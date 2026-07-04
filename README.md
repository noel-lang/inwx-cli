# inwx-cli

Kommandozeilen-Client für die Domain- und DNS-Verwaltung bei [INWX](https://www.inwx.de) über die
[DomRobot-API](https://www.inwx.de/en/help/apidoc). Unterstützt Verfügbarkeits- und Preisabfragen,
Domain-Registrierung, Kontakt-Handles sowie das Auflisten, Erstellen und Löschen einzelner
DNS-Records und das deklarative, idempotente Ausrollen einer kompletten Zone aus einer
JSON-Beschreibung, mit vorgeschaltetem Änderungsplan und Dry-Run.

In TypeScript geschrieben (strikt typisiert), im Stil von `vercel dns`. Inoffizielles
Community-Projekt, nicht mit INWX affiliiert. MIT-lizenziert.

## Anforderungen

- **Node.js ≥ 18** (nutzt das globale `fetch` und `Headers.getSetCookie`; empfohlen ≥ 20, getestet auf 22)
- Zum Bauen aus dem Quellcode: **TypeScript 5** (als devDependency enthalten, kein globales `tsc` nötig)
- Ein INWX-Account mit aktiviertem API-Zugang. Für Trockenläufe von Domain-Registrierungen ein
  separater [OT&E-Testaccount](https://ote.inwx.com) (eigene Registrierung, eigene Zugangsdaten).

## Installation

Direkte Ausführung ohne Installation (npx klont, installiert transient und baut über den
`prepare`-Hook automatisch `dist`):

```bash
npx github:noel-lang/inwx-cli login
npx github:noel-lang/inwx-cli dns ls example.com
```

Globale Installation:

```bash
npm install -g github:noel-lang/inwx-cli
```

Lokale Entwicklung:

```bash
git clone https://github.com/noel-lang/inwx-cli.git
cd inwx-cli
npm install       # installiert Deps und baut via prepare-Hook nach dist/
npm link          # registriert das `inwx`-Binary global
```

## Build & Entwicklung

Der Quellcode liegt in TypeScript unter `src/` und `bin/`, das ausführbare Ergebnis kompiliert
`tsc` nach `dist/` (die einzige vom Binary genutzte Ausgabe, per `.gitignore` nicht eingecheckt).

```bash
npm run build     # tsc: src + bin + test -> dist/
npm run dev -- domain check example.de   # baut und führt direkt aus (Args nach --)
npm test          # baut und läuft node --test (ohne Netzwerk)
```

Der `prepare`-Hook baut `dist` automatisch bei `npm install` und bei Installation via
`npx`/`npm install -g github:…`. Das Binary ist in `package.json` auf `dist/bin/inwx.js`
verdrahtet; veröffentlicht wird nur `dist` plus die Beispiel-Zonendatei.

## Authentifizierung

### Ablauf

`inwx login` fragt Benutzername, Passwort und optional die 2FA-Konfiguration ab, verifiziert
die Zugangsdaten mit einem echten `account.login`-Aufruf und persistiert sie erst danach.

```bash
inwx login            # produktiv
inwx login --ote      # gegen das OT&E-Testsystem (separater Account, siehe unten)
inwx whoami           # aktives Profil anzeigen
inwx logout           # Profil entfernen
```

### Zwei-Faktor-Authentifizierung (TOTP)

Ist auf dem Account 2FA aktiv, gibt es zwei Betriebsmodi:

1. **Secret hinterlegen:** das Base32-TOTP-Secret (aus der 2FA-Einrichtung) wird gespeichert;
   die CLI erzeugt gültige Codes selbst (RFC 6238, SHA-1, 6 Stellen, 30 s, via `otpauth`).
2. **Interaktiv:** kein Secret gespeichert; jede authentifizierte Aktion fragt den aktuellen
   6-stelligen Code ab.

Intern wird `account.login` gefolgt von `account.unlock` mit dem generierten bzw. eingegebenen
`tan` ausgeführt.

### Zugangsdaten-Speicherung

Profile werden in `~/.inwx/config.json` mit Dateirechten `0600` abgelegt:

```json
{
  "profiles": {
    "prod": {
      "user": "kunde",
      "pass": "<base64>",
      "totpSecret": "<base64>",
      "savedAt": "2026-07-04T13:37:00.000Z"
    },
    "ote": { }
  }
}
```

> **Hinweis:** `pass` und `totpSecret` sind lediglich Base64-kodiert. Das ist **keine
> Verschlüsselung**, sondern nur Schutz vor versehentlicher Klartext-Anzeige. Wer keine
> Credentials auf die Platte schreiben will, nutzt Umgebungsvariablen.

### Umgebungsvariablen

Überschreiben das gespeicherte Profil und ermöglichen Betrieb ohne persistierte Datei
(z. B. in CI):

| Variable            | Zweck                                     |
| ------------------- | ----------------------------------------- |
| `INWX_USER`         | Benutzername                              |
| `INWX_PASSWORD`     | Passwort                                  |
| `INWX_TOTP_SECRET`  | Base32-TOTP-Secret für die Code-Erzeugung |

## Befehle

| Befehl                                             | Beschreibung                                   |
| -------------------------------------------------- | ---------------------------------------------- |
| `inwx login` / `logout` / `whoami`                 | Anmelden, Profil entfernen, Profil anzeigen    |
| `inwx dns ls <domain>`                             | Alle Records einer Zone auflisten              |
| `inwx dns add <domain> <name> <type> <content>`    | Einzelnen Record anlegen                       |
| `inwx dns rm <domain> <id>`                        | Record anhand seiner ID löschen                |
| `inwx dns apply <datei>`                           | Zone deklarativ abgleichen                     |
| `inwx domain check <name...>`                      | Verfügbarkeit prüfen (READ-ONLY)               |
| `inwx domain price <name>`                         | Preisinfo zu Domain/TLD                        |
| `inwx domain ls`                                   | Eigene Domains auflisten                       |
| `inwx domain info <name>`                          | Details zu einer eigenen Domain                |
| `inwx domain buy <name>`                           | Domain registrieren (Standard: OT&E)           |
| `inwx contact ls`                                  | Domain-Kontakte (Handles) auflisten            |
| `inwx contact add`                                 | Kontakt interaktiv anlegen                     |

Globale Option `--ote` schaltet jeden Befehl auf das OT&E-Testsystem.

## Domains

### `domain check` (READ-ONLY)

Prüft die Verfügbarkeit einer oder mehrerer Domains über `domain.check`. Vor dem API-Call
wird jeder Name syntaktisch validiert (Label-Länge, erlaubte Zeichen, IDN/Punycode-Hinweis)
und für einige TLDs ein Registrierungshinweis ausgegeben.

```bash
inwx domain check example.de
inwx domain check meine-idee.de meine-idee.com meine-idee.io
```

Der `avail`-Code der API wird übersetzt:

| avail | Anzeige    | Bedeutung                     |
| ----- | ---------- | ----------------------------- |
| `1`   | `frei`     | registrierbar                 |
| `0`   | `vergeben` | bereits registriert           |
| `2`   | `premium`  | frei, aber Premium-Preis      |
| `-1`  | `ungültig` | ungültiger Name / nicht prüfbar |

Sofern die API einen Preis mitliefert, wird er angezeigt.

### `domain price`

```bash
inwx domain price example.de
```

Kombiniert den konkreten Domainpreis samt Verfügbarkeit aus `domain.check` mit der
TLD-weiten Preisliste (Registrierung/Verlängerung/Transfer) aus `domain.getPrices`.

### `domain ls` / `domain info`

```bash
inwx domain ls                 # eigene Domains (domain.list)
inwx domain info example.de    # Status, Ablaufdatum, Handles, Nameserver (domain.info)
```

### `domain buy` (mit Sicherheitsnetz)

Registriert eine Domain über `domain.create`. Der Befehl ist bewusst mehrfach abgesichert:

```bash
# 1) Testkauf gegen OT&E (Standard, keine Kosten, keine echte Registrierung)
inwx domain buy meine-idee.de --registrant 12345

# 2) Nur validieren, ohne zu registrieren (testing=true)
inwx domain buy meine-idee.de --registrant 12345 --dry-run

# 3) Echter, kostenpflichtiger Kauf auf PROD (erfordert --yes-live + Tippbestätigung)
inwx domain buy meine-idee.de --registrant 12345 --yes-live
```

| Option                    | Default               | Beschreibung                                   |
| ------------------------- | --------------------- | ---------------------------------------------- |
| `--registrant <id>`       | –                     | Inhaber-Kontakt-ID (**Pflicht**)               |
| `--period <dauer>`        | `1Y`                  | Registrierungsdauer, Format `\d+Y`             |
| `--admin/--tech/--billing`| –                     | weitere Kontakt-Handles                        |
| `--ns <liste>`            | `ns.inwx.de,ns2.inwx.de` | Nameserver (kommasepariert)                 |
| `--renewal-mode <modus>`  | –                     | `AUTORENEW`, `AUTOEXPIRE`, `AUTODELETE`        |
| `--dry-run`               | –                     | nur validieren (`testing=true`)                |
| `--yes-live`              | –                     | echte PROD-Registrierung erlauben              |

**Sicherheitsmodell:**

- Ohne `--yes-live` läuft `buy` **immer** gegen OT&E. Ein `domain.create` gegen PROD ist ohne
  dieses Flag technisch ausgeschlossen.
- Vor dem Kauf zeigt der Befehl Verfügbarkeit und Preis aus `domain.check`. Ist die Domain nicht
  frei, bricht er ab.
- Es folgt eine Bestätigung mit Preisanzeige. Bei `--yes-live` muss der Domainname zusätzlich
  exakt eingetippt werden.

## Kontakte

Domain-Registrierungen brauchen mindestens einen Inhaber-Kontakt (Handle).

```bash
inwx contact ls     # contact.list: ID, Typ, Name, Firma, Ort, Land
inwx contact add    # contact.create: interaktiv, gibt die neue Kontakt-ID aus
```

`contact add` fragt Typ (Person/Organisation/Rolle), Name, Firma (optional), Straße, PLZ, Ort,
Ländercode (ISO 3166-1 alpha-2), E-Mail und Telefon ab, validiert Ländercode und E-Mail lokal und
gibt am Ende die erzeugte Kontakt-ID für die Nutzung mit `domain buy --registrant` aus.

## DNS-Records

### `dns add`

```bash
inwx dns add example.com www CNAME cname.vercel-dns.com
inwx dns add example.com mail MX feedback-smtp.eu-central-1.amazonses.com --prio 10
inwx dns add example.com @ A 203.0.113.10 --ttl 300
```

| Option           | Default | Beschreibung                    |
| ---------------- | ------- | ------------------------------- |
| `--ttl <sek>`    | `3600`  | Time-to-live                    |
| `--prio <n>`     | –       | Priorität (für `MX`, `SRV`)     |

`name` ist der Host relativ zur Zone; `@` bezeichnet den Apex. Intern wird daraus der
FQDN gebildet (`www` → `www.example.com`, `@` → `example.com`).

### `dns rm`

```bash
inwx dns ls example.com          # IDs ermitteln
inwx dns rm example.com 12345678 # löschen (mit Rückfrage)
inwx dns rm example.com 12345678 --yes
```

## Deklaratives Zonen-Management (`apply`)

`apply` gleicht den Ist-Zustand einer Zone gegen eine Soll-Beschreibung ab. Es zeigt zuerst
einen Plan, fragt (außer bei `--yes`) nach und schreibt dann nur die Differenz.

### Dateischema

```json
{
  "domain": "example.com",
  "records": [
    { "name": "@",    "type": "A",     "content": "76.76.21.21" },
    { "name": "www",  "type": "CNAME", "content": "cname.vercel-dns.com" },
    { "name": "mail", "type": "MX",    "content": "feedback-smtp.eu-central-1.amazonses.com", "prio": 10 }
  ]
}
```

| Feld       | Pflicht | Default | Beschreibung                          |
| ---------- | ------- | ------- | ------------------------------------- |
| `domain`   | ja      | –       | Zone (Top-Level der Datei)            |
| `name`     | ja      | –       | Host relativ zur Zone (`@` = Apex)    |
| `type`     | ja      | –       | Record-Typ (`A`, `AAAA`, `CNAME`, `MX`, `TXT`, …) |
| `content`  | ja      | –       | Wert des Records                      |
| `ttl`      | nein    | `3600`  | Time-to-live in Sekunden              |
| `prio`     | nein    | –       | Priorität (nur `MX`/`SRV`)            |

Eine vollständige Vorlage liegt unter [`records/example.records.json`](records/example.records.json).

### Abgleichslogik

Für jeden Soll-Record wird ein bestehender Record über `(FQDN, Typ)` gesucht (bei `MX`
zusätzlich über die Priorität). Daraus ergibt sich die Aktion:

| Zustand                                              | Aktion         |
| ---------------------------------------------------- | -------------- |
| kein passender Record vorhanden                      | **anlegen** (`createRecord`) |
| Record vorhanden, `content` oder `ttl` weicht ab     | **ändern** (`updateRecord`)  |
| Record vorhanden und identisch                       | **unverändert** (übersprungen) |

Der Vorgang ist damit idempotent: mehrfaches `apply` derselben Datei erzeugt keine Duplikate.

> Aktuelle Einschränkung: mehrere gleichnamige `TXT`-Records werden über `(Name, Typ)`
> gematcht und können nicht eindeutig unterschieden werden. Siehe Roadmap.

### Dry-Run

```bash
inwx dns apply zone.json --dry-run   # nur lesen, Plan ausgeben, nichts schreiben
inwx dns apply zone.json             # mit Bestätigung schreiben
inwx dns apply zone.json --yes       # ohne Rückfrage (CI/Automation)
```

Der `--dry-run` liest die reale Zone (read-only) und ist damit ein gefahrloser Vorab-Check,
auch ohne separaten OT&E-Account.

## OT&E-Testsystem

OT&E (Operational Test & Evaluation) ist die Sandbox von INWX und ein **eigenständiger Account**:
Die Produktiv-Zugangsdaten funktionieren dort nicht. Für Trockenläufe von Registrierungen daher
zuerst unter [ote.inwx.com](https://ote.inwx.com) registrieren, dann:

```bash
inwx login --ote                       # OT&E-Zugang speichern
inwx domain check example.de --ote     # Verfügbarkeit im Testsystem
inwx domain buy example.de --ote --registrant <id>   # Testkauf ohne Kosten
```

Ohne `--yes-live` läuft `domain buy` ohnehin gegen OT&E, `--ote` erzwingt es zusätzlich für alle
übrigen Befehle.

## Verwendete DomRobot-API

Die CLI spricht die DomRobot-API im JSON-RPC-Format an:

| Umgebung | Endpoint                                |
| -------- | --------------------------------------- |
| `prod`   | `https://api.domrobot.com/jsonrpc/`     |
| `ote`    | `https://api.ote.domrobot.com/jsonrpc/` |

Genutzte Methoden: `account.login`, `account.unlock`, `account.logout`,
`nameserver.info`, `nameserver.createRecord`, `nameserver.updateRecord`, `nameserver.deleteRecord`,
`domain.check`, `domain.getPrices`, `domain.list`, `domain.info`, `domain.create`,
`contact.list`, `contact.create`.

Die Session wird über das von `account.login` gesetzte Cookie gehalten und bei Folge-Requests
mitgesendet. Jede Antwort trägt einen numerischen `code`; `1000` bedeutet Erfolg, alles andere
wird als Fehler mit Meldung und Code weitergereicht (z. B. `2200` = Authentifizierungsfehler).

## Projektstruktur

```
bin/inwx.ts          Einstiegspunkt (Shebang)
src/cli.ts           Commander-Verdrahtung + Command-Handler
src/api.ts           DomRobot-Client (JSON-RPC, Session, TOTP, Record-/Domain-/Kontakt-Methoden)
src/config.ts        Profil-/Credential-Verwaltung (~/.inwx)
src/ui.ts            Ausgabe (Farben, Tabellen, Plan-Diff)
src/validate.ts      Validierung (Domain-Syntax, TLD-Ableitung, Periode, Ländercode)
src/types.ts         Interfaces für DomRobot-Requests/-Responses, Config, Optionen
test/*.test.ts       Unit-Tests (node --test, ohne Netzwerk)
records/             Beispiel-Zonendatei
dist/                Build-Ausgabe (nicht eingecheckt)
```

## Sicherheit

- Credentials liegen ausschließlich lokal in `~/.inwx/config.json` (`0600`), Base64-kodiert,
  nicht verschlüsselt. Für höhere Anforderungen Umgebungsvariablen nutzen.
- Es werden keine Zugangsdaten geloggt oder an Dritte gesendet; einziger Kontakt ist die
  DomRobot-API.
- `domain buy` registriert standardmäßig nur auf OT&E; ein echter, kostenpflichtiger Kauf auf
  PROD verlangt das explizite Flag `--yes-live` und eine Tippbestätigung des Domainnamens.
- Empfehlung: einen INWX-Sub-Account mit auf DNS/Domains beschränkten Rechten verwenden.

## Tests

Netzwerkfreie Unit-Tests über das eingebaute `node --test`:

```bash
npm test
```

Abgedeckt: FQDN-Ableitung (`toFqdn`), TOTP-Generierung (RFC-6238-Vektoren),
Domain-Validierung, TLD-Ableitung inkl. mehrteiliger Suffixe, Perioden- und Ländercode-Parsing.

## Roadmap

- [ ] `dns export <domain>` – bestehende Zone in eine Records-Datei serialisieren (Gegenstück zu `apply`)
- [ ] Session-Cookie wiederverwenden statt bei jedem Befehl neu anzumelden
- [ ] Eindeutiges Matching mehrfacher `TXT`/`MX`-Records in `apply`
- [ ] `dns rm` anhand von Name/Typ statt nur per ID
- [ ] Löschen nicht deklarierter Records in `apply` (`--prune`, opt-in)
- [x] Testabdeckung (FQDN-Ableitung, TOTP, Domain-Validierung)
- [x] Domain-Verwaltung (`domain check/price/ls/info/buy`, `contact ls/add`)
- [x] TypeScript-Umbau mit strikter Typisierung
- [ ] Veröffentlichung auf npm (Namensverfügbarkeit prüfen) für `npx inwx-cli`
- [ ] Optionale Credential-Ablage im OS-Keychain
- [ ] Windows-Terminal verifizieren

## Lizenz

[MIT](LICENSE) © Noel Lang
