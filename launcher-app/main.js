// Rotterdam VII — Electron-app
// Het spel draait op http://rotterdam7.local/ (alleen binnen dit venster, via een eigen protocol-handler).
// Alle /api/-functies van de oude launcher zitten hier: spelers, saves, instellingen en updates.
'use strict';
const { app, BrowserWindow, Menu, session, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const HOST = 'rotterdam7.local';
const ORIGIN = 'http://' + HOST;
const BUNDLED_DICT_VERSION = require('./package.json').dictVersion;
const UPDATE_URL = process.env.R7_UPDATE_URL || 'https://liamdej0ng.github.io/rotterdam7/update.json';
const DISCORD = 'https://discord.gg/GXM3Mb2TNp';
const APPDIR = path.join(__dirname, 'app');
const BUNDLED_GAME_VERSION = require('./package.json').gameVersion;
const R7I18N = require('./i18n-boot.js');

app.setName('Rotterdam VII');
app.commandLine.appendSwitch('lang', 'nl');
app.commandLine.appendSwitch('disable-features', 'Translate');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null;
let DATA, SAVES, CACHE;

/* ---------- opslag ---------- */
function readJSON(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } }
function writeJSON(f, v) { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); }
function log(...a) {
  try {
    const f = path.join(DATA, 'launcher.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 512 * 1024) fs.renameSync(f, f + '.old');
    fs.appendFileSync(f, new Date().toISOString() + ' ' + a.join(' ') + '\n');
  } catch (e) {}
}
const cleanName = n => String(n || '').replace(/[^\w\- ]/g, '').trim().slice(0, 24);
const saveFile = n => path.join(SAVES, cleanName(n) + '.json');

const DEF_SETTINGS = { gfx: 'auto', fs: true, vol: 0.8, rvol: 0.9, last: '', lang: '' };
const LANGS = ['nl', 'en', 'de'];
let S = { ...DEF_SETTINGS };
let P = []; // [{name,char,created}]

function loadStore() {
  DATA = app.getPath('userData');
  SAVES = path.join(DATA, 'saves');
  CACHE = path.join(DATA, 'cache');
  fs.mkdirSync(SAVES, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });
  migrateOldLauncher();
  S = { ...DEF_SETTINGS, ...readJSON(path.join(DATA, 'settings.json'), {}) };
  if (!LANGS.includes(S.lang)) { const l = (app.getLocale() || '').slice(0, 2).toLowerCase(); S.lang = LANGS.includes(l) ? l : 'en'; }
  const raw = readJSON(path.join(DATA, 'profiles.json'), []);
  P = (Array.isArray(raw) ? raw : []).map(p => ({ name: cleanName(p && p.name), char: p && p.char === 'bella' ? 'bella' : 'barry', created: (p && p.created) || Date.now() })).filter(p => p.name);
}
function saveProfiles() { writeJSON(path.join(DATA, 'profiles.json'), P); }
function saveSettings() { writeJSON(path.join(DATA, 'settings.json'), S); }

// Spelers en saves van de oude Rotterdam-VII.exe overnemen (eenmalig).
function migrateOldLauncher() {
  if (process.platform !== 'win32' || fs.existsSync(path.join(DATA, 'profiles.json'))) return;
  const base = process.env.LOCALAPPDATA;
  if (!base) return;
  for (const dir of ['Rotterdam VII', 'Rotterdam-VII', 'RotterdamVII', 'GTA VII Rotterdam']) {
    const old = path.join(base, dir);
    if (!fs.existsSync(path.join(old, 'profiles.json'))) continue;
    try {
      for (const f of ['profiles.json', 'settings.json']) if (fs.existsSync(path.join(old, f))) fs.copyFileSync(path.join(old, f), path.join(DATA, f));
      const os = path.join(old, 'saves');
      if (fs.existsSync(os)) for (const f of fs.readdirSync(os)) if (f.endsWith('.json')) fs.copyFileSync(path.join(os, f), path.join(SAVES, f));
      log('migratie van', old, 'gelukt');
    } catch (e) { log('migratie mislukt', e.message); }
    return;
  }
}

function profileList() {
  return P.map(p => {
    const f = saveFile(p.name);
    let has = false, story = 0, cash = 0, lastPlay = 0;
    try {
      const st = fs.statSync(f);
      const s = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (s) {
        has = true; lastPlay = Math.floor(st.mtimeMs / 1000);
        story = +s.story || 0;
        cash = (s.slots || []).reduce((a, x) => a + (x && x.id === 'cash' ? +x.n || 0 : 0), 0);
      }
    } catch (e) {}
    return { name: p.name, char: p.char, has, story, cash, lastPlay };
  });
}

