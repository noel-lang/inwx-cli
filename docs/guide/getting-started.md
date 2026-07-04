# Erste Schritte

`inwx-cli` ist ein Kommandozeilen-Client für die Domain- und DNS-Verwaltung bei
[INWX](https://www.inwx.de) über die [DomRobot-API](https://www.inwx.de/en/help/apidoc).
In TypeScript geschrieben, im Stil von `vercel dns`. Inoffizielles Community-Projekt,
nicht mit INWX affiliiert. MIT-lizenziert.

## Anforderungen

- **Node.js ≥ 18** (nutzt globales `fetch` und `Headers.getSetCookie`; empfohlen ≥ 20)
- Ein INWX-Account mit API-Zugang. Für Trockenläufe von Registrierungen ein separater
  [OT&E-Testaccount](https://ote.inwx.com) (eigene Registrierung, eigene Zugangsdaten).

## Installation

Ohne Installation ausführen (npx baut über den `prepare`-Hook automatisch):

```bash
npx github:noel-lang/inwx-cli login
npx github:noel-lang/inwx-cli dns ls example.com
```

Global installieren:

```bash
npm install -g github:noel-lang/inwx-cli
```

Lokal für die Entwicklung:

```bash
git clone https://github.com/noel-lang/inwx-cli.git
cd inwx-cli
npm install    # installiert Deps und baut via prepare-Hook nach dist/
npm link       # registriert das `inwx`-Binary global
```

## Anmelden

```bash
inwx login          # produktiv
inwx login --ote    # gegen das OT&E-Testsystem
inwx whoami         # aktives Profil anzeigen
inwx logout         # Profil entfernen
```

`inwx login` fragt Benutzername, Passwort und optional die 2FA-Konfiguration ab, verifiziert
die Zugangsdaten mit einem echten `account.login`-Aufruf und speichert sie erst danach in
`~/.inwx/config.json` (Dateirechte `0600`).

::: warning Credential-Speicherung
`pass` und `totpSecret` liegen dort nur base64-kodiert. Das ist **keine Verschlüsselung**,
sondern nur Schutz vor versehentlicher Klartext-Anzeige. Wer nichts auf die Platte schreiben
will, nutzt Umgebungsvariablen.
:::

### Zwei-Faktor-Authentifizierung (TOTP)

Bei aktiver 2FA kannst du das Base32-TOTP-Secret hinterlegen, dann erzeugt die CLI die Codes
selbst (RFC 6238, SHA-1, 6 Stellen, 30 s). Alternativ fragt sie bei jeder Aktion nach dem
aktuellen 6-stelligen Code. Intern läuft `account.login` gefolgt von `account.unlock`.

### Umgebungsvariablen

Überschreiben das gespeicherte Profil (z. B. in CI):

| Variable            | Zweck                                     |
| ------------------- | ----------------------------------------- |
| `INWX_USER`         | Benutzername                              |
| `INWX_PASSWORD`     | Passwort                                  |
| `INWX_TOTP_SECRET`  | Base32-TOTP-Secret für die Code-Erzeugung |

Weiter geht es mit [DNS verwalten](./dns).
