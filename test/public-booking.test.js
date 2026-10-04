import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApplication } from '../server/app.js';
import { availableSlots, confirmBooking, createHold } from '../server/domain.js';
import { createSeedState, DEMO_EVENTS } from '../server/seed.js';
import { createStore } from '../server/store.js';

const now = Date.parse('2026-09-27T09:00:00-03:00');
const date = '2026-09-28';
const guest = { name: 'Guest Example', email: 'guest@example.com' };

test('public fixture offers exactly two distinct 30-minute service types', () => {
  assert.equal(DEMO_EVENTS.length, 2);
  assert.equal(new Set(DEMO_EVENTS.map((event) => event.id)).size, 2);
  assert.equal(new Set(DEMO_EVENTS.map((event) => event.name)).size, 2);
  assert.ok(DEMO_EVENTS.every((event) => event.duration === 30));
});

test('selected service survives hold, confirmation and receipt without leaking guest data', () => {
  const state = createSeedState();
  const chosen = DEMO_EVENTS[1];
  const token = 'b'.repeat(64);
  const hold = createHold(state, { eventId: chosen.id, date, time: '09:00' }, now, token);
  assert.equal(hold.eventId, chosen.id);
  const receipt = confirmBooking(state, token, guest, now + 1000, 'AY-SECOND');
  assert.equal(state.bookings[0].eventId, chosen.id);
  assert.equal(receipt.eventId, chosen.id);
  assert.equal(receipt.eventName, chosen.name);
  assert.equal(receipt.duration, chosen.duration);
  assert.equal(JSON.stringify(receipt).includes(guest.email), false);
});

test('a hold for one service removes the occupied slot from the other service', () => {
  const state = createSeedState();
  createHold(state, { eventId: DEMO_EVENTS[1].id, date, time: '09:00' }, now, 'c'.repeat(64));
  assert.ok(!availableSlots(state, date, now, null, DEMO_EVENTS[0].id).includes('09:00'));
});

test('confirmed booking creates one durable simulated admin alert and idempotent retry adds none', () => {
  const state = createSeedState();
  const token = 'd'.repeat(64);
  createHold(state, { eventId: DEMO_EVENTS[0].id, date, time: '09:00' }, now, token);
  const first = confirmBooking(state, token, guest, now + 1000, 'AY-FIRST');
  const again = confirmBooking(state, token, guest, now + 2000, 'AY-DIFFERENT');
  assert.deepEqual(first, again);
  const alerts = state.notificationOutbox.filter((item) => item.type === 'BOOKING_CONFIRMED');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].delivery, 'SIMULATED_NOT_SENT');
  assert.equal(alerts[0].reference, 'AY-FIRST');
  assert.equal(JSON.stringify(alerts).includes(guest.email), false);
});

test('a simulated email failure keeps the booking confirmed and reports the failure honestly', () => {
  const state = createSeedState();
  const token = 'e'.repeat(64);
  createHold(state, { eventId: DEMO_EVENTS[0].id, date, time: '09:00' }, now, token);
  const receipt = confirmBooking(state, token, guest, now + 1000, 'AY-FAIL', 'SIMULATED_FAILED');
  assert.equal(state.bookings[0].status, 'CONFIRMED');
  assert.equal(receipt.notifications.guestEmail, 'SIMULATED_FAILED');
  assert.equal(state.notificationOutbox[0].delivery, 'SIMULATED_NOT_SENT');
});

test('API exposes a public catalog, rejects unknown types and persists admin alerts without guest data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agendaya-public-'));
  const dataFile = join(directory, 'agenda.json');
  const server = createApplication({
    store: await createStore(dataFile),
    clock: () => now,
    createToken: () => 'f'.repeat(64),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.deepEqual(config.events, DEMO_EVENTS);
    const unknown = await fetch(`${base}/api/availability?month=2026-09&eventId=unknown`);
    assert.equal(unknown.status, 400);
    const slots = await (await fetch(`${base}/api/availability?month=2026-09&eventId=${DEMO_EVENTS[1].id}`)).json();
    assert.ok(slots.days.find((day) => day.date === date).slots.includes('09:00'));
    const holdResponse = await fetch(`${base}/api/holds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: DEMO_EVENTS[1].id, date, time: '09:00' }),
    });
    assert.equal(holdResponse.status, 201);
    const hold = await holdResponse.json();
    const booked = await fetch(`${base}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdToken: hold.token, guest }),
    });
    assert.equal(booked.status, 201);
    assert.equal((await booked.json()).eventId, DEMO_EVENTS[1].id);
    const admin = await (await fetch(`${base}/api/admin/exceptions`)).json();
    assert.equal(admin.notifications.filter((item) => item.type === 'BOOKING_CONFIRMED').length, 1);
    assert.equal(JSON.stringify(admin).includes(guest.email), false);
    const persisted = JSON.parse(await readFile(dataFile, 'utf8'));
    assert.equal(persisted.notificationOutbox.filter((item) => item.type === 'BOOKING_CONFIRMED').length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('API simulated email failure returns a confirmed receipt and persists the booking', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agendaya-email-failure-'));
  const dataFile = join(directory, 'agenda.json');
  const server = createApplication({
    store: await createStore(dataFile),
    clock: () => now,
    createToken: () => 'a'.repeat(64),
    simulatedGuestEmailStatus: 'SIMULATED_FAILED',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const holdResponse = await fetch(`${base}/api/holds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: DEMO_EVENTS[0].id, date, time: '09:00' }),
    });
    assert.equal(holdResponse.status, 201);
    const hold = await holdResponse.json();
    const booked = await fetch(`${base}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdToken: hold.token, guest }),
    });
    assert.equal(booked.status, 201);
    const receipt = await booked.json();
    assert.equal(receipt.status, 'CONFIRMED');
    assert.equal(receipt.notifications.guestEmail, 'SIMULATED_FAILED');
    const state = JSON.parse(await readFile(dataFile, 'utf8'));
    assert.equal(state.bookings[0].status, 'CONFIRMED');
    assert.equal(state.notificationOutbox[0].guestEmailStatus, 'SIMULATED_FAILED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
