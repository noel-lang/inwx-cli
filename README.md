# inwx-cli

Kommandozeilen-Client für die DNS-Verwaltung bei [INWX](https://www.inwx.de) über die
[DomRobot-API](https://www.inwx.de/en/help/apidoc). Unterstützt das Auflisten, Erstellen
und Löschen einzelner Records sowie das deklarative, idempotente Ausrollen einer kompletten
Zone aus einer JSON-Beschreibung, mit vorgeschaltetem Änderungsplan und Dry-Run.

Inoffizielles Community-Projekt, nicht mit INWX affiliiert. MIT-lizenziert.

## Anforderungen

- **Node.js ≥ 18** (nutzt das globale `fetch` und `Headers.getSetCookie`; empfohlen ≥ 20, getestet auf 22)
- Ein INWX-Account mit aktiviertem API-Zugang. Optional ein separater
  [OT&E-Testaccount](https://ote.inwx.com) für Trockenläufe.

## Installation

Direkte Ausführung ohne Installation (npx, klont und installiert transient):

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
npm install
npm link          # registriert das `inwx`-Binary global
```

## Authentifizierung

### Ablauf

`inwx login` fragt Benutzername, Passwort und optional die 2FA-Konfiguration ab, verifiziert
die Zugangsdaten mit einem echten `account.login`-Aufruf und persistiert sie erst danach.

```bash
inwx login            # produktiv
inwx login --ote      # gegen das OT&E-Testsystem
inwx whoami           # aktives Profil anzeigen
inwx logout           # Profil entfernen
```

### Zwei-Faktor-Authentifizierung (TOTP)

Ist auf dem Account 2FA aktiv, gibt es zwei Betriebsmodi:

1. **Secret hinterlegen** – das Base32-TOTP-Secret (aus der 2FA-Einrichtung) wird gespeichert;
   die CLI erzeugt gültige Codes selbst (RFC 6238, SHA-1, 6 Stellen, 30 s, via `otpauth`).
2. **Interaktiv** – kein Secret gespeichert; jede authentifizierte Aktion fragt den aktuellen
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

| Variable            | Zweck                                  |
| ------------------- | -------------------------------------- |
| `INWX_USER`         | Benutzername                           |
| `INWX_PASSWORD`     | Passwort                               |
| `INWX_TOTP_SECRET`  | Base32-TOTP-Secret für die Code-Erzeugung |

## Befehle

| Befehl                                             | Beschreibung                                   |
| -------------------------------------------------- | ---------------------------------------------- |
| `inwx login`                                       | Anmelden und Profil speichern                  |
| `inwx logout`                                      | Gespeichertes Profil entfernen                 |
| `inwx whoami`                                      | Aktives Profil anzeigen                        |
| `inwx dns ls <domain>`                             | Alle Records einer Zone auflisten              |
| `inwx dns add <domain> <name> <type> <content>`    | Einzelnen Record anlegen                       |
| `inwx dns rm <domain> <id>`                        | Record anhand seiner ID löschen                |
| `inwx dns apply <datei>`                           | Zone deklarativ abgleichen                     |

Globale Option `--ote` schaltet jeden Befehl auf das OT&E-Testsystem.

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

## Verwendete DomRobot-API

Die CLI spricht die DomRobot-API im JSON-RPC-Format an:

| Umgebung | Endpoint                              |
| -------- | ------------------------------------- |
| `prod`   | `https://api.domrobot.com/jsonrpc/`   |
| `ote`    | `https://api.ote.domrobot.com/jsonrpc/` |

Genutzte Methoden: `account.login`, `account.unlock`, `account.logout`,
`nameserver.info`, `nameserver.createRecord`, `nameserver.updateRecord`,
`nameserver.deleteRecord`.

Die Session wird über das von `account.login` gesetzte Cookie gehalten und bei Folge-Requests
mitgesendet. Jede Antwort trägt einen numerischen `code`; `1000` bedeutet Erfolg, alles andere
wird als Fehler mit Meldung und Code weitergereicht (z. B. `2200` = Authentifizierungsfehler).

## Konfiguration & Exit-Codes

- Konfigurationsverzeichnis: `~/.inwx/` (`config.json`, Modus `0600`)
- Exit-Code `0` bei Erfolg, `1` bei Fehler (nicht angemeldet, API-Fehler, ungültige Eingabe)

## Projektstruktur

```
bin/inwx.js          Einstiegspunkt (Shebang)
src/cli.js           Commander-Verdrahtung + Command-Handler
src/api.js           DomRobot-Client (JSON-RPC, Session, TOTP, Record-Methoden)
src/config.js        Profil-/Credential-Verwaltung (~/.inwx)
src/ui.js            Ausgabe (Farben, Tabelle, Plan-Diff)
records/             Beispiel-Zonendatei
```

## Sicherheit

- Credentials liegen ausschließlich lokal in `~/.inwx/config.json` (`0600`), Base64-kodiert,
  nicht verschlüsselt. Für höhere Anforderungen Umgebungsvariablen nutzen.
- Es werden keine Zugangsdaten geloggt oder an Dritte gesendet; einziger Kontakt ist die
  DomRobot-API.
- Empfehlung: einen INWX-Sub-Account mit auf DNS beschränkten Rechten verwenden.

## Roadmap

- [ ] `dns export <domain>` – bestehende Zone in eine Records-Datei serialisieren (Gegenstück zu `apply`)
- [ ] Session-Cookie wiederverwenden statt bei jedem Befehl neu anzumelden
- [ ] Eindeutiges Matching mehrfacher `TXT`/`MX`-Records in `apply`
- [ ] `dns rm` anhand von Name/Typ statt nur per ID
- [ ] Löschen nicht deklarierter Records in `apply` (`--prune`, opt-in)
- [ ] Testabdeckung (API-Client, FQDN-Ableitung, Plan-Diff)
- [ ] Veröffentlichung auf npm (Namensverfügbarkeit prüfen) für `npx inwx-cli`
- [ ] Optionale Credential-Ablage im OS-Keychain
- [ ] Windows-Terminal verifizieren

## Lizenz

[MIT](LICENSE) © Noel Lang
