import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';

export const CONFIG_DIR = join(homedir(), '.inwx');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Leichte Verschleierung gegen versehentliches `cat`. KEINE Verschlüsselung.
const enc = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const dec = (s) => Buffer.from(String(s), 'base64').toString('utf8');

export async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
  } catch {
    return { profiles: {} };
  }
}

async function writeConfig(cfg) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
  await chmod(CONFIG_FILE, 0o600);
}

/** Speichert Zugangsdaten für eine Umgebung ('prod' | 'ote'). */
export async function saveProfile(env, { user, pass, totpSecret }) {
  const cfg = await loadConfig();
  cfg.profiles ??= {};
  cfg.profiles[env] = {
    user,
    pass: enc(pass),
    ...(totpSecret ? { totpSecret: enc(totpSecret) } : {}),
    savedAt: new Date().toISOString(),
  };
  await writeConfig(cfg);
}

/** Liefert Zugangsdaten für eine Umgebung, inkl. Env-Var-Override. */
export async function getProfile(env) {
  const cfg = await loadConfig();
  const p = cfg.profiles?.[env] ?? null;

  const envUser = process.env.INWX_USER;
  const envPass = process.env.INWX_PASSWORD;
  const envTotp = process.env.INWX_TOTP_SECRET;

  if (!p && !envUser) return null;

  return {
    user: envUser ?? p?.user,
    pass: envPass ?? (p?.pass ? dec(p.pass) : undefined),
    totpSecret: envTotp ?? (p?.totpSecret ? dec(p.totpSecret) : undefined),
    fromEnv: Boolean(envUser || envPass),
    savedAt: p?.savedAt,
  };
}

export async function removeProfile(env) {
  const cfg = await loadConfig();
  if (cfg.profiles?.[env]) {
    delete cfg.profiles[env];
    await writeConfig(cfg);
    return true;
  }
  return false;
}

export async function clearAll() {
  try {
    await rm(CONFIG_FILE);
    return true;
  } catch {
    return false;
  }
}
