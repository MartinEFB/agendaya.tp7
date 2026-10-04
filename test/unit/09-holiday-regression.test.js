import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableSlots, blockDay, createHold } from '../../server/domain.js';
import { NOW, seed, TOKEN_A } from './fixtures.js';

const TUESDAY = '2026-09-29';

for (const reason of ['Feriado', 'Motivo Personal']) {
  test(`HOTFIX: un día bloqueado como "${reason}" no ofrece horarios ni admite retenciones`, () => {
    const state = seed();
    blockDay(state, { date: TUESDAY, reason });
    assert.deepEqual(availableSlots(state, TUESDAY, NOW), []);
    assert.throws(
      () => createHold(state, { eventId: 'advisory-session', date: TUESDAY, time: '09:00' }, NOW, TOKEN_A),
      (error) => error.status === 409 && error.code === 'SLOT_UNAVAILABLE',
    );
  });
}
