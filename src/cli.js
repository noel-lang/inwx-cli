import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Command } from 'commander';
import {
  intro,
  outro,
  text,
  password as passwordPrompt,
  confirm,
  spinner,
  isCancel,
  cancel,
  note,
  log,
} from '@clack/prompts';
import pc from 'picocolors';

import { Domrobot, ApiError, toFqdn } from './api.js';
import { saveProfile, getProfile, removeProfile, CONFIG_FILE } from './config.js';
import { logo, brand, dim, ok, warn, err, accent, recordTable, planLine } from './ui.js';

const program = new Command();

function envFromOpts() {
  return program.opts().ote ? 'ote' : 'prod';
}

function envBadge(env) {
  return env === 'ote' ? pc.bgYellow(pc.black(' OTE-TEST ')) : pc.bgCyan(pc.black(' PROD '));
}

function die(message) {
  log.error(err(message));
  process.exit(1);
}

class NotLoggedIn extends Error {}

/** Meldet sich an und gibt einen verbundenen Client zurück (mit 2FA-Fallback). */
async function connect(env, { interactive = true } = {}) {
  const prof = await getProfile(env);
  if (!prof || !prof.user || !prof.pass) throw new NotLoggedIn(env);

  const attempt = async (extra) => {
    const client = new Domrobot(env);
    await client.login(prof.user, prof.pass, { totpSecret: prof.totpSecret, ...extra });
    return client;
  };

  const s = spinner();
  s.start(`Anmeldung bei INWX (${env})…`);
  try {
    const client = await attempt();
    s.stop(`${ok('✓')} Angemeldet als ${accent(prof.user)} ${dim('(' + env + ')')}`);
    return client;
  } catch (e) {
    if (e.tfaRequired && interactive) {
      s.stop(warn('2FA erforderlich'));
      const code = await text({
        message: 'Aktueller 6-stelliger 2FA-Code',
        validate: (v) => (/^\d{6}$/.test(v.trim()) ? undefined : 'Bitte 6 Ziffern.'),
      });
      if (isCancel(code)) { cancel('Abgebrochen.'); process.exit(1); }
      const s2 = spinner();
      s2.start('Anmeldung bei INWX…');
      const client = await attempt({ totpCode: code.trim() });
      s2.stop(`${ok('✓')} Angemeldet als ${accent(prof.user)}`);
      return client;
    }
    s.stop(err('✗ Anmeldung fehlgeschlagen'));
    throw e;
  }
}

async function withClient(env, fn) {
  let client;
  try {
    client = await connect(env);
  } catch (e) {
    if (e instanceof NotLoggedIn) {
      die(`Nicht angemeldet für "${env}". Führe zuerst ${accent('inwx login' + (env === 'ote' ? ' --ote' : ''))} aus.`);
    }
    die(e.message);
  }
  try {
    return await fn(client);
  } finally {
    try { await client.logout(); } catch { /* egal */ }
  }
}

/* ────────────────────────── login ────────────────────────── */
async function cmdLogin() {
  const env = envFromOpts();
  intro(`${logo()}  ${envBadge(env)}`);

  const user = await text({
    message: 'INWX Benutzername',
    validate: (v) => (v.trim() ? undefined : 'Bitte einen Benutzernamen eingeben.'),
  });
  if (isCancel(user)) { cancel('Abgebrochen.'); return; }

  const pass = await passwordPrompt({
    message: 'INWX Passwort',
    validate: (v) => (v ? undefined : 'Bitte ein Passwort eingeben.'),
  });
  if (isCancel(pass)) { cancel('Abgebrochen.'); return; }

  const has2fa = await confirm({
    message: 'Ist auf dem Account 2FA (Mobile-TAN / TOTP) aktiv?',
    initialValue: true,
  });
  if (isCancel(has2fa)) { cancel('Abgebrochen.'); return; }

  let totpSecret;
  let totpCode;
  if (has2fa) {
    const mode = await confirm({
      message: 'TOTP-Secret dauerhaft speichern (Codes automatisch erzeugen)?',
      initialValue: true,
    });
    if (isCancel(mode)) { cancel('Abgebrochen.'); return; }
    if (mode) {
      const sec = await passwordPrompt({
        message: 'TOTP-Secret (Base32, aus der 2FA-Einrichtung)',
        validate: (v) => (v.trim().length >= 16 ? undefined : 'Sieht zu kurz aus.'),
      });
      if (isCancel(sec)) { cancel('Abgebrochen.'); return; }
      totpSecret = sec.trim();
    } else {
      const code = await text({
        message: 'Aktueller 6-stelliger 2FA-Code',
        validate: (v) => (/^\d{6}$/.test(v.trim()) ? undefined : 'Bitte 6 Ziffern.'),
      });
      if (isCancel(code)) { cancel('Abgebrochen.'); return; }
      totpCode = code.trim();
    }
  }

  const s = spinner();
  s.start('Zugangsdaten prüfen…');
  try {
    const client = new Domrobot(env);
    await client.login(user.trim(), pass, { totpSecret, totpCode });
    await client.logout();
    s.stop(`${ok('✓')} Anmeldung erfolgreich.`);
  } catch (e) {
    s.stop(err('✗ Anmeldung fehlgeschlagen.'));
    die(e.message);
  }

  await saveProfile(env, { user: user.trim(), pass, totpSecret });
  note(
    `${dim('Profil:')} ${env}\n${dim('Gespeichert in:')} ${CONFIG_FILE} ${dim('(chmod 600)')}` +
      (totpSecret ? '' : `\n${warn('Ohne gespeichertes TOTP-Secret fragt jede Aktion nach dem aktuellen Code.')}`),
    'Gespeichert'
  );
  outro(`${ok('Fertig.')} Nächster Schritt: ${accent('inwx dns ls <domain>')}`);
}

