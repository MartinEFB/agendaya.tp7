import { createSeedState, DEMO_EVENTS } from '../../server/seed.js';

export const NOW = Date.parse('2026-09-27T09:00:00-03:00');
export const MONDAY = '2026-09-28';
export const TOKEN_A = 'a'.repeat(64);
export const TOKEN_B = 'b'.repeat(64);

export function seed() {
  return createSeedState();
}

export function booking(overrides = {}) {
  return {
    reference: 'AY-ONE',
    holdToken: TOKEN_A,
    eventId: DEMO_EVENTS[0].id,
    date: MONDAY,
    time: '09:00',
    duration: DEMO_EVENTS[0].duration,
    guest: { name: 'Ada Lovelace', email: 'ada@example.com', phone: '', note: '' },
    status: 'CONFIRMED',
    createdAt: NOW,
    ...overrides,
  };
}
