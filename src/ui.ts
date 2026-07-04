import pc from 'picocolors';
import type { Contact, DnsRecord, DomainCheckResult, DomainListEntry } from './types.js';

// Markenzeichen: kräftiges Blau/Cyan, passend zu INWX, aber eigenständig.
export const brand = (s: string): string => pc.cyan(pc.bold(s));
export const dim = (s: string): string => pc.dim(s);
export const ok = (s: string): string => pc.green(s);
export const warn = (s: string): string => pc.yellow(s);
export const err = (s: string): string => pc.red(s);
export const accent = (s: string): string => pc.cyan(s);

export function logo(): string {
  return `${pc.cyan('◆')} ${pc.bold('inwx')} ${pc.dim('· DNS')}`;
}

type ColorFn = (s: string) => string;

const TYPE_COLORS: Record<string, ColorFn> = {
  A: pc.green,
  AAAA: pc.green,
  CNAME: pc.cyan,
  MX: pc.magenta,
  TXT: pc.yellow,
  NS: pc.blue,
  SRV: pc.magenta,
  CAA: pc.blue,
};

export function colorType(type: string): string {
  const fn = TYPE_COLORS[type] || pc.white;
  return fn(type.padEnd(5));
}

interface ActionStyle {
  sign: string;
  color: ColorFn;
  label: string;
}

const ACTION_STYLE: Record<string, ActionStyle> = {
  create: { sign: '+', color: pc.green, label: 'anlegen' },
  update: { sign: '~', color: pc.yellow, label: 'ändern' },
  skip: { sign: '=', color: pc.dim, label: 'unverändert' },
};

export function actionTag(action: string): string {
  const a = ACTION_STYLE[action] || ACTION_STYLE.skip!;
  return a.color(`${a.sign} ${a.label}`);
}