/* ---------- updates van het spel (update.json, zoals de oude launcher) ---------- */
const vnum = v => String(v || '0').split('.').map(x => parseInt(x, 10) || 0);
function newer(a, b) { const A = vnum(a), B = vnum(b); for (let i = 0; i < Math.max(A.length, B.length); i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) > (B[i] || 0); } return false; }

const U = { state: 'zoeken', notes: '', launcher: '', auto: false };
function cachedGame() {
  const meta = readJSON(path.join(CACHE, 'game.json'), null);
  const f = path.join(CACHE, 'game.html');
  if (meta && meta.version && fs.existsSync(f) && newer(meta.version, BUNDLED_GAME_VERSION)) return { version: meta.version, file: f };
  return { version: BUNDLED_GAME_VERSION, file: path.join(APPDIR, 'game.html') };
}
async function checkGameUpdate() {
  try {
    const r = await net.fetch(UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('update.json ' + r.status);
    const u = await r.json();
    if (u.discordAppId) RPC.setId(String(u.discordAppId));
    if (u.app && newer(u.app, app.getVersion()) && !app.isPackaged) U.launcher = u.app; // app-updates gaan vanzelf via autoUpdater
    const cur = cachedGame().version;
    if (u.version && u.game && newer(u.version, cur)) {
      const g = await net.fetch(u.game + '?v=' + encodeURIComponent(u.version), { cache: 'no-store' });
      if (!g.ok) throw new Error('game ' + g.status);
      const buf = Buffer.from(await g.arrayBuffer());
      const h = crypto.createHash('sha256').update(buf).digest('hex');
      if (u.sha256 && h !== String(u.sha256).toLowerCase()) throw new Error('sha256 klopt niet');
      fs.writeFileSync(path.join(CACHE, 'game.html.tmp'), buf);
      fs.renameSync(path.join(CACHE, 'game.html.tmp'), path.join(CACHE, 'game.html'));
      writeJSON(path.join(CACHE, 'game.json'), { version: u.version, sha256: h });
      U.state = 'bijgewerkt'; U.notes = u.notes || '';
      log('spel bijgewerkt naar', u.version);
    } else U.state = 'actueel';
    if (u.i18n && u.i18nVersion && newer(u.i18nVersion, dictInfo().version)) {
      try {
        const g = await net.fetch(u.i18n + '?v=' + encodeURIComponent(u.i18nVersion), { cache: 'no-store' });
        if (!g.ok) throw new Error('i18n ' + g.status);
        const buf = Buffer.from(await g.arrayBuffer());
        const h = crypto.createHash('sha256').update(buf).digest('hex');
        if (u.i18nSha256 && h !== String(u.i18nSha256).toLowerCase()) throw new Error('i18n sha256 klopt niet');
        JSON.parse(buf.toString('utf8'));
        fs.writeFileSync(path.join(CACHE, 'dict.json'), buf);
        writeJSON(path.join(CACHE, 'dict.meta.json'), { version: u.i18nVersion, sha256: h });
        log('vertalingen bijgewerkt naar', u.i18nVersion);
      } catch (e) { log('vertalingen:', e.message); }
    }
  } catch (e) { U.state = 'offline'; log('update-check:', e.message); }
}

// Updates van de app zelf (GitHub Releases), als die er zijn.
function checkAppUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info: m => log('updater', m), warn: m => log('updater', m), error: m => log('updater', m), debug() {} };
    autoUpdater.on('update-available', i => { U.launcher = i.version; U.auto = true; });
    autoUpdater.on('update-downloaded', () => {
      // Stil installeren en meteen herstarten, tenzij iemand midden in het spel zit: dan bij afsluiten.
      const inGame = () => win && !win.isDestroyed() && /\/game/.test(win.webContents.getURL());
      const go = () => { if (inGame()) return setTimeout(go, 30000); setImmediate(() => autoUpdater.quitAndInstall(true, true)); };
      go();
    });
    autoUpdater.on('error', e => log('app-update:', e && e.message));
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60000);
    autoUpdater.checkForUpdates().catch(e => log('app-update:', e && e.message));
  } catch (e) { log('app-update:', e.message); }
}

