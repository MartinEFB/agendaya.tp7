import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidEmail, validateGuest } from '../../public/shared/validation.js';
import { confirmBooking, createHold } from '../../server/domain.js';
import { DEMO_EVENTS } from '../../server/seed.js';
import { MONDAY, NOW, seed, TOKEN_A } from './fixtures.js';

const selection = { eventId: DEMO_EVENTS[1].id, date: MONDAY, time: '09:00' };

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('email validation accepts plus-addressing but rejects embedded whitespace', () => {
  assert.equal(isValidEmail('ada+agenda@example.com'), true);
  assert.equal(isValidEmail('ada @example.com'), false);
});

test('guest validation treats whitespace-only required values as empty', () => {
  const errors = validateGuest({ name: '   ', email: '  ' });
  assert.ok(errors.name);
  assert.ok(errors.email);
});

test('guest validation rejects non-string optional phone and note', () => {
  const errors = validateGuest({ name: 'Ada Lovelace', email: 'ada@example.com', phone: 123, note: {} });
  assert.ok(errors.phone);
  assert.ok(errors.note);
});

test('booking trims guest fields, consumes the hold, and returns no private guest data', () => {
  const state = seed();
  createHold(state, selection, NOW, TOKEN_A);
  const receipt = confirmBooking(
    state,
    TOKEN_A,
    { name: '  Ada Lovelace  ', email: '  ada@example.com  ', phone: '  123  ', note: '  Advice  ' },
    NOW,
    'AY-ONE',
  );
  assert.deepEqual(state.bookings[0].guest, {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '123',
    note: 'Advice',
  });
  assert.equal(state.holds.length, 0);
  assert.equal(receipt.eventId, DEMO_EVENTS[1].id);
  assert.equal(JSON.stringify(receipt).includes('ada@example.com'), false);
});

test('confirmation at the hold deadline rejects without booking or notification', () => {
  const state = seed();
  const hold = createHold(state, selection, NOW, TOKEN_A);
  assert.throws(
    () => confirmBooking(state, TOKEN_A, { name: 'Ada Lovelace', email: 'ada@example.com' }, hold.expiresAt, 'AY-ONE'),
    (error) => error.status === 410 && error.code === 'HOLD_EXPIRED',
  );
  assert.equal(state.bookings.length, 0);
  assert.equal(state.notificationOutbox.length, 0);
});