function truncate(s: unknown, n: number): string {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

/** Einfache, ausgerichtete Tabelle für `dns ls`. */
export function recordTable(records: DnsRecord[]): string {
  if (!records.length) return dim('  Keine Records gefunden.');
  const rows = records.map((r) => ({
    id: String(r.id ?? ''),
    type: r.type ?? '',
    name: r.name ?? '',
    content: r.content ?? '',
    ttl: String(r.ttl ?? ''),
    prio: r.prio !== undefined && r.prio !== 0 ? String(r.prio) : '',
  }));

  const w = {
    id: Math.max(4, ...rows.map((r) => r.id.length)),
    type: 5,
    name: Math.max(4, ...rows.map((r) => r.name.length)),
    content: Math.min(48, Math.max(7, ...rows.map((r) => r.content.length))),
    ttl: Math.max(3, ...rows.map((r) => r.ttl.length)),
    prio: Math.max(4, ...rows.map((r) => r.prio.length)),
  };

  const head =
    '  ' +
    pc.dim('ID'.padEnd(w.id)) +
    '  ' +
    pc.dim('TYPE'.padEnd(w.type)) +
    '  ' +
    pc.dim('NAME'.padEnd(w.name)) +
    '  ' +
    pc.dim('CONTENT'.padEnd(w.content)) +
    '  ' +
    pc.dim('TTL'.padEnd(w.ttl)) +
    '  ' +
    pc.dim('PRIO'.padEnd(w.prio));

  const body = rows
    .map(
      (r) =>
        '  ' +
        pc.dim(r.id.padEnd(w.id)) +
        '  ' +
        colorType(r.type) +
        '  ' +
        r.name.padEnd(w.name) +
        '  ' +
        truncate(r.content, w.content).padEnd(w.content) +
        '  ' +
        pc.dim(r.ttl.padEnd(w.ttl)) +
        '  ' +
        pc.dim(r.prio.padEnd(w.prio)),
    )
    .join('\n');

  return head + '\n' + body;
}

export interface PlanLineInput {
  action: string;
  record: { type: string; content: string; prio?: number | string };
  fqdn: string;
  oldContent?: string;
}

/** Formatiert eine geplante Änderung für `dns apply`. */
export function planLine({ action, record, fqdn, oldContent }: PlanLineInput): string {
  const sign = ACTION_STYLE[action] || ACTION_STYLE.skip!;
  const left = `${sign.color(sign.sign)} ${colorType(record.type)} ${fqdn}`;
  if (action === 'update') {
    return `  ${left}\n      ${pc.dim(truncate(oldContent, 60))} ${pc.dim('→')} ${truncate(record.content, 60)}`;
  }
  const prio = record.prio ? pc.dim(` [prio ${record.prio}]`) : '';
  return `  ${left}  ${dim(truncate(record.content, 60))}${prio}`;
}

/* ── Domain-Verfügbarkeit ── */

interface AvailStyle {
  label: string;
  color: ColorFn;
}

/** Übersetzt den avail-Code von domain.check in Label + Farbe. */
export function availStyle(avail: number): AvailStyle {
  switch (avail) {
    case 1:
      return { label: 'frei', color: pc.green };
    case 0:
      return { label: 'vergeben', color: pc.red };
    case 2:
      return { label: 'premium', color: pc.magenta };
    case -1:
      return { label: 'ungültig', color: pc.yellow };
    default:
      return { label: 'unklar', color: pc.dim };
  }
}

function formatPrice(price: number | undefined, currency = 'EUR'): string {
  if (price === undefined || price === null) return '';
  return `${price.toFixed(2)} ${currency}`;
}

/** Tabelle für `domain check`. */
export function checkTable(results: DomainCheckResult[]): string {
  if (!results.length) return dim('  Keine Ergebnisse.');
  const rows = results.map((r) => {
    const st = availStyle(r.avail);
    return {
      domain: r.domain ?? '',
      status: st.color(st.label),
      statusLen: st.label.length,
      price: r.price !== undefined ? formatPrice(r.price) : '',
    };
  });

  const wDomain = Math.max(6, ...rows.map((r) => r.domain.length));
  const wStatus = Math.max(6, ...rows.map((r) => r.statusLen));

  return rows
    .map(
      (r) =>
        '  ' +
        accent(r.domain.padEnd(wDomain)) +
        '  ' +
        r.status +
        ' '.repeat(Math.max(0, wStatus - r.statusLen)) +
        '  ' +
        dim(r.price),
    )
    .join('\n');
}

/** Tabelle für `contact ls`. */
export function contactTable(contacts: Contact[]): string {
  if (!contacts.length) return dim('  Keine Kontakte gefunden.');
  const rows = contacts.map((c) => ({
    id: String(c.id ?? c.roId ?? ''),
    type: c.type ?? '',
    name: c.name ?? '',
    org: c.org ?? '',
    place: [c.pc, c.city].filter(Boolean).join(' '),
    cc: c.cc ?? '',
  }));

  const w = {
    id: Math.max(2, ...rows.map((r) => r.id.length)),
    type: Math.max(4, ...rows.map((r) => r.type.length)),
    name: Math.max(4, ...rows.map((r) => r.name.length)),
    org: Math.max(3, ...rows.map((r) => r.org.length)),
    place: Math.max(3, ...rows.map((r) => r.place.length)),
  };

  const head =
    '  ' +
    dim('ID'.padEnd(w.id)) + '  ' +
    dim('TYPE'.padEnd(w.type)) + '  ' +
    dim('NAME'.padEnd(w.name)) + '  ' +
    dim('ORG'.padEnd(w.org)) + '  ' +
    dim('ORT'.padEnd(w.place)) + '  ' +
    dim('CC');

  const body = rows
    .map(
      (r) =>
        '  ' +
        accent(r.id.padEnd(w.id)) + '  ' +
        r.type.padEnd(w.type) + '  ' +
        r.name.padEnd(w.name) + '  ' +
        dim(r.org.padEnd(w.org)) + '  ' +
        dim(r.place.padEnd(w.place)) + '  ' +
        dim(r.cc),
    )
    .join('\n');

  return head + '\n' + body;
}

/** Datumswert der INWX-API (String oder getyptes {scalar}-Objekt) auf YYYY-MM-DD kürzen. */
export function apiDateStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (typeof v === 'object' && 'scalar' in v) {
    const s = (v as { scalar?: unknown }).scalar;
    if (typeof s === 'string') return s.slice(0, 10);
  }
  return String(v);
}

/** Tabelle für `domain ls`. */
export function domainTable(domains: DomainListEntry[]): string {
  if (!domains.length) return dim('  Keine Domains gefunden.');
  const rows = domains.map((d) => ({
    domain: String(d.domain ?? ''),
    status: String(d.status ?? ''),
    exDate: apiDateStr(d.exDate),
  }));

  const w = {
    domain: Math.max(6, ...rows.map((r) => r.domain.length)),
    status: Math.max(6, ...rows.map((r) => r.status.length)),
  };

  const head =
    '  ' +
    dim('DOMAIN'.padEnd(w.domain)) + '  ' +
    dim('STATUS'.padEnd(w.status)) + '  ' +
    dim('LÄUFT AB');

  const body = rows
    .map(
      (r) =>
        '  ' +
        accent(r.domain.padEnd(w.domain)) + '  ' +
        r.status.padEnd(w.status) + '  ' +
        dim(r.exDate),
    )
    .join('\n');

  return head + '\n' + body;
}
