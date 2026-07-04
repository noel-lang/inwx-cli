import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Command } from 'commander';
import {
  intro,
  outro,
  text,
  password as passwordPrompt,
  select,
  confirm,
  spinner,
  isCancel,
  cancel,
  note,
  log,
} from '@clack/prompts';
import pc from 'picocolors';

import { Domrobot, ApiError, TfaRequiredError, toFqdn } from './api.js';
import { saveProfile, getProfile, removeProfile, CONFIG_FILE } from './config.js';
import {
  logo,
  brand,
  dim,
  ok,
  warn,
  err,
  accent,
  recordTable,
  planLine,
  checkTable,
  availStyle,
  contactTable,
  domainTable,
} from './ui.js';
import {
  assertValidDomain,
  splitDomain,
  tldHints,
  parsePeriod,
  normalizeCountryCode,
  normalizePhone,
} from './validate.js';
import type {
  ContactType,
  DnsRecord,
  DomainCheckResult,
  Env,
  ResolvedProfile,
} from './types.js';

const program = new Command();

function envFromOpts(): Env {
  return program.opts().ote ? 'ote' : 'prod';
}

function envBadge(env: Env): string {
  return env === 'ote' ? pc.bgYellow(pc.black(' OTE-TEST ')) : pc.bgCyan(pc.black(' PROD '));
}

function die(message: string): never {
  log.error(err(message));
  process.exit(1);
}

function cancelExit(): never {
  cancel('Abgebrochen.');
  process.exit(1);
}

class NotLoggedIn extends Error {}

/** Meldet sich an und gibt einen verbundenen Client zurück (mit 2FA-Fallback). */
async function connect(env: Env, { interactive = true } = {}): Promise<Domrobot> {
  const prof = await getProfile(env);
  if (!prof || !prof.user || !prof.pass) throw new NotLoggedIn(env);
  const user = prof.user;
  const pass = prof.pass;

  const attempt = async (extra?: { totpCode?: string }): Promise<Domrobot> => {
    const client = new Domrobot(env);
    await client.login(user, pass, { totpSecret: prof.totpSecret, ...extra });
    return client;
  };

  const s = spinner();
  s.start(`Anmeldung bei INWX (${env})…`);
  try {
    const client = await attempt();
    s.stop(`${ok('✓')} Angemeldet als ${accent(user)} ${dim('(' + env + ')')}`);
    return client;
  } catch (e) {
    if (e instanceof TfaRequiredError && interactive) {
      s.stop(warn('2FA erforderlich'));
      const code = await text({
        message: 'Aktueller 6-stelliger 2FA-Code',
        validate: (v) => (/^\d{6}$/.test(v.trim()) ? undefined : 'Bitte 6 Ziffern.'),
      });
      if (isCancel(code)) cancelExit();
      const s2 = spinner();
      s2.start('Anmeldung bei INWX…');
      const client = await attempt({ totpCode: code.trim() });
      s2.stop(`${ok('✓')} Angemeldet als ${accent(user)}`);
      return client;
    }
    s.stop(err('✗ Anmeldung fehlgeschlagen'));
    throw e;
  }
}

async function withClient<T>(env: Env, fn: (client: Domrobot) => Promise<T>): Promise<T | undefined> {
  let client: Domrobot;
  try {
    client = await connect(env);
  } catch (e) {
    if (e instanceof NotLoggedIn) {
      die(`Nicht angemeldet für "${env}". Führe zuerst ${accent('inwx login' + (env === 'ote' ? ' --ote' : ''))} aus.`);
    }
    die(e instanceof Error ? e.message : String(e));
  }
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      /* egal */
    }
  }
}

