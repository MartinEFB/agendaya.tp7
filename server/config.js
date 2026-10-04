export function readCloudConfig(env = process.env) {
  if (env.VERCEL !== '1') return null;
  const hosts = [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL]
    .filter(Boolean)
    .map((value) => {
      const host = value.trim().toLowerCase();
      const parsed = new URL(`https://${host}`);
      if (
        !/^[a-z0-9.-]+$/.test(host) ||
        !host.includes('.') ||
        parsed.host !== host ||
        parsed.pathname !== '/' ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error('Vercel host configuration must contain exact hostnames without schemes or paths.');
      }
      return host;
    });
  if (!hosts.length) throw new Error('Cloud deployment requires a Vercel hostname.');
  if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) {
    throw new Error('Connect the Upstash store to this Vercel environment before deploying.');
  }
  const environment = env.VERCEL_ENV === 'production' ? 'production' : 'preview';
  return {
    trustedHosts: [...new Set(hosts)],
    redis: {
      url: env.KV_REST_API_URL,
      token: env.KV_REST_API_TOKEN,
      key: env.AGENDA_REDIS_KEY || `agendaya:${environment}:state:v1`,
    },
  };
}
