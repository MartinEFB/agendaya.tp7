import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmBooking, createHold, findHold, isLiveHold, updateSchedule } from '../../server/domain.js';
import { DEMO_EVENTS } from '../../server/seed.js';
import { MONDAY, NOW, seed, TOKEN_A, TOKEN_B } from './fixtures.js';

const selection = { eventId: DEMO_EVENTS[0].id, date: MONDAY, time: '09:00' };

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('a hold stops being live at its exact expiration millisecond', () => {
  const hold = { expiresAt: NOW + 15 * 60 * 1000 };
  assert.equal(isLiveHold(hold, hold.expiresAt - 1), true);
  assert.equal(isLiveHold(hold, hold.expiresAt), false);
});

test('an unknown service cannot create a hold or mutate state', () => {
  const state = seed();
  const before = structuredClone(state);
  assert.throws(
    () => createHold(state, { ...selection, eventId: 'unknown-service' }, NOW, TOKEN_A),
    (error) => error.status === 400,
  );
  assert.deepEqual(state, before);
});

test('creating a hold purges expired holds but retains other active holds', () => {
  const state = seed();
  state.holds.push({ token: 'c'.repeat(64), date: '2026-09-29', time: '09:00', duration: 30, expiresAt: NOW });
  state.holds.push({ token: TOKEN_B, date: '2026-09-29', time: '09:30', duration: 30, expiresAt: NOW + 1000 });
  createHold(state, selection, NOW, TOKEN_A);
  assert.deepEqual(
    state.holds.map(({ token }) => token),
    [TOKEN_B, TOKEN_A],
  );
});

test('an active hold becomes unusable when edited hours remove its slot', () => {
  const state = seed();
  createHold(state, selection, NOW, TOKEN_A);
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  updateSchedule(state, schedule, NOW);
  assert.throws(
    () => findHold(state, TOKEN_A, NOW),
    (error) => error.status === 409 && error.code === 'SLOT_UNAVAILABLE',
  );
});

test('a confirmed token resolves to its receipt after the hold has expired', () => {
  const state = seed();
  const hold = createHold(state, selection, NOW, TOKEN_A);
  confirmBooking(state, TOKEN_A, { name: 'Ada Lovelace', email: 'ada@example.com' }, NOW, 'AY-ONE');
  assert.equal(state.holds.length, 0);
  assert.equal(findHold(state, TOKEN_A, hold.expiresAt + 1).receipt.reference, 'AY-ONE');
});
