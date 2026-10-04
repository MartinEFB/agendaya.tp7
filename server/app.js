import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { datesInMonth, isValidMonth, localDate } from '../public/shared/dates.js';
import {
  blockDateRange,
  blockDay,
  confirmBooking,
  createHold,
  DomainError,
  exceptionSummary,
  expireExceptions,
  findHold,
  guestReassignmentSlots,
  monthlyAvailability,
  quickSettingsOf,
  reassignException,
  reassignGuestException,
  updateQuickSettings,
  updateSchedule,
} from './domain.js';
import { DEMO_EVENT, DEMO_EVENTS, DEMO_PROFILE } from './seed.js';

const PUBLIC_DIRECTORY = fileURLToPath(new URL('../public/', import.meta.url));
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ...['app', 'api', 'ui', 'booking', 'admin'].map((name) => [
    `/js/${name}.js`,
    [`js/${name}.js`, 'text/javascript; charset=utf-8'],
  ]),
  ...['dates', 'validation'].map((name) => [
    `/shared/${name}.js`,
    [`shared/${name}.js`, 'text/javascript; charset=utf-8'],
  ]),
]);

async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) {
    throw new DomainError('Se requiere contenido JSON.', 415);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32768) throw new DomainError('La solicitud es demasiado grande.', 413);
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid object');
    return data;
  } catch {
    throw new DomainError('El contenido JSON no es válido.');
  }
}

