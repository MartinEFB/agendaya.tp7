import { WEEK_DAYS, isValidDate, timeToMinutes } from './dates.js';

export const BLOCK_REASONS = ['Feriado', 'Motivo Personal'];
export const BLOCK_RANGE_REASONS = ['Vacaciones', 'Licencia Médica'];

export function validateQuickSettings(settings) {
  const errors = {};
  const values = settings || {};
  const limits = [
    ['maxDailyBookings', 1, Infinity, 'Ingresa un máximo diario entero mayor que 0.'],
    ['intervalMinutes', 0, 120, 'El intervalo debe ser un número entero entre 0 y 120 minutos.'],
    ['leadHours', 1, 72, 'La antelación debe ser un número entero entre 1 y 72 horas.'],
  ];
  for (const [name, min, max, message] of limits) {
    const value = values[name];
    if (!Number.isSafeInteger(value) || value < min || value > max) errors[name] = message;
  }
  return errors;
}

export function validateSchedule(weeklyHours) {
  const errors = {};
  if (!weeklyHours || typeof weeklyHours !== 'object' || Array.isArray(weeklyHours)) {
    return { schedule: 'La configuración de horarios no es válida.' };
  }
  for (const { key } of WEEK_DAYS) {
    const day = weeklyHours[key];
    if (!day || typeof day.enabled !== 'boolean' || !Array.isArray(day.ranges)) {
      errors[key] = 'Revisa la configuración de este día.';
      continue;
    }
    if (day.ranges.length > 3 || (day.enabled && day.ranges.length === 0)) {
      errors[key] = 'Cada día habilitado debe tener entre 1 y 3 franjas.';
    }
    const validRanges = [];
    day.ranges.forEach((range, index) => {
      const start = timeToMinutes(range?.start);
      const end = timeToMinutes(range?.end);
      if (start === null || end === null) {
        errors[`${key}-${index}`] = 'Completa ambas horas en formato HH:mm.';
      } else if (end <= start) {
        errors[`${key}-${index}`] = 'La hora de fin debe ser posterior a la de inicio.';
      } else validRanges.push({ start, end, index });
    });
    validRanges.sort((left, right) => left.start - right.start);
    for (let index = 1; index < validRanges.length; index += 1) {
      if (validRanges[index].start < validRanges[index - 1].end) {
        errors[`${key}-${validRanges[index].index}`] = 'Las franjas de este día no pueden superponerse.';
      }
    }
  }
  return errors;
}

export function normalizeSchedule(weeklyHours) {
  return Object.fromEntries(
    WEEK_DAYS.map(({ key }) => [
      key,
      {
        enabled: weeklyHours[key].enabled,
        ranges: weeklyHours[key].ranges.map(({ start, end }) => ({ start, end })),
      },
    ]),
  );
}

export function validateBlock({ date, reason } = {}) {
  const errors = {};
  if (!isValidDate(date)) errors.date = 'Selecciona una fecha válida.';
  if (!BLOCK_REASONS.includes(reason)) errors.reason = 'Selecciona un motivo de la lista.';
  return errors;
}

export function validateDateRange({ startDate, endDate, reason } = {}) {
  const errors = {};
  if (!isValidDate(startDate)) errors.startDate = 'Selecciona una fecha de inicio válida.';
  if (!isValidDate(endDate) || (isValidDate(startDate) && endDate <= startDate)) {
    errors.endDate = 'La fecha de fin debe ser posterior a la de inicio.';
  }
  if (!BLOCK_RANGE_REASONS.includes(reason)) errors.reason = 'Selecciona una categoría de la lista.';
  return errors;
}

// HTML email-input-compatible syntax. No DNS lookup or arbitrary domain suffix rule.
export function isValidEmail(value) {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
      value,
    )
  );
}

export function validateGuest(guest = {}) {
  const errors = {};
  if (typeof guest.name !== 'string' || !guest.name.trim()) errors.name = 'Ingresa tu nombre completo.';
  if (typeof guest.email !== 'string' || !guest.email.trim()) errors.email = 'Ingresa tu correo electrónico.';
  else if (!isValidEmail(guest.email.trim())) errors.email = 'Ingresa un correo electrónico válido.';
  if (guest.phone !== undefined && typeof guest.phone !== 'string') errors.phone = 'El teléfono debe ser texto.';
  if (guest.note !== undefined && typeof guest.note !== 'string') errors.note = 'La nota debe ser texto.';
  return errors;
}
