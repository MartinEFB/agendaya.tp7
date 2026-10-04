import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  guestReassignmentSlots,
  reassignException,
  reassignGuestException,
  updateSchedule,
} from '../../server/domain.js';
import { booking, MONDAY, NOW, seed, TOKEN_A } from './fixtures.js';

function exceptionState() {
  const state = seed();
  state.bookings.push(booking());
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  updateSchedule(state, schedule, NOW);
  return state;
}

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('reassigning an unknown reference returns not found without mutation', () => {
  const state = exceptionState();
  const before = structuredClone(state);
  assert.throws(
    () => reassignException(state, 'AY-UNKNOWN', { date: MONDAY, time: '10:00' }, NOW),
    (error) => error.status === 404 && error.code === 'EXCEPTION_NOT_FOUND',
  );
  assert.deepEqual(state, before);
});

test('reassignment rejects malformed date and time with field errors', () => {
  const state = exceptionState();
  const before = structuredClone(state);
  assert.throws(
    () => reassignException(state, 'AY-ONE', { date: '2026-09-31', time: '25:00' }, NOW),
    (error) => error.status === 400 && Boolean(error.fields.date) && Boolean(error.fields.time),
  );
  assert.deepEqual(state, before);
});

test('the original exception does not consume its own daily capacity when reassigned', () => {
  const state = exceptionState();
  state.quickSettings.maxDailyBookings = 1;
  const result = reassignException(state, 'AY-ONE', { date: MONDAY, time: '10:00' }, NOW);
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(state.bookings[0].time, '10:00');
  assert.equal(state.bookings.length, 1);
});

test('guest reassignment availability closes exactly at the deadline', () => {
  const state = exceptionState();
  const deadline = state.bookings[0].exceptionDeadline;
  assert.throws(
    () => guestReassignmentSlots(state, TOKEN_A, MONDAY, deadline),
    (error) => error.status === 410 && error.code === 'EXCEPTION_EXPIRED',
  );
});

test('guest reassignment retains reference and service but omits guest details', () => {
  const state = exceptionState();
  const receipt = reassignGuestException(state, TOKEN_A, { date: MONDAY, time: '10:00' }, NOW);
  assert.equal(receipt.reference, 'AY-ONE');
  assert.equal(receipt.eventId, state.bookings[0].eventId);
  assert.equal(receipt.time, '10:00');
  assert.equal(JSON.stringify(receipt).includes('ada@example.com'), false);
});
