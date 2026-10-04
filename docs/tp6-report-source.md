# AgendaYA — Trabajo Práctico N.º 6: Testing Automatizado

Este texto reúne el contenido del informe del Grupo 01 en el orden solicitado por la sección 10.2 del enunciado. Los bloques asignados a integrantes son una **propuesta para revisar y defender los tests**, no una declaración de autoría individual.

## 1. Carátula

**AGENDA YA**

**Ingeniería y Calidad de Software — Grupo 01 — Módulos 02 y 04**

**Trabajo Práctico N.º 6: Testing Automatizado**

**Integrantes (según informes TP1 y TP5):** Valentin Mendez, Facundo Rodriguez, Alvaro Tapia, Luciano Romero, Augusto Berloin, Martin Flores, Valentin Fornes y Alejo Palavecino.

**Fecha de elaboración:** 27/09/2026. La entrega y la validación del equipo están pendientes.

## 2. Enlace al repositorio Git

**Repositorio:** [agendaya-tp6](https://github.com/AlejoPalavecino/agendaya-tp6). El código y el historial de este trabajo están publicados en la [rama `codex/tp6-coverage-tests`](https://github.com/AlejoPalavecino/agendaya-tp6/tree/codex/tp6-coverage-tests), separada de `main`. La rama todavía no se integró a `main` y no se abrió un pull request.

El historial incluye commits separados para configuraciones rápidas (`8b50e11`), rangos y excepciones (`1ead3a0`), catálogo y avisos simulados (`9ac2682`), pruebas unitarias (`03e8878`) y recorridos Cypress (`7f1aac6`). También están documentadas las pruebas y sus resultados (`988407c`).

## 3. Tarea A — Frontend mínimo de AgendaYA

La demo combina una interfaz adaptable en HTML, CSS y JavaScript con un minibackend Node. En M02 se configuran horarios, límites y bloqueos. En M04 el invitado elige un servicio, fecha y hora; el horario queda retenido durante 15 minutos mientras completa sus datos y confirma la reserva. La ejecución local usa almacenamiento JSON y existe una configuración para Redis. El enunciado admite un backend simulado. Los controles que utiliza Cypress tienen atributos `data-cy` estables.

| Flujo obligatorio del TP6 | Estado observable y criterio de aceptación |
|---|---|
| M02: configurar horario laboral | Se pueden habilitar días y guardar hasta tres franjas; el fin debe ser posterior al inicio. Una entrada inválida muestra error y no se guarda; la válida presenta confirmación visible. |
| M02: bloquear un día | Se solicita fecha y categoría. El bloqueo exitoso desaparece del calendario público; una reserva existente produce un diálogo de conflicto. |
| M04: seleccionar fecha y hora | El calendario muestra horarios libres del servicio seleccionado. La selección crea un HOLD exclusivo de 15 minutos con contador; la caducidad o el cambio de horario lo libera. |
| M04: completar formulario y confirmar | Nombre y correo son obligatorios; teléfono y nota, opcionales. Los errores se ven en el formulario. La confirmación mantiene una referencia y un comprobante sin datos privados. |

La comparación también abarca las diez historias del grupo, **US_001–US_010**. Para cubrirlas se añadieron cupo diario, intervalos entre reservas, antelación mínima, bloqueo de rangos, excepciones con plazo de 24 horas y dos servicios estáticos. La [matriz de trazabilidad](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/docs/traceability.md) relaciona cada historia con pruebas E2E, unitarias o de integración, sin mezclar los identificadores RF de documentos distintos.

Cuando TP1 y Trello/TP2 discrepan, prevalecen los criterios de aceptación de Trello/TP2, según lo acordado para esta demo. Por eso US_006 conserva la reserva afectada como excepción hasta que pueda reasignarse; US_004 admite `Vacaciones` y `Licencia Médica` para rangos, mientras US_003 mantiene las categorías del bloqueo de un solo día.

**Límites de la demo.** Lucía Méndez y los dos servicios virtuales de 30 minutos son datos de ejemplo, no requisitos del negocio. El panel de administración no tiene autenticación, por lo que no debe cargarse información personal real. Los avisos quedan registrados como `SIMULATED_NOT_SENT` o `SIMULATED_FAILED`: **no se envía correo**. Para reasignar, el invitado debe conservar la misma sesión del navegador; las excepciones vencidas se actualizan con la siguiente solicitud, no mediante una tarea de fondo. No se evaluaron rendimiento ni compatibilidad entre navegadores, y esta demo no está preparada para producción.

## 4. Tarea B — Tests E2E con Cypress

Antes de cada caso, Cypress restablece el estado inicial en memoria y fija el reloj del servidor. `cypress.config.js` levanta una instancia aislada en un puerto local libre. Los ocho recorridos cubren variantes de M02 y M04; cada uno señala preparación, acción y verificación con comentarios `Arrange`, `Act` y `Assert`. Los nombres de la tabla indican a quién se propone asignar la revisión, **no quién escribió cada caso**.

| Bloque propuesto para revisión | Variante integral | Resultado final |
|---|---|---|
| 1 — Valentin Mendez | Guardar y recargar tres franjas de un día | Aprobado |
| 2 — Facundo Rodriguez | Rechazar horas/intervalos inválidos y aplicar antelación | Aprobado |
| 3 — Alvaro Tapia | Bloquear un día y verificar calendario público | Aprobado |
| 4 — Luciano Romero | Rechazar rango invertido y bloquear ambos extremos | Aprobado |
| 5 — Augusto Berloin | Elegir servicio, crear HOLD y liberarlo | Aprobado |
| 6 — Martin Flores | Rechazar HOLD duplicado y liberar al vencer | Aprobado |
| 7 — Valentin Fornes | Validar datos del invitado y confirmar con aviso simulado | Aprobado |
| 8 — Alejo Palavecino | Advertir conflicto, crear excepción y reasignar | Aprobado |

El siguiente bloque reproduce el archivo completo [`cypress/e2e/tp6.cy.js`](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/cypress/e2e/tp6.cy.js): funciones auxiliares y ocho casos. Se incluye para que el informe pueda leerse sin abrir el repositorio.

```javascript
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
    cy.get('[data-cy="hold-timer"]').invoke('text').should('match', /1[45]:[0-5][0-9]/);
    cy.get('[data-cy="change-time"]').click();
    cy.get(`[data-cy="calendar-day"][data-date="${TUESDAY}"]`).click();
    cy.get('[data-cy="time-slot"][data-time="09:00"]').should('be.visible');
  });

  it('proposed member 6: prevents double holds and frees the slot after fifteen minutes', () => {
    // Arrange: this browser holds Tuesday 09:00.
    selectSlot();

    // Act: another HTTP client tries the same slot, then the server clock expires the hold.
    cy.request({
      method: 'POST', url: '/api/holds', failOnStatusCode: false,
      body: { eventId: 'advisory-session', date: TUESDAY, time: '09:00' },
    }).its('status').should('eq', 409);
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
    cy.get('[data-cy="booking-reference"]').invoke('text').then((reference) => {
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
```

### Ejecución y evidencia

En Windows se instaló Cypress 16.1.0 con pnpm 11.19.0. La ejecución de `pnpm run test:e2e` en Electron 146, sin interfaz gráfica, terminó con **8 casos aprobados y ninguno fallido, pendiente u omitido**. Se conservaron el [registro de la ejecución](https://drive.google.com/file/d/1jIe6zvel23pbg_VyCZh2acgfcqRmipNQ/view?usp=drivesdk) y el [video](https://drive.google.com/file/d/1UQLdUejiBTVfabyBeNXp_Iw9fELTwLAy/view?usp=drivesdk). Cypress generó un video y ninguna captura de pantalla.

No hubo fallas E2E en la ejecución final: los escenarios con datos inválidos o reservas en conflicto aprobaron porque comprobaron el rechazo esperado. Durante la instalación, el entorno restringido impidió crear una junction de `bluebird`. El mismo procedimiento funcionó fuera de ese entorno y permitió ejecutar los ocho casos; no fue una falla funcional de AgendaYA.

**Para repetir la prueba:** configurar `CYPRESS_CACHE_FOLDER` en un directorio temporal con permiso de escritura y ejecutar, en este orden, `pnpm install --frozen-lockfile`, `pnpm exec cypress install` y `pnpm run test:e2e`. Cypress levanta su propio servidor y usa estado y reloj aislados; no utiliza una instancia compartida. La demostración en clase de un caso exitoso y uno de error o borde sigue pendiente.

## 5. Tarea C — Tests unitarios con asistencia de IA

Se prepararon ocho bloques de cinco pruebas nuevas, propuestos para que cada integrante revise uno. Cada bloque cubre al menos dos funciones o comportamientos y contiene casos normales, de borde e inválidos. Se usó `node:test` para comprobar reglas de dominio con estado y tiempo controlados, sin depender de la interfaz.

La suite completa terminó con **74 casos aprobados y ninguno fallido**: 68 pruebas unitarias, incluidas las 40 nuevas, y 6 de integración HTTP. Estas últimas no se cuentan entre las cinco asignadas a cada integrante. El [registro de Node](https://drive.google.com/file/d/1nd-8HtXHZEn9fJUWu6QZfng3s82O62i2/view?usp=drivesdk) permite consultar el resultado.

### Prompt exacto compartido y alcance de la IA

Se usó **un único prompt compartido** para preparar los ocho bloques, no ocho instrucciones personales. Se reproduce literalmente como consta en el [registro de uso de IA](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/docs/unit-test-ai-record.md):

> Implementá T4 ahora como escritor delegado. Leé odd/tasks/tp6-coverage-and-automated-tests.md; Engram mirror falla unknown_session. Usá tu inventario de 40 casos NUEVOS (8 bloques de 5), exactos o ajustes si T3 cambió dominio, en `test/unit/` con 8 archivos/block IDs, sin atribuir falsamente autoría individual. Cada bloque ≥2 funciones/comportamientos y normal/límite/inválido. Importante: TP6 pide prompt exacto, salida generada, cambios y evaluación crítica por bloque; creá `docs/unit-test-ai-record.md` honesto con prompt usado (tu instrucción aquí puede citarse como contexto pero redactá exacto prompt de generación), archivos de salida/código o fragmentos trazables, modificaciones efectivas y evaluación, sin afirmar que los ocho estudiantes lo escribieron. TDD ON inferido docs/traceability.md, runner node --test; para T4 son pruebas nuevas sobre comportamiento ya existente: registrá un fallo RED real de test/fixture si surge, NO inventes ni alteres código productivo para forzarlo. Ejecutá 40 y suite completa. No edit ODD doc ni commit. Route delegated writer; ~400 líneas heurística, no cap, RDD global OFF. Devolvé conteos unit vs integration y matiz autoría. Repo nested TP6-PROYECTO-FRONTEND-MINIBACKEND.

La salida de la herramienta se conserva en los ocho archivos reproducidos a continuación; todos usan el mismo [fixture](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/test/unit/fixtures.js). La propuesta sirvió para cubrir reglas y límites, pero el hecho de que una prueba pase no demuestra quién la escribió ni quién puede explicarla. Cada integrante debe ejecutar y revisar su bloque antes de presentarlo como propio.

### Bloque 1 — Valentin Mendez (asignación propuesta)

Con `validateSchedule`, `normalizeSchedule` y `updateSchedule` se comprueban la ausencia de un día, un día habilitado sin franjas, el límite de tres franjas, la normalización y la conservación del horario de otro día. El guardado y la respuesta visible de la interfaz se verifican en los recorridos E2E 1 y 2. Estas pruebas no exigieron cambios en el código de producción.

**Código completo:** [`test/unit/01-schedule.test.js`](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/test/unit/01-schedule.test.js).

```javascript
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
    { start: '08:00', end: '08:30' }, { start: '09:00', end: '09:30' },
    { start: '10:00', end: '10:30' }, { start: '11:00', end: '11:30' },
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
    ranges: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '18:00' }],
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
```

### Bloque 2 — Facundo Rodriguez (asignación propuesta)

Las pruebas de `isValidDate`, `isValidMonth`, `timeToMinutes`, `minutesToTime` y `datesInMonth` incluyen un año bisiesto, el límite del año admitido, una hora inválida y la generación de fechas de un mes. Verifican los cálculos, pero no cómo se presenta el huso horario en el navegador.

**Código completo:** [`test/unit/02-datetime.test.js`](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/test/unit/02-datetime.test.js).

```javascript
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
```

### Bloque 3 — Alvaro Tapia (asignación propuesta)

`validateBlock` y `blockDay` se prueban con fechas y motivos inválidos, orden de inserción, superposición con un rango y una reserva cancelada. El diálogo de conflicto ante una reserva confirmada no se comprueba aquí, sino en el recorrido E2E 8.

**Código completo:** [`test/unit/03-day-blocking.test.js`](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/test/unit/03-day-blocking.test.js).

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateBlock } from '../../public/shared/validation.js';
import { blockDay } from '../../server/domain.js';
import { booking, MONDAY, seed } from './fixtures.js';

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('single-day validation rejects an impossible calendar date', () => {
  assert.ok(validateBlock({ date: '2026-09-31', reason: 'Feriado' }).date);
});

test('single-day validation does not accept a range-only reason', () => {
  assert.ok(validateBlock({ date: MONDAY, reason: 'Vacaciones' }).reason);
});

test('blocking a free day keeps the day list chronological', () => {
  const state = seed();
  state.blockedDays.push({ date: '2026-10-02', reason: 'Feriado' });
  blockDay(state, { date: MONDAY, reason: 'Motivo Personal' });
  assert.deepEqual(state.blockedDays.map(({ date }) => date), [MONDAY, '2026-10-02']);
});

test('a day inside an existing blocked range cannot be blocked again', () => {
  const state = seed();
  state.blockedRanges.push({ startDate: MONDAY, endDate: '2026-09-30', reason: 'Vacaciones' });
  const original = structuredClone(state.blockedDays);
  assert.throws(() => blockDay(state, { date: '2026-09-29', reason: 'Feriado' }),
    (error) => error.status === 409 && error.code === 'ALREADY_BLOCKED');
  assert.deepEqual(state.blockedDays, original);
});

test('a cancelled booking does not prevent blocking its former day', () => {
  const state = seed();
  state.bookings.push(booking({ status: 'CANCELLED' }));
  assert.deepEqual(blockDay(state, { date: MONDAY, reason: 'Feriado' }), { date: MONDAY, reason: 'Feriado' });
});
```

### Bloque 4 — Luciano Romero (asignación propuesta)

Con `validateDateRange` y `blockDateRange` se examinan un inicio o categoría inválidos, una reserva cancelada, el orden de los rangos y dos rangos adyacentes. La operación ante una reserva activa y su reversión están cubiertas por pruebas adicionales en `test/ranges-exceptions.test.js`; estos cinco casos no bastan para demostrarlo.

**Código completo:** [`test/unit/04-range-blocking.test.js`](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/test/unit/04-range-blocking.test.js).

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDateRange } from '../../public/shared/validation.js';
import { blockDateRange } from '../../server/domain.js';
import { booking, MONDAY, seed } from './fixtures.js';

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('range validation flags an impossible start date', () => {
  assert.ok(validateDateRange({ startDate: '2026-09-31', endDate: '2026-10-02', reason: 'Vacaciones' }).startDate);
});

test('range validation requires a category even for valid dates', () => {
  assert.ok(validateDateRange({ startDate: MONDAY, endDate: '2026-09-30' }).reason);
});

test('a cancelled reservation does not conflict with range blocking', () => {
  const state = seed();
  state.bookings.push(booking({ status: 'CANCELLED' }));
  assert.deepEqual(blockDateRange(state, { startDate: MONDAY, endDate: '2026-09-30', reason: 'Vacaciones' }),
    { startDate: MONDAY, endDate: '2026-09-30', reason: 'Vacaciones' });
});

test('separate range blocks are sorted by their start date', () => {
  const state = seed();
  blockDateRange(state, { startDate: '2026-10-05', endDate: '2026-10-07', reason: 'Vacaciones' });
  blockDateRange(state, { startDate: MONDAY, endDate: '2026-09-30', reason: 'Licencia Médica' });
  assert.deepEqual(state.blockedRanges.map(({ startDate }) => startDate), [MONDAY, '2026-10-05']);
});

test('adjacent ranges with no shared date are both allowed', () => {
  const state = seed();
  blockDateRange(state, { startDate: MONDAY, endDate: '2026-09-29', reason: 'Vacaciones' });
  blockDateRange(state, { startDate: '2026-09-30', endDate: '2026-10-01', reason: 'Licencia Médica' });
  assert.equal(state.blockedRanges.length, 2);
});
```

### Bloque 5 — Augusto Berloin (asignación propuesta)

Las pruebas de `updateSchedule`, `expireExceptions` y `exceptionSummary` distinguen reservas futuras y pasadas, verifican el vencimiento selectivo e idempotente y comprueban que el resumen no exponga datos privados. El aviso es simulado: ninguna de estas aserciones acredita un correo enviado ni una tarea automática de fondo.

**Código completo:** [`test/unit/05-exceptions.test.js`](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/test/unit/05-exceptions.test.js).

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exceptionSummary, expireExceptions, updateSchedule } from '../../server/domain.js';
import { booking, NOW, seed } from './fixtures.js';

function exceptionState() {
  const state = seed();
  state.bookings.push(booking());
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.enabled = false;
  schedule.monday.ranges = [];
  updateSchedule(state, schedule, NOW);
  return state;
}

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('disabling a working day flags its future booking as an exception', () => {
  const state = exceptionState();
  assert.equal(state.bookings[0].status, 'EXCEPTION');
  assert.equal(state.bookings[0].exceptionDeadline, NOW + 24 * 60 * 60 * 1000);
});

test('a past booking is not newly flagged when its weekday is disabled', () => {
  const state = seed();
  state.bookings.push(booking({ date: '2026-09-25' }));
  const schedule = structuredClone(state.weeklyHours);
  schedule.friday.enabled = false;
  schedule.friday.ranges = [];
  updateSchedule(state, schedule, NOW);
  assert.equal(state.bookings[0].status, 'CONFIRMED');
  assert.equal(state.notificationOutbox.length, 0);
});

test('expiration selects only due exceptions among mixed booking states', () => {
  const state = exceptionState();
  state.bookings[0].exceptionDeadline = NOW - 1;
  state.bookings.push(booking({ reference: 'AY-LATER', status: 'EXCEPTION', exceptionDeadline: NOW + 1 }));
  state.bookings.push(booking({ reference: 'AY-NORMAL', status: 'CONFIRMED' }));
  assert.deepEqual(expireExceptions(state, NOW), ['AY-ONE']);
  assert.deepEqual(state.bookings.map(({ status }) => status), ['CANCELLED', 'EXCEPTION', 'CONFIRMED']);
});

test('running expiration twice does not cancel the same exception twice', () => {
  const state = exceptionState();
  const deadline = state.bookings[0].exceptionDeadline;
  assert.deepEqual(expireExceptions(state, deadline), ['AY-ONE']);
  assert.deepEqual(expireExceptions(state, deadline + 1), []);
  assert.equal(state.bookings[0].cancelReason, 'EXCEPTION_DEADLINE');
});

test('exception summary exposes notice metadata without guest contact details', () => {
  const state = exceptionState();
  const summary = exceptionSummary(state);
  assert.equal(summary.bookings[0].reference, 'AY-ONE');
  assert.equal(summary.notifications[0].delivery, 'SIMULATED_NOT_SENT');
  assert.equal(JSON.stringify(summary).includes('ada@example.com'), false);
  assert.equal(JSON.stringify(summary).includes('Ada Lovelace'), false);
});
```

### Bloque 6 — Martin Flores (asignación propuesta)

`reassignException`, `guestReassignmentSlots` y `reassignGuestException` se prueban con referencias inexistentes, datos inválidos, el acceso del propio invitado, el vencimiento exacto y la privacidad del comprobante. El recorrido E2E 8 completa la verificación de la sesión del navegador, que una función aislada no puede cubrir.

**Código completo:** [`test/unit/06-reassignment.test.js`](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/test/unit/06-reassignment.test.js).

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guestReassignmentSlots, reassignException, reassignGuestException, updateSchedule } from '../../server/domain.js';
import { booking, MONDAY, NOW, seed, TOKEN_A } from './fixtures.js';

function exceptionState() {
  const state = seed();
  state.bookings.push(booking());
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  updateSchedule(state, schedule, NOW);
  return state;
}

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('reassigning an unknown reference returns not found without mutation', () => {
  const state = exceptionState();
  const before = structuredClone(state);
  assert.throws(() => reassignException(state, 'AY-UNKNOWN', { date: MONDAY, time: '10:00' }, NOW),
    (error) => error.status === 404 && error.code === 'EXCEPTION_NOT_FOUND');
  assert.deepEqual(state, before);
});

test('reassignment rejects malformed date and time with field errors', () => {
  const state = exceptionState();
  const before = structuredClone(state);
  assert.throws(() => reassignException(state, 'AY-ONE', { date: '2026-09-31', time: '25:00' }, NOW),
    (error) => error.status === 400 && Boolean(error.fields.date) && Boolean(error.fields.time));
  assert.deepEqual(state, before);
});

test('the original exception does not consume its own daily capacity when reassigned', () => {
  const state = exceptionState();
  state.quickSettings.maxDailyBookings = 1;
  const result = reassignException(state, 'AY-ONE', { date: MONDAY, time: '10:00' }, NOW);
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(state.bookings[0].time, '10:00');
  assert.equal(state.bookings.length, 1);
});

test('guest reassignment availability closes exactly at the deadline', () => {
  const state = exceptionState();
  const deadline = state.bookings[0].exceptionDeadline;
  assert.throws(() => guestReassignmentSlots(state, TOKEN_A, MONDAY, deadline),
    (error) => error.status === 410 && error.code === 'EXCEPTION_EXPIRED');
});

test('guest reassignment retains reference and service but omits guest details', () => {
  const state = exceptionState();
  const receipt = reassignGuestException(state, TOKEN_A, { date: MONDAY, time: '10:00' }, NOW);
  assert.equal(receipt.reference, 'AY-ONE');
  assert.equal(receipt.eventId, state.bookings[0].eventId);
  assert.equal(receipt.time, '10:00');
  assert.equal(JSON.stringify(receipt).includes('ada@example.com'), false);
});
```

### Bloque 7 — Valentin Fornes (asignación propuesta)

Con `isLiveHold`, `createHold`, `findHold`, `updateSchedule` y `confirmBooking` se revisan el instante exacto de vencimiento, un servicio desconocido, la limpieza de reservas temporales, el cambio de horario y la recuperación del comprobante. Estos tests no simulan clientes de red concurrentes; el conflicto HTTP observable se comprueba en E2E 6.

**Código completo:** [`test/unit/07-holds.test.js`](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/test/unit/07-holds.test.js).

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmBooking, createHold, findHold, isLiveHold, updateSchedule } from '../../server/domain.js';
import { DEMO_EVENTS } from '../../server/seed.js';
import { MONDAY, NOW, seed, TOKEN_A, TOKEN_B } from './fixtures.js';

