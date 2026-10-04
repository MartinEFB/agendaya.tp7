import { api } from './api.js';
import { displayFieldErrors, escapeHtml as safe, showConflict, toast } from './ui.js';
import { formatDate, isValidDate, minutesToTime, timeToMinutes, WEEK_DAYS } from '../shared/dates.js';
import {
  BLOCK_REASONS,
  BLOCK_RANGE_REASONS,
  validateBlock,
  validateDateRange,
  validateQuickSettings,
  validateSchedule,
} from '../shared/validation.js';

export class AdminView {
  constructor(onSaved) {
    this.onSaved = onSaved;
    this.weeklyHours = null;
    this.blockedDays = [];
    this.blockedRanges = [];
    this.exceptions = { bookings: [], notifications: [] };
    this.quickSettings = null;
    this.busy = false;
    this.root = document.getElementById('admin-content');
    this.root.addEventListener('change', (event) => this.onChange(event));
    this.root.addEventListener('input', (event) => this.onInput(event));
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('submit', (event) => this.onSubmit(event));
  }

  async initialize() {
    const [result, exceptions] = await Promise.all([api('/api/admin/availability'), api('/api/admin/exceptions')]);
    this.weeklyHours = result.weeklyHours;
    this.blockedDays = result.blockedDays;
    this.blockedRanges = result.blockedRanges;
    this.exceptions = exceptions;
    this.quickSettings = result.quickSettings;
    this.render();
  }