/* ────────────────────────── logout ────────────────────────── */
async function cmdLogout() {
  const env = envFromOpts();
  const removed = await removeProfile(env);
  if (removed) log.success(`Abgemeldet, Profil "${env}" entfernt.`);
  else log.info(`Kein gespeichertes Profil für "${env}".`);
}

/* ────────────────────────── whoami ────────────────────────── */
async function cmdWhoami() {
  const env = envFromOpts();
  const prof = await getProfile(env);
  if (!prof || !prof.user) {
    die(`Nicht angemeldet für "${env}". Führe ${accent('inwx login')} aus.`);
  }
  const src = prof.fromEnv ? dim(' (aus Umgebungsvariablen)') : '';
  log.message(`${envBadge(env)}  ${accent(prof.user)}${src}`);
  if (prof.savedAt) log.message(dim(`gespeichert: ${prof.savedAt}`));
}

/* ────────────────────────── dns ls ────────────────────────── */
async function cmdDnsLs(domain) {
  const env = envFromOpts();
  await withClient(env, async (client) => {
    const records = await client.listRecords(domain);
    console.log('');
    console.log(`  ${brand('DNS')} ${dim('·')} ${accent(domain)} ${envBadge(env)}  ${dim(records.length + ' Records')}`);
    console.log('');
    console.log(recordTable(records));
    console.log('');
  });
}

/* ────────────────────────── dns add ────────────────────────── */
async function cmdDnsAdd(domain, name, type, content, opts) {
  const env = envFromOpts();
  const t = String(type).toUpperCase();
  await withClient(env, async (client) => {
    const fqdn = toFqdn(name, domain);
    await client.createRecord({
      domain,
      name: fqdn,
      type: t,
      content,
      ttl: opts.ttl ? Number(opts.ttl) : 3600,
      prio: opts.prio,
    });
    log.success(`${ok('+')} ${t} ${accent(fqdn)} → ${content}`);
  });
}

/* ────────────────────────── dns rm ────────────────────────── */
async function cmdDnsRm(domain, id, opts) {
  const env = envFromOpts();
  await withClient(env, async (client) => {
    if (!opts.yes) {
      const yes = await confirm({ message: `Record #${id} in ${domain} wirklich löschen?`, initialValue: false });
      if (isCancel(yes) || !yes) { cancel('Abgebrochen.'); return; }
    }
    await client.deleteRecord(id);
    log.success(`${warn('−')} Record #${id} gelöscht.`);
  });
}

