import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSchedule, validateSchedule } from '../../public/shared/validation.js';
import { updateSchedule } from '../../server/domain.js';
import { NOW, seed } from './fixtures.js';

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('schedule validation identifies a missing weekday configuration', () => {
  const schedule = seed().weeklyHours;
  delete schedule.tuesday;
  assert.ok(validateSchedule(schedule).tuesday);
});

test('enabled weekdays require at least one time range', () => {
  const schedule = seed().weeklyHours;
  schedule.monday.ranges = [];
  assert.ok(validateSchedule(schedule).monday);
});

test('a fourth valid range exceeds the weekday limit', () => {
  const schedule = seed().weeklyHours;
  schedule.monday.ranges = [
    { start: '08:00', end: '08:30' },
    { start: '09:00', end: '09:30' },
    { start: '10:00', end: '10:30' },
    { start: '11:00', end: '11:30' },
  ];
  assert.ok(validateSchedule(schedule).monday);
});

test('schedule normalization removes transient editor metadata', () => {
  const schedule = seed().weeklyHours;
  schedule.monday.editorId = 'temporary';
  schedule.monday.ranges[0].selected = true;
  const normalized = normalizeSchedule(schedule);
  assert.deepEqual(normalized.monday, {
    enabled: true,
    ranges: [
      { start: '09:00', end: '13:00' },
      { start: '15:00', end: '18:00' },
    ],
  });
});

test('updating Monday leaves unrelated weekday hours intact', () => {
  const state = seed();
  const tuesday = structuredClone(state.weeklyHours.tuesday);
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '12:00' }];
  updateSchedule(state, schedule, NOW);
  assert.deepEqual(state.weeklyHours.tuesday, tuesday);
  assert.deepEqual(state.weeklyHours.monday.ranges, [{ start: '10:00', end: '12:00' }]);
});