/* ────────────────────────── login ────────────────────────── */
async function cmdLogin(): Promise<void> {
  const env = envFromOpts();
  intro(`${logo()}  ${envBadge(env)}`);

  const user = await text({
    message: 'INWX Benutzername',
    validate: (v) => (v.trim() ? undefined : 'Bitte einen Benutzernamen eingeben.'),
  });
  if (isCancel(user)) return void cancel('Abgebrochen.');

  const pass = await passwordPrompt({
    message: 'INWX Passwort',
    validate: (v) => (v ? undefined : 'Bitte ein Passwort eingeben.'),
  });
  if (isCancel(pass)) return void cancel('Abgebrochen.');

  const has2fa = await confirm({
    message: 'Ist auf dem Account 2FA (Mobile-TAN / TOTP) aktiv?',
    initialValue: true,
  });
  if (isCancel(has2fa)) return void cancel('Abgebrochen.');

  let totpSecret: string | undefined;
  let totpCode: string | undefined;
  if (has2fa) {
    const mode = await confirm({
      message: 'TOTP-Secret dauerhaft speichern (Codes automatisch erzeugen)?',
      initialValue: true,
    });
    if (isCancel(mode)) return void cancel('Abgebrochen.');
    if (mode) {
      const sec = await passwordPrompt({
        message: 'TOTP-Secret (Base32, aus der 2FA-Einrichtung)',
        validate: (v) => (v.trim().length >= 16 ? undefined : 'Sieht zu kurz aus.'),
      });
      if (isCancel(sec)) return void cancel('Abgebrochen.');
      totpSecret = sec.trim();
    } else {
      const code = await text({
        message: 'Aktueller 6-stelliger 2FA-Code',
        validate: (v) => (/^\d{6}$/.test(v.trim()) ? undefined : 'Bitte 6 Ziffern.'),
      });
      if (isCancel(code)) return void cancel('Abgebrochen.');
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
    die(e instanceof Error ? e.message : String(e));
  }

  await saveProfile(env, { user: user.trim(), pass, totpSecret });
  note(
    `${dim('Profil:')} ${env}\n${dim('Gespeichert in:')} ${CONFIG_FILE} ${dim('(chmod 600)')}` +
      (totpSecret ? '' : `\n${warn('Ohne gespeichertes TOTP-Secret fragt jede Aktion nach dem aktuellen Code.')}`),
    'Gespeichert',
  );
  outro(`${ok('Fertig.')} Nächster Schritt: ${accent('inwx dns ls <domain>')}`);
}

/* ────────────────────────── logout ────────────────────────── */
async function cmdLogout(): Promise<void> {
  const env = envFromOpts();
  const removed = await removeProfile(env);
  if (removed) log.success(`Abgemeldet, Profil "${env}" entfernt.`);
  else log.info(`Kein gespeichertes Profil für "${env}".`);
}

/* ────────────────────────── whoami ────────────────────────── */
async function cmdWhoami(): Promise<void> {
  const env = envFromOpts();
  const prof: ResolvedProfile | null = await getProfile(env);
  if (!prof || !prof.user) {
    die(`Nicht angemeldet für "${env}". Führe ${accent('inwx login')} aus.`);
  }
  const src = prof.fromEnv ? dim(' (aus Umgebungsvariablen)') : '';
  log.message(`${envBadge(env)}  ${accent(prof.user)}${src}`);
  if (prof.savedAt) log.message(dim(`gespeichert: ${prof.savedAt}`));
}

/* ────────────────────────── dns ls ────────────────────────── */
async function cmdDnsLs(domain: string): Promise<void> {
  const env = envFromOpts();
  await withClient(env, async (client) => {
    const records: DnsRecord[] = await client.listRecords(domain);
    console.log('');
    console.log(`  ${brand('DNS')} ${dim('·')} ${accent(domain)} ${envBadge(env)}  ${dim(records.length + ' Records')}`);
    console.log('');
    console.log(recordTable(records));
    console.log('');
  });
}

/* ────────────────────────── dns add ────────────────────────── */
interface DnsAddOpts {
  ttl?: string;
  prio?: string;
}
async function cmdDnsAdd(domain: string, name: string, type: string, content: string, opts: DnsAddOpts): Promise<void> {
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
interface YesOpt {
  yes?: boolean;
}
async function cmdDnsRm(domain: string, id: string, opts: YesOpt): Promise<void> {
  const env = envFromOpts();
  await withClient(env, async (client) => {
    if (!opts.yes) {
      const yes = await confirm({ message: `Record #${id} in ${domain} wirklich löschen?`, initialValue: false });
      if (isCancel(yes) || !yes) return void cancel('Abgebrochen.');
    }
    await client.deleteRecord(id);
    log.success(`${warn('−')} Record #${id} gelöscht.`);
  });
}

/* ────────────────────────── dns apply ────────────────────────── */
interface RecordSpec {
  name: string;
  type: string;
  content: string;
  ttl?: number;
  prio?: number | string;
}
function normalizeRecordsFile(raw: string): { domain: string; records: RecordSpec[] } {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Records-Datei ist kein gültiges JSON: ${(e as Error).message}`);
  }
  const d = doc as { domain?: string; records?: RecordSpec[] };
  const domain = d.domain;
  const records = Array.isArray(doc) ? (doc as RecordSpec[]) : d.records;
  if (!domain || !Array.isArray(records)) {
    throw new Error('Datei braucht { "domain": "...", "records": [ ... ] }.');
  }
  return { domain, records };
}

interface ApplyOpts {
  dryRun?: boolean;
  yes?: boolean;
}
async function cmdDnsApply(file: string, opts: ApplyOpts): Promise<void> {
  const env = envFromOpts();
  const path = resolve(process.cwd(), file);
  let spec: { domain: string; records: RecordSpec[] };
  try {
    spec = normalizeRecordsFile(await readFile(path, 'utf8'));
  } catch (e) {
    return die((e as Error).message);
  }

  intro(`${logo()} ${dim('apply')}  ${envBadge(env)} ${accent(spec.domain)}`);

  await withClient(env, async (client) => {
    const existing = await client.listRecords(spec.domain);
    interface PlanItem {
      action: 'create' | 'update' | 'skip';
      record: RecordSpec & { type: string };
      fqdn: string;
      id?: number;
      oldContent?: string;
    }
    const plan: PlanItem[] = [];
    for (const rec of spec.records) {
      const type = String(rec.type).toUpperCase();
      const fqdn = toFqdn(rec.name, spec.domain);
      const match = existing.find(
        (e) => e.name === fqdn && e.type === type && (type !== 'MX' || String(e.prio) === String(rec.prio ?? '')),
      );
      if (!match) {
        plan.push({ action: 'create', record: { ...rec, type }, fqdn });
      } else if (String(match.content) !== String(rec.content) || String(match.ttl) !== String(rec.ttl ?? match.ttl)) {
        plan.push({ action: 'update', record: { ...rec, type }, fqdn, id: match.id, oldContent: match.content });
      } else {
        plan.push({ action: 'skip', record: { ...rec, type }, fqdn });
      }
    }

    const counts = plan.reduce<Record<string, number>>((a, p) => ((a[p.action] = (a[p.action] || 0) + 1), a), {});
    console.log('');
    for (const p of plan) console.log(planLine(p));
    console.log('');
    console.log(
      `  ${ok(String(counts.create || 0) + ' anlegen')}  ${warn(String(counts.update || 0) + ' ändern')}  ${dim(String(counts.skip || 0) + ' unverändert')}`,
    );
    console.log('');

    const todo = plan.filter((p) => p.action !== 'skip');
    if (!todo.length) return void outro(ok('Alles aktuell, nichts zu tun.'));

    if (opts.dryRun) return void outro(dim('Dry-Run, keine Änderungen geschrieben.'));

    if (!opts.yes) {
      const go = await confirm({
        message: `${todo.length} Änderung(en) auf ${env === 'ote' ? 'dem OTE-Testsystem' : 'die LIVE-Domain'} schreiben?`,
        initialValue: env === 'ote',
      });
      if (isCancel(go) || !go) return void cancel('Abgebrochen, nichts geändert.');
    }

    const s = spinner();
    let done = 0;
    for (const p of todo) {
      s.start(`${p.action === 'create' ? 'Anlegen' : 'Ändern'}: ${p.record.type} ${p.fqdn}`);
      try {
        if (p.action === 'create') {
          await client.createRecord({ domain: spec.domain, name: p.fqdn, type: p.record.type, content: p.record.content, ttl: p.record.ttl ?? 3600, prio: p.record.prio });
        } else {
          await client.updateRecord(p.id!, { content: p.record.content, ttl: p.record.ttl ?? 3600, prio: p.record.prio });
        }
        done++;
        s.stop(`${ok('✓')} ${p.record.type} ${p.fqdn}`);
      } catch (e) {
        s.stop(`${err('✗')} ${p.record.type} ${p.fqdn} — ${(e as Error).message}`);
      }
    }
    outro(`${ok('Fertig.')} ${done}/${todo.length} Record(s) geschrieben.`);
  });
}

/* ────────────────────────── domain check ────────────────────────── */
async function cmdDomainCheck(names: string[]): Promise<void> {
  const env = envFromOpts();
  const checked: string[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    try {
      assertValidDomain(name);
      checked.push(name);
      for (const hint of tldHints(name)) log.warn(warn(hint));
    } catch (e) {
      log.error(err(`${raw}: ${(e as Error).message}`));
    }
  }
  if (!checked.length) return void die('Keine gültigen Domainnamen zum Prüfen.');

  await withClient(env, async (client) => {
    const results: DomainCheckResult[] = await client.checkDomains(checked);
    console.log('');
    console.log(`  ${brand('domain check')} ${envBadge(env)}  ${dim(results.length + ' geprüft')}`);
    console.log('');
    console.log(checkTable(results));
    console.log('');
  });
}

/* ────────────────────────── domain price ────────────────────────── */
async function cmdDomainPrice(name: string): Promise<void> {
  const env = envFromOpts();
  const fqdn = name.trim().toLowerCase();
  try {
    assertValidDomain(fqdn);
  } catch (e) {
    return die((e as Error).message);
  }
  const { tld } = splitDomain(fqdn);

  await withClient(env, async (client) => {
    console.log('');
    console.log(`  ${brand('domain price')} ${dim('·')} ${accent(fqdn)} ${envBadge(env)}`);
    console.log('');

    // Konkreter Domainpreis + Verfügbarkeit aus domain.check.
    try {
      const [check] = await client.checkDomains([fqdn]);
      if (check) {
        const st = availStyle(check.avail);
        const priceStr = check.price !== undefined ? `${check.price.toFixed(2)} EUR` : dim('kein Preis in Antwort');
        console.log(`  Status:  ${st.color(st.label)}`);
        console.log(`  Preis:   ${priceStr}`);
      }
    } catch (e) {
      log.warn(warn(`domain.check nicht möglich: ${(e as Error).message}`));
    }

    // TLD-weite Preisliste (create/renew/transfer) aus domain.getPrices.
    try {
      const [p] = await client.getPrices([tld]);
      if (p) {
        const cur = p.currency ?? 'EUR';
        const fmt = (v?: number) => (v !== undefined ? `${v.toFixed(2)} ${cur}` : dim('–'));
        console.log('');
        console.log(`  ${dim('TLD .' + tld)}`);
        console.log(`  Registrierung: ${fmt(p.createPrice)} / Jahr`);
        console.log(`  Verlängerung:  ${fmt(p.renewalPrice)} / Jahr`);
        console.log(`  Transfer:      ${fmt(p.transferPrice)}`);
      }
    } catch (e) {
      log.warn(warn(`domain.getPrices nicht verfügbar: ${(e as Error).message}`));
    }
    console.log('');
  });
}

/* ────────────────────────── domain ls / info ────────────────────────── */
async function cmdDomainLs(): Promise<void> {
  const env = envFromOpts();
  await withClient(env, async (client) => {
    const domains = await client.listDomains();
    console.log('');
    console.log(`  ${brand('domains')} ${envBadge(env)}  ${dim(domains.length + ' Domains')}`);
    console.log('');
    console.log(domainTable(domains));
    console.log('');
  });
}

async function cmdDomainInfo(name: string): Promise<void> {
  const env = envFromOpts();
  const fqdn = name.trim().toLowerCase();
  await withClient(env, async (client) => {
    const info = await client.domainInfo(fqdn);
    console.log('');
    console.log(`  ${brand('domain')} ${dim('·')} ${accent(info.domain)} ${envBadge(env)}`);
    console.log('');
    const line = (k: string, v: unknown) => {
      if (v === undefined || v === null || v === '') return;
      console.log(`  ${dim(k.padEnd(14))} ${String(v)}`);
    };
    line('Status', info.status);
    line('Angelegt', String(info.crDate ?? '').slice(0, 10));
    line('Läuft ab', String(info.exDate ?? '').slice(0, 10));
    line('Registrant', info.registrant);
    line('Admin-C', info.admin);
    line('Tech-C', info.tech);
    line('Billing-C', info.billing);
    line('Nameserver', Array.isArray(info.ns) ? info.ns.join(', ') : info.ns);
    line('Transfer-Lock', info.transferLock ? 'ja' : undefined);
    console.log('');
  });
}

/* ────────────────────────── domain buy ────────────────────────── */
interface BuyOpts {
  period?: string;
  registrant?: string;
  admin?: string;
  tech?: string;
  billing?: string;
  ns?: string;
  renewalMode?: string;
  dryRun?: boolean;
  yesLive?: boolean;
  yes?: boolean;
}
async function cmdDomainBuy(name: string, opts: BuyOpts): Promise<void> {
  const fqdn = name.trim().toLowerCase();

  // Sicherheit: Kauf läuft standardmäßig auf OT&E. Prod NUR mit --yes-live.
  const live = Boolean(opts.yesLive);
  const env: Env = live ? 'prod' : 'ote';

  // Syntax + TLD-Hinweise.
  try {
    assertValidDomain(fqdn);
  } catch (e) {
    return die((e as Error).message);
  }
  if (!opts.registrant) return die('--registrant <contactId> ist Pflicht. Kontakt-ID via `inwx contact ls` ermitteln.');
  const registrant = Number(opts.registrant);
  if (!Number.isInteger(registrant) || registrant <= 0) return die('--registrant muss eine numerische Kontakt-ID sein.');

  let period;
  try {
    period = parsePeriod(opts.period, '1Y');
  } catch (e) {
    return die((e as Error).message);
  }
  const ns = (opts.ns ?? 'ns.inwx.de,ns2.inwx.de').split(',').map((s) => s.trim()).filter(Boolean);

  intro(`${logo()} ${dim('buy')}  ${envBadge(env)} ${accent(fqdn)}`);
  for (const hint of tldHints(fqdn)) log.warn(warn(hint));

  if (live) {
    log.warn(err('ACHTUNG: --yes-live gesetzt. Dies ist eine ECHTE, KOSTENPFLICHTIGE Registrierung auf PROD.'));
  } else {
    log.info(dim('Läuft gegen das OT&E-Testsystem (keine echte Registrierung, keine Kosten). Für einen echten Kauf: --yes-live.'));
  }

  await withClient(env, async (client) => {
    // Kostenanzeige + Verfügbarkeit aus domain.check.
    let price: number | undefined;
    const s = spinner();
    s.start('Verfügbarkeit und Preis prüfen…');
    try {
      const [check] = await client.checkDomains([fqdn]);
      s.stop('Prüfung abgeschlossen.');
      if (!check) return void die('Keine Antwort von domain.check.');
      const st = availStyle(check.avail);
      price = check.price;
      note(
        `${dim('Domain:')}   ${fqdn}\n` +
          `${dim('Status:')}   ${st.color(st.label)}\n` +
          `${dim('Preis:')}    ${price !== undefined ? `${price.toFixed(2)} EUR` : 'unbekannt'}\n` +
          `${dim('Periode:')}  ${period.api}\n` +
          `${dim('Nameserver:')} ${ns.join(', ')}`,
        live ? 'LIVE-Kauf' : 'OT&E-Testkauf',
      );
      if (check.avail !== 1 && check.avail !== 2) {
        return void die(`Domain ist nicht frei (Status: ${st.label}). Kauf abgebrochen.`);
      }
    } catch (e) {
      s.stop(err('Prüfung fehlgeschlagen.'));
      return void die((e as Error).message);
    }

    // Doppelte Bestätigung (bei --dry-run übersprungen, weil nur Validierung).
    const testing = Boolean(opts.dryRun);
    if (!testing) {
      if (!opts.yes) {
        const c1 = await confirm({
          message: `${fqdn} für ${period.api} registrieren${price !== undefined ? ` (~${price.toFixed(2)} EUR)` : ''}?`,
          initialValue: false,
        });
        if (isCancel(c1) || !c1) return void cancel('Abgebrochen, nichts gekauft.');
      }

      // Die getippte Bestätigung für LIVE-Käufe lässt sich NICHT per --yes überspringen.
      if (live) {
        const typed = await text({
          message: `Zur Bestätigung des LIVE-Kaufs den Domainnamen exakt eintippen (${fqdn})`,
          validate: (v) => (v.trim().toLowerCase() === fqdn ? undefined : 'Stimmt nicht überein.'),
        });
        if (isCancel(typed)) return void cancel('Abgebrochen, nichts gekauft.');
      }
    } else {
      log.info(dim('--dry-run: domain.create wird mit testing=true nur validiert, nichts registriert.'));
    }

    const s2 = spinner();
    s2.start(testing ? 'Validiere Registrierung (testing)…' : 'Registriere Domain…');
    try {
      const res = await client.createDomain({
        domain: fqdn,
        period: period.api,
        registrant,
        // INWX verlangt alle vier Kontakte; ohne explizite Flags den Registranten übernehmen.
        admin: opts.admin ? Number(opts.admin) : registrant,
        tech: opts.tech ? Number(opts.tech) : registrant,
        billing: opts.billing ? Number(opts.billing) : registrant,
        ns,
        renewalMode: opts.renewalMode,
        testing,
      });
      s2.stop(
        testing
          ? `${ok('✓')} Validierung erfolgreich (nichts registriert).`
          : `${ok('✓')} Registriert. roId ${res.roId ?? '?'}${res.price !== undefined ? `, Kosten ${res.price} ${res.currency ?? 'EUR'}` : ''}`,
      );
    } catch (e) {
      s2.stop(err('✗ domain.create fehlgeschlagen.'));
      return void die((e as Error).message);
    }
    outro(ok('Fertig.'));
  });
}

/* ────────────────────────── contact ls ────────────────────────── */
async function cmdContactLs(): Promise<void> {
  const env = envFromOpts();
  await withClient(env, async (client) => {
    const contacts = await client.listContacts();
    console.log('');
    console.log(`  ${brand('contacts')} ${envBadge(env)}  ${dim(contacts.length + ' Kontakte')}`);
    console.log('');
    console.log(contactTable(contacts));
    console.log('');
  });
}

/* ────────────────────────── contact add ────────────────────────── */
interface ContactAddOpts {
  type?: string;
  name?: string;
  org?: string;
  street?: string;
  pc?: string;
  city?: string;
  cc?: string;
  email?: string;
  voice?: string;
}

async function cmdContactAdd(opts: ContactAddOpts = {}): Promise<void> {
  const env = envFromOpts();
  intro(`${logo()} ${dim('contact add')}  ${envBadge(env)}`);

  // Non-interaktiv, wenn alle Pflichtfelder als Flags übergeben wurden.
  const flagged = Boolean(opts.name && opts.street && opts.pc && opts.city && opts.email && opts.voice);

  let type: string;
  let name: string;
  let org: string;
  let street: string;
  let pc2: string;
  let city: string;
  let cc: string;
  let email: string;
  let voice: string;

  if (flagged) {
    type = (opts.type ?? 'person').toLowerCase();
    if (!['person', 'org', 'role'].includes(type)) return die('--type muss person, org oder role sein.');
    name = opts.name!.trim();
    org = (opts.org ?? '').trim();
    street = opts.street!.trim();
    pc2 = opts.pc!.trim();
    city = opts.city!.trim();
    try {
      cc = normalizeCountryCode(opts.cc ?? 'DE');
    } catch (e) {
      return die((e as Error).message);
    }
    email = opts.email!.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return die('--email ist keine gültige E-Mail-Adresse.');
    try {
      voice = normalizePhone(opts.voice!);
    } catch (e) {
      return die((e as Error).message);
    }
  } else {
    const t = await select({
      message: 'Kontakttyp',
      options: [
        { value: 'person', label: 'Person (natürliche Person)' },
        { value: 'org', label: 'Organisation / Firma' },
        { value: 'role', label: 'Rolle (z. B. Hostmaster)' },
      ],
      initialValue: opts.type ?? 'person',
    });
    if (isCancel(t)) return void cancel('Abgebrochen.');
    type = t;

    const n = await text({ message: 'Voller Name (Vor- und Nachname)', initialValue: opts.name, validate: (v) => (v.trim() ? undefined : 'Pflichtfeld.') });
    if (isCancel(n)) return void cancel('Abgebrochen.');
    name = n.trim();

    const o = await text({ message: 'Firma / Organisation (optional)', initialValue: opts.org, placeholder: '—' });
    if (isCancel(o)) return void cancel('Abgebrochen.');
    org = o.trim();

    const st = await text({ message: 'Straße und Hausnummer', initialValue: opts.street, validate: (v) => (v.trim() ? undefined : 'Pflichtfeld.') });
    if (isCancel(st)) return void cancel('Abgebrochen.');
    street = st.trim();

    const p = await text({ message: 'PLZ', initialValue: opts.pc, validate: (v) => (v.trim() ? undefined : 'Pflichtfeld.') });
    if (isCancel(p)) return void cancel('Abgebrochen.');
    pc2 = p.trim();

    const ci = await text({ message: 'Ort', initialValue: opts.city, validate: (v) => (v.trim() ? undefined : 'Pflichtfeld.') });
    if (isCancel(ci)) return void cancel('Abgebrochen.');
    city = ci.trim();

    const c = await text({
      message: 'Ländercode (ISO 3166-1 alpha-2, z. B. DE)',
      initialValue: opts.cc ?? 'DE',
      validate: (v) => {
        try {
          normalizeCountryCode(v);
          return undefined;
        } catch (e) {
          return (e as Error).message;
        }
      },
    });
    if (isCancel(c)) return void cancel('Abgebrochen.');
    cc = normalizeCountryCode(c);

    const e = await text({
      message: 'E-Mail',
      initialValue: opts.email,
      validate: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? undefined : 'Bitte eine gültige E-Mail.'),
    });
    if (isCancel(e)) return void cancel('Abgebrochen.');
    email = e.trim();

    const vo = await text({
      message: 'Telefon (international, z. B. +49.30123456)',
      initialValue: opts.voice,
      validate: (v) => {
        try {
          normalizePhone(v);
          return undefined;
        } catch (e) {
          return (e as Error).message;
        }
      },
    });
    if (isCancel(vo)) return void cancel('Abgebrochen.');
    voice = normalizePhone(vo);
  }

  await withClient(env, async (client) => {
    const s = spinner();
    s.start('Kontakt anlegen…');
    try {
      const id = await client.createContact({
        type: type as ContactType,
        name,
        org: org || undefined,
        street,
        pc: pc2,
        city,
        cc,
        email,
        voice,
      });
      s.stop(`${ok('✓')} Kontakt angelegt.`);
      note(`${dim('Kontakt-ID:')} ${accent(String(id))}\n${dim('Nutzung:')} inwx domain buy <name> --registrant ${id}`, 'Handle');
      outro(ok('Fertig.'));
    } catch (e) {
      s.stop(err('✗ Anlegen fehlgeschlagen.'));
      die((e as Error).message);
    }
  });
}

/* ────────────────────────── Programm ────────────────────────── */
export function run(argv: string[]): void {
  program
    .name('inwx')
    .description('Schön designte CLI für INWX-Domains & -DNS (DomRobot-API).')
    .version('0.2.0')
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

  const domain = program.command('domain').description('Domains verwalten (Verfügbarkeit, Preise, Registrierung)');
  domain
    .command('check <name...>')
    .description('Verfügbarkeit einer oder mehrerer Domains prüfen (READ-ONLY)')
    .action(cmdDomainCheck);
  domain.command('price <name>').description('Preisinfo zu einer Domain/TLD').action(cmdDomainPrice);
  domain.command('ls').alias('list').description('Eigene Domains auflisten').action(cmdDomainLs);
  domain.command('info <name>').description('Details zu einer eigenen Domain').action(cmdDomainInfo);
  domain
    .command('buy <name>')
    .description('Domain registrieren (Standard: OT&E-Test; PROD nur mit --yes-live)')
    .option('--period <dauer>', 'Registrierungsdauer, z. B. 1Y', '1Y')
    .option('--registrant <contactId>', 'Inhaber-Kontakt-ID (Pflicht)')
    .option('--admin <contactId>', 'Admin-C')
    .option('--tech <contactId>', 'Tech-C')
    .option('--billing <contactId>', 'Billing-C')
    .option('--ns <liste>', 'Nameserver (kommasepariert)', 'ns.inwx.de,ns2.inwx.de')
    .option('--renewal-mode <modus>', 'Verlängerungsmodus (AUTORENEW, AUTOEXPIRE, AUTODELETE)')
    .option('--dry-run', 'nur validieren (testing=true), nicht registrieren')
    .option('-y, --yes', 'Rückfrage überspringen (nur OT&E; LIVE braucht weiter die Tippbestätigung)')
    .option('--yes-live', 'ECHTE, kostenpflichtige Registrierung auf PROD erlauben')
    .action(cmdDomainBuy);

  const contact = program.command('contact').description('Domain-Kontakte (Handles) verwalten');
  contact.command('ls').alias('list').description('Kontakte auflisten').action(cmdContactLs);
  contact
    .command('add')
    .description('Neuen Kontakt anlegen (interaktiv oder vollständig per Flags)')
    .option('--type <typ>', 'person | org | role', 'person')
    .option('--name <name>', 'Voller Name (Vor- und Nachname)')
    .option('--org <org>', 'Firma / Organisation (optional)')
    .option('--street <strasse>', 'Straße und Hausnummer')
    .option('--pc <plz>', 'Postleitzahl')
    .option('--city <ort>', 'Ort')
    .option('--cc <land>', 'Ländercode ISO 3166-1 alpha-2', 'DE')
    .option('--email <email>', 'E-Mail')
    .option('--voice <telefon>', 'Telefon international, z. B. +49.30123456')
    .action(cmdContactAdd);

  program.parseAsync(argv).catch((e) => {
    if (e instanceof ApiError) die(e.message);
    else die(e instanceof Error ? e.message : String(e));
  });
}
