# TP6 unit-test generation record

These eight blocks are **proposed allocations for review and defense**, not evidence that any named student personally authored or approved the tests. The source files were generated with AI assistance. A student must inspect, run, and be able to explain their proposed block before the final report may attribute individual responsibility to them.

## Exact generation prompt and output

One shared delegation prompt drove all eight blocks. There were **not** eight separate student prompts. The exact prompt was:

> Implementá T4 ahora como escritor delegado. Leé odd/tasks/tp6-coverage-and-automated-tests.md; Engram mirror falla unknown_session. Usá tu inventario de 40 casos NUEVOS (8 bloques de 5), exactos o ajustes si T3 cambió dominio, en `test/unit/` con 8 archivos/block IDs, sin atribuir falsamente autoría individual. Cada bloque ≥2 funciones/comportamientos y normal/límite/inválido. Importante: TP6 pide prompt exacto, salida generada, cambios y evaluación crítica por bloque; creá `docs/unit-test-ai-record.md` honesto con prompt usado (tu instrucción aquí puede citarse como contexto pero redactá exacto prompt de generación), archivos de salida/código o fragmentos trazables, modificaciones efectivas y evaluación, sin afirmar que los ocho estudiantes lo escribieron. TDD ON inferido docs/traceability.md, runner node --test; para T4 son pruebas nuevas sobre comportamiento ya existente: registrá un fallo RED real de test/fixture si surge, NO inventes ni alteres código productivo para forzarlo. Ejecutá 40 y suite completa. No edit ODD doc ni commit. Route delegated writer; ~400 líneas heurística, no cap, RDD global OFF. Devolvé conteos unit vs integration y matiz autoría. Repo nested TP6-PROYECTO-FRONTEND-MINIBACKEND.

The prompt referred to a 40-case inventory prepared in an earlier read-only exchange. The final, complete generated code is in the eight `test/unit/*.test.js` files below, supported by `test/unit/fixtures.js`. Each file contains exactly five `node:test` cases. The files are named for behavior, **not** students.

| Proposed reviewer | Generated output | Distinct behaviors | Evaluation and limitations |
|---|---|---|---|
| Valentin Mendez | [`01-schedule.test.js`](../test/unit/01-schedule.test.js) | `validateSchedule`, `normalizeSchedule`, `updateSchedule` | Covers missing day, empty enabled day, the three-range limit, normalization, and unrelated-day preservation. These are domain rules; a browser save/feedback path remains E2E work. |
| Facundo Rodriguez | [`02-datetime.test.js`](../test/unit/02-datetime.test.js) | `isValidDate`, `isValidMonth`, `timeToMinutes`, `minutesToTime`, `datesInMonth` | Covers leap-year validity, supported-year boundary, invalid clock value, and month expansion. It does not prove browser timezone rendering. |
| Alvaro Tapia | [`03-day-blocking.test.js`](../test/unit/03-day-blocking.test.js) | `validateBlock`, `blockDay` | Covers invalid date/reason, sorted successful insertion, range overlap, and cancelled-booking exception. Existing-booking dialog behavior needs E2E verification. |
| Luciano Romero | [`04-range-blocking.test.js`](../test/unit/04-range-blocking.test.js) | `validateDateRange`, `blockDateRange` | Covers invalid start/category, cancelled booking, range sorting, and adjacent ranges. Existing T2 tests independently cover active-booking conflicts and atomic rollback. |
| Augusto Berloin | [`05-exceptions.test.js`](../test/unit/05-exceptions.test.js) | `updateSchedule`, `expireExceptions`, `exceptionSummary` | Covers future/past distinction, selective and idempotent expiry, and public-summary privacy. A simulated notice is **not** evidence of delivered email or a background scheduler. |
| Martin Flores | [`06-reassignment.test.js`](../test/unit/06-reassignment.test.js) | `reassignException`, `guestReassignmentSlots`, `reassignGuestException` | Covers missing/invalid input, own-capacity exclusion, exact deadline, and receipt privacy. Browser-session capability retention needs E2E verification. |
| Valentin Fornes | [`07-holds.test.js`](../test/unit/07-holds.test.js) | `isLiveHold`, `createHold`, `findHold`, `updateSchedule`, `confirmBooking` | Covers expiry boundary, unknown service, stale-hold cleanup, schedule invalidation, and confirmed-token recovery. It does not simulate simultaneous network clients. |
| Alejo Palavecino | [`08-guests-and-bookings.test.js`](../test/unit/08-guests-and-bookings.test.js) | `isValidEmail`, `validateGuest`, `createHold`, `confirmBooking` | Covers accepted/rejected email syntax, required/optional fields, normalized private storage, and exact hold-expiry rejection. Email syntax does not check DNS or deliver notifications. |

## Modifications and critical review

The AI adapted the earlier inventory to the committed T3 multi-service model before writing: hold/receipt cases pass an explicit service ID, and the last guest-booking case tests the hold-expiry boundary instead of repeating an existing idempotency assertion. A proposed past-booking schedule case was replaced with unrelated-weekday preservation because another block already tests past bookings. After the first generated test run passed, the eight files were renamed from student-name filenames to behavior filenames at reviewer request to prevent a false authorship signal. A small shared fixture file replaces repeated seed/bookings/tokens. **No production code was changed to make these tests pass. No human-authored correction of the test logic or individual student review has been recorded.**

This output is useful for deriving focused domain cases and exposing expiry/privacy boundaries. It cannot determine whether each proposed reviewer understands the assertions, whether the application behaves correctly in a browser, or whether simulated notifications satisfy any real-email requirement. Those questions require the team's review and the separate E2E evidence.

## Execution evidence

- Runner: Node 24 built-in `node --test`.
- Focused command: `node --test test/unit/*.test.js` — **40 passed, 0 failed** on the first run; no RED failure was observed. These are characterization tests over behavior already implemented in T1–T3, so no artificial RED or production edit was introduced.
- Full command: `node --test test/*.test.js test/unit/*.test.js` — **74 passed, 0 failed**.
- Classification: 68 direct domain/helper unit tests (40 new + 28 prior); 6 HTTP integration tests in the three pre-existing top-level suites. The integration cases are not counted toward the per-member unit quota.
- Syntax: `node --check` passed for all eight new test files. A line-by-line whitespace scan found no trailing whitespace in the nine new test files and this record. `git diff --check` passed for tracked changes; Git only warned about future LF-to-CRLF conversion in the separately edited ODD task file.

The assignment's individual-responsibility requirement is **not yet verified** by these execution counts. The final report should retain the proposed label until each member confirms their own review, changes, and ability to explain their five tests.
