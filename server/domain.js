import {
  datesInMonth,
  dayKey,
  isValidDate,
  localDate,
  minutesToTime,
  slotTimestamp,
  timeToMinutes,
} from '../public/shared/dates.js';
import {
  normalizeSchedule,
  validateBlock,
  validateDateRange,
  validateGuest,
  validateQuickSettings,
  validateSchedule,
} from '../public/shared/validation.js';
import { DEFAULT_QUICK_SETTINGS, DEMO_EVENT, DEMO_EVENTS } from './seed.js';

export const HOLD_DURATION_MS = 15 * 60 * 1000;
export const EXCEPTION_DURATION_MS = 24 * 60 * 60 * 1000;

export class DomainError extends Error {
  constructor(message, status = 400, fields = {}, code = 'INVALID_INPUT', details = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
    this.details = details;
  }
}

function requireValid(errors) {
  if (Object.keys(errors).length) throw new DomainError('Revisa los datos indicados.', 400, errors);
}

function eventFor(eventId) {
  const event = DEMO_EVENTS.find((item) => item.id === eventId);
  if (!event) throw new DomainError('Selecciona un tipo de servicio válido.');
  return event;
}

export function isLiveHold(hold, now) {
  return hold.expiresAt > now;
}

// Existing schema-v1 files predate quick settings; use defaults until first save.
export function quickSettingsOf(state) {
  return { ...DEFAULT_QUICK_SETTINGS, ...state.quickSettings };
}

export function updateQuickSettings(state, settings) {
  requireValid(validateQuickSettings(settings));
  state.quickSettings = {
    maxDailyBookings: settings.maxDailyBookings,
    intervalMinutes: settings.intervalMinutes,
    leadHours: settings.leadHours,
  };
  return { quickSettings: state.quickSettings };
}

export function scheduledSlots(state, date, now, eventId = DEMO_EVENT.id) {
  const event = eventFor(eventId);
  if (!isValidDate(date) || date < localDate(now)) return [];
  //Comentado para simular incidente de soporte
  //if (state.blockedDays.some((blocked) => blocked.date === date)) return [];
  if (state.blockedRanges?.some((blocked) => blocked.startDate <= date && date <= blocked.endDate)) return [];
  const day = state.weeklyHours[dayKey(date)];
  if (!day.enabled) return [];
  const { intervalMinutes, leadHours } = quickSettingsOf(state);
  const slots = [];
  let nextStart = 0;
  for (const range of [...day.ranges].sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start))) {
    const end = timeToMinutes(range.end);
    for (
      let minute = Math.max(timeToMinutes(range.start), nextStart);
      minute + event.duration <= end;
      minute += event.duration + intervalMinutes
    ) {
      const time = minutesToTime(minute);
      if (slotTimestamp(date, time) >= now + leadHours * 60 * 60 * 1000) slots.push(time);
      nextStart = minute + event.duration + intervalMinutes;
    }
  }
  return slots;
}

function overlaps(date, time, record, intervalMinutes, duration) {
  if (record.date !== date) return false;
  const start = timeToMinutes(time);
  const otherStart = timeToMinutes(record.time);
  return (
    start < otherStart + (record.duration || DEMO_EVENT.duration) + intervalMinutes &&
    start + duration + intervalMinutes > otherStart
  );
}

export function availableSlots(state, date, now, ownToken = null, eventId = DEMO_EVENT.id) {
  const event = eventFor(eventId);
  const { maxDailyBookings, intervalMinutes } = quickSettingsOf(state);
  const activeBookings = state.bookings.filter((booking) => booking.status !== 'CANCELLED');
  const confirmedCount = activeBookings.filter((booking) => booking.date === date).length;
  const activeHoldCount = state.holds.filter(
    (hold) => hold.date === date && hold.token !== ownToken && isLiveHold(hold, now),
  ).length;
  if (confirmedCount + activeHoldCount >= maxDailyBookings) return [];
  return scheduledSlots(state, date, now, eventId).filter((time) => {
    const booked = activeBookings.some((booking) => overlaps(date, time, booking, intervalMinutes, event.duration));
    const held = state.holds.some(
      (hold) =>
        hold.token !== ownToken && isLiveHold(hold, now) && overlaps(date, time, hold, intervalMinutes, event.duration),
    );
    return !booked && !held;
  });
}