const selection = { eventId: DEMO_EVENTS[0].id, date: MONDAY, time: '09:00' };

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('a hold stops being live at its exact expiration millisecond', () => {
  const hold = { expiresAt: NOW + 15 * 60 * 1000 };
  assert.equal(isLiveHold(hold, hold.expiresAt - 1), true);
  assert.equal(isLiveHold(hold, hold.expiresAt), false);
});

test('an unknown service cannot create a hold or mutate state', () => {
  const state = seed();
  const before = structuredClone(state);
  assert.throws(() => createHold(state, { ...selection, eventId: 'unknown-service' }, NOW, TOKEN_A),
    (error) => error.status === 400);
  assert.deepEqual(state, before);
});

test('creating a hold purges expired holds but retains other active holds', () => {
  const state = seed();
  state.holds.push({ token: 'c'.repeat(64), date: '2026-09-29', time: '09:00', duration: 30, expiresAt: NOW });
  state.holds.push({ token: TOKEN_B, date: '2026-09-29', time: '09:30', duration: 30, expiresAt: NOW + 1000 });
  createHold(state, selection, NOW, TOKEN_A);
  assert.deepEqual(state.holds.map(({ token }) => token), [TOKEN_B, TOKEN_A]);
});

test('an active hold becomes unusable when edited hours remove its slot', () => {
  const state = seed();
  createHold(state, selection, NOW, TOKEN_A);
  const schedule = structuredClone(state.weeklyHours);
  schedule.monday.ranges = [{ start: '10:00', end: '13:00' }];
  updateSchedule(state, schedule, NOW);
  assert.throws(() => findHold(state, TOKEN_A, NOW),
    (error) => error.status === 409 && error.code === 'SLOT_UNAVAILABLE');
});

