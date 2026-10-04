import assert from 'node:assert/strict';
import { test } from 'node:test';
import { datesInMonth, isValidDate, isValidMonth, minutesToTime, timeToMinutes } from '../../public/shared/dates.js';

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('calendar validation accepts February 29 in a leap year', () => {
  assert.equal(isValidDate('2028-02-29'), true);
});

test('calendar validation rejects February 29 in a common year', () => {
  assert.equal(isValidDate('2027-02-29'), false);
});

test('month validation enforces its upper supported year boundary', () => {
  assert.equal(isValidMonth('9998-12'), true);
  assert.equal(isValidMonth('9999-01'), false);
});

test('time conversion round-trips the final minute and rejects 24:00', () => {
  assert.equal(timeToMinutes('23:59'), 1439);
  assert.equal(minutesToTime(1439), '23:59');
  assert.equal(timeToMinutes('24:00'), null);
});

test('month expansion includes all 29 leap-February dates in order', () => {
  const dates = datesInMonth('2028-02');
  assert.equal(dates.length, 29);
  assert.equal(dates[0], '2028-02-01');
  assert.equal(dates.at(-1), '2028-02-29');
});
