import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeedState } from '../server/seed.js';
import { writeState } from '../server/store.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = resolve(process.env.AGENDA_DATA_FILE || resolve(root, 'data/agenda.json'));
if (!process.argv.includes('--confirm')) {
  console.error(
    'Stop the server first. Reset removes all local demo reservations, holds and settings.\nTo proceed explicitly: npm run reset -- --confirm',
  );
  process.exitCode = 1;
} else {
  await writeState(path, createSeedState());
  console.log(`Demo data reset: ${path}`);
}