test('a confirmed token resolves to its receipt after the hold has expired', () => {
  const state = seed();
  const hold = createHold(state, selection, NOW, TOKEN_A);
  confirmBooking(state, TOKEN_A, { name: 'Ada Lovelace', email: 'ada@example.com' }, NOW, 'AY-ONE');
  assert.equal(state.holds.length, 0);
  assert.equal(findHold(state, TOKEN_A, hold.expiresAt + 1).receipt.reference, 'AY-ONE');
});
```

### Bloque 8 — Alejo Palavecino (asignación propuesta)

`isValidEmail`, `validateGuest`, `createHold` y `confirmBooking` se ejercitan con correos válidos e inválidos, campos obligatorios en blanco, opcionales del tipo incorrecto, almacenamiento normalizado y vencimiento exacto. La validación del formato no comprueba DNS ni entrega de avisos. Los errores que ve el invitado se examinan en E2E 7.

**Código completo:** [`test/unit/08-guests-and-bookings.test.js`](https://github.com/AlejoPalavecino/agendaya-tp6/blob/codex/tp6-coverage-tests/test/unit/08-guests-and-bookings.test.js).

```javascript
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidEmail, validateGuest } from '../../public/shared/validation.js';
import { confirmBooking, createHold } from '../../server/domain.js';
import { DEMO_EVENTS } from '../../server/seed.js';
import { MONDAY, NOW, seed, TOKEN_A } from './fixtures.js';

