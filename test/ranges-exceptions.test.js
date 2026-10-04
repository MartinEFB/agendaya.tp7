import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApplication } from '../server/app.js';
import {
  availableSlots,
  blockDateRange,
  expireExceptions,
  guestReassignmentSlots,
  reassignException,
  reassignGuestException,
  updateSchedule,
} from '../server/domain.js';
import { createSeedState } from '../server/seed.js';
import { createStore } from '../server/store.js';
import { validateDateRange } from '../public/shared/validation.js';

const now = Date.parse('2026-09-27T09:00:00-03:00');
const monday = '2026-09-28';

function booking(date = monday, time = '09:00', reference = 'AY-ONE') {
  return { reference, date, time, duration: 30, status: 'CONFIRMED', guest: { email: 'guest@example.com' } };
}

test('range validation requires a real end strictly after its start and a listed category', () => {
  assert.deepEqual(validateDateRange({ startDate: monday, endDate: '2026-09-30', reason: 'Vacaciones' }), {});
  assert.deepEqual(validateDateRange({ startDate: monday, endDate: '2026-09-30', reason: 'Licencia Médica' }), {});
  assert.ok(validateDateRange({ startDate: monday, endDate: monday, reason: 'Vacaciones' }).endDate);
  assert.ok(validateDateRange({ startDate: monday, endDate: '2026-09-27', reason: 'Vacaciones' }).endDate);
  assert.ok(validateDateRange({ startDate: monday, endDate: '2026-09-31', reason: 'Vacaciones' }).endDate);
  assert.ok(validateDateRange({ startDate: monday, endDate: '2026-09-30', reason: 'Feriado' }).reason);
});

test('range block includes both endpoints and disables public slots for every date', () => {
  const state = createSeedState();
  const result = blockDateRange(state, { startDate: monday, endDate: '2026-09-30', reason: 'Vacaciones' });
  assert.deepEqual(result, { startDate: monday, endDate: '2026-09-30', reason: 'Vacaciones' });
  for (const date of [monday, '2026-09-29', '2026-09-30']) assert.deepEqual(availableSlots(state, date, now), []);
  assert.ok(availableSlots(state, '2026-10-01', now).length > 0);
});

test('range conflict names all affected booking dates and leaves the state unchanged', () => {
  const state = createSeedState();
  state.bookings.push(booking('2026-09-29'), booking('2026-09-30', '10:00', 'AY-TWO'));
  const beforeState = structuredClone(state);
  assert.throws(
    () => blockDateRange(state, { startDate: monday, endDate: '2026-10-01', reason: 'Licencia Médica' }),
    (error) =>
      error.code === 'BOOKING_CONFLICT' &&
      error.status === 409 &&
      error.details.dates.join(',') === '2026-09-29,2026-09-30',
  );
  assert.deepEqual(state, beforeState);
});

test('range block rejects any already blocked date without a partial write', () => {
  const state = createSeedState();
  state.blockedDays.push({ date: '2026-09-29', reason: 'Feriado' });
  const beforeState = structuredClone(state);
  assert.throws(
    () => blockDateRange(state, { startDate: monday, endDate: '2026-09-30', reason: 'Vacaciones' }),
    (error) => error.code === 'ALREADY_BLOCKED',
  );
  assert.deepEqual(state, beforeState);
});

test('range block rejects overlap with a previously blocked range', () => {
  const state = createSeedState();
  state.blockedRanges.push({ startDate: '2026-09-30', endDate: '2026-10-02', reason: 'Vacaciones' });
  const beforeState = structuredClone(state);
  assert.throws(
    () => blockDateRange(state, { startDate: monday, endDate: '2026-09-30', reason: 'Licencia Médica' }),
    (error) => error.code === 'ALREADY_BLOCKED',
  );
  assert.deepEqual(state, beforeState);
});

test('schedule edit preserves a booking outside new hours and creates one simulated notice', () => {
  const state = createSeedState();
  state.bookings.push(booking());
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  const result = updateSchedule(state, schedule, now);
  assert.equal(state.bookings[0].status, 'EXCEPTION');
  assert.equal(state.bookings[0].exceptionDeadline, now + 24 * 60 * 60 * 1000);
  assert.equal(state.bookings[0].date, monday);
  assert.equal(state.bookings[0].time, '09:00');
  assert.deepEqual(result.exceptions, ['AY-ONE']);
  assert.equal(state.notificationOutbox.length, 1);
  assert.equal(state.notificationOutbox[0].delivery, 'SIMULATED_NOT_SENT');
  assert.equal(state.notificationOutbox[0].recipient, 'guest@example.com');
  updateSchedule(state, schedule, now + 1000);
  assert.equal(state.notificationOutbox.length, 1);
});

