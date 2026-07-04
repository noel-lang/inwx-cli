# DNS verwalten

Mit `--ote` läuft jeder Befehl gegen das OT&E-Testsystem statt produktiv.

## Records auflisten

```bash
inwx dns ls example.com
```

Zeigt eine farbige, ausgerichtete Tabelle aller Records der Zone (ID, Typ, Name, Content, TTL, Prio).

## Einzelne Records

```bash
inwx dns add example.com www CNAME cname.vercel-dns.com
inwx dns add example.com mail MX feedback-smtp.eu-central-1.amazonses.com --prio 10
inwx dns add example.com @ A 203.0.113.10 --ttl 300

inwx dns rm example.com 12345678        # per ID (mit Rückfrage)
inwx dns rm example.com 12345678 --yes  # ohne Rückfrage
```

`name` ist der Host relativ zur Zone; `@` bezeichnet den Apex. Intern wird daraus der FQDN
gebildet (`www` → `www.example.com`, `@` → `example.com`).

## Deklaratives Ausrollen (`apply`)

`apply` gleicht den Ist-Zustand einer Zone gegen eine Soll-Beschreibung ab, zeigt einen Plan
und schreibt (außer bei `--yes`) erst nach Bestätigung nur die Differenz.

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

| Feld       | Pflicht | Default | Beschreibung                       |
| ---------- | ------- | ------- | ---------------------------------- |
| `domain`   | ja      | –       | Zone (Top-Level der Datei)         |
| `name`     | ja      | –       | Host relativ zur Zone (`@` = Apex) |
| `type`     | ja      | –       | Record-Typ (`A`, `CNAME`, `MX`, …) |
| `content`  | ja      | –       | Wert des Records                   |
| `ttl`      | nein    | `3600`  | Time-to-live in Sekunden           |
| `prio`     | nein    | –       | Priorität (nur `MX`/`SRV`)         |

### Abgleichslogik

Für jeden Soll-Record wird über `(FQDN, Typ)` ein bestehender gesucht (bei `MX` zusätzlich die
Priorität):

| Zustand                                          | Aktion          |
| ------------------------------------------------ | --------------- |
| kein passender Record vorhanden                  | **anlegen**     |
| Record vorhanden, `content` oder `ttl` weicht ab | **ändern**      |
| Record vorhanden und identisch                   | **unverändert** |

Der Vorgang ist idempotent, mehrfaches `apply` erzeugt keine Duplikate.

```bash
inwx dns apply zone.json --dry-run   # nur lesen, Plan ausgeben, nichts schreiben
inwx dns apply zone.json             # mit Bestätigung schreiben
inwx dns apply zone.json --yes       # ohne Rückfrage (CI/Automation)
```

Der `--dry-run` liest die reale Zone (read-only) und ist ein gefahrloser Vorab-Check.