export function monthlyAvailability(state, month, now, eventId = DEMO_EVENT.id) {
  return datesInMonth(month).map((date) => ({ date, slots: availableSlots(state, date, now, null, eventId) }));
}

function bookingFitsSchedule(booking, schedule) {
  const day = schedule[dayKey(booking.date)];
  if (!day.enabled) return false;
  const start = timeToMinutes(booking.time);
  return day.ranges.some(
    (range) =>
      start >= timeToMinutes(range.start) &&
      start + (booking.duration || DEMO_EVENT.duration) <= timeToMinutes(range.end),
  );
}

export function updateSchedule(state, schedule, now = Date.now()) {
  requireValid(validateSchedule(schedule));
  const nextSchedule = normalizeSchedule(schedule);
  const affected = state.bookings.filter(
    (booking) =>
      booking.status === 'CONFIRMED' &&
      slotTimestamp(booking.date, booking.time) > now &&
      !bookingFitsSchedule(booking, nextSchedule),
  );
  state.weeklyHours = nextSchedule;
  state.notificationOutbox ??= [];
  for (const booking of affected) {
    booking.status = 'EXCEPTION';
    booking.exceptionCreatedAt = now;
    booking.exceptionDeadline = now + EXCEPTION_DURATION_MS;
    state.notificationOutbox.push({
      type: 'EXCEPTION_NOTICE',
      reference: booking.reference,
      recipient: booking.guest?.email || '',
      createdAt: now,
      deadline: booking.exceptionDeadline,
      delivery: 'SIMULATED_NOT_SENT',
      accessMethod: 'SAME_BROWSER_SESSION',
      message:
        'Abre la reserva en la misma pestaña y navegador para elegir otro horario antes del plazo indicado. Este aviso no fue enviado por correo.',
    });
  }
  return { weeklyHours: state.weeklyHours, exceptions: affected.map((booking) => booking.reference) };
}

export function expireExceptions(state, now) {
  const expired = [];
  for (const booking of state.bookings) {
    if (booking.status !== 'EXCEPTION' || booking.exceptionDeadline > now) continue;
    booking.status = 'CANCELLED';
    booking.cancelReason = 'EXCEPTION_DEADLINE';
    booking.exceptionResolvedAt = now;
    delete booking.exceptionDeadline;
    expired.push(booking.reference);
  }
  return expired;
}

export function reassignException(state, reference, input, now) {
  const booking = state.bookings.find((item) => item.reference === reference);
  if (!booking || booking.status !== 'EXCEPTION') {
    throw new DomainError('No se encontró un turno pendiente de reasignación.', 404, {}, 'EXCEPTION_NOT_FOUND');
  }
  if (booking.exceptionDeadline <= now) {
    throw new DomainError('El plazo de reasignación finalizó.', 410, {}, 'EXCEPTION_EXPIRED');
  }
  if (!isValidDate(input?.date) || timeToMinutes(input?.time) === null) {
    throw new DomainError('Selecciona una fecha y un horario válidos.', 400, {
      date: 'Selecciona una fecha válida.',
      time: 'Selecciona un horario válido.',
    });
  }
  const withoutCurrent = { ...state, bookings: state.bookings.filter((item) => item !== booking) };
  if (!availableSlots(withoutCurrent, input.date, now).includes(input.time)) {
    throw new DomainError('Este horario ya no está disponible. Selecciona otro.', 409, {}, 'SLOT_UNAVAILABLE');
  }
  booking.date = input.date;
  booking.time = input.time;
  booking.status = 'CONFIRMED';
  booking.exceptionResolvedAt = now;
  booking.exceptionResolution = 'REASSIGNED';
  delete booking.exceptionDeadline;
  return { reference: booking.reference, date: booking.date, time: booking.time, status: booking.status };
}