  render() {
    this.root.innerHTML = `<div class="admin-layout">
      <section class="admin-card" aria-labelledby="schedule-heading"><div class="card-heading"><p class="eyebrow">01 / TU SEMANA HABITUAL</p><h2 id="schedule-heading">Horarios de atención</h2><p>Activa los días laborables y define hasta 3 franjas por día.</p></div>
      <form class="schedule-form" id="schedule-form" novalidate data-cy="schedule-form"><div class="week-editor" id="week-editor">${WEEK_DAYS.map((day) => this.renderDay(day)).join('')}</div>
      <div class="schedule-footer"><p>Hora local de Buenos Aires. Si un turno confirmado queda fuera del horario, se marca como excepción y se puede reasignar durante 24 horas. Las notificaciones de esta demo son simuladas; no se envían correos.</p><button type="submit" class="button primary" data-cy="save-schedule">Guardar horarios <span aria-hidden="true">↗</span></button></div>
      <p id="schedule-error" class="field-error" role="alert" data-cy="schedule-error"></p></form></section>
      <aside class="admin-side">
        <section class="admin-card" aria-labelledby="quick-settings-heading"><div class="card-heading"><p class="eyebrow">02 / AJUSTES DE RESERVAS</p><h2 id="quick-settings-heading">Configuraciones rápidas</h2><p>Define los límites que se aplican de inmediato al calendario público.</p></div>
        <form class="quick-settings-form" id="quick-settings-form" novalidate data-cy="quick-settings-form">
          <div class="field"><label for="max-daily-bookings">Máximo de turnos por día <span>*</span></label><input id="max-daily-bookings" name="maxDailyBookings" type="number" min="1" step="1" required value="${this.quickSettings.maxDailyBookings}" aria-describedby="quick-maxDailyBookings-error" data-cy="max-daily-bookings"><p id="quick-maxDailyBookings-error" class="field-error" data-cy="max-daily-bookings-error"></p></div>
          <div class="field"><label for="interval-minutes">Intervalo entre turnos (minutos) <span>*</span></label><input id="interval-minutes" name="intervalMinutes" type="number" min="0" max="120" step="1" required value="${this.quickSettings.intervalMinutes}" aria-describedby="quick-intervalMinutes-error" data-cy="interval-minutes"><p id="quick-intervalMinutes-error" class="field-error" data-cy="interval-minutes-error"></p></div>
          <div class="field"><label for="lead-hours">Antelación mínima (horas) <span>*</span></label><input id="lead-hours" name="leadHours" type="number" min="1" max="72" step="1" required value="${this.quickSettings.leadHours}" aria-describedby="quick-leadHours-error" data-cy="lead-hours"><p id="quick-leadHours-error" class="field-error" data-cy="lead-hours-error"></p></div>
          <button class="button primary full-width" type="submit" data-cy="save-quick-settings">Guardar configuración</button><p id="quick-submit-error" class="field-error" role="alert" data-cy="quick-submit-error"></p>
        </form></section>
        <section class="admin-card" aria-labelledby="block-heading"><div class="card-heading"><p class="eyebrow">03 / UNA PAUSA NECESARIA</p><h2 id="block-heading">Bloquear un día</h2><p>Deja una fecha fuera de tu agenda pública.</p></div>
        <div class="block-content"><form class="block-form" id="block-form" novalidate data-cy="block-day-form">
        <div class="field"><label for="block-date">Fecha <span>*</span></label><input type="date" id="block-date" name="date" required aria-describedby="block-date-error" data-cy="block-date"><p id="block-date-error" class="field-error" data-cy="block-date-error"></p></div>
        <div class="field"><label for="block-reason">Motivo <span>*</span></label><select id="block-reason" name="reason" required aria-describedby="block-reason-error" data-cy="block-reason"><option value="">Selecciona un motivo</option>${BLOCK_REASONS.map((reason) => `<option value="${safe(reason)}">${safe(reason)}</option>`).join('')}</select><p id="block-reason-error" class="field-error" data-cy="block-reason-error"></p></div>
        <button class="button coral full-width" type="submit" data-cy="block-day">Bloquear este día <span aria-hidden="true">↗</span></button><p id="block-submit-error" class="field-error" role="alert" data-cy="block-submit-error"></p>
        </form><p class="block-note">Si la fecha tiene turnos confirmados, el sistema te avisará y no permitirá bloquearla.</p></div></section>
        <section class="admin-card" aria-labelledby="range-heading"><div class="card-heading"><p class="eyebrow">04 / PAUSA PROLONGADA</p><h2 id="range-heading">Bloquear un rango</h2><p>Ambas fechas quedan incluidas en el bloqueo.</p></div>
        <div class="block-content"><form class="block-form" id="range-form" novalidate data-cy="block-range-form">
          <div class="field"><label for="range-start">Desde <span>*</span></label><input type="date" id="range-start" name="startDate" required aria-describedby="range-startDate-error" data-cy="range-start"><p id="range-startDate-error" class="field-error" data-cy="range-start-error"></p></div>
          <div class="field"><label for="range-end">Hasta <span>*</span></label><input type="date" id="range-end" name="endDate" required aria-describedby="range-endDate-error" data-cy="range-end"><p id="range-endDate-error" class="field-error" role="alert" data-cy="range-end-error"></p></div>
          <div class="field"><label for="range-reason">Categoría <span>*</span></label><select id="range-reason" name="reason" required aria-describedby="range-reason-error" data-cy="range-reason"><option value="">Selecciona una categoría</option>${BLOCK_RANGE_REASONS.map((reason) => `<option value="${safe(reason)}">${safe(reason)}</option>`).join('')}</select><p id="range-reason-error" class="field-error" data-cy="range-reason-error"></p></div>
          <button class="button coral full-width" type="submit" data-cy="block-range" disabled>Bloquear rango <span aria-hidden="true">↗</span></button><p id="range-submit-error" class="field-error" role="alert" data-cy="range-submit-error"></p>
        </form><p class="block-note">Si alguna fecha tiene un turno confirmado, no se bloqueará ninguna.</p></div></section>
        <section class="admin-card" aria-labelledby="blocked-heading"><div class="card-heading"><h2 id="blocked-heading">Días bloqueados</h2><p>Estas fechas no admiten nuevas reservas.</p></div><div id="blocked-days" data-cy="blocked-days">${this.renderBlockedDays()}</div></section>
        <section class="admin-card" aria-labelledby="ranges-heading"><div class="card-heading"><h2 id="ranges-heading">Rangos bloqueados</h2><p>Bloqueos continuos de varios días.</p></div><div id="blocked-ranges" data-cy="blocked-ranges">${this.renderBlockedRanges()}</div></section>
        <section class="admin-card" aria-labelledby="exceptions-heading"><div class="card-heading"><h2 id="exceptions-heading">Excepciones de horario</h2><p>Turnos afectados por un cambio de atención. Los avisos se registran, pero no se envían correos.</p></div><div id="schedule-exceptions" data-cy="schedule-exceptions">${this.renderExceptions()}</div></section>
        <section class="admin-card" aria-labelledby="booking-notifications-heading"><div class="card-heading"><h2 id="booking-notifications-heading">Avisos de reservas</h2><p>Confirmaciones registradas en esta demo. No se enviaron notificaciones externas.</p></div><div id="booking-notifications" data-cy="booking-notifications">${this.renderBookingNotifications()}</div></section>
        <p class="scope-note">Administración simulada, sin inicio de sesión. En la demo compartida, cualquier persona con el enlace puede cambiar horarios y bloquear fechas.</p>
      </aside>
    </div>`;
  }