test('schedule edit leaves still-covered confirmed bookings untouched', () => {
  const state = createSeedState();
  state.bookings.push(booking(monday, '10:00'));
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  const result = updateSchedule(state, schedule, now);
  assert.deepEqual(result.exceptions, []);
  assert.equal(state.bookings[0].status, 'CONFIRMED');
  assert.deepEqual(state.notificationOutbox, []);
});

test('schedule validation rejects overlapping ranges before modifying bookings', () => {
  const state = createSeedState();
  state.bookings.push(booking());
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [
    { start: '09:00', end: '10:00' },
    { start: '09:59', end: '11:00' },
  ];
  const beforeState = structuredClone(state);
  assert.throws(
    () => updateSchedule(state, schedule, now),
    (error) => Boolean(error.fields['monday-1']),
  );
  assert.deepEqual(state, beforeState);
});

test('reassignment before the deadline confirms a valid new slot without duplicate booking', () => {
  const state = createSeedState();
  state.bookings.push(booking());
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  updateSchedule(state, schedule, now);
  const result = reassignException(state, 'AY-ONE', { date: monday, time: '10:00' }, now + 1000);
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(state.bookings.length, 1);
  assert.equal(state.bookings[0].time, '10:00');
  assert.equal(state.bookings[0].exceptionDeadline, undefined);
  assert.equal(state.notificationOutbox.length, 1);
});

test('guest capability can reassign its own exception but not another booking', () => {
  const state = createSeedState();
  state.quickSettings.maxDailyBookings = 1;
  const own = { ...booking(), holdToken: 'a'.repeat(64) };
  state.bookings.push(own, { ...booking('2026-09-29', '09:00', 'AY-OTHER'), holdToken: 'b'.repeat(64) });
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  updateSchedule(state, schedule, now);
  assert.deepEqual(guestReassignmentSlots(state, own.holdToken, monday, now).slice(0, 2), ['10:00', '10:30']);
  assert.throws(
    () => guestReassignmentSlots(state, undefined, monday, now),
    (error) => error.code === 'EXCEPTION_NOT_FOUND',
  );
  assert.throws(
    () => reassignGuestException(state, 'b'.repeat(64), { date: monday, time: '10:00' }, now),
    (error) => error.code === 'EXCEPTION_NOT_FOUND',
  );
  const moved = reassignGuestException(state, own.holdToken, { date: monday, time: '10:00' }, now);
  assert.equal(moved.status, 'CONFIRMED');
  assert.equal(own.time, '10:00');
  assert.equal(state.bookings[1].time, '09:00');
});

test('invalid reassignment does not change exception or displace another booking', () => {
  const state = createSeedState();
  state.bookings.push(booking(), booking(monday, '10:00', 'AY-TWO'));
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  updateSchedule(state, schedule, now);
  const beforeState = structuredClone(state);
  assert.throws(
    () => reassignException(state, 'AY-ONE', { date: monday, time: '10:00' }, now + 1000),
    (error) => error.code === 'SLOT_UNAVAILABLE',
  );
  assert.deepEqual(state, beforeState);
});

test('exception expires exactly at 24 hours and stops occupying availability', () => {
  const state = createSeedState();
  state.bookings.push(booking());
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  updateSchedule(state, schedule, now);
  expireExceptions(state, now + 24 * 60 * 60 * 1000 - 1);
  assert.equal(state.bookings[0].status, 'EXCEPTION');
  expireExceptions(state, now + 24 * 60 * 60 * 1000);
  assert.equal(state.bookings[0].status, 'CANCELLED');
  assert.equal(state.bookings[0].cancelReason, 'EXCEPTION_DEADLINE');
  assert.ok(availableSlots(state, monday, now).includes('10:00'));
});

test('reassignment is rejected at the deadline and preserves the old booking until expiry runs', () => {
  const state = createSeedState();
  state.bookings.push(booking());
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  updateSchedule(state, schedule, now);
  const beforeState = structuredClone(state);
  assert.throws(
    () => reassignException(state, 'AY-ONE', { date: monday, time: '10:00' }, now + 24 * 60 * 60 * 1000),
    (error) => error.code === 'EXCEPTION_EXPIRED' && error.status === 410,
  );
  assert.deepEqual(state, beforeState);
});

