import { WEEK_DAYS } from '../public/shared/dates.js';

export const DEMO_PROFILE = {
  name: 'Lucía Méndez',
  initials: 'LM',
  role: 'Consultoría profesional',
  description: 'Un espacio para ordenar tus ideas, conversar sobre tus objetivos y dar forma a tu próximo paso.',
};
// Two static service types make the story's plural catalog observable. Their count and duration are demo fixtures.
export const DEMO_EVENTS = [
  {
    id: 'advisory-session',
    name: 'Sesión de asesoramiento',
    duration: 30,
    format: 'Encuentro virtual',
    timezone: 'America/Argentina/Buenos_Aires',
  },
  {
    id: 'follow-up-session',
    name: 'Consulta de seguimiento',
    duration: 30,
    format: 'Encuentro virtual',
    timezone: 'America/Argentina/Buenos_Aires',
  },
];
export const DEMO_EVENT = DEMO_EVENTS[0];

export const DEFAULT_QUICK_SETTINGS = Object.freeze({
  maxDailyBookings: 8,
  intervalMinutes: 0,
  leadHours: 1,
});

export function createSeedState() {
  return {
    schemaVersion: 1,
    weeklyHours: Object.fromEntries(
      WEEK_DAYS.map(({ key }, index) => [
        key,
        {
          enabled: index < 5,
          ranges:
            index < 5
              ? [
                  { start: '09:00', end: '13:00' },
                  { start: '15:00', end: '18:00' },
                ]
              : [],
        },
      ]),
    ),
    blockedDays: [],
    blockedRanges: [],
    holds: [],
    bookings: [],
    notificationOutbox: [],
    quickSettings: { ...DEFAULT_QUICK_SETTINGS },
  };
}