  renderDay({ key, label }) {
    const day = this.weeklyHours[key];
    return `<div class="day-row" data-day-row="${key}"><label class="day-switch"><input type="checkbox" data-cy="working-day-toggle" data-day="${key}" aria-label="Habilitar ${label}" ${day.enabled ? 'checked' : ''}><span>${label}</span></label>
    <div class="day-ranges">${day.enabled ? `<div class="range-list">${day.ranges.map((range, index) => `<div><div class="range-row"><label class="sr-only" for="${key}-${index}-start">Inicio de ${label}, franja ${index + 1}</label><input class="time-input" type="time" step="60" required id="${key}-${index}-start" data-day="${key}" data-index="${index}" data-edge="start" data-cy="range-start" aria-describedby="${key}-${index}-error" value="${safe(range.start)}"><span aria-hidden="true">a</span><label class="sr-only" for="${key}-${index}-end">Fin de ${label}, franja ${index + 1}</label><input class="time-input" type="time" step="60" required id="${key}-${index}-end" data-day="${key}" data-index="${index}" data-edge="end" data-cy="range-end" aria-describedby="${key}-${index}-error" value="${safe(range.end)}"><button class="range-remove" type="button" data-cy="remove-range" data-day="${key}" data-index="${index}" aria-label="Quitar franja ${index + 1} de ${label}" ${day.ranges.length === 1 ? 'disabled' : ''}>×</button></div><p class="field-error" id="${key}-${index}-error" data-cy="range-error"></p></div>`).join('')}</div><button type="button" class="add-range" data-cy="add-range" data-day="${key}" ${day.ranges.length >= 3 ? 'disabled' : ''}><span aria-hidden="true">+</span> ${day.ranges.length >= 3 ? 'Máximo de 3 franjas' : 'Agregar franja'}</button>` : '<div class="day-disabled">Sin atención</div>'}<p class="field-error" id="${key}-error" data-cy="day-error"></p></div></div>`;
  }

  renderBlockedDays() {
    if (!this.blockedDays.length)
      return '<p class="blocked-empty">Tu agenda no tiene días bloqueados.<br>Las pausas que guardes aparecerán aquí.</p>';
    return `<ul class="blocked-list">${this.blockedDays.map((day) => `<li class="blocked-item" data-cy="blocked-day" data-date="${day.date}"><div><strong>${safe(formatDate(day.date, { year: 'numeric' }))}</strong><small>${safe(day.reason)}</small></div><span class="blocked-tag">No disponible</span></li>`).join('')}</ul>`;
  }

  renderBlockedRanges() {
    if (!this.blockedRanges.length) return '<p class="blocked-empty">No hay rangos bloqueados.</p>';
    return `<ul class="blocked-list">${this.blockedRanges.map((range) => `<li class="blocked-item" data-cy="blocked-range"><div><strong>${safe(formatDate(range.startDate, { year: 'numeric' }))} a ${safe(formatDate(range.endDate, { year: 'numeric' }))}</strong><small>${safe(range.reason)}</small></div><span class="blocked-tag">No disponible</span></li>`).join('')}</ul>`;
  }