let directory;
let server;
let base;
let currentTime = now;
let thursdayReference;
let fridayReference;
let thursdayToken;
let fridayToken;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'agendaya-ranges-'));
  server = createApplication({ store: await createStore(join(directory, 'agenda.json')), clock: () => currentTime });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function jsonRequest(path, method, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('range API persists block and rejects booking conflicts atomically', async () => {
  const saved = await jsonRequest('/api/admin/blocked-ranges', 'POST', {
    startDate: monday,
    endDate: '2026-09-30',
    reason: 'Vacaciones',
  });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.startDate, monday);
  const admin = await (await fetch(`${base}/api/admin/availability`)).json();
  assert.equal(admin.blockedRanges.length, 1);
  const publicDays = await (await fetch(`${base}/api/availability?month=2026-09`)).json();
  assert.deepEqual(publicDays.days.find((day) => day.date === '2026-09-30').slots, []);
  async function reserve(date) {
    const hold = await jsonRequest('/api/holds', 'POST', { eventId: 'advisory-session', date, time: '09:00' });
    assert.equal(hold.status, 201);
    const confirmed = await jsonRequest('/api/bookings', 'POST', {
      holdToken: hold.body.token,
      guest: { name: 'Test Guest', email: 'guest@example.com' },
    });
    assert.equal(confirmed.status, 201);
    return { reference: confirmed.body.reference, token: hold.body.token };
  }
  ({ reference: thursdayReference, token: thursdayToken } = await reserve('2026-10-01'));
  ({ reference: fridayReference, token: fridayToken } = await reserve('2026-10-02'));
  const conflict = await jsonRequest('/api/admin/blocked-ranges', 'POST', {
    startDate: '2026-10-01',
    endDate: '2026-10-02',
    reason: 'Licencia Médica',
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'BOOKING_CONFLICT');
  assert.deepEqual(conflict.body.dates, ['2026-10-01', '2026-10-02']);
  const unchanged = await (await fetch(`${base}/api/admin/availability`)).json();
  assert.equal(unchanged.blockedRanges.length, 1);
});

test('admin exception API exposes simulated notice, reassignment and expiry status', async () => {
  const availability = await (await fetch(`${base}/api/admin/availability`)).json();
  const schedule = availability.weeklyHours;
  schedule.thursday.ranges = [{ start: '10:00', end: '13:00' }];
  schedule.friday.ranges = [{ start: '10:00', end: '13:00' }];
  const saved = await jsonRequest('/api/admin/availability', 'PUT', { weeklyHours: schedule });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.exceptions.sort(), [thursdayReference, fridayReference].sort());
  const exceptions = await (await fetch(`${base}/api/admin/exceptions`)).json();
  assert.equal(exceptions.bookings.length, 2);
  const exceptionNotices = exceptions.notifications.filter((notice) => notice.type === 'EXCEPTION_NOTICE');
  assert.equal(exceptionNotices.length, 2);
  assert.ok(exceptionNotices.every((notice) => notice.delivery === 'SIMULATED_NOT_SENT'));
  assert.ok(
    exceptionNotices.every(
      (notice) => notice.accessMethod === 'SAME_BROWSER_SESSION' && notice.message.includes('misma pestaña'),
    ),
  );
  assert.ok(
    exceptions.bookings.every((item) => item.status === 'EXCEPTION' && item.deadline === now + 24 * 60 * 60 * 1000),
  );
  const guestStatus = await (await fetch(`${base}/api/holds/${thursdayToken}`)).json();
  assert.equal(guestStatus.receipt.status, 'EXCEPTION');
  assert.equal(guestStatus.receipt.exceptionDeadline, now + 24 * 60 * 60 * 1000);
  assert.equal(guestStatus.receipt.guest, undefined);
  const guestSlots = await (
    await fetch(`${base}/api/bookings/access/${thursdayToken}/availability?month=2026-10`)
  ).json();
  assert.ok(guestSlots.days.find((day) => day.date === '2026-10-01').slots.includes('10:00'));
  const denied = await jsonRequest(`/api/bookings/access/${'c'.repeat(64)}/reassign`, 'POST', {
    date: '2026-10-01',
    time: '10:00',
  });
  assert.equal(denied.status, 404);
  const moved = await jsonRequest(`/api/bookings/access/${thursdayToken}/reassign`, 'POST', {
    date: '2026-10-01',
    time: '10:00',
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.status, 'CONFIRMED');
  assert.equal(moved.body.guest, undefined);
  currentTime = now + 25 * 60 * 60 * 1000;
  const afterDeadline = await (await fetch(`${base}/api/admin/exceptions`)).json();
  assert.equal(afterDeadline.bookings.find((item) => item.reference === thursdayReference).status, 'CONFIRMED');
  assert.equal(afterDeadline.bookings.find((item) => item.reference === fridayReference).status, 'CANCELLED');
  const expiredGuest = await (await fetch(`${base}/api/holds/${fridayToken}`)).json();
  assert.equal(expiredGuest.receipt.status, 'CANCELLED');
  const noReassignment = await jsonRequest(`/api/bookings/access/${fridayToken}/reassign`, 'POST', {
    date: '2026-10-02',
    time: '10:00',
  });
  assert.notEqual(noReassignment.status, 200);
});