const selection = { eventId: DEMO_EVENTS[1].id, date: MONDAY, time: '09:00' };

// Proposed allocation only: these AI-assisted tests do not assert individual authorship.
test('email validation accepts plus-addressing but rejects embedded whitespace', () => {
  assert.equal(isValidEmail('ada+agenda@example.com'), true);
  assert.equal(isValidEmail('ada @example.com'), false);
});

test('guest validation treats whitespace-only required values as empty', () => {
  const errors = validateGuest({ name: '   ', email: '  ' });
  assert.ok(errors.name);
  assert.ok(errors.email);
});

test('guest validation rejects non-string optional phone and note', () => {
  const errors = validateGuest({ name: 'Ada Lovelace', email: 'ada@example.com', phone: 123, note: {} });
  assert.ok(errors.phone);
  assert.ok(errors.note);
});

test('booking trims guest fields, consumes the hold, and returns no private guest data', () => {
  const state = seed();
  createHold(state, selection, NOW, TOKEN_A);
  const receipt = confirmBooking(state, TOKEN_A,
    { name: '  Ada Lovelace  ', email: '  ada@example.com  ', phone: '  123  ', note: '  Advice  ' },
    NOW, 'AY-ONE');
  assert.deepEqual(state.bookings[0].guest,
    { name: 'Ada Lovelace', email: 'ada@example.com', phone: '123', note: 'Advice' });
  assert.equal(state.holds.length, 0);
  assert.equal(receipt.eventId, DEMO_EVENTS[1].id);
  assert.equal(JSON.stringify(receipt).includes('ada@example.com'), false);
});