/* ────────────────────────── dns apply ────────────────────────── */
function normalizeRecordsFile(raw) {
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Records-Datei ist kein gültiges JSON: ${e.message}`);
  }
  const domain = doc.domain;
  const records = Array.isArray(doc) ? doc : doc.records;
  if (!domain || !Array.isArray(records)) {
    throw new Error('Datei braucht { "domain": "...", "records": [ ... ] }.');
  }
  return { domain, records };
}

async function cmdDnsApply(file, opts) {
  const env = envFromOpts();
  const path = resolve(process.cwd(), file);
  let spec;
  try {
    spec = normalizeRecordsFile(await readFile(path, 'utf8'));
  } catch (e) {
    return die(e.message);
  }

  intro(`${logo()} ${dim('apply')}  ${envBadge(env)} ${accent(spec.domain)}`);

  await withClient(env, async (client) => {
    const existing = await client.listRecords(spec.domain);
    const plan = [];
    for (const rec of spec.records) {
      const type = String(rec.type).toUpperCase();
      const fqdn = toFqdn(rec.name, spec.domain);
      const match = existing.find((e) => e.name === fqdn && e.type === type && (type !== 'MX' || String(e.prio) === String(rec.prio ?? '')));
      if (!match) {
        plan.push({ action: 'create', record: { ...rec, type }, fqdn });
      } else if (String(match.content) !== String(rec.content) || String(match.ttl) !== String(rec.ttl ?? match.ttl)) {
        plan.push({ action: 'update', record: { ...rec, type }, fqdn, id: match.id, oldContent: match.content });
      } else {
        plan.push({ action: 'skip', record: { ...rec, type }, fqdn });
      }
    }

    const counts = plan.reduce((a, p) => ((a[p.action] = (a[p.action] || 0) + 1), a), {});
    console.log('');
    for (const p of plan) console.log(planLine(p));
    console.log('');
    console.log(
      `  ${ok(String(counts.create || 0) + ' anlegen')}  ${warn(String(counts.update || 0) + ' ändern')}  ${dim(String(counts.skip || 0) + ' unverändert')}`
    );
    console.log('');

    const todo = plan.filter((p) => p.action !== 'skip');
    if (!todo.length) { outro(ok('Alles aktuell, nichts zu tun.')); return; }

    if (opts.dryRun) { outro(dim('Dry-Run, keine Änderungen geschrieben.')); return; }

    if (!opts.yes) {
      const go = await confirm({ message: `${todo.length} Änderung(en) auf ${env === 'ote' ? 'dem OTE-Testsystem' : 'die LIVE-Domain'} schreiben?`, initialValue: env === 'ote' });
      if (isCancel(go) || !go) { cancel('Abgebrochen, nichts geändert.'); return; }
    }

    const s = spinner();
    let done = 0;
    for (const p of todo) {
      s.start(`${p.action === 'create' ? 'Anlegen' : 'Ändern'}: ${p.record.type} ${p.fqdn}`);
      try {
        if (p.action === 'create') {
          await client.createRecord({ domain: spec.domain, name: p.fqdn, type: p.record.type, content: p.record.content, ttl: p.record.ttl ?? 3600, prio: p.record.prio });
        } else {
          await client.updateRecord(p.id, { content: p.record.content, ttl: p.record.ttl ?? 3600, prio: p.record.prio });
        }
        done++;
        s.stop(`${ok('✓')} ${p.record.type} ${p.fqdn}`);
      } catch (e) {
        s.stop(`${err('✗')} ${p.record.type} ${p.fqdn} — ${e.message}`);
      }
    }
    outro(`${ok('Fertig.')} ${done}/${todo.length} Record(s) geschrieben.`);
  });
}

/* ────────────────────────── Programm ────────────────────────── */
export function run(argv) {
  program
    .name('inwx')
    .description('Schön designte CLI für INWX-DNS (DomRobot-API).')
    .version('0.1.0')
    .option('--ote', 'gegen das INWX-OTE-Testsystem arbeiten (statt produktiv)');

  program.command('login').description('Bei INWX anmelden und Zugang speichern').action(cmdLogin);
  program.command('logout').description('Gespeicherten Zugang entfernen').action(cmdLogout);
  program.command('whoami').description('Angemeldeten Account anzeigen').action(cmdWhoami);

  const dns = program.command('dns').description('DNS-Records verwalten');
  dns.command('ls <domain>').alias('list').description('Alle Records einer Zone anzeigen').action(cmdDnsLs);
  dns
    .command('add <domain> <name> <type> <content>')
    .description('Einzelnen Record anlegen')
    .option('--ttl <sekunden>', 'TTL', '3600')
    .option('--prio <n>', 'Priorität (für MX)')
    .action(cmdDnsAdd);
  dns.command('rm <domain> <id>').alias('remove').description('Record per ID löschen').option('-y, --yes', 'ohne Rückfrage').action(cmdDnsRm);
  dns
    .command('apply <file>')
    .description('Records deklarativ aus einer JSON-Datei ausrollen (mit Plan)')
    .option('--dry-run', 'nur den Plan zeigen, nichts schreiben')
    .option('-y, --yes', 'ohne Rückfrage anwenden')
    .action(cmdDnsApply);

  program.parseAsync(argv).catch((e) => {
    if (e instanceof ApiError) die(e.message);
    else die(e?.message || String(e));
  });
}