  renderExceptions() {
    if (!this.exceptions.bookings.length)
      return '<p class="blocked-empty">No hay turnos afectados por cambios de horario.</p>';
    return `<div class="exception-list">${this.exceptions.bookings
      .map((booking) => {
        const deadline = booking.deadline
          ? new Date(booking.deadline).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
          : '';
        const notice = this.exceptions.notifications.some(
          (item) => item.type === 'EXCEPTION_NOTICE' && item.reference === booking.reference,
        );
        return `<div class="exception-item" data-cy="schedule-exception"><strong>${safe(booking.reference)}</strong><p>${safe(booking.date)} · ${safe(booking.time)} · ${safe(booking.status === 'EXCEPTION' ? 'Excepción' : booking.status === 'CANCELLED' ? 'Cancelado' : 'Reasignado')}</p>
        ${booking.status === 'EXCEPTION' ? `<p>Reasignar antes del ${safe(deadline)}.</p><form class="exception-form" data-reference="${safe(booking.reference)}" data-cy="reassign-form"><label>Nuevo día <input type="date" name="date" required data-cy="reassign-date"></label><label>Nuevo horario <input type="time" name="time" required data-cy="reassign-time"></label><button class="button primary full-width" type="submit" data-cy="reassign-booking">Reasignar turno</button><p class="field-error" role="alert" data-cy="reassign-error"></p></form>` : ''}
        ${notice ? '<small>Aviso registrado en la demo; correo no enviado.</small>' : ''}</div>`;
      })
      .join('')}</div>`;
  }

