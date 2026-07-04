import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidDomain,
  splitDomain,
  tldOf,
  parsePeriod,
  normalizeCountryCode,
  tldHints,
} from '../src/validate.js';

test('splitDomain: einfache TLD', () => {
  assert.deepEqual(splitDomain('example.de'), { sld: 'example', tld: 'de' });
  assert.deepEqual(splitDomain('www.example.com'), { sld: 'www.example', tld: 'com' });
});

test('splitDomain: mehrteilige TLD', () => {
  assert.deepEqual(splitDomain('shop.example.co.uk'), { sld: 'shop.example', tld: 'co.uk' });
  assert.equal(tldOf('foo.com.au'), 'com.au');
});

test('splitDomain: trailing dot und Groß-/Kleinschreibung', () => {
  assert.deepEqual(splitDomain('Example.DE.'), { sld: 'example', tld: 'de' });
});

test('splitDomain: wirft ohne TLD', () => {
  assert.throws(() => splitDomain('localhost'));
});

test('assertValidDomain: akzeptiert gültige Namen', () => {
  assert.doesNotThrow(() => assertValidDomain('example.com'));
  assert.doesNotThrow(() => assertValidDomain('my-domain123.io'));
  assert.doesNotThrow(() => assertValidDomain('a.b.example.dev'));
});

test('assertValidDomain: ohne TLD', () => {
  assert.throws(() => assertValidDomain('example'), /keine TLD/);
});

test('assertValidDomain: ungültige Zeichen', () => {
  assert.throws(() => assertValidDomain('exa_mple.com'), /Ungültige Zeichen/);
});

test('assertValidDomain: Bindestrich am Rand', () => {
  assert.throws(() => assertValidDomain('-bad.com'), /Bindestrich/);
  assert.throws(() => assertValidDomain('bad-.com'), /Bindestrich/);
});

test('assertValidDomain: IDN/Umlaut braucht Punycode', () => {
  assert.throws(() => assertValidDomain('münchen.de'), /Punycode/);
  assert.doesNotThrow(() => assertValidDomain('xn--mnchen-3ya.de'));
});

test('assertValidDomain: zu langes Label', () => {
  assert.throws(() => assertValidDomain('a'.repeat(64) + '.com'), /63 Zeichen/);
});

test('parsePeriod: normalisiert', () => {
  assert.deepEqual(parsePeriod('1Y'), { years: 1, api: '1Y' });
  assert.deepEqual(parsePeriod('2y'), { years: 2, api: '2Y' });
  assert.deepEqual(parsePeriod('3'), { years: 3, api: '3Y' });
  assert.deepEqual(parsePeriod(undefined), { years: 1, api: '1Y' });
});

test('parsePeriod: ungültig / Bereich', () => {
  assert.throws(() => parsePeriod('abc'));
  assert.throws(() => parsePeriod('0Y'));
  assert.throws(() => parsePeriod('99Y'));
});

test('normalizeCountryCode', () => {
  assert.equal(normalizeCountryCode('de'), 'DE');
  assert.equal(normalizeCountryCode(' At '), 'AT');
  assert.throws(() => normalizeCountryCode('DEU'));
  assert.throws(() => normalizeCountryCode('D1'));
});

test('tldHints: .de liefert Hinweis, .com nicht', () => {
  assert.equal(tldHints('example.de').length, 1);
  assert.equal(tldHints('example.com').length, 0);
});
