import { randomBytes } from 'node:crypto';
import { createApplication } from './server/app.js';
import { createSeedState } from './server/seed.js';

// Cypress owns this process-local store. The application never exposes a reset route.
function createTestStore() {
  let state = createSeedState();
  let pending = Promise.resolve();
  return {
    async read() {
      await pending;
      return structuredClone(state);
    },
    mutate(operation) {
      const result = pending.then(() => {
        const candidate = structuredClone(state);
        const output = operation(candidate);
        state = candidate;
        return structuredClone(output);
      });
      pending = result.catch(() => undefined);
      return result;
    },
    async reset() {
      await pending;
      state = createSeedState();
    },
  };
}

export default {
  video: true,
  trashAssetsBeforeRuns: false,
  screenshotsFolder: 'cypress/screenshots',
  videosFolder: 'cypress/videos',
  e2e: {
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: false,
    testIsolation: true,
    async setupNodeEvents(on, config) {
      const store = createTestStore();
      let now = Date.parse('2026-09-28T08:00:00-03:00');
      const server = createApplication({
        store,
        clock: () => now,
        createToken: () => randomBytes(32).toString('hex'),
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      config.baseUrl = `http://127.0.0.1:${server.address().port}`;

      on('task', {
        async resetDemo({ now: nextNow }) {
          if (!Number.isSafeInteger(nextNow)) throw new Error('resetDemo requires a millisecond timestamp.');
          await store.reset();
          now = nextNow;
          return null;
        },
        advanceDemoClock(milliseconds) {
          if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
            throw new Error('advanceDemoClock requires non-negative whole milliseconds.');
          }
          now += milliseconds;
          return now;
        },
      });
      on('after:run', () => new Promise((resolve) => server.close(resolve)));
      return config;
    },
  },
};
