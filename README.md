# inwx-cli

Eine schön designte CLI für **INWX-DNS** über die [DomRobot-API](https://www.inwx.de/en/help/apidoc), aufgebaut wie `vercel dns`. Records auflisten, einzeln setzen oder eine ganze Zone **deklarativ** aus einer JSON-Datei ausrollen, mit Plan-Vorschau und Dry-Run.

> Kein offizielles INWX-Produkt. Community-Projekt, MIT-lizenziert.

## Features

- `login` mit hübschen Prompts, speichert den Zugang lokal (inkl. **2FA / TOTP**)
- `dns ls` – farbige, ausgerichtete Record-Tabelle
- `dns add` / `dns rm` – einzelne Records
- `dns apply` – **deklaratives Ausrollen** aus einer JSON-Datei, idempotent, mit Plan (`+ anlegen`, `~ ändern`, `= unverändert`) und `--dry-run`
- `--ote` für das INWX-Testsystem
- Zero Native Deps, reines ESM/Node

## Installation

**Schnell, ohne Installation (npx):**

```bash
npx github:noel-lang/inwx-cli login
npx github:noel-lang/inwx-cli dns ls example.com
```

**Global installieren:**

```bash
npm install -g github:noel-lang/inwx-cli
inwx --help
```

**Lokal für Entwicklung:**

```bash
git clone https://github.com/noel-lang/inwx-cli.git
cd inwx-cli
npm install
npm link          # macht `inwx` global verfügbar
```

## Login

```bash
inwx login        # fragt Benutzername, Passwort und (optional) TOTP ab
```

Der Zugang wird in `~/.inwx/config.json` gespeichert (`chmod 600`).

> **Sicherheitshinweis:** Das Passwort liegt dort nur base64-kodiert, das ist **keine
> Verschlüsselung**, nur Schutz gegen versehentliches Auslesen. Wer nichts auf die Platte
> schreiben möchte, nutzt stattdessen Umgebungsvariablen:
>
> ```bash
> export INWX_USER=... INWX_PASSWORD=... INWX_TOTP_SECRET=...
> ```

### 2FA / TOTP

Bei aktiver 2FA kannst du beim Login das TOTP-Secret (Base32, aus der 2FA-Einrichtung)
hinterlegen, dann erzeugt die CLI die Codes selbst. Alternativ fragt sie bei jeder Aktion
nach dem aktuellen 6-stelligen Code.

## Befehle

```bash
inwx dns ls <domain>                                # Records auflisten
inwx dns add <domain> <name> <type> <content>       # einzelnen Record anlegen
      [--ttl <sekunden>] [--prio <n>]
inwx dns rm <domain> <id> [-y]                       # Record per ID löschen
inwx dns apply <datei.json> [--dry-run] [-y]         # Records deklarativ ausrollen

inwx whoami            # angemeldeten Account anzeigen
inwx logout            # gespeicherten Zugang entfernen
```

Globales Flag `--ote` schaltet jeden Befehl auf das INWX-OTE-Testsystem
(erfordert einen separaten OTE-Account auf [ote.inwx.com](https://ote.inwx.com)).

## Deklaratives Ausrollen (`apply`)

Eine JSON-Datei beschreibt den Soll-Zustand einer Zone (siehe
[`records/example.records.json`](records/example.records.json)):

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

`name` ist der Host relativ zur Zone (`@` = Apex). `apply` zeigt zuerst einen Plan und
schreibt erst nach Bestätigung. Idempotent: passende Records werden übersprungen,
abweichende aktualisiert.

```bash
inwx dns apply records/example.records.json --dry-run   # nur Plan, read-only
inwx dns apply records/example.records.json             # scharf schreiben
```

Der `--dry-run` ist der risikofreie Vorab-Check: er liest die echte Zone, schreibt aber nichts.

## Roadmap / offene TODOs

- [ ] `dns export <domain>` – bestehende Zone in eine Records-Datei schreiben (Gegenstück zu `apply`)
- [ ] Session-Cookie wiederverwenden, um nicht bei jedem Befehl neu einzuloggen
- [ ] Mehrere gleichnamige `TXT`/`MX`-Records im `apply`-Abgleich sauberer matchen
- [ ] `dns rm` per Name/Typ statt nur per ID
- [ ] Tests (API-Client, FQDN-Logik, Plan-Diff)
- [ ] npm-Namensverfügbarkeit prüfen und ggf. auf npm veröffentlichen (`npx inwx-cli`)
- [ ] Optional: Credentials im OS-Keychain statt in einer Datei
- [ ] Windows-Terminal testen

Beiträge willkommen, gern per Issue oder PR.

## Lizenz

[MIT](LICENSE) © Noel Lang