  renderBookingNotifications() {
    const notices = this.exceptions.notifications.filter((item) => item.type === 'BOOKING_CONFIRMED');
    if (!notices.length) return '<p class="blocked-empty">Todavía no hay reservas confirmadas.</p>';
    return `<div class="exception-list">${notices.map((item) => `<div class="exception-item" data-cy="booking-alert"><strong>Reserva confirmada ${safe(item.reference)}</strong><p>${safe(new Date(item.createdAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }))}</p><small>${item.guestEmailStatus === 'SIMULATED_FAILED' ? 'La simulación del aviso por correo falló.' : 'Aviso simulado; no se envió ningún correo.'}</small></div>`).join('')}</div>`;
  }

  async refreshExceptions() {
    this.exceptions = await api('/api/admin/exceptions');
    this.root.querySelector('#schedule-exceptions').innerHTML = this.renderExceptions();
    this.root.querySelector('#booking-notifications').innerHTML = this.renderBookingNotifications();
  }

  refreshRangeValidity(form, showErrors = true) {
    const input = Object.fromEntries(new FormData(form));
    const errors = validateDateRange(input);
    const end = form.querySelector('[name="endDate"]');
    if (isValidDate(input.startDate)) {
      const next = new Date(`${input.startDate}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      end.min = next.toISOString().slice(0, 10);
    } else end.removeAttribute('min');
    form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
    for (const name of ['startDate', 'endDate', 'reason']) form.querySelector(`#range-${name}-error`).textContent = '';
    if (showErrors) {
      for (const [name, message] of Object.entries(errors)) {
        form.querySelector(`[name="${name}"]`)?.setAttribute('aria-invalid', 'true');
        form.querySelector(`#range-${name}-error`).textContent = message;
      }
    }
    form.querySelector('[type="submit"]').disabled = Object.keys(errors).length > 0;
  }

  redrawDay(key) {
    this.root.querySelector(`[data-day-row="${key}"]`).outerHTML = this.renderDay(
      WEEK_DAYS.find((day) => day.key === key),
    );
  }

  onChange(event) {
    const input = event.target;
    if (input.closest('#range-form') && !this.busy) {
      input.closest('form').querySelector('#range-submit-error').textContent = '';
      this.refreshRangeValidity(input.closest('form'));
      return;
    }
    if (input.dataset.cy !== 'working-day-toggle' || this.busy) return;
    const day = this.weeklyHours[input.dataset.day];
    day.enabled = input.checked;
    if (day.enabled && !day.ranges.length) day.ranges = [{ start: '09:00', end: '17:00' }];
    this.redrawDay(input.dataset.day);
    this.root
      .querySelector(`[data-day="${input.dataset.day}"][data-cy="working-day-toggle"]`)
      .focus({ preventScroll: true });
  }

  onInput(event) {
    const input = event.target;
    if (input.closest('#range-form') && !this.busy) {
      input.closest('form').querySelector('#range-submit-error').textContent = '';
      this.refreshRangeValidity(input.closest('form'));
      return;
    }
    if (input.closest('#quick-settings-form')) {
      input.closest('form').classList.remove('settings-saved');
      return;
    }
    if (!input.dataset.edge || this.busy) return;
    this.weeklyHours[input.dataset.day].ranges[Number(input.dataset.index)][input.dataset.edge] = input.value;
  }

  onClick(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || this.busy || !button.dataset.day) return;
    const key = button.dataset.day;
    const day = this.weeklyHours[key];
    if (button.dataset.cy === 'add-range' && day.ranges.length < 3) {
      const latest = Math.max(...day.ranges.map((range) => timeToMinutes(range.end) ?? 0));
      const start = latest < 1380 ? minutesToTime(latest) : '';
      const end = latest < 1380 ? minutesToTime(Math.min(latest + 60, 1439)) : '';
      day.ranges.push({ start, end });
      this.redrawDay(key);
      this.root.querySelector(`#${key}-${day.ranges.length - 1}-start`).focus();
    } else if (button.dataset.cy === 'remove-range' && day.ranges.length > 1) {
      day.ranges.splice(Number(button.dataset.index), 1);
      this.redrawDay(key);
      this.root.querySelector(`[data-cy="add-range"][data-day="${key}"]`).focus();
    }
  }

  showScheduleErrors(errors) {
    this.root.querySelectorAll('.time-input').forEach((input) => input.removeAttribute('aria-invalid'));
    this.root.querySelectorAll('#schedule-form .field-error').forEach((field) => {
      field.textContent = '';
    });
    for (const [key, message] of Object.entries(errors)) {
      const container = this.root.querySelector(`#${CSS.escape(`${key}-error`)}`);
      if (container) container.textContent = message;
      for (const edge of ['start', 'end'])
        this.root.querySelector(`#${CSS.escape(`${key}-${edge}`)}`)?.setAttribute('aria-invalid', 'true');
    }
    this.root.querySelector('[aria-invalid="true"]')?.focus();
  }

  async onSubmit(event) {
    event.preventDefault();
    if (this.busy) return;
    const form = event.target;
    if (form.id === 'schedule-form') {
      const errors = validateSchedule(this.weeklyHours);
      this.showScheduleErrors(errors);
      if (Object.keys(errors).length) {
        toast('No se guardaron los cambios. Revisa las franjas horarias.', 'error');
        return;
      }
      this.busy = true;
      const controls = [...form.querySelectorAll('button, input')];
      controls.forEach((element) => {
        element.dataset.wasDisabled = String(element.disabled);
        element.disabled = true;
      });
      const button = form.querySelector('[type="submit"]');
      button.textContent = 'Guardando…';
      try {
        await api('/api/admin/availability', { method: 'PUT', body: { weeklyHours: this.weeklyHours } });
        await this.refreshExceptions();
        toast('Horarios guardados correctamente.');
        this.onSaved();
      } catch (error) {
        this.showScheduleErrors(error.fields || {});
        this.root.querySelector('#schedule-error').textContent = error.message;
        toast(error.message, 'error');
      } finally {
        controls.forEach((element) => {
          element.disabled = element.dataset.wasDisabled === 'true';
        });
        button.innerHTML = 'Guardar horarios <span aria-hidden="true">↗</span>';
        this.busy = false;
      }
    } else if (form.id === 'quick-settings-form') {
      const settings = Object.fromEntries(
        [...new FormData(form)].map(([key, value]) => [key, value === '' ? null : Number(value)]),
      );
      const errors = validateQuickSettings(settings);
      displayFieldErrors(form, errors, 'quick-');
      if (Object.keys(errors).length) {
        toast('No se guardaron los cambios. Revisa la configuración.', 'error');
        return;
      }
      this.busy = true;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      button.textContent = 'Guardando…';
      try {
        const result = await api('/api/admin/quick-settings', { method: 'PUT', body: settings });
        this.quickSettings = result.quickSettings;
        form.classList.add('settings-saved');
        toast('Configuración guardada correctamente.');
        this.onSaved();
      } catch (error) {
        displayFieldErrors(form, error.fields || {}, 'quick-');
        form.querySelector('#quick-submit-error').textContent = error.message;
        toast(error.message, 'error');
      } finally {
        button.disabled = false;
        button.textContent = 'Guardar configuración';
        this.busy = false;
      }
    } else if (form.id === 'block-form') {
      const input = Object.fromEntries(new FormData(form));
      const errors = validateBlock(input);
      displayFieldErrors(form, errors, 'block-');
      if (Object.keys(errors).length) {
        toast('Selecciona una fecha y un motivo para bloquear el día.', 'error');
        return;
      }
      this.busy = true;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      button.textContent = 'Guardando…';
      try {
        const blocked = await api('/api/admin/blocked-days', { method: 'POST', body: input });
        this.blockedDays.push(blocked);
        this.blockedDays.sort((left, right) => left.date.localeCompare(right.date));
        this.root.querySelector('#blocked-days').innerHTML = this.renderBlockedDays();
        form.reset();
        toast('Día bloqueado exitosamente');
        this.onSaved();
      } catch (error) {
        if (error.code === 'BOOKING_CONFLICT') {
          showConflict(error.message);
          toast('El día tiene turnos confirmados. No se guardaron cambios.', 'error');
        } else {
          displayFieldErrors(form, error.fields || {}, 'block-');
          form.querySelector('#block-submit-error').textContent = error.message;
          toast(error.message, 'error');
        }
      } finally {
        button.disabled = false;
        button.innerHTML = 'Bloquear este día <span aria-hidden="true">↗</span>';
        this.busy = false;
      }
    } else if (form.id === 'range-form') {
      const input = Object.fromEntries(new FormData(form));
      const errors = validateDateRange(input);
      displayFieldErrors(form, errors, 'range-');
      if (Object.keys(errors).length) return;
      this.busy = true;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      button.textContent = 'Guardando…';
      let saved = false;
      try {
        const range = await api('/api/admin/blocked-ranges', { method: 'POST', body: input });
        this.blockedRanges.push(range);
        this.blockedRanges.sort((left, right) => left.startDate.localeCompare(right.startDate));
        this.root.querySelector('#blocked-ranges').innerHTML = this.renderBlockedRanges();
        form.reset();
        saved = true;
        toast('Rango bloqueado exitosamente.');
        this.onSaved();
      } catch (error) {
        if (error.code === 'BOOKING_CONFLICT') showConflict(error.message);
        else displayFieldErrors(form, error.fields || {}, 'range-');
        form.querySelector('#range-submit-error').textContent = error.message;
        toast(error.message, 'error');
      } finally {
        button.innerHTML = 'Bloquear rango <span aria-hidden="true">↗</span>';
        this.busy = false;
        this.refreshRangeValidity(form, !saved);
      }
    } else if (form.matches('.exception-form')) {
      const input = Object.fromEntries(new FormData(form));
      const button = form.querySelector('[type="submit"]');
      this.busy = true;
      button.disabled = true;
      try {
        await api(`/api/admin/exceptions/${encodeURIComponent(form.dataset.reference)}/reassign`, {
          method: 'POST',
          body: input,
        });
        await this.refreshExceptions();
        toast('Turno reasignado correctamente.');
        this.onSaved();
      } catch (error) {
        form.querySelector('[data-cy="reassign-error"]').textContent = error.message;
        toast(error.message, 'error');
      } finally {
        button.disabled = false;
        this.busy = false;
      }
    }
  }
}
