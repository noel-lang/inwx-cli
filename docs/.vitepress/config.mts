import { defineConfig } from 'vitepress';

export default defineConfig({
  base: '/inwx-cli/',
  lang: 'de-DE',
  title: 'inwx-cli',
  description: 'Kommandozeilen-Client für INWX-Domains & -DNS über die DomRobot-API.',
  cleanUrls: true,
  lastUpdated: true,
  head: [['meta', { name: 'theme-color', content: '#0a7ea4' }]],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Befehlsreferenz', link: '/reference/commands' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Erste Schritte', link: '/guide/getting-started' },
          { text: 'DNS verwalten', link: '/guide/dns' },
          { text: 'Domains & Kontakte', link: '/guide/domains' },
          { text: 'OT&E-Walkthrough', link: '/guide/ote' },
        ],
      },
      {
        text: 'Referenz',
        items: [{ text: 'Alle Befehle', link: '/reference/commands' }],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/noel-lang/inwx-cli' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/noel-lang/inwx-cli/edit/main/docs/:path',
      text: 'Diese Seite auf GitHub bearbeiten',
    },
    footer: {
      message: 'MIT-lizenziert. Inoffizielles Community-Projekt, nicht mit INWX affiliiert.',
      copyright: '© 2026 Noel Lang',
    },
    docFooter: { prev: 'Zurück', next: 'Weiter' },
    outline: { label: 'Auf dieser Seite' },
  },
});
