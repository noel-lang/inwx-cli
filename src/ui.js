import pc from 'picocolors';

// Markenzeichen: kräftiges Blau/Cyan, passend zu INWX, aber eigenständig.
export const brand = (s) => pc.cyan(pc.bold(s));
export const dim = (s) => pc.dim(s);
export const ok = (s) => pc.green(s);
export const warn = (s) => pc.yellow(s);
export const err = (s) => pc.red(s);
export const accent = (s) => pc.cyan(s);

export function logo() {
  return `${pc.cyan('◆')} ${pc.bold('inwx')} ${pc.dim('· DNS')}`;
}

const TYPE_COLORS = {
  A: pc.green,
  AAAA: pc.green,
  CNAME: pc.cyan,
  MX: pc.magenta,
  TXT: pc.yellow,
  NS: pc.blue,
  SRV: pc.magenta,
  CAA: pc.blue,
};

export function colorType(type) {
  const fn = TYPE_COLORS[type] || pc.white;
  return fn(type.padEnd(5));
}

const ACTION_STYLE = {
  create: { sign: '+', color: pc.green, label: 'anlegen' },
  update: { sign: '~', color: pc.yellow, label: 'ändern' },
  skip: { sign: '=', color: pc.dim, label: 'unverändert' },
};

export function actionTag(action) {
  const a = ACTION_STYLE[action] || ACTION_STYLE.skip;
  return a.color(`${a.sign} ${a.label}`);
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Einfache, ausgerichtete Tabelle für `dns ls`. */
export function recordTable(records) {
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
        pc.dim(r.prio.padEnd(w.prio))
    )
    .join('\n');

  return head + '\n' + body;
}

/** Formatiert eine geplante Änderung für `dns apply`. */
export function planLine({ action, record, fqdn, oldContent }) {
  const sign = ACTION_STYLE[action] || ACTION_STYLE.skip;
  const left = `${sign.color(sign.sign)} ${colorType(record.type)} ${fqdn}`;
  if (action === 'update') {
    return `  ${left}\n      ${pc.dim(truncate(oldContent, 60))} ${pc.dim('→')} ${truncate(record.content, 60)}`;
  }
  const prio = record.prio ? pc.dim(` [prio ${record.prio}]`) : '';
  return `  ${left}  ${dim(truncate(record.content, 60))}${prio}`;
}
