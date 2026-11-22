# Rotterdam VII – app (Electron)

De Windows-app: launcher, spelers, saves, talen (NL/EN/DE) en automatische updates.

## Bouwen
```
npm install
node copy-assets.js
npm run dist
```
De installer komt in `dist/`. Upload `Rotterdam-VII-Setup-<versie>.exe`, `latest.yml` en de `.blockmap` als GitHub Release met tag `v<versie>`.

## Updates
- **Spel**: nieuwe `game.html` in de repo + `version` en `sha256` in `update.json` ophogen → de app haalt hem vanzelf op.
- **Vertalingen**: `dict.json` in de repo aanpassen + `i18nVersion` en `i18nSha256` in `update.json` ophogen.
- **App zelf**: `version` in `package.json` ophogen, bouwen, nieuwe GitHub Release maken en `app` in `update.json` ophogen. Geïnstalleerde apps updaten zichzelf.