function guestException(state, token, now) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new DomainError('No se encontró un turno pendiente de reasignación.', 404, {}, 'EXCEPTION_NOT_FOUND');
  }
  const booking = state.bookings.find((item) => item.holdToken === token);
  if (!booking || booking.status !== 'EXCEPTION') {
    throw new DomainError('No se encontró un turno pendiente de reasignación.', 404, {}, 'EXCEPTION_NOT_FOUND');
  }
  if (booking.exceptionDeadline <= now) {
    throw new DomainError('El plazo de reasignación finalizó.', 410, {}, 'EXCEPTION_EXPIRED');
  }
  return booking;
}

export function guestReassignmentSlots(state, token, date, now) {
  const booking = guestException(state, token, now);
  const withoutCurrent = { ...state, bookings: state.bookings.filter((item) => item !== booking) };
  return availableSlots(withoutCurrent, date, now);
}

export function reassignGuestException(state, token, input, now) {
  const booking = guestException(state, token, now);
  reassignException(state, booking.reference, input, now);
  return bookingReceipt(booking);
}

export function exceptionSummary(state) {
  return {
    bookings: state.bookings
      .filter((booking) => booking.exceptionCreatedAt !== undefined)
      .map((booking) => ({
        reference: booking.reference,
        date: booking.date,
        time: booking.time,
        status: booking.status,
        deadline: booking.exceptionDeadline ?? null,
        resolution: booking.exceptionResolution || booking.cancelReason || null,
      })),
    notifications: (state.notificationOutbox || []).map(
      ({ type, reference, createdAt, deadline, delivery, accessMethod, message, guestEmailStatus }) => ({
        type,
        reference,
        createdAt,
        deadline,
        delivery,
        accessMethod,
        message,
        guestEmailStatus,
      }),
    ),
  };
}

export function blockDateRange(state, input) {
  requireValid(validateDateRange(input));
  const { startDate, endDate, reason } = input;
  const dates = state.bookings
    .filter((booking) => booking.status !== 'CANCELLED' && booking.date >= startDate && booking.date <= endDate)
    .map((booking) => booking.date);
  const conflictDates = [...new Set(dates)].sort();
  if (conflictDates.length) {
    throw new DomainError(
      `No se puede bloquear el rango: hay turnos confirmados el ${conflictDates.join(', ')}.`,
      409,
      {},
      'BOOKING_CONFLICT',
      { dates: conflictDates },
    );
  }
  const blockedDay = state.blockedDays.find((day) => day.date >= startDate && day.date <= endDate);
  const blockedRange = state.blockedRanges?.find((range) => range.startDate <= endDate && range.endDate >= startDate);
  if (blockedDay || blockedRange) {
    throw new DomainError('El rango contiene fechas ya bloqueadas.', 409, {}, 'ALREADY_BLOCKED');
  }
  const range = { startDate, endDate, reason };
  state.blockedRanges ??= [];
  state.blockedRanges.push(range);
  state.blockedRanges.sort((left, right) => left.startDate.localeCompare(right.startDate));
  return range;
}

export function blockDay(state, input) {
  requireValid(validateBlock(input));
  const count = state.bookings.filter(
    (booking) => booking.date === input.date && booking.status !== 'CANCELLED',
  ).length;
  if (count) {
    throw new DomainError(
      `No puedes bloquear este día porque tienes ${count} ${count === 1 ? 'turno agendado' : 'turnos agendados'}. Cancélalos o prográmalos primero.`,
      409,
      {},
      'BOOKING_CONFLICT',
      { count },
    );
  }
  if (
    state.blockedDays.some((blocked) => blocked.date === input.date) ||
    state.blockedRanges?.some((range) => range.startDate <= input.date && input.date <= range.endDate)
  ) {
    throw new DomainError('Este día ya está bloqueado.', 409, { date: 'Selecciona otra fecha.' }, 'ALREADY_BLOCKED');
  }
  const blocked = { date: input.date, reason: input.reason };
  state.blockedDays.push(blocked);
  state.blockedDays.sort((left, right) => left.date.localeCompare(right.date));
  return blocked;
}

