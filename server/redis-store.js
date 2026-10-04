import { setTimeout as delay } from 'node:timers/promises';
import { createSeedState } from './seed.js';

// EVAL (not EVAL_RO) routes reads to the primary, avoiding lagging replicas.
const READ_STATE = `
local value = redis.call('GET', KEYS[1])
if not value then
  redis.call('SET', KEYS[1], ARGV[1], 'NX')
  value = redis.call('GET', KEYS[1])
end
return value`;

const COMPARE_AND_SET = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

function parseState(value) {
  if (typeof value !== 'string') throw new Error('Cloud storage returned an invalid state.');
  let state;
  try {
    state = JSON.parse(value);
  } catch {
    throw new Error('Cloud state is not valid JSON. Restore a backup instead of overwriting it.');
  }
  if (
    state?.schemaVersion !== 1 ||
    !state.weeklyHours ||
    typeof state.weeklyHours !== 'object' ||
    Array.isArray(state.weeklyHours) ||
    !Array.isArray(state.blockedDays) ||
    !Array.isArray(state.holds) ||
    !Array.isArray(state.bookings)
  ) {
    throw new Error('Unsupported cloud data. Restore a backup instead of overwriting it.');
  }
  return state;
}

export function createRedisStore({ url, token, key = 'agendaya:production:state:v1', fetchImpl = fetch }) {
  if (!url || !token) throw new Error('Cloud storage requires KV_REST_API_URL and KV_REST_API_TOKEN.');
  const endpoint = new URL(url);
  if (
    endpoint.protocol !== 'https:' ||
    !endpoint.hostname.endsWith('.upstash.io') ||
    endpoint.port ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error('KV_REST_API_URL must be the HTTPS Upstash REST endpoint without a path or credentials.');
  }
  if (typeof key !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(key)) {
    throw new Error('AGENDA_REDIS_KEY must contain 1 to 160 letters, digits, colons, underscores or hyphens.');
  }
  const seed = JSON.stringify(createSeedState());

  async function command(arguments_) {
    // A failed/ambiguous network write is never blindly replayed or saved locally.
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(arguments_),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error(`Cloud storage request failed (${response.status}).`);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Cloud storage returned an invalid response.');
    }
    if (!payload || payload.error || !Object.hasOwn(payload, 'result')) {
      throw new Error('Cloud storage rejected the request. Check its configuration and quota.');
    }
    return payload.result;
  }

  const readSerialized = () => command(['EVAL', READ_STATE, '1', key, seed]);
  return {
    async read() {
      return parseState(await readSerialized());
    },
    async mutate(operation) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const previous = await readSerialized();
        const candidate = parseState(previous);
        // Existing domain operations are synchronous and have no external side effects.
        const output = operation(candidate);
        if (output && typeof output.then === 'function') throw new Error('Storage mutations must be synchronous.');
        const next = JSON.stringify(candidate);
        // Still compare unchanged results, so confirmations remain safe and idempotent.
        const committed = await command(['EVAL', COMPARE_AND_SET, '1', key, previous, next]);
        if (committed === 1) return structuredClone(output);
        if (committed !== 0) throw new Error('Cloud storage returned an invalid commit result.');
        if (attempt < 4) await delay(20 * (attempt + 1) + Math.floor(Math.random() * 20));
      }
      throw new Error('Cloud storage is busy. Retry the operation.');
    },
  };
}
