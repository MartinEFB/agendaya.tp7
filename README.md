# AgendaYA · TP6 and TP7

A small, working availability-and-booking prototype for **Ingeniería y Calidad de Software, Grupo 01**. It covers the group's **US_001–US_010** across modules **M02 and M04**, including the four mandatory TP6 flows. The responsive Spanish interface uses a Node.js mini backend that runs locally or on Vercel.

**TP7** adds a continuous-integration pipeline (GitHub Actions), linter and formatter configuration, and a hotfix process exercised on a simulated incident. See [Continuous integration and quality gates](#continuous-integration-and-quality-gates-tp7), [Branching and hotfix process](#branching-and-hotfix-process-tp7) and [Simulated incident INC-0102](#simulated-incident-inc-0102).

> [!IMPORTANT]
> This is an **academic demo**, not a production booking service. The professional and two services are fixtures; all guest email and administrator notices are **simulated, not sent**. Use fictitious guest data. The administrative view has no authentication: anyone with the link can change shared availability and make mock bookings. The eight Cypress journeys and 40 proposed per-member unit cases are executable evidence, **not proof that each named student personally wrote or reviewed their allocation**. The TP7 exercise also includes a **simulated production incident (INC-0102)**; it is a deliberate teaching defect, not an unnoticed bug. Its current status is recorded in [Simulated incident INC-0102](#simulated-incident-inc-0102).

## Run locally

Requires **Node.js 24.x**. The runtime has no external packages and no compilation step. The development dependencies are Cypress (end-to-end tests), ESLint (linter) and Prettier (formatter). Install them with **pnpm 11** when running the quality checks (see [Automated verification](#automated-verification)).

```sh
node server/index.js
```

Open **http://127.0.0.1:3000**. Stop the server with `Ctrl+C`.

```sh
node --watch server/index.js
```

Development mode restarts the Node server when server-side files change. Refresh the browser after editing frontend files. The application binds only to `127.0.0.1`; it is not exposed to the local network.

### Optional configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Local HTTP port |
| `AGENDA_DATA_FILE` | `data/agenda.json` inside the project | Alternate JSON file, useful for isolated future test runs |

PowerShell example:

```powershell
$env:PORT = '3001'
$env:AGENDA_DATA_FILE = Join-Path $PWD 'data/demo-alternative.json'
node server/index.js
```

The data file is created on first startup. Configuration, blocked dates, pending holds and confirmed bookings survive server restarts. Do not run multiple server processes against the same data file.

### Reset demo data

**Stop the server first.** This explicitly removes every local booking and hold, clears blocked dates, and restores the fixture working week. It is not a production migration or an undo feature.

```sh
node scripts/reset-data.js --confirm
node server/index.js
```

Reset without `--confirm` refuses to write. There is no browser-accessible reset endpoint. If using `AGENDA_DATA_FILE`, the reset command targets that file too. Runtime data is excluded from Git. Equivalent package scripts are `npm start`, `npm run dev`, and `npm run reset -- --confirm` on machines with a working npm launcher.

## Deploy the shared demo on Vercel

1. Import this GitHub repository into Vercel. Use the **Node.js** framework preset and the repository root; no custom build command or output directory is needed. `vercel.json` selects `iad1` and includes the allowlisted public assets in the native Node function.
2. Connect the **Upstash Redis Free** store to the project's **Production** environment (and **Preview** if previews are needed). The Marketplace provides **`KV_REST_API_URL`** and **`KV_REST_API_TOKEN`**. Use the read/write token, not the read-only token. Never commit or expose these values to the browser.
3. Keep **System Environment Variables** enabled. The app allows only the exact hosts supplied by `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_BRANCH_URL`, with matching HTTPS origins. An arbitrary `*.vercel.app` hostname is not trusted.
4. Deploy the main branch. Share the production project URL, not a protected preview URL. Check it from a signed-out browser before distributing it.

The root `server.js` is the fail-closed Vercel entrypoint; `npm start` continues to use `server/index.js` locally. Local runs always use their existing JSON file. Cloud runs require valid Redis configuration and never substitute local files or in-memory state when the store is unavailable. `.env.example` documents variable names only; this dependency-free app does not automatically load `.env` files.

Cloud data uses `agendaya:production:state:v1`; previews use `agendaya:preview:state:v1`, so normal previews do not modify the production demo. An optional `AGENDA_REDIS_KEY` overrides the namespace. Preview deployments using the same preview key share their mock data. Do not point automated experiments or resets at the production key.

The Redis adapter keeps the same `read()` / `mutate(operation)` interface and the existing JSON schema. Reads use **`EVAL`**, not `EVAL_RO`, to reach the primary rather than a lagging replica. Missing state is initialized with `SET NX`. A mutation reads a fresh snapshot, applies the existing synchronous domain operation, and commits only if the serialized state still matches. A concurrent change causes a bounded retry (five attempts maximum); network failures, invalid state and quota failures are not blindly retried. Confirmation retries retain the existing hold-token idempotency. No authoritative state is cached inside a function.

This handles ordinary simultaneous demo requests without pretending the provider offers stronger partition/failover guarantees than it documents. The one-document design is intentionally small, not a production-scale database model. Data is shared across visitors and survives function restarts/redeployments while the connected database remains available. `npm run reset` affects **local JSON only**, never Redis. Back up cloud state before any deliberate reset through the provider dashboard.

Free-tier quotas still apply. The browser polls visible booking views every five seconds, so close unused tabs. At the current published limits, Upstash Free includes 500,000 monthly commands; quota exhaustion can make the demo unavailable. This setup does not enable paid upgrades or eviction.

Official references: [native Node servers on Vercel](https://vercel.com/docs/functions/runtimes/node-js), [Upstash primary reads with EVAL](https://upstash.com/blog/replicated-cache-backed-by-redis), [Upstash consistency limits](https://upstash.com/docs/redis/features/consistency), [Upstash Free pricing](https://upstash.com/pricing/redis).

## Try the covered stories

The group selected Trello/TP2 acceptance criteria when they conflict with earlier TP1 wording. See [traceability](docs/traceability.md) for source-specific RF identifiers and known gaps.

| Story | Observable demo behavior |
|---|---|
| US_001 | In **Disponibilidad**, enable a day and save up to three non-overlapping working ranges; invalid hours are rejected visibly. |
| US_002 | Set a positive daily booking cap. Confirmed bookings and live holds consume capacity. |
| US_003 | Block one date with **Feriado** or **Motivo Personal**. An existing booking produces a count-aware conflict dialog. |
| US_004 | Block an inclusive date range with **Vacaciones** or **Licencia Médica**. Invalid ranges or existing bookings reject the whole change. |
| US_005 | Set a whole-minute interval from 0 to 120 between bookable slots. |
| US_006 | Changing working hours marks affected future bookings as exceptions. The same browser session can choose another slot before the 24-hour deadline; unresolved exceptions are cancelled on the next API request after that deadline. Notices are simulated. |
| US_007 | Set a minimum lead time from 1 to 72 hours; the public calendar updates accordingly. |
| US_008 | Select a date/time and obtain an exclusive 15-minute hold with a visible countdown. Expiry or **Cambiar horario** releases it. |
| US_009 | Submit required name/email and optional phone/note, then receive a persistent confirmation reference. Invalid fields receive visible errors. |
| US_010 | Select either of the two static service types before viewing availability. The selected type appears in the hold and receipt. |

Start with **Reservar turno** for the public flow or **Disponibilidad** for administration. To see a conflict, confirm a fictional booking and then try blocking its date. The server rechecks capacity and availability on hold/confirmation; a stale calendar cannot guarantee a slot.

## Scope and fixture assumptions

**Fixture data:** Lucía Méndez; two virtual, 30-minute services; Buenos Aires calendar time; Monday–Friday `09:00–13:00` and `15:00–18:00`; initial daily cap 8, interval 0 minutes, and lead time 1 hour. The service count, durations, profile, and initial schedule are demo choices, not prescribed product requirements. Public availability refreshes every five seconds. Interactive UI controls use stable `data-cy` selectors.

**Deliberate boundaries:** No login, authorization, profile or service CRUD, general booking-list API, payments, real SMTP, or background scheduler. Guest details remain in private server state, not public receipts or availability responses. Email failure is an injected **simulation**; the confirmed booking is retained. Exception self-service requires the original browser session capability, not an emailed link. An affected future booking remains an exception until reassigned or its 24-hour deadline expires; it is not immediately deleted when hours change. Local JSON storage is single-process; cloud Redis is shared demo state, not a production booking system.

## Small architecture

```text
public/
  index.html, styles.css, favicon.svg   Accessible responsive interface
  js/app.js                            Startup and two-view navigation
  js/booking.js, js/admin.js            Public booking and simulated admin UI
  js/api.js, js/ui.js                   HTTP transport and feedback helpers
  shared/dates.js, validation.js        Pure, reusable date/validation functions
server/
  index.js, config.js                   Local/cloud startup and trusted host configuration
  app.js                               Native HTTP routing and static-file allowlist
  domain.js                            Availability, holds, blocking, exceptions and booking rules
  store.js                             Serialized mutations and atomic JSON replacement
  redis-store.js                       Primary reads and conditional cloud-state commits
  seed.js                              Explicit demonstration fixtures
server.js, vercel.json                  Native Node deployment entrypoint and settings
scripts/reset-data.js                   Explicit, offline fixture reset
scripts/check-build.js                  Syntax and startup check used by the CI Build job
docs/traceability.md                    Story-to-implementation/source mapping
docs/unit-test-ai-record.md             Exact shared AI prompt, output and critical review
test/*.test.js, test/unit/*.test.js      Domain/helper and HTTP integration checks
test/unit/09-holiday-regression.test.js Regression test for incident INC-0102
cypress/e2e/tp6.cy.js                    Eight complete browser journeys
cypress.config.js                        Isolated store, injected clock and dynamic local port
eslint.config.js, .prettierrc.json      Linter and formatter configuration (TP7)
.github/workflows/ci.yml                CI pipeline: format, lint, tests, build, E2E (TP7)
.github/actions/setup/action.yml        Shared environment setup reused by every CI job
```

The browser and server share validation helpers. The server remains authoritative: another browser can take a slot before a stale calendar refreshes. Locally, mutations execute one at a time against cloned state; a successful write replaces the JSON file before the in-memory state is committed. Cloud mutations use the conditional Redis commits described above. A failed validation does not commit a candidate. If a network failure makes a cloud write's outcome uncertain, the app reports failure rather than claiming it saved; retrying a confirmation with its existing hold token safely recovers its receipt. Holds use unpredictable 256-bit tokens.

Holds are logically expired when `now >= expiresAt`, even after a server restart. Expired records may remain in the JSON file until a later hold creation; they never block availability. The UI keeps only its hold/booking capability in tab-scoped `sessionStorage`, not guest details. Reloading the same tab can restore a pending hold, a confirmed receipt, or a reassignment opportunity.

The date helpers explicitly use Buenos Aires calendar dates. Slot timestamps use the fixture's current UTC−03:00 offset; this is not a general historical/DST timezone engine. `createApplication({ store, clock })` accepts an injected clock, and domain functions accept `now` explicitly, so expiry tests do not need to wait 15 minutes in real time.

## HTTP contracts

JSON requests use `Content-Type: application/json`; responses use JSON unless requesting a static asset. All JSON responses are `no-store`.

| Method and endpoint | Request / response |
|---|---|
| `GET /api/config` | Mock profile and two-service catalog (`events`), authoritative `serverNow`, local `today` |
| `GET /api/availability?month=YYYY-MM&eventId=...` | `{ month, eventId, days: [{date, slots}], serverNow, today }`; no guest information or hold tokens |
| `GET /api/admin/availability` | `{ weeklyHours, blockedDays, blockedRanges, quickSettings }`; unauthenticated simulated administration |
| `GET /api/admin/exceptions` | Booking-exception metadata and simulated notice metadata; no guest contact data |
| `PUT /api/admin/quick-settings` | `{ maxDailyBookings, intervalMinutes, leadHours }` with validated integer boundaries |
| `PUT /api/admin/availability` | `{ weeklyHours: { monday: {enabled, ranges:[{start,end}]}, ... } }` for all seven weekday keys; returns affected exception references |
| `POST /api/admin/blocked-days` | `{ date: "YYYY-MM-DD", reason: "Feriado" or "Motivo Personal" }`; returns blocked date |
| `POST /api/admin/blocked-ranges` | `{ startDate, endDate, reason: "Vacaciones" or "Licencia Médica" }`; all-or-nothing conflict check |
| `POST /api/admin/exceptions/:reference/reassign` | `{ date, time }`; simulated admin reassignment before deadline |
| `GET /api/bookings/access/:token/availability?month=YYYY-MM` | Same-session capability returns available reassignment slots |
| `POST /api/bookings/access/:token/reassign` | `{ date, time }`; same-session capability restores confirmation |
| `POST /api/holds` | `{ eventId, date, time: "HH:mm" }`; returns token, service, expiry and server time |
| `GET /api/holds/:token` | Active hold, or a non-personal receipt after confirmation; capability required |
| `DELETE /api/holds/:token` | Releases only that pending hold; never cancels a confirmed booking |
| `POST /api/bookings` | `{ holdToken, guest: {name,email,phone?,note?} }`; returns non-personal receipt with `SIMULATED_NOT_SENT` or injected `SIMULATED_FAILED` status |

Errors use `{ message, code, fields? }`; booking-conflict errors also include `count`. Expected status codes: `400` invalid input, `409` unavailable/conflicting slot or date, `410` expired hold, `413` JSON body over 32 KiB, `415` unsupported content type. Unknown resources are `404`. Only explicitly allowlisted frontend files are served; the JSON storage is never served as a static file.

## Automated verification

The Cypress config starts its **own** loopback server on an available port, with a resettable in-memory store and injectable clock. Each journey resets the fixture. Do not run these browser tests against shared production or preview data.

On Windows with Node 24 and pnpm 11, install from the checked-in lockfile and place the Cypress binary cache in a writable temporary directory:

```powershell
$env:CYPRESS_CACHE_FOLDER = Join-Path $env:TEMP 'CypressCache-AgendaYA-TP6'
$env:CI = 'true'
pnpm install --frozen-lockfile
pnpm exec cypress install
```

The explicit binary install is needed on a clean machine; it downloads Cypress 16.1.0. The lockfile includes a targeted `ansi-regex` override in `pnpm-workspace.yaml` to satisfy pnpm's dependency-age policy. In one managed sandbox, pnpm's `bluebird` junction creation failed; the same install and headless run succeeded outside that sandbox. This is an environment limitation, not a passing sandbox run.

Run the checks from the repository root. These are the same commands the CI pipeline executes:

```powershell
pnpm run format:check   # Prettier check (apply fixes with: pnpm run format)
pnpm run lint           # ESLint
pnpm test               # complete Node suite: unit + HTTP integration
pnpm run build          # syntax check of every .js file + startup smoke test
pnpm run test:e2e       # Cypress journeys in Electron headless
```

To run only the per-member unit blocks: `node --test test/unit/*.test.js`.

The code is formatted with Prettier (`singleQuote`, `printWidth` 120). After the TP7 tooling was introduced, the whole code base was reformatted once in a dedicated commit; run `pnpm run format` before committing.

The results below were recorded for the **TP6 baseline**, before the TP7 changes, and are kept as historical evidence. The regression test for INC-0102 adds 2 tests to the Node suite (76 in total). While the simulated defect is present in `main`, those 2 tests fail on purpose; with the fix applied the suite is expected to pass completely.

| Check | Observed result | Evidence |
|---|---|---|
| Proposed eight-member unit blocks | **40 passed, 0 failed**; five cases in each `test/unit/01-*.test.js` through `08-*.test.js`, with at least two behaviors per block | [AI generation and allocation record](docs/unit-test-ai-record.md) |
| Complete Node suite | **74 passed, 0 failed**: 68 domain/helper unit tests (including those 40) and 6 HTTP integration tests | [Node execution log](cypress/evidence/node-rerun.txt) |
| Cypress/Electron headless | **8 passed, 0 failed**: distinct full-flow variants with Arrange/Act/Assert comments | [Cypress execution log](cypress/evidence/headless-rerun-pnpm11.txt), [recorded run video](https://drive.google.com/file/d/1UQLdUejiBTVfabyBeNXp_Iw9fELTwLAy/view?usp=drivesdk) |

The Cypress video is a real recorded execution; local `cypress/videos/` and `cypress/screenshots/` are ignored by Git. Cypress reported **0 screenshots** and one video for the successful run. The eight labels are **proposed review/defense assignments**, not verified student authorship. The [AI record](docs/unit-test-ai-record.md) contains the exact shared prompt, generated file paths, actual adjustments, and limitations; it does not claim eight separate student prompts. Git contains more than three descriptive work-unit commits. The project is hosted in the [GitHub repository](https://github.com/AlejoPalavecino/agendaya-tp6). Each member's individual review/defense must also be confirmed for submission.

For the class demo, run one successful booking journey and one invalid/conflict journey from `cypress/e2e/tp6.cy.js`, then have a member explain two domain tests from their proposed block and one of the three structured reflection answers. Re-run in the presentation environment rather than relying only on the video.

## Continuous integration and quality gates (TP7)

The workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs five independent jobs. Each one appears as its own check on a pull request, so a failure points directly at the verification that broke.

| Check name | Command | What it verifies |
|---|---|---|
| Formato | `pnpm run format:check` | Prettier formatting of the JavaScript sources |
| Linter | `pnpm run lint` | ESLint recommended rules, including unused variables and undefined globals |
| Tests unitarios | `pnpm test` | Complete Node suite: domain unit tests, HTTP integration tests and the INC-0102 regression test |
| Build | `pnpm run build` | AgendaYA has no compilation step, so this checks the syntax of every `.js` file and that the server starts and answers `/` and `/api/availability` |
| E2E Cypress | `pnpm run test:e2e` | The eight browser journeys; videos and screenshots are uploaded as the `cypress-evidencia` artifact |

**Triggers:** pull requests targeting `develop` or `main`, every push to a `hotfix/**` branch, and manual runs. While a pull request from a hotfix branch is open, each push starts two runs (one per trigger); this is expected.

**Protected branches** (configured in the repository settings, not in the code): `main` and `develop` require a pull request, all five checks passing, an up-to-date branch and no force pushes. `main` requires **2 approvals** and `develop` requires **1**. Rules apply to administrators too, so a red pipeline cannot be merged.

**Not covered yet:** automated deployment (development and production environments with manual approval).

## Branching and hotfix process (TP7)

The project follows GitFlow: `main` mirrors production, `develop` integrates the next version, and urgent corrections use `hotfix/INC-<id>-<description>` branches.

1. The hotfix branch is created from the production tag on `main`, never from `develop`, because `develop` holds unreleased work.
2. The first commit contains only the test that reproduces the defect (the pipeline must fail). The second commit contains the minimal fix (the pipeline must pass).
3. The pull request to `main` needs two approvals, one of them from a developer who did not take part in the fix, plus all five checks. It is merged with a merge commit, and a patch-version tag is created.
4. The same branch is then merged into `develop` through a second pull request, so the fix is not lost in the next version. The hotfix test travels with the fix.
5. The incident is closed only after both merges, the post-deployment verification and the post-incident review.

## Simulated incident INC-0102

For the TP7 exercise, Support N1 reports a critical incident in module **02 – Gestión de disponibilidad**: *since the last deployment, bookings made on holiday dates have been reported.*

**Injected change.** In `server/domain.js`, function `scheduledSlots`, the check that returns no slots for a blocked day was commented out:

```js
// if (state.blockedDays.some((blocked) => blocked.date === date)) return [];
```

**Effect.** A date blocked as **Feriado** or **Motivo Personal** is saved and listed in the administration view, but the public calendar still offers its slots, a hold is granted and the booking can be confirmed. Date-range blocks (**Vacaciones**, **Licencia Médica**) are unaffected.

**Detection.** The existing Node tests do not cover the effect of a blocked day on availability, so they pass with the defect present. The Cypress journey *blocks one day and removes it from public availability* asserts that the blocked date is disabled in the public calendar. The regression test [`test/unit/09-holiday-regression.test.js`](test/unit/09-holiday-regression.test.js) was added for this incident: for both block reasons it checks that the date offers no slots and that a hold on it is rejected with `409`. It fails with the defect and passes with the fix.

**Status:** Open. The fix is pending on branch `hotfix/INC-0102-bloqueo-dia-feriado`.

## Academic-demo limitations

- No authentication or authorization: the administrative screen is explicitly simulated. Share only as an academic sandbox; everyone with the link can change shared availability. Never use real personal information.
- Local development binds to HTTP loopback. Vercel supplies HTTPS. Exact host/origin checks and a same-origin content security policy reduce accidental exposure, but do not make this a hardened multi-user service.
- Local JSON storage is designed for **one process**. Cloud Redis uses one shared state document and bounded contention retries, not production durability/service-level guarantees. Keep a backup before resets.
- No real mail or video-call room is created. `SIMULATED_NOT_SENT` and `SIMULATED_FAILED` are local notification states, never proof of delivery. Cloud state is stored with the connected Upstash provider.
- Cypress has been observed only in Electron headless mode; Chrome/Firefox, performance, accessibility audits, and the actual classroom demonstration have not been verified. Electron 146 is deprecated as a Cypress test browser in the recorded run. Source conflicts and intentionally excluded production behaviors are documented in [traceability](docs/traceability.md).
