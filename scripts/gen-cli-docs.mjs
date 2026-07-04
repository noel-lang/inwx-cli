/**
 * Generiert die Befehlsreferenz (docs/reference/commands.md) aus dem
 * Commander-Programm der CLI. Quelle der Wahrheit ist der Code selbst,
 * damit die Doku nicht abdriften kann. Läuft bei jedem Docs-Build.
 *
 * Voraussetzung: vorher `npm run build` (liest dist/).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProgram } from '../dist/src/cli.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../docs/reference/commands.md');

const program = buildProgram();
const notHelp = (c) => c.name() !== 'help';
const realOptions = (cmd) => cmd.options.filter((o) => !/(^| )-h, --help|-V, --version/.test(o.flags));

function optionRows(cmd) {
  return realOptions(cmd).map((o) => {
    const d = o.defaultValue;
    const hasDefault =
      d !== undefined && d !== false && d !== '' && !(Array.isArray(d) && d.length === 0);
    const def = hasDefault ? '`' + String(d) + '`' : '–';
    const desc = (o.description || '').replace(/\|/g, '\\|');
    return `| \`${o.flags}\` | ${def} | ${desc} |`;
  });
}

function argSignature(cmd) {
  const args = cmd.registeredArguments || cmd._args || [];
  return args
    .map((a) => {
      const name = typeof a.name === 'function' ? a.name() : a._name;
      const inner = a.variadic ? `${name}...` : name;
      return a.required ? `<${inner}>` : `[${inner}]`;
    })
    .join(' ');
}

const lines = [];
lines.push('# Befehlsreferenz');
lines.push('');
lines.push('> Diese Seite wird automatisch aus der CLI generiert (`npm run docs:gen`). Nicht von Hand bearbeiten.');
lines.push('');

function emitLeaf(cmd, path, level) {
  const args = argSignature(cmd);
  const usage = `${path}${realOptions(cmd).length ? ' [options]' : ''}${args ? ' ' + args : ''}`;
  lines.push(`${'#'.repeat(level)} \`${path}\``);
  lines.push('');
  if (cmd.description()) {
    lines.push(cmd.description());
    lines.push('');
  }
  lines.push('```bash');
  lines.push(usage);
  lines.push('```');
  lines.push('');
  const aliases = (cmd.aliases?.() || []).filter(Boolean);
  if (aliases.length) {
    lines.push(`Alias: \`${aliases.join('`, `')}\``);
    lines.push('');
  }
  const rows = optionRows(cmd);
  if (rows.length) {
    lines.push('| Option | Default | Beschreibung |');
    lines.push('| --- | --- | --- |');
    lines.push(...rows);
    lines.push('');
  }
}

const globalRows = optionRows(program);
if (globalRows.length) {
  lines.push('## Globale Optionen');
  lines.push('');
  lines.push('| Option | Default | Beschreibung |');
  lines.push('| --- | --- | --- |');
  lines.push(...globalRows);
  lines.push('');
}

for (const sub of program.commands.filter(notHelp)) {
  const path = `inwx ${sub.name()}`;
  const children = sub.commands.filter(notHelp);
  if (children.length === 0) {
    emitLeaf(sub, path, 2);
  } else {
    lines.push(`## \`${path}\``);
    lines.push('');
    if (sub.description()) {
      lines.push(sub.description());
      lines.push('');
    }
    for (const child of children) emitLeaf(child, `${path} ${child.name()}`, 3);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n') + '\n');
console.log('Befehlsreferenz geschrieben:', OUT);
