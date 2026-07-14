# Domains & Kontakte

## Verfügbarkeit & Preise

```bash
inwx domain check meine-idee.de meine-idee.com meine-idee.io
inwx domain price meine-idee.io
```

`domain check` ist read-only und validiert jeden Namen vorab (Label-Länge, erlaubte Zeichen,
IDN/Punycode-Hinweis). Der `avail`-Code wird übersetzt:

| avail | Anzeige    | Bedeutung                       |
| ----- | ---------- | ------------------------------- |
| `1`   | `frei`     | registrierbar                   |
| `0`   | `vergeben` | bereits registriert             |
| `2`   | `premium`  | frei, aber Premium-Preis        |
| `-1`  | `ungültig` | ungültiger Name / nicht prüfbar |

## Eigene Domains

```bash
inwx domain ls                 # eigene Domains
inwx domain info example.de    # Status, Ablaufdatum, Handles, Nameserver
```

## Kontakte (Handles)

Registrierungen brauchen mindestens einen Inhaber-Kontakt.

```bash
inwx contact ls     # ID, Typ, Name, Firma, Ort, Land

# interaktiv
inwx contact add

# oder vollständig per Flags (scriptbar)
inwx contact add \
  --name "Max Inhaber" --street "Musterstr. 1" --pc 10115 --city Berlin --cc DE \
  --email max@example.com --voice "+49.30123456"
```

::: tip Telefonformat
INWX erwartet `+Ländercode.Nummer` mit genau einem Punkt (z. B. `+49.30123456`). Die CLI
normalisiert übliche Schreibweisen: aus `+49.30.999-8877` wird `+49.309998877`. Eine Nummer
ganz ohne Punkt ist mehrdeutig und wird abgelehnt.
:::

## Domain registrieren (`buy`)

`domain buy` registriert über `domain.create` und ist bewusst mehrfach abgesichert.

Beim Default `ns.inwx.de,ns2.inwx.de` legt die CLI vor der Registrierung automatisch die
INWX-MASTER-Zone an. Die Zone enthält dadurch rechtzeitig autoritative SOA-/NS-Records für die
Nameserverprüfung der Registry.

```bash
# 1) Testkauf gegen OT&E (Standard, keine Kosten, keine echte Registrierung)
inwx domain buy meine-idee.de --registrant 12345

# 2) Non-interaktiv (Rückfrage überspringen), weiterhin OT&E
inwx domain buy meine-idee.de --registrant 12345 --yes

# 3) Nur validieren (testing=true), nichts registrieren
inwx domain buy meine-idee.de --registrant 12345 --dry-run

# 4) Echter, kostenpflichtiger Kauf auf PROD
inwx domain buy meine-idee.de --registrant 12345 --yes-live
```

::: danger Sicherheitsmodell
- Ohne `--yes-live` läuft `buy` **immer** gegen OT&E, ein `domain.create` auf PROD ist ohne
  dieses Flag technisch ausgeschlossen.
- `-y/--yes` überspringt die Rückfrage **nur auf OT&E**; bei `--yes-live` muss der Domainname
  trotzdem exakt eingetippt werden.
- INWX verlangt alle vier Kontakt-Handles. Ohne `--admin/--tech/--billing` übernimmt die CLI
  den Registranten.
:::

Bestehende Nameserver lassen sich separat aktualisieren:

```bash
inwx domain ns example.de --ns ns.inwx.de,ns2.inwx.de
```

### Secure-only-TLDs und Zusatzdaten

`.app`, `.dev` und `.page` verlangen eine Secure-only-Bestätigung. Die CLI setzt
`ACKNOWLEDGE-SECURE-ONLY-<TLD>` automatisch. Beliebige weitere TLD-Zusatzdaten gehen über
`--ext key=value` (mehrfach nutzbar). Manche TLDs haben Mindestlaufzeiten (z. B. `.ai` ab
`--period 2Y`), die INWX im Fehlerfall inklusive erlaubter Werte zurückmeldet.
