# Self-hosted fonts

The public site ships its fonts from `src/assets/fonts/` (asset pipeline, hashed URLs).
Both families are licensed under the SIL Open Font License 1.1.

| File | Family | Source |
| --- | --- | --- |
| `instrument-serif-latin.woff2` | Instrument Serif 400 | https://fonts.google.com/specimen/Instrument+Serif |
| `instrument-serif-italic-latin.woff2` | Instrument Serif 400 italic | https://fonts.google.com/specimen/Instrument+Serif |
| `plex-sans-400-latin.woff2` | IBM Plex Sans 400 | https://fonts.google.com/specimen/IBM+Plex+Sans |
| `plex-sans-500-latin.woff2` | IBM Plex Sans 500 | https://fonts.google.com/specimen/IBM+Plex+Sans |
| `plex-sans-600-latin.woff2` | IBM Plex Sans 600 | https://fonts.google.com/specimen/IBM+Plex+Sans |

Latin subset only. `document.ts` emits `@font-face` with the resolved (hashed) URLs and
preloads the display serif plus the body regular.