test('confirmation at the hold deadline rejects without booking or notification', () => {
  const state = seed();
  const hold = createHold(state, selection, NOW, TOKEN_A);
  assert.throws(() => confirmBooking(state, TOKEN_A,
    { name: 'Ada Lovelace', email: 'ada@example.com' }, hold.expiresAt, 'AY-ONE'),
  (error) => error.status === 410 && error.code === 'HOLD_EXPIRED');
  assert.equal(state.bookings.length, 0);
  assert.equal(state.notificationOutbox.length, 0);
});
```

### Modificaciones, evaluación general y resultados

La propuesta inicial se ajustó al catálogo incorporado en T3: las pruebas de reserva temporal y comprobante ahora indican el servicio. En el bloque 8, el último caso pasó a cubrir el instante de caducidad, en vez de repetir una comprobación de idempotencia. También se reemplazó un caso de reserva pasada por otro que verifica la conservación de un día no relacionado, porque el pasado ya estaba cubierto en otro bloque. Tras la primera ejecución, los archivos se nombraron por comportamiento, no por integrante, y se compartió un fixture. **No se modificó código de producción para que estas 40 pruebas pasaran.** Como aprobaron desde la primera corrida, no corresponde afirmar una fase RED que no ocurrió.

El comando `node --test test/unit/*.test.js` aprobó **40 de 40**; la suite `node --test test/*.test.js test/unit/*.test.js`, **74 de 74**. La asistencia permitió proponer casos y límites, pero cada resultado esperado debe contrastarse con los criterios de aceptación. Sigue pendiente que los integrantes revisen y expliquen las pruebas que se les proponen.

## 6. Reflexión estructurada

**1. Trazabilidad.** Los flujos principales se desprendían del enunciado, pero convertirlos en pruebas exigió resolver diferencias entre TP1, TP2 y Trello. Algunos identificadores RF cambian de significado y, en US_006, la conversación no coincide con el criterio de aceptación. También varían los motivos permitidos para bloquear un día o un rango. Tomar los criterios de Trello/TP2 como referencia y anotar historia, comportamiento y fuente para cada prueba evitó tratar dos requisitos distintos como si fueran el mismo.

**2. Valor de testear.** Durante T1, una prueba de franjas adyacentes falló: la corrida enfocada aprobó 10 de 11 casos y permitió corregir la separación de horarios. Más tarde, Cypress comprobó que una entrada inválida no se guarda y que dos clientes no obtienen la misma reserva temporal. Lo importante no fue acumular aprobados, sino detectar un caso en el que el estado final no coincidía con la regla esperada.

**3. Uso de IA.** El prompt compartido ayudó a preparar 40 pruebas unitarias para fechas, bloqueos, excepciones y reservas. En los recorridos E2E fue necesario revisar además el estado del navegador, los selectores y el reloj del servidor. Ninguna respuesta generada puede confirmar por sí sola que una aserción representa el negocio, que se envió un correo o que los ocho integrantes comprenden el código. Por eso se conservaron la instrucción, los archivos producidos y las correcciones realizadas; la revisión individual sigue pendiente.

## 7. Lecciones aprendidas

**Diseñar para poder probar.** Separar las reglas de la interfaz e inyectar el reloj y el estado permitió comprobar el vencimiento de 15 minutos y el plazo de 24 horas sin esperar en tiempo real. Los selectores `data-cy` también evitaron que un cambio de estilo rompiera los recorridos. Vale la pena conservar esta separación al incorporar reglas nuevas, sin ampliar la demo más allá de lo acordado.

**Una prueba generada requiere revisión.** El prompt compartido produjo casos ejecutables, pero hubo que adaptarlos al catálogo de servicios y nombrar los archivos de forma que no insinuaran autoría personal. Antes de la entrega, cada integrante debería ejecutar sus cinco pruebas y el recorrido E2E propuesto, discutir los cambios necesarios y explicar los resultados esperados.

**Los desacuerdos entre fuentes deben resolverse antes de probar.** Los RF discordantes y los textos contradictorios de US_006 podían dar lugar a pruebas incompatibles. Dejar constancia de la fuente elegida y de las limitaciones de la demo hizo posible interpretar los resultados. En un proyecto posterior, convendría cerrar estas diferencias antes de implementar.

**Los resultados tienen un alcance concreto.** Los registros y el video muestran una ejecución local de 74 pruebas Node y ocho recorridos Cypress. No prueban envío de correos, autenticación, compatibilidad entre navegadores ni participación individual de cada estudiante. La presentación en clase y la validación del equipo siguen siendo pasos necesarios para cerrar el trabajo.
