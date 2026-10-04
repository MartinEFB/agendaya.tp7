import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exceptionSummary, expireExceptions, updateSchedule } from '../../server/domain.js';
import { booking, NOW, seed } from './fixtures.js';

function exceptionState() {
  const state = seed();
  state.bookings.push(booking());
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.enabled = false;
  schedule.monday.ranges = [];
  updateSchedule(state, schedule, NOW);
  return state;
}

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('disabling a working day flags its future booking as an exception', () => {
  const state = exceptionState();
  assert.equal(state.bookings[0].status, 'EXCEPTION');
  assert.equal(state.bookings[0].exceptionDeadline, NOW + 24 * 60 * 60 * 1000);
});

test('a past booking is not newly flagged when its weekday is disabled', () => {
  const state = seed();
  state.bookings.push(booking({ date: '2026-09-25' }));
  const schedule = structuredClone(state.weeklyHours);
  schedule.friday.enabled = false;
  schedule.friday.ranges = [];
  updateSchedule(state, schedule, NOW);
  assert.equal(state.bookings[0].status, 'CONFIRMED');
  assert.equal(state.notificationOutbox.length, 0);
});

test('expiration selects only due exceptions among mixed booking states', () => {
  const state = exceptionState();
  state.bookings[0].exceptionDeadline = NOW - 1;
  state.bookings.push(booking({ reference: 'AY-LATER', status: 'EXCEPTION', exceptionDeadline: NOW + 1 }));
  state.bookings.push(booking({ reference: 'AY-NORMAL', status: 'CONFIRMED' }));
  assert.deepEqual(expireExceptions(state, NOW), ['AY-ONE']);
  assert.deepEqual(
    state.bookings.map(({ status }) => status),
    ['CANCELLED', 'EXCEPTION', 'CONFIRMED'],
  );
});

test('running expiration twice does not cancel the same exception twice', () => {
  const state = exceptionState();
  const deadline = state.bookings[0].exceptionDeadline;
  assert.deepEqual(expireExceptions(state, deadline), ['AY-ONE']);
  assert.deepEqual(expireExceptions(state, deadline + 1), []);
  assert.equal(state.bookings[0].cancelReason, 'EXCEPTION_DEADLINE');
});

test('exception summary exposes notice metadata without guest contact details', () => {
  const state = exceptionState();
  const summary = exceptionSummary(state);
  assert.equal(summary.bookings[0].reference, 'AY-ONE');
  assert.equal(summary.notifications[0].delivery, 'SIMULATED_NOT_SENT');
  assert.equal(JSON.stringify(summary).includes('ada@example.com'), false);
  assert.equal(JSON.stringify(summary).includes('Ada Lovelace'), false);
});
