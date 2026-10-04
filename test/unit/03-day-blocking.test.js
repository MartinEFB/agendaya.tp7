import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateBlock } from '../../public/shared/validation.js';
import { blockDay } from '../../server/domain.js';
import { booking, MONDAY, seed } from './fixtures.js';

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('single-day validation rejects an impossible calendar date', () => {
  assert.ok(validateBlock({ date: '2026-09-31', reason: 'Feriado' }).date);
});

test('single-day validation does not accept a range-only reason', () => {
  assert.ok(validateBlock({ date: MONDAY, reason: 'Vacaciones' }).reason);
});

test('blocking a free day keeps the day list chronological', () => {
  const state = seed();
  state.blockedDays.push({ date: '2026-10-02', reason: 'Feriado' });
  blockDay(state, { date: MONDAY, reason: 'Motivo Personal' });
  assert.deepEqual(
    state.blockedDays.map(({ date }) => date),
    [MONDAY, '2026-10-02'],
  );
});

test('a day inside an existing blocked range cannot be blocked again', () => {
  const state = seed();
  state.blockedRanges.push({ startDate: MONDAY, endDate: '2026-09-30', reason: 'Vacaciones' });
  const original = structuredClone(state.blockedDays);
  assert.throws(
    () => blockDay(state, { date: '2026-09-29', reason: 'Feriado' }),
    (error) => error.status === 409 && error.code === 'ALREADY_BLOCKED',
  );
  assert.deepEqual(state.blockedDays, original);
});

test('a cancelled booking does not prevent blocking its former day', () => {
  const state = seed();
  state.bookings.push(booking({ status: 'CANCELLED' }));
  assert.deepEqual(blockDay(state, { date: MONDAY, reason: 'Feriado' }), { date: MONDAY, reason: 'Feriado' });
});