/* ---------- talen ---------- */
// Woordenboek: meegeleverd in de app, of een nieuwere versie uit update.json ("i18n").
function dictInfo() {
  const meta = readJSON(path.join(CACHE, 'dict.meta.json'), null);
  const f = path.join(CACHE, 'dict.json');
  if (meta && meta.version && fs.existsSync(f) && newer(meta.version, BUNDLED_DICT_VERSION)) return { version: meta.version, file: f };
  return { version: BUNDLED_DICT_VERSION, file: path.join(APPDIR, 'dict.json') };
}
let i18nCache = { file: '', mtime: 0, tag: '' };
function i18nTag() {
  const d = dictInfo();
  let mt = 0; try { mt = fs.statSync(d.file).mtimeMs; } catch (e) {}
  if (i18nCache.file !== d.file || i18nCache.mtime !== mt) {
    const dict = readJSON(d.file, {});
    const src = '(' + R7I18N.toString() + ')(' + JSON.stringify(dict).replace(/<\/(script)/gi, '<\\/$1') + ')';
    i18nCache = { file: d.file, mtime: mt, tag: '<script>/*__R7I18N__*/' + src + '</script>' };
  }
  return i18nCache.tag;
}
function htmlWithI18n(f) {
  try {
    let h = fs.readFileSync(f, 'utf8');
    const tag = i18nTag();
    h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, m => m + tag) : tag + h;
    return new Response(h, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e) { return text('Niet gevonden', 404); }
}

/* ---------- http://rotterdam7.local ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const text = (t, status = 200) => new Response(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
function file(f) {
  try { return new Response(fs.readFileSync(f), { headers: { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' } }); }
  catch (e) { return text('Niet gevonden', 404); }
}

async function handle(req) {
  const u = new URL(req.url);
  if (u.host !== HOST) return net.fetch(req, { bypassCustomProtocolHandlers: true });
  const p = u.pathname, m = req.method;
  switch (p) {
    case '/': case '/index.html': return htmlWithI18n(path.join(APPDIR, 'launcher.html'));
    case '/game': case '/game.html': return htmlWithI18n(cachedGame().file);
    case '/lib/three.min.js': return file(path.join(APPDIR, 'three.min.js'));
    case '/poster.jpg': return file(path.join(APPDIR, 'poster.jpg'));
    case '/favicon.png': case '/favicon.ico': return file(path.join(APPDIR, 'favicon.png'));

    case '/api/ping': return text('ok');
    case '/api/prepare': return json({ ok: true });
    case '/api/status': return json({ version: app.getVersion(), game: cachedGame().version, engineCached: true, update: U });
    case '/api/log': log('[pagina]', (await req.text()).slice(0, 2000)); return text('ok');
    case '/api/quit': setTimeout(() => app.quit(), 300); return text('ok');
    case '/api/open': {
      const t = u.searchParams.get('u') || '';
      if (/^https:\/\//i.test(t)) shell.openExternal(t);
      return text('ok');
    }
    case '/api/settings':
      if (m === 'POST') {
        try { const n = JSON.parse(await req.text()); S = { ...S, ...n }; if (!LANGS.includes(S.lang)) S.lang = 'nl'; saveSettings(); applyWindowMode(); } catch (e) { return text('ongeldig', 400); }
        return text('ok');
      }
      return json(S);
    case '/api/profiles': {
      if (m === 'POST') {
        let b; try { b = JSON.parse(await req.text()); } catch (e) { return text('ongeldig', 400); }
        const name = cleanName(b.name);
        if (!name) return text('Gebruik letters of cijfers in je naam.', 400);
        if (P.some(x => x.name.toLowerCase() === name.toLowerCase())) return text('Er is al een speler met de naam ' + name + '.', 409);
        P.push({ name, char: b.char === 'bella' ? 'bella' : 'barry', created: Date.now() });
        saveProfiles();
      } else if (m === 'DELETE') {
        const name = cleanName(u.searchParams.get('name'));
        P = P.filter(x => x.name !== name); saveProfiles();
        try { const f = saveFile(name); if (fs.existsSync(f)) fs.renameSync(f, f.replace(/\.json$/, '.verwijderd-' + Date.now() + '.json')); } catch (e) {}
      }
      return json(profileList());
    }
    case '/api/save': {
      const name = cleanName(u.searchParams.get('user'));
      if (!name) return text('null');
      const f = saveFile(name);
      if (m === 'POST') {
        const body = await req.text();
        try { JSON.parse(body); } catch (e) { return text('ongeldig', 400); }
        fs.writeFileSync(f + '.tmp', body); fs.renameSync(f + '.tmp', f);
        return text('ok');
      }
      try { return text(fs.readFileSync(f, 'utf8')); } catch (e) { return text('null'); }
    }
  }
  return text('Niet gevonden', 404);
}

/* ---------- venster ---------- */
function applyWindowMode() {
  if (!win) return;
  if (S.fs) { if (!win.isFullScreen()) win.setFullScreen(true); }
  else { if (win.isFullScreen()) win.setFullScreen(false); if (!win.isMaximized()) win.maximize(); }
}

