// Keep this deployment entrypoint fail-closed; npm start uses the local entrypoint.
if (process.env.VERCEL !== '1') throw new Error('Enable Vercel system environment variables for this deployment.');
await import('./server/index.js');
