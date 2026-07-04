# OT&E-Walkthrough

Das OT&E-Testsystem (eigener Account auf [ote.inwx.com](https://ote.inwx.com)) eignet sich, um
den kompletten Registrierungs-Weg gefahrlos zu proben. Mit `--ote` läuft jeder Befehl gegen die
Sandbox.

```bash
inwx login --ote

# 1) Verfügbarkeit über mehrere TLDs prüfen (read-only)
inwx domain check codegeschichten.com codegeschichten.io codegeschichten.org \
  codegeschichten.ai codegeschichten.ch codegeschichten.at --ote

# 2) Preise ansehen
inwx domain price codegeschichten.io --ote

# 3) Inhaber-Kontakt anlegen (gibt eine Kontakt-ID zurück)
inwx contact add --ote \
  --name "Max Inhaber" --street "Musterstr. 1" --pc 10115 --city Berlin --cc DE \
  --email max@example.com --voice "+49.30123456"

# 4) Registrierung validieren bzw. auf OT&E durchspielen
#    (buy ist ohne --yes-live immer OT&E)
inwx domain buy codegeschichten.com --registrant <id> --dry-run   # nur validieren
inwx domain buy codegeschichten.com --registrant <id> --yes       # OT&E-Registrierung
```

::: info Zum OT&E-Guthaben
`domain.create` durchläuft auch im Test eine Abrechnungsprüfung. Hat der OT&E-Account kein
Test-Guthaben, endet der Aufruf mit `Billing failure (Code 2104)`. Das ist kein CLI-Fehler,
sondern ein Kontostand-Zustand; Test-Guthaben wird im OT&E-Panel aufgeladen. Die vorgelagerten
Schritte (`check`, `price`, `contact add`) funktionieren unabhängig davon.
:::
