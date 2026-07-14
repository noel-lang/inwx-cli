import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Domrobot, toFqdn, generateTotp } from '../src/api.js';

test('toFqdn: Apex und leere Namen', () => {
  assert.equal(toFqdn('@', 'example.com'), 'example.com');
  assert.equal(toFqdn('', 'example.com'), 'example.com');
  assert.equal(toFqdn('example.com', 'example.com'), 'example.com');
});

test('toFqdn: relative Hosts', () => {
  assert.equal(toFqdn('www', 'example.com'), 'www.example.com');
  assert.equal(toFqdn('mail', 'example.com'), 'mail.example.com');
  assert.equal(toFqdn('token1._domainkey', 'example.com'), 'token1._domainkey.example.com');
});

test('toFqdn: bereits qualifizierte Namen bleiben unverändert', () => {
  assert.equal(toFqdn('www.example.com', 'example.com'), 'www.example.com');
});

// RFC 6238 Testvektoren (SHA-1, Secret = ASCII "12345678901234567890").
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('generateTotp: RFC-6238-Vektoren (6-stellig)', () => {
  // Unixzeit 59 s -> 8-stellig 94287082 -> 6-stellig 287082.
  assert.equal(generateTotp(RFC_SECRET, 59_000), '287082');
  // Unixzeit 1111111109 -> 8-stellig 07081804 -> 6-stellig 081804.
  assert.equal(generateTotp(RFC_SECRET, 1_111_111_109_000), '081804');
});

test('generateTotp: toleriert Leerzeichen und Kleinschreibung im Secret', () => {
  const spaced = 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq';
  assert.equal(generateTotp(spaced, 59_000), '287082');
});

test('generateTotp: liefert 6 Ziffern für aktuellen Zeitpunkt', () => {
  assert.match(generateTotp(RFC_SECRET), /^\d{6}$/);
});

test('createNameserverZone: sendet MASTER-Zone mit mindestens zwei Nameservern', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;
  globalThis.fetch = (async (_url, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ code: 1000, resData: { roId: 42 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await new Domrobot('ote').createNameserverZone({
    domain: 'example.de',
    type: 'MASTER',
    ns: ['ns.inwx.de', 'ns2.inwx.de'],
    testing: true,
  });

  assert.equal(result.roId, 42);
  assert.deepEqual(requestBody, {
    method: 'nameserver.create',
    params: {
      lang: 'en',
      domain: 'example.de',
      type: 'MASTER',
      ns: ['ns.inwx.de', 'ns2.inwx.de'],
      testing: true,
    },
  });
});