function createWindow() {
  const ses = session.fromPartition('persist:rotterdam7');
  ses.protocol.handle('http', handle);
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(['pointerLock', 'fullscreen', 'media'].includes(perm)));

  win = new BrowserWindow({
    width: 1280, height: 760, minWidth: 900, minHeight: 560,
    title: 'Rotterdam VII', backgroundColor: '#07050b', show: false,
    icon: path.join(APPDIR, 'favicon.png'),
    autoHideMenuBar: true,
    webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false, devTools: !app.isPackaged }
  });
  win.once('ready-to-show', () => { applyWindowMode(); win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); } });
  win.on('page-title-updated', e => e.preventDefault());
  win.webContents.on('render-process-gone', (e, d) => { log('renderer weg:', d.reason); if (d.reason !== 'clean-exit') win.loadURL(ORIGIN + '/?lang=' + S.lang); });
  win.loadURL(ORIGIN + '/?lang=' + S.lang);
}

/* ---------- Discord-status: iedereen die speelt krijgt "Speelt Rotterdam VII" onder zijn naam ---------- */
// Werkt via Discord Rich Presence (lokale Discord-app). Het ID van de Discord-app "Rotterdam VII" komt uit update.json (discordAppId).
const RPC = {
  id: '', sock: null, ready: false, start: Math.floor(Date.now() / 1000), last: '', retryT: null, nonce: 0,
  setId(id) { if (!/^\d{15,22}$/.test(id) || id === this.id) return; this.id = id; this.close(); this.connect(); },
  frame(op, obj) { const j = Buffer.from(JSON.stringify(obj), 'utf8'), h = Buffer.alloc(8); h.writeInt32LE(op, 0); h.writeInt32LE(j.length, 4); return Buffer.concat([h, j]); },
  close() { this.ready = false; this.last = ''; if (this.sock) { try { this.sock.destroy(); } catch (e) {} } this.sock = null; },
  connect(i = 0) {
    if (!this.id || this.sock) return;
    const base = process.platform === 'win32' ? '\\\\?\\pipe\\discord-ipc-' : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp', 'discord-ipc-');
    const s = require('net').createConnection(base + i);
    s.once('connect', () => { this.sock = s; s.write(this.frame(0, { v: 1, client_id: this.id })); });
    s.on('data', d => { try { if (d.length >= 8 && d.readInt32LE(0) === 1) { const m = JSON.parse(d.slice(8, 8 + d.readInt32LE(4)).toString()); if (m.evt === 'READY') { this.ready = true; this.last = ''; this.tick(); } } } catch (e) {} });
    s.on('error', () => { if (!this.sock && i < 9) this.connect(i + 1); else this.retry(); });
    s.on('close', () => { if (this.sock === s) { this.close(); this.retry(); } });
  },
  retry() { clearTimeout(this.retryT); this.retryT = setTimeout(() => { this.sock = null; this.connect(); }, 5000); },
  tick() {
    if (!this.ready || !this.sock) return;
    const activity = { timestamps: { start: this.start }, assets: { large_image: 'https://liamdej0ng.github.io/rotterdam7/discord-icon.png', large_text: 'Rotterdam VII' } };
    const key = JSON.stringify(activity); if (key === this.last) return; this.last = key;
    try { this.sock.write(this.frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: String(++this.nonce) })); } catch (e) { this.close(); this.retry(); }
  }
};
setInterval(() => RPC.tick(), 15000);
RPC.setId('1575432127783243929'); // direct bij opstarten, update.json kan het later nog aanpassen

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  loadStore();
  log('start', app.getVersion(), 'spel', cachedGame().version);
  createWindow();
  checkGameUpdate();
  checkAppUpdate();
});
