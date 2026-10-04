import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSeedState } from './seed.js';

export async function writeState(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  await rename(temporaryPath, filePath);
}

export async function createStore(filePath) {
  const path = resolve(filePath);
  let state;
  try {
    state = JSON.parse(await readFile(path, 'utf8'));
    if (
      state.schemaVersion !== 1 ||
      !state.weeklyHours ||
      !Array.isArray(state.bookings) ||
      !Array.isArray(state.blockedDays) ||
      !Array.isArray(state.holds)
    ) {
      throw new Error('Unsupported data file. Restore a backup or explicitly reset the demo.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = createSeedState();
    await writeState(path, state);
  }
  let pending = Promise.resolve();
  return {
    async read() {
      await pending;
      return structuredClone(state);
    },
    mutate(operation) {
      const result = pending.then(async () => {
        const candidate = structuredClone(state);
        const output = operation(candidate);
        await writeState(path, candidate);
        state = candidate;
        return structuredClone(output);
      });
      pending = result.catch(() => undefined);
      return result;
    },
  };
}
