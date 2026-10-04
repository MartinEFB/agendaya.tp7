import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from './app.js';
import { createStore } from './store.js';
import { createRedisStore } from './redis-store.js';
import { readCloudConfig } from './config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
const dataPath = resolve(process.env.AGENDA_DATA_FILE || resolve(root, 'data/agenda.json'));
const cloud = readCloudConfig();
const store = cloud ? createRedisStore(cloud.redis) : await createStore(dataPath);
const server = createApplication({ store, trustedHosts: cloud?.trustedHosts });
if (cloud) server.listen(port, () => console.log('AgendaYA shared academic demo: cloud persistence enabled.'));
else
  server.listen(port, '127.0.0.1', () =>
    console.log(`AgendaYA local demo: http://127.0.0.1:${port}\nData file: ${dataPath}\nPress Ctrl+C to stop.`),
  );
server.on('error', (error) => {
  console.error('Unable to start AgendaYA:', error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
