import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDateRange } from '../../public/shared/validation.js';
import { blockDateRange } from '../../server/domain.js';
import { booking, MONDAY, seed } from './fixtures.js';

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('range validation flags an impossible start date', () => {
  assert.ok(validateDateRange({ startDate: '2026-09-31', endDate: '2026-10-02', reason: 'Vacaciones' }).startDate);
});

test('range validation requires a category even for valid dates', () => {
  assert.ok(validateDateRange({ startDate: MONDAY, endDate: '2026-09-30' }).reason);
});

test('a cancelled reservation does not conflict with range blocking', () => {
  const state = seed();
  state.bookings.push(booking({ status: 'CANCELLED' }));
  assert.deepEqual(blockDateRange(state, { startDate: MONDAY, endDate: '2026-09-30', reason: 'Vacaciones' }), {
    startDate: MONDAY,
    endDate: '2026-09-30',
    reason: 'Vacaciones',
  });
});

test('separate range blocks are sorted by their start date', () => {
  const state = seed();
  blockDateRange(state, { startDate: '2026-10-05', endDate: '2026-10-07', reason: 'Vacaciones' });
  blockDateRange(state, { startDate: MONDAY, endDate: '2026-09-30', reason: 'Licencia Médica' });
  assert.deepEqual(
    state.blockedRanges.map(({ startDate }) => startDate),
    [MONDAY, '2026-10-05'],
  );
});

test('adjacent ranges with no shared date are both allowed', () => {
  const state = seed();
  blockDateRange(state, { startDate: MONDAY, endDate: '2026-09-29', reason: 'Vacaciones' });
  blockDateRange(state, { startDate: '2026-09-30', endDate: '2026-10-01', reason: 'Licencia Médica' });
  assert.equal(state.blockedRanges.length, 2);
});