export function createApplication({
  store,
  trustedHosts,
  clock = Date.now,
  createToken = () => randomBytes(32).toString('hex'),
  simulatedGuestEmailStatus = 'SIMULATED_NOT_SENT',
}) {
  const cloudHosts = trustedHosts ? new Set(trustedHosts) : null;
  async function currentState(now) {
    const state = await store.read();
    if (!state.bookings.some((booking) => booking.status === 'EXCEPTION' && booking.exceptionDeadline <= now))
      return state;
    await store.mutate((candidate) => expireExceptions(candidate, now));
    return store.read();
  }
  return createServer(async (request, response) => {
    const send = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(data));
    };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    try {
      const host = (request.headers.host || '').toLowerCase();
      const allowed = cloudHosts ? cloudHosts.has(host) : /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
      if (!allowed) throw new DomainError('Host no permitido.', 403);
      const origin = `${cloudHosts ? 'https' : 'http'}://${host}`;
      if (request.headers.origin && request.headers.origin !== origin)
        throw new DomainError('Origen no permitido.', 403);
      const url = new URL(request.url, origin);
      const path = url.pathname;
      const method = request.method;
      if (method === 'GET' && path === '/api/config') {
        return send(200, {
          profile: DEMO_PROFILE,
          event: DEMO_EVENT,
          events: DEMO_EVENTS,
          serverNow: clock(),
          today: localDate(clock()),
        });
      }
      if (method === 'GET' && path === '/api/availability') {
        const month = url.searchParams.get('month');
        if (!isValidMonth(month)) throw new DomainError('El mes debe tener formato AAAA-MM.');
        const eventId = url.searchParams.get('eventId') || DEMO_EVENT.id;
        const now = clock();
        return send(200, {
          month,
          eventId,
          days: monthlyAvailability(await currentState(now), month, now, eventId),
          serverNow: now,
          today: localDate(now),
        });
      }
      if (method === 'GET' && path === '/api/admin/availability') {
        const state = await currentState(clock());
        return send(200, {
          weeklyHours: state.weeklyHours,
          blockedDays: state.blockedDays,
          blockedRanges: state.blockedRanges || [],
          quickSettings: quickSettingsOf(state),
        });
      }
      if (method === 'GET' && path === '/api/admin/exceptions') {
        return send(200, exceptionSummary(await currentState(clock())));
      }
      if (method === 'PUT' && path === '/api/admin/quick-settings') {
        const body = await readJson(request);
        return send(200, await store.mutate((state) => updateQuickSettings(state, body)));
      }
      if (method === 'PUT' && path === '/api/admin/availability') {
        const body = await readJson(request);
        const now = clock();
        return send(
          200,
          await store.mutate((state) => {
            expireExceptions(state, now);
            return updateSchedule(state, body.weeklyHours, now);
          }),
        );
      }
      if (method === 'POST' && path === '/api/admin/blocked-days') {
        const body = await readJson(request);
        return send(201, await store.mutate((state) => blockDay(state, body)));
      }
      if (method === 'POST' && path === '/api/admin/blocked-ranges') {
        const body = await readJson(request);
        return send(201, await store.mutate((state) => blockDateRange(state, body)));
      }
      const exceptionRoute = path.match(/^\/api\/admin\/exceptions\/(AY-[A-Z0-9]+)\/reassign$/);
      if (exceptionRoute && method === 'POST') {
        const body = await readJson(request);
        const now = clock();
        return send(200, await store.mutate((state) => reassignException(state, exceptionRoute[1], body, now)));
      }
      const guestReassignmentRoute = path.match(/^\/api\/bookings\/access\/([a-f0-9]{64})\/(availability|reassign)$/);
      if (guestReassignmentRoute && method === 'GET' && guestReassignmentRoute[2] === 'availability') {
        const month = url.searchParams.get('month');
        if (!isValidMonth(month)) throw new DomainError('El mes debe tener formato AAAA-MM.');
        const now = clock();
        const state = await currentState(now);
        return send(200, {
          month,
          days: datesInMonth(month).map((date) => ({
            date,
            slots: guestReassignmentSlots(state, guestReassignmentRoute[1], date, now),
          })),
          serverNow: now,
          today: localDate(now),
        });
      }
      if (guestReassignmentRoute && method === 'POST' && guestReassignmentRoute[2] === 'reassign') {
        const body = await readJson(request);
        const now = clock();
        return send(
          200,
          await store.mutate((state) => reassignGuestException(state, guestReassignmentRoute[1], body, now)),
        );
      }
      if (method === 'POST' && path === '/api/holds') {
        const body = await readJson(request);
        const now = clock();
        return send(
          201,
          await store.mutate((state) => {
            expireExceptions(state, now);
            return createHold(state, body, now, createToken());
          }),
        );
      }
      const holdRoute = path.match(/^\/api\/holds\/([a-f0-9]{64})$/);
      if (holdRoute && method === 'GET') {
        const now = clock();
        return send(200, findHold(await currentState(now), holdRoute[1], now));
      }
      if (holdRoute && method === 'DELETE') {
        await store.mutate((state) => {
          state.holds = state.holds.filter((hold) => hold.token !== holdRoute[1]);
          return null;
        });
        return send(200, { released: true });
      }
      if (method === 'POST' && path === '/api/bookings') {
        const body = await readJson(request);
        if (typeof body.holdToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.holdToken))
          throw new DomainError('La selección del horario no es válida.');
        const now = clock();
        return send(
          201,
          await store.mutate((state) => {
            expireExceptions(state, now);
            return confirmBooking(
              state,
              body.holdToken,
              body.guest || {},
              now,
              `AY-${randomBytes(5).toString('hex').toUpperCase()}`,
              simulatedGuestEmailStatus,
            );
          }),
        );
      }
      if ((method === 'GET' || method === 'HEAD') && STATIC_FILES.has(path)) {
        const [file, mime] = STATIC_FILES.get(path);
        const content = await readFile(join(PUBLIC_DIRECTORY, file));
        response.writeHead(200, { 'Content-Type': mime });
        return response.end(method === 'HEAD' ? undefined : content);
      }
      send(404, { message: 'Recurso no encontrado.', code: 'NOT_FOUND' });
    } catch (error) {
      if (response.headersSent) return response.end();
      if (error instanceof DomainError)
        return send(error.status, { message: error.message, code: error.code, fields: error.fields, ...error.details });
      console.error('Request failed:', error.message);
      send(500, { message: 'No se pudieron guardar los cambios. Intenta nuevamente.', code: 'INTERNAL_ERROR' });
    }
  });
}
