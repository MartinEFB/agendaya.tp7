import { api } from './api.js';
import { AdminView } from './admin.js';
import { BookingView } from './booking.js';
import { toast } from './ui.js';

let booking;
let admin;

function switchView(view) {
  const isBooking = view !== 'disponibilidad';
  document.getElementById('booking-view').hidden = !isBooking;
  document.getElementById('admin-view').hidden = isBooking;
  for (const [selector, active] of [
    ['nav-booking', isBooking],
    ['nav-availability', !isBooking],
  ]) {
    const button = document.querySelector(`[data-cy="${selector}"]`);
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  document.title = isBooking ? 'AgendaYA — Reserva tu próximo encuentro' : 'AgendaYA — Gestión de disponibilidad';
  if (isBooking && booking) booking.synchronize();
  if (!isBooking && admin) admin.refreshExceptions().catch((error) => toast(error.message, 'error'));
}

document.querySelector('[data-cy="nav-booking"]').addEventListener('click', () => {
  location.hash = 'reservar';
  switchView('reservar');
});
document.querySelector('[data-cy="nav-availability"]').addEventListener('click', () => {
  location.hash = 'disponibilidad';
  switchView('disponibilidad');
});
window.addEventListener('hashchange', () => switchView(location.hash.slice(1)));
const dialog = document.getElementById('conflict-dialog');
document.querySelector('[data-cy="close-conflict-modal"]').addEventListener('click', () => dialog.close());
document.querySelector('[data-cy="acknowledge-conflict"]').addEventListener('click', () => dialog.close());
switchView(location.hash.slice(1));

try {
  const config = await api('/api/config');
  document.getElementById('profile-name').textContent = config.profile.name;
  document.getElementById('profile-role').textContent = config.profile.role;
  document.getElementById('profile-description').textContent = config.profile.description;
  document.getElementById('event-name').textContent = 'Prestaciones disponibles';
  document.getElementById('event-duration').textContent =
    `${config.events.length} servicios de ${config.event.duration} minutos`;
  booking = new BookingView(config);
  admin = new AdminView(() => {
    if (booking.step === 'select') booking.refreshAvailability().catch((error) => toast(error.message, 'error'));
    else booking.synchronize();
  });
  await Promise.all([booking.initialize(), admin.initialize()]);
} catch (error) {
  const banner = document.getElementById('startup-error');
  banner.textContent = `${error.message} Actualiza la página para volver a intentar.`;
  banner.hidden = false;
  document.getElementById('booking-workspace').setAttribute('aria-busy', 'false');
}
