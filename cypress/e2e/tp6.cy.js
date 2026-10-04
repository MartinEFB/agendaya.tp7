// The eight blocks are proposed assignments for student review, not claims of authorship.
const FIXED_NOW = Date.parse('2026-09-28T08:00:00-03:00');
const TUESDAY = '2026-09-29';

function openAdmin() {
  cy.get('[data-cy="nav-availability"]').click();
  cy.get('[data-cy="schedule-form"]').should('be.visible');
}

function selectSlot(date = TUESDAY, time = '09:00') {
  cy.get(`[data-cy="calendar-day"][data-date="${date}"]`).click();
  cy.get(`[data-cy="time-slot"][data-time="${time}"]`).click();
  cy.get('[data-cy="guest-form"]').should('be.visible');
}

function confirmFixtureBooking() {
  selectSlot();
  cy.get('[data-cy="guest-name"]').type('Persona de Prueba');
  cy.get('[data-cy="guest-email"]').type('persona@example.test');
  cy.get('[data-cy="confirm-booking"]').click();
  cy.get('[data-cy="booking-confirmation"]').should('be.visible');
}

describe('TP6 AgendaYA browser journeys', () => {
  beforeEach(() => {
    cy.task('resetDemo', { now: FIXED_NOW });
    cy.clearAllSessionStorage();
    cy.visit('/');
    cy.get('[data-cy="calendar-month"]').should('be.visible');
  });

  it('proposed member 1: saves three independent working ranges', () => {
    // Arrange: Saturday starts disabled in the academic fixture.
    openAdmin();
    cy.get('[data-cy="working-day-toggle"][data-day="saturday"]').should('not.be.checked');

    // Act: enable the day, add the maximum three ranges, and persist the schedule.
    cy.get('[data-cy="working-day-toggle"][data-day="saturday"]').check();
    cy.get('[data-cy="add-range"][data-day="saturday"]').click();
    cy.get('[data-cy="add-range"][data-day="saturday"]').click();
    cy.get('[data-cy="save-schedule"]').click();

    // Assert: the success feedback and all three ranges survive a page reload.
    cy.get('[data-cy="feedback-toast"]').should('be.visible').and('contain.text', 'guardados');
    cy.get('[data-cy="add-range"][data-day="saturday"]').should('be.disabled');
    cy.reload();
    cy.get('[data-cy="working-day-toggle"][data-day="saturday"]').should('be.checked');
    cy.get('[data-cy="range-start"][data-day="saturday"]').should('have.length', 3);
  });

  it('proposed member 2: rejects invalid hours and applies booking quick settings', () => {
    // Arrange: Monday has public slots with the default one-hour lead.
    cy.get('[data-cy="calendar-day"][data-date="2026-09-28"]').should('not.be.disabled');
    openAdmin();

    // Act: try an inverted range and an out-of-bounds interval before saving valid settings.
    cy.get('[data-cy="range-start"][data-day="monday"][data-index="0"]').clear().type('11:00');
    cy.get('[data-cy="range-end"][data-day="monday"][data-index="0"]').clear().type('10:00');
    cy.get('[data-cy="save-schedule"]').click();
    cy.get('[data-cy="interval-minutes"]').clear().type('121');
    cy.get('[data-cy="save-quick-settings"]').click();
    cy.get('[data-cy="max-daily-bookings"]').clear().type('1');
    cy.get('[data-cy="interval-minutes"]').clear().type('15');
    cy.get('[data-cy="lead-hours"]').clear().type('24');
    cy.get('[data-cy="save-quick-settings"]').click();

    // Assert: invalid inputs were rejected, and lead time changes the public calendar.
    cy.get('[data-cy="range-error"]').first().should('contain.text', 'posterior');
    cy.get('[data-cy="interval-minutes"]').should('have.value', '15');
    cy.get('[data-cy="feedback-toast"]').should('be.visible').and('contain.text', 'guardada');
    cy.get('[data-cy="nav-booking"]').click();
    cy.get('[data-cy="calendar-day"][data-date="2026-09-28"]').should('be.disabled');
    cy.get(`[data-cy="calendar-day"][data-date="${TUESDAY}"]`).should('not.be.disabled');
  });

  it('proposed member 3: blocks one day and removes it from public availability', () => {
    // Arrange: September 30 has available hours before the block.
    cy.get('[data-cy="calendar-day"][data-date="2026-09-30"]').should('not.be.disabled');
    openAdmin();

    // Act: block the complete date for a permitted single-day reason.
    cy.get('[data-cy="block-date"]').type('2026-09-30');
    cy.get('[data-cy="block-reason"]').select('Feriado');
    cy.get('[data-cy="block-day"]').click();

    // Assert: the admin list and the public calendar agree.
    cy.get('[data-cy="blocked-day"][data-date="2026-09-30"]').should('contain.text', 'Feriado');
    cy.get('[data-cy="nav-booking"]').click();
    cy.get('[data-cy="calendar-day"][data-date="2026-09-30"]').should('be.disabled');
  });

  it('proposed member 4: validates and applies an inclusive date-range block', () => {
    // Arrange: move from the September fixture month to the October range.
    openAdmin();

    // Act: reject reversed dates, then block October 1 through 2 as vacation.
    cy.get('[data-cy="block-range-form"] [data-cy="range-start"]').type('2026-10-02');
    cy.get('[data-cy="block-range-form"] [data-cy="range-end"]').type('2026-10-01');
    cy.get('[data-cy="block-range-form"] [data-cy="range-reason"]').select('Vacaciones');
    cy.get('[data-cy="block-range"]').should('be.disabled');
    cy.get('[data-cy="range-end-error"]').should('contain.text', 'posterior');
    cy.get('[data-cy="block-range-form"] [data-cy="range-start"]').clear().type('2026-10-01');
    cy.get('[data-cy="block-range-form"] [data-cy="range-end"]').clear().type('2026-10-02').blur();
    cy.intercept('POST', '**/api/admin/blocked-ranges').as('blockRange');
    cy.get('[data-cy="block-range"]').click();
    cy.get('[data-cy="range-start-error"]').should('be.empty');
    cy.get('[data-cy="range-end-error"]').should('be.empty');
    cy.get('[data-cy="range-reason-error"]').should('be.empty');
    cy.get('[data-cy="range-submit-error"]').should('be.empty');
    cy.wait('@blockRange').its('response.statusCode').should('eq', 201);

    // Assert: both inclusive endpoints are unavailable and the range is listed.
    cy.get('[data-cy="blocked-range"]').should('contain.text', 'Vacaciones');
    cy.get('[data-cy="nav-booking"]').click();
    cy.get('[data-cy="next-month"]').click();
    cy.get('[data-cy="calendar-day"][data-date="2026-10-01"]').should('be.disabled');
    cy.get('[data-cy="calendar-day"][data-date="2026-10-02"]').should('be.disabled');
  });

  it('proposed member 5: selects a service, obtains a hold, and releases it', () => {
    // Arrange: both static service types are visible on the public page.
    cy.get('[data-cy="event-type"]').should('have.length', 2);

    // Act: select the follow-up service and reserve a Tuesday time temporarily.
    cy.get('[data-cy="event-type"][data-event-id="follow-up-session"]').click();
    selectSlot();

    // Assert: the service and countdown are visible; changing time releases the slot.
    cy.get('[data-cy="booking-summary"]').should('contain.text', 'Consulta de seguimiento');
    cy.get('[data-cy="hold-timer"]')
      .invoke('text')
      .should('match', /1[45]:[0-5][0-9]/);
    cy.get('[data-cy="change-time"]').click();
    cy.get(`[data-cy="calendar-day"][data-date="${TUESDAY}"]`).click();
    cy.get('[data-cy="time-slot"][data-time="09:00"]').should('be.visible');
  });

  it('proposed member 6: prevents double holds and frees the slot after fifteen minutes', () => {
    // Arrange: this browser holds Tuesday 09:00.
    selectSlot();

    // Act: another HTTP client tries the same slot, then the server clock expires the hold.
    cy.request({
      method: 'POST',
      url: '/api/holds',
      failOnStatusCode: false,
      body: { eventId: 'advisory-session', date: TUESDAY, time: '09:00' },
    })
      .its('status')
      .should('eq', 409);
    cy.task('advanceDemoClock', 15 * 60 * 1000 + 1);
    cy.reload();

    // Assert: expiry is visible and the previously held time can be selected again.
    cy.get('[data-cy="booking-expired"]').should('be.visible');
    cy.get(`[data-cy="calendar-day"][data-date="${TUESDAY}"]`).click();
    cy.get('[data-cy="time-slot"][data-time="09:00"]').should('be.visible');
  });

  it('proposed member 7: validates guest data and confirms with a simulated notice', () => {
    // Arrange: enter the required guest form through a real calendar selection.
    selectSlot();

    // Act: submit empty and malformed inputs, then complete a fictional guest booking.
    cy.get('[data-cy="confirm-booking"]').click();
    cy.get('[data-cy="guest-name-error"]').should('contain.text', 'Ingresa');
    cy.get('[data-cy="guest-email-error"]').should('contain.text', 'Ingresa');
    cy.get('[data-cy="guest-name"]').type('Persona de Prueba');
    cy.get('[data-cy="guest-email"]').type('invalid-email');
    cy.get('[data-cy="confirm-booking"]').click();
    cy.get('[data-cy="guest-email-error"]').should('contain.text', 'válido');
    cy.get('[data-cy="guest-email"]').clear().type('persona@example.test');
    cy.get('[data-cy="guest-phone"]').type('1112345678');
    cy.get('[data-cy="guest-note"]').type('Consulta de prueba');
    cy.get('[data-cy="confirm-booking"]').click();

    // Assert: the confirmation persists and its administrator alert is explicitly simulated.
    cy.get('[data-cy="booking-confirmation"]').should('be.visible');
    cy.get('[data-cy="booking-reference"]')
      .invoke('text')
      .then((reference) => {
        cy.get('[data-cy="simulated-notifications"]').should('contain.text', 'no se envió');
        cy.get('[data-cy="nav-availability"]').click();
        cy.get('[data-cy="booking-alert"]').should('contain.text', reference);
      });
  });

  it('proposed member 8: warns on booking conflict and reassigns a schedule exception', () => {
    // Arrange: confirm a fictional Tuesday 09:00 booking.
    confirmFixtureBooking();
    cy.get('[data-cy="booking-reference"]').invoke('text').as('reference');
    openAdmin();

    // Act: attempt an unsafe day block, then move Tuesday's first range past the booking.
    cy.get('[data-cy="block-date"]').type(TUESDAY);
    cy.get('[data-cy="block-reason"]').select('Feriado');
    cy.get('[data-cy="block-day"]').click();
    cy.get('[data-cy="conflict-modal"]').should('be.visible').and('contain.text', '1 turno');
    cy.get('[data-cy="acknowledge-conflict"]').click();
    cy.get('[data-cy="range-start"][data-day="tuesday"][data-index="0"]').clear().type('10:00');
    cy.get('[data-cy="save-schedule"]').click();
    cy.get('[data-cy="schedule-exception"]').should('contain.text', 'Excepción');
    cy.get('[data-cy="nav-booking"]').click();
    cy.reload();
    cy.get('[data-cy="booking-exception"]').should('be.visible');
    cy.get('[data-cy="choose-reassignment"]').click();
    cy.get(`[data-cy="calendar-day"][data-date="${TUESDAY}"]`).click();
    cy.get('[data-cy="time-slot"][data-time="10:00"]').click();

    // Assert: reassignment preserves the original reference and restores confirmation.
    cy.get('[data-cy="booking-confirmation"]').should('be.visible');
    cy.get('@reference').then((reference) => {
      cy.get('[data-cy="booking-reference"]').should('have.text', reference);
    });
  });
});
