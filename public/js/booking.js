import { api } from './api.js';
import { displayFieldErrors, escapeHtml as safe, storageGet, storageSet, toast } from './ui.js';
import { formatDate, offsetMonth } from '../shared/dates.js';
import { validateGuest } from '../shared/validation.js';

const HOLD_STORAGE_KEY = 'agendaya-current-hold';

export class BookingView {
  constructor(config) {
    this.config = config;
    this.events = config.events || [config.event];
    this.eventId = config.event.id;
    this.today = config.today;
    this.month = this.today.slice(0, 7);
    this.selectedDate = null;
    this.days = [];
    this.step = 'select';
    this.hold = null;
    this.receipt = null;
    this.busy = false;
    this.clockOffset = config.serverNow - Date.now();
    this.requestVersion = 0;
    this.message = '';
    this.content = document.getElementById('booking-content');
    this.content.addEventListener('click', (event) => this.onClick(event));
    this.content.addEventListener('submit', (event) => this.onSubmit(event));
  }

  async initialize() {
    const token = storageGet(HOLD_STORAGE_KEY);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      try {
        const selection = await api(`/api/holds/${token}`);
        this.clockOffset = selection.serverNow - Date.now();
        if (selection.receipt) {
          this.receipt = selection.receipt;
          this.eventId = selection.receipt.eventId;
          this.step = 'success';
        } else {
          this.hold = selection;
          this.eventId = selection.eventId;
          this.step = 'details';
        }
      } catch (error) {
        if (error.status === 0 || error.status >= 500) throw error;
        storageSet(HOLD_STORAGE_KEY, null);
        this.message = error.message;
      }
    }
    if (this.step === 'select') await this.refreshAvailability();
    else this.render();
    document.getElementById('booking-workspace').setAttribute('aria-busy', 'false');
    this.timer = setInterval(() => this.updateTimer(), 500);
    this.poller = setInterval(() => this.synchronize(), 5000);
    window.addEventListener('focus', () => this.synchronize());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.synchronize();
    });
  }

  async refreshAvailability() {
    const version = ++this.requestVersion;
    const token = storageGet(HOLD_STORAGE_KEY);
    const path =
      this.step === 'reassign'
        ? `/api/bookings/access/${token}/availability?month=${this.month}`
        : `/api/availability?month=${this.month}&eventId=${encodeURIComponent(this.eventId)}`;
    const result = await api(path);
    if (version !== this.requestVersion || !['select', 'reassign'].includes(this.step)) return;
    this.today = result.today;
    this.clockOffset = result.serverNow - Date.now();
    const changed = JSON.stringify(this.days) !== JSON.stringify(result.days);
    this.days = result.days;
    if (this.selectedDate && !this.days.some((day) => day.date === this.selectedDate && day.slots.length)) {
      this.selectedDate = null;
    }
    if (changed || !this.content.querySelector('.selection-layout')) this.render();
    const status = this.content.querySelector('[data-cy="availability-connection"]');
    if (status) {
      status.textContent = 'Disponibilidad actualizada';
      status.classList.remove('field-error');
    }
  }

  async synchronize() {
    if (document.hidden || this.busy) return;
    if (['success', 'reassign'].includes(this.step) && this.receipt) {
      try {
        await this.synchronizeReceipt();
      } catch {
        /* The last confirmed state remains visible while offline. */
      }
    }
    if (['select', 'reassign'].includes(this.step) && !document.getElementById('booking-view').hidden) {
      try {
        await this.refreshAvailability();
      } catch {
        const status = this.content.querySelector('[data-cy="availability-connection"]');
        if (status) {
          status.textContent = 'Sin conexión. Se verificará el horario al seleccionarlo.';
          status.classList.add('field-error');
        }
      }
    } else if (this.step === 'details' && this.hold) {
      try {
        const current = await api(`/api/holds/${this.hold.token}`);
        this.clockOffset = current.serverNow - Date.now();
        if (current.receipt) {
          this.receipt = current.receipt;
          this.hold = null;
          this.step = 'success';
          this.render();
        }
      } catch (error) {
        if (error.status === 410 || error.status === 409) await this.expire(error.message);
      }
    }
  }

  async synchronizeReceipt() {
    const token = storageGet(HOLD_STORAGE_KEY);
    if (!token) return;
    const current = await api(`/api/holds/${token}`);
    this.clockOffset = current.serverNow - Date.now();
    if (!current.receipt) return;
    const changed = JSON.stringify(this.receipt) !== JSON.stringify(current.receipt);
    if (this.step === 'reassign' && current.receipt.status !== 'EXCEPTION') this.step = 'success';
    this.receipt = current.receipt;
    if (changed || (this.step === 'success' && !this.content.querySelector('.success-panel'))) this.render();
  }

  renderProgress() {
    const stepIndex = { select: 0, reassign: 0, details: 1, success: 2 }[this.step];
    document.querySelectorAll('.progress-step').forEach((element, index) => {
      element.classList.toggle('current', index === stepIndex);
      element.classList.toggle('complete', index < stepIndex);
      element.querySelector('b').textContent = index < stepIndex ? '✓' : String(index + 1);
      if (index === stepIndex) element.setAttribute('aria-current', 'step');
      else element.removeAttribute('aria-current');
    });
  }

  render() {
    const focusedDate = document.activeElement?.dataset.date;
    this.renderProgress();
    if (this.step === 'select' || this.step === 'reassign') this.renderSelection();
    else if (this.step === 'details') this.renderDetails();
    else this.renderSuccess();
    if (focusedDate) this.content.querySelector(`[data-date="${focusedDate}"]`)?.focus({ preventScroll: true });
  }

  renderSelection() {
    const reassigning = this.step === 'reassign';
    const firstDate = `${this.month}-01`;
    const firstWeekday = (new Date(`${firstDate}T12:00:00Z`).getUTCDay() + 6) % 7;
    const selected = this.days.find((day) => day.date === this.selectedDate);
    this.content.innerHTML = `<div class="booking-panel">
      ${this.message ? `<div class="expired-message" role="alert" data-cy="booking-expired">${safe(this.message)}</div>` : ''}
      <h2 class="panel-heading" tabindex="-1" data-cy="booking-step-title">${reassigning ? 'Elige un nuevo horario.' : 'Encuentra tu momento.'}</h2>
      <p class="panel-subtitle">${reassigning ? `Reasigna tu turno ${safe(this.receipt.reference)} antes del ${safe(new Date(this.receipt.exceptionDeadline).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }))}. Esta sesión conserva el acceso; no se envió un correo.` : 'Selecciona un día y el horario que mejor se adapte a ti.'}</p>
      ${reassigning ? '' : `<div class="event-catalog" data-cy="event-catalog" role="group" aria-label="Tipos de servicio">${this.events.map((event) => `<button type="button" class="event-type${event.id === this.eventId ? ' selected' : ''}" data-cy="event-type" data-event-id="${safe(event.id)}" aria-pressed="${event.id === this.eventId}"><strong>${safe(event.name)}</strong><span>${event.duration} min · ${safe(event.format)}</span></button>`).join('')}</div>`}
      ${reassigning ? '<button class="text-button" type="button" data-cy="return-to-booking">← Volver a mi turno</button>' : ''}
      <div class="selection-layout">
        <div class="calendar-pane">
          <div class="calendar-toolbar"><h3 data-cy="calendar-month">${safe(formatDate(firstDate, { month: 'long', year: 'numeric', day: undefined }))}</h3>
            <div class="month-buttons"><button class="icon-button" type="button" data-cy="previous-month" aria-label="Mes anterior" ${this.month <= this.today.slice(0, 7) ? 'disabled' : ''}>‹</button><button class="icon-button" type="button" data-cy="next-month" aria-label="Mes siguiente" ${this.month >= '9998-12' ? 'disabled' : ''}>›</button></div>
          </div>
          <div class="calendar-grid" role="group" aria-label="Selecciona una fecha disponible">
            ${['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map((day) => `<span class="weekday" aria-hidden="true">${day}</span>`).join('')}
            ${'<span aria-hidden="true"></span>'.repeat(firstWeekday)}
            ${this.days.map((day) => `<button type="button" class="calendar-day${day.date === this.selectedDate ? ' selected' : ''}${day.date === this.today ? ' today' : ''}" data-cy="calendar-day" data-date="${day.date}" aria-label="${safe(formatDate(day.date, { weekday: 'long', year: 'numeric' }))}${day.slots.length ? ', disponible' : ', no disponible'}" aria-pressed="${day.date === this.selectedDate}" ${day.slots.length ? '' : 'disabled'}>${Number(day.date.slice(8))}</button>`).join('')}
          </div>
          <p class="calendar-legend"><span class="legend-dot"></span> Días con horarios disponibles</p>
        </div>
        <div class="slots-pane" aria-live="polite">
          <h3 class="slots-heading">${selected ? safe(formatDate(selected.date, { weekday: 'long' })) : 'Horarios disponibles'}<small>${selected ? `${selected.slots.length} opciones · Buenos Aires` : 'Primero, elige una fecha'}</small></h3>
            ${selected ? `<div class="slot-list">${selected.slots.map((time) => `<button type="button" class="slot-button" data-cy="time-slot" data-time="${time}" aria-label="${reassigning ? 'Reasignar' : 'Reservar'} a las ${time}">${time}</button>`).join('')}</div>` : `<div class="slots-empty"><span class="empty-symbol" aria-hidden="true">↗</span><p>${this.days.some((day) => day.slots.length) ? 'Tu próximo encuentro empieza con un día en el calendario.' : 'No hay horarios disponibles este mes. Puedes consultar el siguiente.'}</p></div>`}
        </div>
      </div>
      <p class="sr-only" data-cy="availability-connection" aria-live="polite">Disponibilidad actualizada</p>
    </div>`;
  }

  renderDetails() {
    const event = this.events.find((item) => item.id === this.hold.eventId) || this.config.event;
    this.content.innerHTML = `<div class="booking-panel">
      <div class="form-topline"><button class="text-button" type="button" data-cy="change-time">← Cambiar horario</button><span class="hold-timer" data-cy="hold-timer">Tiempo disponible <strong id="hold-countdown">15:00</strong></span></div>
      <h2 class="panel-heading" tabindex="-1" data-cy="booking-step-title">Ya casi es tuyo.</h2><p class="panel-subtitle">Completa tus datos para confirmar este encuentro.</p>
      <div class="booking-summary" data-cy="booking-summary"><span class="summary-icon" aria-hidden="true">◷</span><div><strong>${safe(formatDate(this.hold.date, { weekday: 'long' }))} · ${safe(this.hold.time)} h</strong><span>${safe(event.name)} · ${event.duration} min · Buenos Aires</span></div></div>
      <form id="guest-form" novalidate data-cy="guest-form">
        <div class="form-grid">
          <div class="field"><label for="guest-name">Nombre completo <span>*</span></label><input id="guest-name" name="name" autocomplete="name" required placeholder="Tu nombre y apellido" aria-describedby="guest-name-error" data-cy="guest-name"><p id="guest-name-error" class="field-error" data-cy="guest-name-error"></p></div>
          <div class="field"><label for="guest-email">Correo electrónico <span>*</span></label><input id="guest-email" name="email" type="email" autocomplete="email" required placeholder="nombre@ejemplo.com" aria-describedby="guest-email-error" data-cy="guest-email"><p id="guest-email-error" class="field-error" data-cy="guest-email-error"></p></div>
          <div class="field field-wide"><label for="guest-phone">Teléfono <span>Opcional</span></label><input id="guest-phone" name="phone" type="tel" autocomplete="tel" placeholder="Tu número de contacto" aria-describedby="guest-phone-error" data-cy="guest-phone"><p id="guest-phone-error" class="field-error" data-cy="guest-phone-error"></p></div>
          <div class="field field-wide"><label for="guest-note">¿Algo que quieras compartir? <span>Opcional</span></label><textarea id="guest-note" name="note" rows="2" placeholder="Cuéntanos brevemente el motivo del encuentro…" aria-describedby="guest-note-error" data-cy="guest-note"></textarea><p id="guest-note-error" class="field-error" data-cy="guest-note-error"></p></div>
        </div>
        <p class="form-note">Esta es una demostración académica. Usa datos ficticios: no se enviarán correos ni notificaciones reales.</p>
        <div class="form-actions"><span class="required-note">* Campos obligatorios</span><button class="button primary" type="submit" data-cy="confirm-booking">Confirmar reserva <span aria-hidden="true">↗</span></button></div>
        <p class="field-error" role="alert" id="guest-submit-error" data-cy="guest-submit-error"></p>
      </form>
    </div>`;
    this.updateTimer();
  }

  renderSuccess() {
    const receipt = this.receipt;
    if (receipt.status === 'EXCEPTION') {
      const deadline = new Date(receipt.exceptionDeadline).toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
      });
      this.content.innerHTML = `<div class="success-panel" data-cy="booking-exception" role="status">
        <p class="eyebrow small">CAMBIO DE HORARIO</p><h2 tabindex="-1" data-cy="booking-step-title">Tu turno necesita otro horario.</h2>
        <p class="panel-subtitle">El horario del ${safe(formatDate(receipt.date, { weekday: 'long', year: 'numeric' }))} a las ${safe(receipt.time)} quedó fuera de la agenda. Tu reserva se conserva como excepción hasta el ${safe(deadline)}.</p>
        <p class="simulation-notice" data-cy="exception-notice">El aviso al correo es solo una simulación: no se envió. Puedes reasignar desde esta misma pestaña y navegador antes del plazo.</p>
        <button class="button primary" type="button" data-cy="choose-reassignment">Elegir nuevo horario</button></div>`;
      return;
    }
    if (receipt.status === 'CANCELLED') {
      this.content.innerHTML = `<div class="success-panel" data-cy="booking-cancelled" role="status">
        <p class="eyebrow small">PLAZO FINALIZADO</p><h2 tabindex="-1" data-cy="booking-step-title">Tu turno fue cancelado.</h2>
        <p class="panel-subtitle">No se eligió otro horario dentro de las 24 horas. La referencia ${safe(receipt.reference)} ya no ocupa un espacio en la agenda.</p>
        <button class="button secondary" type="button" data-cy="new-booking">Buscar otro turno</button></div>`;
      return;
    }
    this.content.innerHTML = `<div class="success-panel" data-cy="booking-confirmation" role="status">
      <span class="success-symbol" aria-hidden="true">✓</span><p class="eyebrow small">UN MOMENTO RESERVADO PARA TI</p>
      <h2 tabindex="-1" data-cy="booking-step-title">Nos vemos pronto.</h2><p class="panel-subtitle">Tu turno está confirmado y el horario ya no está disponible para otras reservas.</p>
      <div class="receipt-card"><div class="receipt-main"><p class="eyebrow small">RESERVA CONFIRMADA</p><h3>${safe(receipt.eventName)}</h3><p class="receipt-detail"><span aria-hidden="true">▦</span> ${safe(formatDate(receipt.date, { weekday: 'long', year: 'numeric' }))}</p><p class="receipt-detail"><span aria-hidden="true">◷</span> ${safe(receipt.time)} h · ${receipt.duration} minutos</p><p class="receipt-detail"><span aria-hidden="true">◎</span> Buenos Aires · Encuentro virtual</p></div><div class="receipt-reference"><span>Tu referencia</span><strong data-cy="booking-reference">${safe(receipt.reference)}</strong></div></div>
      <p class="simulation-notice" data-cy="simulated-notifications">${
        receipt.notifications?.guestEmail === 'SIMULATED_FAILED'
          ? '<strong>Tu turno está confirmado, pero falló la simulación del aviso por correo.</strong><br>La reserva sigue guardada. No se envió ningún email real.'
          : '<strong>Reserva confirmada y aviso registrado para el profesional.</strong><br>Los avisos son simulados: no se envió ningún correo real.'
      }</p>
      <button class="button secondary" type="button" data-cy="new-booking">Reservar otro turno <span aria-hidden="true">↗</span></button>
    </div>`;
  }

  async onClick(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || this.busy) return;
    const action = button.dataset.cy;
    try {
      if (action === 'event-type' && this.step === 'select') {
        this.busy = true;
        this.eventId = button.dataset.eventId;
        this.selectedDate = null;
        this.days = [];
        this.render();
        await this.refreshAvailability();
        this.focusHeading();
      }
      if (action === 'calendar-day') {
        this.selectedDate = button.dataset.date;
        this.message = '';
        this.render();
      }
      if (action === 'previous-month' || action === 'next-month') {
        this.busy = true;
        this.month = offsetMonth(this.month, action === 'next-month' ? 1 : -1);
        this.selectedDate = null;
        await this.refreshAvailability();
      }
      if (action === 'time-slot') {
        this.busy = true;
        this.content.querySelectorAll('[data-cy="time-slot"]').forEach((slot) => {
          slot.disabled = true;
        });
        if (this.step === 'reassign') {
          this.receipt = await api(`/api/bookings/access/${storageGet(HOLD_STORAGE_KEY)}/reassign`, {
            method: 'POST',
            body: { date: this.selectedDate, time: button.dataset.time },
          });
          this.step = 'success';
          this.render();
          this.focusHeading();
          toast('Turno reasignado correctamente.');
        } else {
          this.hold = await api('/api/holds', {
            method: 'POST',
            body: { date: this.selectedDate, time: button.dataset.time, eventId: this.eventId },
          });
          this.clockOffset = this.hold.serverNow - Date.now();
          storageSet(HOLD_STORAGE_KEY, this.hold.token);
          this.step = 'details';
          this.render();
          this.focusHeading();
        }
      }
      if (action === 'choose-reassignment') {
        this.busy = true;
        this.step = 'reassign';
        this.selectedDate = null;
        this.message = '';
        await this.refreshAvailability();
        this.focusHeading();
      }
      if (action === 'return-to-booking') {
        this.step = 'success';
        this.render();
        this.focusHeading();
      }
      if (action === 'change-time') {
        this.busy = true;
        await api(`/api/holds/${this.hold.token}`, { method: 'DELETE' });
        this.hold = null;
        storageSet(HOLD_STORAGE_KEY, null);
        this.step = 'select';
        this.message = '';
        this.render();
        await this.refreshAvailability();
        this.focusHeading();
      }
      if (action === 'new-booking') {
        this.receipt = null;
        this.hold = null;
        storageSet(HOLD_STORAGE_KEY, null);
        this.step = 'select';
        this.message = '';
        this.selectedDate = null;
        this.render();
        await this.refreshAvailability();
        this.focusHeading();
      }
    } catch (error) {
      toast(error.message, 'error');
      if (this.step === 'select' || this.step === 'reassign') {
        if (error.code === 'SLOT_UNAVAILABLE') this.message = error.message;
        this.render();
        try {
          await this.synchronizeReceipt();
          await this.refreshAvailability();
        } catch {
          /* The toast keeps the failure visible. */
        }
      }
    } finally {
      this.busy = false;
    }
  }

  async onSubmit(event) {
    if (event.target.id !== 'guest-form') return;
    event.preventDefault();
    if (this.busy || !this.hold) return;
    const form = event.target;
    const guest = Object.fromEntries(new FormData(form));
    const errors = validateGuest(guest);
    if (!form.elements.email.validity.valid && !errors.email) errors.email = 'Ingresa un correo electrónico válido.';
    displayFieldErrors(form, errors, 'guest-');
    if (Object.keys(errors).length) {
      toast('Revisa los datos obligatorios antes de continuar.', 'error');
      return;
    }
    this.busy = true;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Confirmando…';
    try {
      this.receipt = await api('/api/bookings', { method: 'POST', body: { holdToken: this.hold.token, guest } });
      this.hold = null;
      this.step = 'success';
      this.render();
      this.focusHeading();
    } catch (error) {
      if (error.status === 410 || error.code === 'SLOT_UNAVAILABLE') await this.expire(error.message);
      else {
        displayFieldErrors(form, error.fields || {}, 'guest-');
        form.querySelector('#guest-submit-error').textContent = error.message;
        toast(error.message, 'error');
      }
    } finally {
      this.busy = false;
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = 'Confirmar reserva <span aria-hidden="true">↗</span>';
      }
    }
  }

  updateTimer() {
    if (this.step !== 'details' || !this.hold) return;
    const remaining = Math.max(0, this.hold.expiresAt - (Date.now() + this.clockOffset));
    const seconds = Math.ceil(remaining / 1000);
    const countdown = document.getElementById('hold-countdown');
    if (countdown)
      countdown.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (remaining <= 0 && !this.busy)
      this.expire('El tiempo de reserva finalizó. El horario fue liberado; selecciona otro para continuar.');
  }

  async expire(message) {
    this.hold = null;
    storageSet(HOLD_STORAGE_KEY, null);
    this.step = 'select';
    this.message = message;
    this.selectedDate = null;
    this.render();
    this.focusHeading();
    toast(message, 'error');
    try {
      await this.refreshAvailability();
    } catch {
      /* Preserve the visible expiry message while offline. */
    }
  }

  focusHeading() {
    this.content.querySelector('[data-cy="booking-step-title"]')?.focus({ preventScroll: true });
  }
}
