import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import type { ConfigFile, Env, ResolvedProfile } from './types.js';

export const CONFIG_DIR = join(homedir(), '.inwx');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Leichte Verschleierung gegen versehentliches `cat`. KEINE Verschlüsselung.
const enc = (s: string): string => Buffer.from(String(s), 'utf8').toString('base64');
const dec = (s: string): string => Buffer.from(String(s), 'base64').toString('utf8');

export async function loadConfig(): Promise<ConfigFile> {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_FILE, 'utf8')) as Partial<ConfigFile>;
    return { profiles: parsed.profiles ?? {} };
  } catch {
    return { profiles: {} };
  }
}

async function writeConfig(cfg: ConfigFile): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
  await chmod(CONFIG_FILE, 0o600);
}

interface SaveProfileInput {
  user: string;
  pass: string;
  totpSecret?: string;
}

/** Speichert Zugangsdaten für eine Umgebung ('prod' | 'ote'). */
export async function saveProfile(env: Env, { user, pass, totpSecret }: SaveProfileInput): Promise<void> {
  const cfg = await loadConfig();
  cfg.profiles[env] = {
    user,
    pass: enc(pass),
    ...(totpSecret ? { totpSecret: enc(totpSecret) } : {}),
    savedAt: new Date().toISOString(),
  };
  await writeConfig(cfg);
}

/** Liefert Zugangsdaten für eine Umgebung, inkl. Env-Var-Override. */
export async function getProfile(env: Env): Promise<ResolvedProfile | null> {
  const cfg = await loadConfig();
  const p = cfg.profiles[env] ?? null;

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

export async function removeProfile(env: Env): Promise<boolean> {
  const cfg = await loadConfig();
  if (cfg.profiles[env]) {
    delete cfg.profiles[env];
    await writeConfig(cfg);
    return true;
  }
  return false;
}

export async function clearAll(): Promise<boolean> {
  try {
    await rm(CONFIG_FILE);
    return true;
  } catch {
    return false;
  }
}
