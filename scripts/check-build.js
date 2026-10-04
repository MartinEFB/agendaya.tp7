// AgendaYA es JavaScript sin compilación, así que "build" significa comprobar que
// el código es sintácticamente válido y que la aplicación arranca y responde.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FOLDERS = ['server', 'public', 'scripts', 'test', 'cypress'];

function listJsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listJsFiles(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

function checkSyntax() {
  const rootFiles = readdirSync('.').filter((name) => name.endsWith('.js'));
  const files = [...rootFiles, ...FOLDERS.flatMap(listJsFiles)];
  const failures = files.filter((file) => {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) console.error(`Error de sintaxis en ${file}\n${result.stderr}`);
    return result.status !== 0;
  });
  if (failures.length) throw new Error(`${failures.length} archivo(s) con errores de sintaxis.`);
  console.log(`Sintaxis correcta en ${files.length} archivos.`);
}

async function waitForServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // El servidor todavía está arrancando.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`La aplicación no respondió en ${url}.`);
}

async function checkStartup() {
  const port = 3100 + Math.floor(Math.random() * 800);
  const dir = mkdtempSync(join(tmpdir(), 'agendaya-build-'));
  const env = { ...process.env, PORT: String(port), AGENDA_DATA_FILE: join(dir, 'agenda.json') };
  const server = spawn(process.execPath, ['server/index.js'], { env, stdio: 'ignore' });
  try {
    const base = `http://127.0.0.1:${port}`;
    await waitForServer(`${base}/`);
    const api = await fetch(`${base}/api/availability?month=2026-10&eventId=advisory-session`);
    if (!api.ok) throw new Error(`/api/availability respondió ${api.status}.`);
    console.log('La aplicación arranca y responde correctamente.');
  } finally {
    server.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  checkSyntax();
  await checkStartup();
} catch (error) {
  console.error(`Build fallido: ${error.message}`);
  process.exit(1);
}