export function createHold(state, input, now, token) {
  if (!isValidDate(input?.date) || timeToMinutes(input?.time) === null) {
    throw new DomainError('Selecciona una fecha y un horario válidos.');
  }
  const event = eventFor(input.eventId);
  state.holds = state.holds.filter((hold) => isLiveHold(hold, now));
  if (!availableSlots(state, input.date, now, null, event.id).includes(input.time)) {
    throw new DomainError('Este horario ya no está disponible. Selecciona otro.', 409, {}, 'SLOT_UNAVAILABLE');
  }
  const hold = {
    token,
    eventId: event.id,
    date: input.date,
    time: input.time,
    duration: event.duration,
    expiresAt: now + HOLD_DURATION_MS,
  };
  state.holds.push(hold);
  return { ...hold, serverNow: now };
}

export function bookingReceipt(booking) {
  const event = eventFor(booking.eventId || DEMO_EVENT.id);
  return {
    reference: booking.reference,
    date: booking.date,
    time: booking.time,
    eventId: event.id,
    eventName: event.name,
    duration: booking.duration,
    status: booking.status,
    exceptionDeadline: booking.exceptionDeadline ?? null,
    notifications: {
      guestEmail: booking.guestEmailStatus || 'SIMULATED_NOT_SENT',
      administrator: 'SIMULATED_NOT_SENT',
    },
  };
}

export function findHold(state, token, now) {
  const booking = state.bookings.find((item) => item.holdToken === token);
  if (booking) return { receipt: bookingReceipt(booking), serverNow: now };
  const hold = state.holds.find((item) => item.token === token);
  if (!hold || !isLiveHold(hold, now)) {
    throw new DomainError('El tiempo de reserva finalizó. Selecciona nuevamente un horario.', 410, {}, 'HOLD_EXPIRED');
  }
  if (!availableSlots(state, hold.date, now, token, hold.eventId || DEMO_EVENT.id).includes(hold.time)) {
    throw new DomainError('La disponibilidad cambió. Selecciona otro horario.', 409, {}, 'SLOT_UNAVAILABLE');
  }
  return { ...hold, serverNow: now };
}

export function confirmBooking(state, token, guest, now, reference, guestEmailStatus = 'SIMULATED_NOT_SENT') {
  const previous = state.bookings.find((item) => item.holdToken === token);
  if (previous) return bookingReceipt(previous);
  requireValid(validateGuest(guest));
  if (!['SIMULATED_NOT_SENT', 'SIMULATED_FAILED'].includes(guestEmailStatus)) {
    throw new Error('Invalid simulated email status.');
  }
  const hold = findHold(state, token, now);
  const booking = {
    reference,
    holdToken: token,
    eventId: hold.eventId,
    date: hold.date,
    time: hold.time,
    duration: hold.duration,
    guest: {
      name: guest.name.trim(),
      email: guest.email.trim(),
      phone: guest.phone?.trim() || '',
      note: guest.note?.trim() || '',
    },
    status: 'CONFIRMED',
    createdAt: now,
    guestEmailStatus,
  };
  state.bookings.push(booking);
  state.holds = state.holds.filter((item) => item.token !== token);
  state.notificationOutbox ??= [];
  state.notificationOutbox.push({
    type: 'BOOKING_CONFIRMED',
    reference,
    createdAt: now,
    delivery: 'SIMULATED_NOT_SENT',
    guestEmailStatus,
  });
  return bookingReceipt(booking);
}
