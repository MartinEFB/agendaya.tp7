import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApplication } from '../server/app.js';
import { availableSlots, createHold, quickSettingsOf, updateQuickSettings } from '../server/domain.js';
import { createSeedState } from '../server/seed.js';
import { createStore } from '../server/store.js';
import { validateQuickSettings } from '../public/shared/validation.js';

const monday = '2026-09-28';
const now = Date.parse('2026-09-28T09:30:00-03:00');
const futureNow = Date.parse('2026-09-27T09:00:00-03:00');

function stateWithSettings(settings) {
  const state = createSeedState();
  updateQuickSettings(state, settings);
  return state;
}

test('quick settings accept their inclusive numeric boundaries', () => {
  assert.deepEqual(validateQuickSettings({ maxDailyBookings: 1, intervalMinutes: 0, leadHours: 1 }), {});
  assert.deepEqual(validateQuickSettings({ maxDailyBookings: 100, intervalMinutes: 120, leadHours: 72 }), {});
});

test('quick settings reject missing, non-integer, and out-of-range values', () => {
  assert.deepEqual(
    Object.keys(validateQuickSettings({ maxDailyBookings: 0, intervalMinutes: -1, leadHours: 0 })).sort(),
    ['intervalMinutes', 'leadHours', 'maxDailyBookings'],
  );
  assert.deepEqual(
    Object.keys(validateQuickSettings({ maxDailyBookings: '2.5', intervalMinutes: 121, leadHours: 73 })).sort(),
    ['intervalMinutes', 'leadHours', 'maxDailyBookings'],
  );
  assert.deepEqual(Object.keys(validateQuickSettings({})).sort(), ['intervalMinutes', 'leadHours', 'maxDailyBookings']);
});

test('invalid settings leave existing settings unchanged', () => {
  const state = createSeedState();
  const previous = structuredClone(state.quickSettings);
  assert.throws(
    () => updateQuickSettings(state, { maxDailyBookings: 4, intervalMinutes: 130, leadHours: 24 }),
    (error) => error.status === 400 && Boolean(error.fields.intervalMinutes),
  );
  assert.deepEqual(state.quickSettings, previous);
});

test('legacy data without quick settings uses safe defaults', () => {
  const state = createSeedState();
  delete state.quickSettings;
  assert.deepEqual(quickSettingsOf(state), { maxDailyBookings: 8, intervalMinutes: 0, leadHours: 1 });
  assert.ok(availableSlots(state, monday, futureNow).includes('09:00'));
});

test('interval changes the generated slot spacing without crossing a range end', () => {
  const state = stateWithSettings({ maxDailyBookings: 8, intervalMinutes: 15, leadHours: 1 });
  state.weeklyHours.monday.ranges = [{ start: '09:00', end: '11:00' }];
  assert.deepEqual(availableSlots(state, monday, futureNow), ['09:00', '09:45', '10:30']);
});

test('interval also separates slots from adjacent configured ranges', () => {
  const state = stateWithSettings({ maxDailyBookings: 8, intervalMinutes: 15, leadHours: 1 });
  state.weeklyHours.monday.ranges = [
    { start: '09:00', end: '09:30' },
    { start: '09:30', end: '10:30' },
  ];
  assert.deepEqual(availableSlots(state, monday, futureNow), ['09:00', '09:45']);
});

test('minimum lead hides slots strictly before the threshold and keeps the boundary', () => {
  const state = stateWithSettings({ maxDailyBookings: 8, intervalMinutes: 0, leadHours: 2 });
  state.weeklyHours.monday.ranges = [{ start: '10:00', end: '12:30' }];
  assert.deepEqual(availableSlots(state, monday, now), ['11:30', '12:00']);
});

test('daily cap hides every slot once confirmed bookings reach it', () => {
  const state = stateWithSettings({ maxDailyBookings: 1, intervalMinutes: 0, leadHours: 1 });
  state.bookings.push({ date: monday, time: '09:00', duration: 30, status: 'CONFIRMED' });
  assert.deepEqual(availableSlots(state, monday, futureNow), []);
});

test('active holds reserve daily capacity to prevent concurrent overbooking', () => {
  const state = stateWithSettings({ maxDailyBookings: 1, intervalMinutes: 0, leadHours: 1 });
  const hold = createHold(
    state,
    { eventId: 'advisory-session', date: monday, time: '09:00' },
    futureNow,
    'a'.repeat(64),
  );
  assert.deepEqual(availableSlots(state, monday, futureNow), []);
  assert.ok(availableSlots(state, monday, futureNow, hold.token).includes('09:00'));
  assert.throws(
    () => createHold(state, { eventId: 'advisory-session', date: monday, time: '09:30' }, futureNow, 'b'.repeat(64)),
    (error) => error.code === 'SLOT_UNAVAILABLE',
  );
  assert.ok(availableSlots(state, monday, hold.expiresAt).includes('09:30'));
});

test('interval separates new slots from an existing off-grid booking', () => {
  const state = stateWithSettings({ maxDailyBookings: 8, intervalMinutes: 15, leadHours: 1 });
  state.bookings.push({ date: monday, time: '09:20', duration: 30, status: 'CONFIRMED' });
  assert.ok(!availableSlots(state, monday, futureNow).includes('09:00'));
  assert.ok(!availableSlots(state, monday, futureNow).includes('09:45'));
  assert.ok(availableSlots(state, monday, futureNow).includes('10:30'));
});

let directory;
let server;
let base;
let dataFile;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'agendaya-settings-'));
  dataFile = join(directory, 'agenda.json');
  server = createApplication({ store: await createStore(dataFile), clock: () => futureNow });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('admin settings persist and immediately change public availability', async () => {
  const settings = { maxDailyBookings: 2, intervalMinutes: 15, leadHours: 24 };
  const saved = await fetch(`${base}/api/admin/quick-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).quickSettings, settings);
  const admin = await (await fetch(`${base}/api/admin/availability`)).json();
  assert.deepEqual(admin.quickSettings, settings);
  const persisted = JSON.parse(await readFile(dataFile, 'utf8'));
  assert.deepEqual(persisted.quickSettings, settings);
  const publicDays = await (await fetch(`${base}/api/availability?month=2026-09`)).json();
  assert.deepEqual(publicDays.days.find((day) => day.date === monday).slots.slice(0, 3), ['09:00', '09:45', '10:30']);
});

test('invalid API update returns field errors and preserves persisted settings', async () => {
  const response = await fetch(`${base}/api/admin/quick-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxDailyBookings: 2, intervalMinutes: -5, leadHours: 0 }),
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.ok(body.fields.intervalMinutes);
  assert.ok(body.fields.leadHours);
  const persisted = JSON.parse(await readFile(dataFile, 'utf8'));
  assert.deepEqual(persisted.quickSettings, { maxDailyBookings: 2, intervalMinutes: 15, leadHours: 24 });
});
