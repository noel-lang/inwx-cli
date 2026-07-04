/**
 * E2E-Tests gegen das INWX-OT&E-Testsystem.
 *
 * Bewusst nur READ-ONLY-Kernabläufe (Login, Verfügbarkeit, Preise, Kontakte,
 * Domainliste) — es wird nichts registriert, geändert oder gelöscht, damit die
 * Suite gefahrlos in CI laufen kann, ohne die API zu belasten.
 *
 * Läuft nur, wenn OT&E-Credentials in der Umgebung stehen (INWX_USER /
 * INWX_PASSWORD, optional INWX_TOTP_SECRET). Ohne Credentials werden alle
 * Tests übersprungen (nicht rot), z. B. lokal oder in Fork-PRs ohne Secrets.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Domrobot } from '../src/api.js';

const HAS_CREDS = Boolean(process.env.INWX_USER && process.env.INWX_PASSWORD);
const skip = HAS_CREDS ? false : 'keine OT&E-Credentials gesetzt (INWX_USER/INWX_PASSWORD)';

let client: Domrobot;

before(async () => {
  if (!HAS_CREDS) return;
  client = new Domrobot('ote');
  await client.login(process.env.INWX_USER as string, process.env.INWX_PASSWORD as string, {
    totpSecret: process.env.INWX_TOTP_SECRET,
  });
});

test('E2E: OT&E-Login funktioniert', { skip }, () => {
  // Kommt before() ohne Fehler durch, war account.login (+ ggf. unlock) erfolgreich.
  assert.ok(client, 'Client wurde angelegt und angemeldet');
});

test('E2E: domain.check liefert Verfügbarkeit', { skip }, async () => {
  const res = await client.checkDomains(['example.com']);
  assert.ok(Array.isArray(res) && res.length >= 1, 'Ergebnis-Array vorhanden');
  assert.equal(typeof res[0]!.avail, 'number', 'avail ist numerisch');
});

test('E2E: domain.getPrices liefert TLD-Preise', { skip }, async () => {
  const prices = await client.getPrices(['de']);
  assert.ok(Array.isArray(prices) && prices.length >= 1, 'Preisliste vorhanden');
});

test('E2E: contact.list liefert ein Array', { skip }, async () => {
  const contacts = await client.listContacts();
  assert.ok(Array.isArray(contacts), 'Kontaktliste ist ein Array');
});

test('E2E: domain.list liefert ein Array', { skip }, async () => {
  const domains = await client.listDomains();
  assert.ok(Array.isArray(domains), 'Domainliste ist ein Array');
});
