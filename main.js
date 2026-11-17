const { app, BrowserWindow, ipcMain, dialog, shell, Menu, net, Tray, nativeImage, Notification, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Mon Carnet');
/* Les réglages internes (clés d'IA, caches) restent dans l'ancien dossier s'il existe, pour ne rien perdre */
{
  const appData = app.getPath('appData');
  let oldUD = '';
  try { const f = fs.readdirSync(appData).find((n) => /^Carnet de /i.test(n) && fs.existsSync(path.join(appData, n, 'Preferences'))); if (f) oldUD = path.join(appData, f); } catch (e) { /* rien */ }
  if (!process.env.CARNET_DATA_DIR && !app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', oldUD && fs.existsSync(oldUD) ? oldUD : path.join(appData, 'Mon Carnet'));
}
app.setAppUserModelId('fr.moncarnet.app'); // nécessaire pour les notifications Windows
app.commandLine.appendSwitch('lang', 'fr-FR');
// Fluidité : défilement et animations confiés à la carte graphique
app.commandLine.appendSwitch('enable-prefer-compositing-to-lcd-text');
app.commandLine.appendSwitch('enable-gpu-rasterization');
if (process.env.CARNET_DATA_DIR) app.setPath('userData', process.env.CARNET_DATA_DIR); // dossier de test séparé
const sarool = require('./main/sarool');
const mail = require('./main/mail');
const ai = require('./main/ai');
const updater = require('./main/update');

const dataDir = () => app.getPath('userData');
/* Les données de l'utilisateur sont dans Documents\\Mon_Carnet (faciles à retrouver et à sauvegarder) */
const docsDir = () => process.env.CARNET_DOCS_DIR || path.join(app.getPath('documents'), 'Mon_Carnet');
const dataFile = () => path.join(docsDir(), 'carnet.json');
const backupDir = () => path.join(docsDir(), 'sauvegardes');
const icsFile = () => path.join(dataDir(), 'emploi-du-temps.ics');
const invoicesDir = () => path.join(docsDir(), 'Factures');

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function dailyBackup() {
  try {
    if (!fs.existsSync(dataFile())) return;
    fs.mkdirSync(backupDir(), { recursive: true });
    const d = new Date();
    const name = `carnet-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    const target = path.join(backupDir(), name);
    if (!fs.existsSync(target)) fs.copyFileSync(dataFile(), target);
    const files = fs.readdirSync(backupDir()).filter(f => /^carnet-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (files.length > 30) fs.unlinkSync(path.join(backupDir(), files.shift()));
  } catch (e) { /* une sauvegarde ratée ne bloque pas l'appli */ }
}
/* Passage à « Mon Carnet » : on recopie les données de l'ancien emplacement (rien n'est supprimé) */
function migrateData() {
  try {
    const d = docsDir();
    fs.mkdirSync(d, { recursive: true });
    const oldData = path.join(dataDir(), 'carnet.json');
    if (!fs.existsSync(dataFile()) && fs.existsSync(oldData)) {
      fs.copyFileSync(oldData, dataFile());
      fs.renameSync(oldData, path.join(dataDir(), 'carnet-ancien-emplacement.json'));
    }
    const oldBackups = path.join(dataDir(), 'sauvegardes');
    if (fs.existsSync(oldBackups) && !fs.existsSync(backupDir())) fs.cpSync(oldBackups, backupDir(), { recursive: true });
    const docsRoot = app.getPath('documents');
    const oldName = process.env.CARNET_DOCS_DIR ? null : fs.readdirSync(docsRoot).find((n) => /^Carnet de /i.test(n) && fs.statSync(path.join(docsRoot, n)).isDirectory());
    const oldDocs = oldName ? path.join(docsRoot, oldName) : '';
    if (oldDocs && fs.existsSync(oldDocs)) {
      for (const name of fs.readdirSync(oldDocs)) {
        const dst = path.join(d, name);
        if (!fs.existsSync(dst)) fs.cpSync(path.join(oldDocs, name), dst, { recursive: true });
      }
    }
    const info = path.join(d, 'A LIRE.txt');
    if (!fs.existsSync(info)) fs.writeFileSync(info, '\uFEFFMon Carnet : tes données\r\n\r\n- carnet.json : tout ce que tu as saisi (agenda, tâches, clients, réglages...).\r\n- sauvegardes : une copie par jour, 30 jours gardés.\r\n- Factures et Pièces jointes : fichiers créés par l\'appli.\r\n\r\nPour changer de PC : copie ce dossier entier dans Documents sur le nouveau PC avant de lancer Mon Carnet.\r\n', 'utf8');
  } catch (e) { console.error('[migration]', e.message); }
}
const inside = (p, dir) => { const r = path.relative(dir, p); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };

/* Données */
ipcMain.handle('carnet:load', () => {
  try {
    if (!fs.existsSync(dataFile())) return null;
    const txt = fs.readFileSync(dataFile(), 'utf8');
    try { JSON.parse(txt); } catch (err) {
      // fichier illisible : on le met de côté (jamais supprimé) avant que l'appli ne réécrive carnet.json
      const d = new Date().toISOString().replace(/[:.]/g, '-');
      try { fs.copyFileSync(dataFile(), path.join(docsDir(), 'carnet-illisible-' + d + '.json')); } catch (e2) { /* ignoré */ }
    }
    return txt;
  } catch (e) { return null; }
});
ipcMain.handle('carnet:save', (_e, text) => {
  try { writeAtomic(dataFile(), String(text)); dailyBackup(); return true; } catch (e) { return false; }
});
ipcMain.on('carnet:saveSync', (e, text) => {
  try { writeAtomic(dataFile(), String(text)); e.returnValue = true; } catch (err) { e.returnValue = false; }
});
ipcMain.handle('carnet:export', async (e, text) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const d = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, {
    title: 'Exporter une sauvegarde',
    defaultPath: path.join(app.getPath('documents'), `carnet-sauvegarde-${d}.json`),
    filters: [{ name: 'Sauvegarde du carnet', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, String(text), 'utf8');
  return r.filePath;
});
ipcMain.handle('carnet:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, {
    title: 'Restaurer une sauvegarde', defaultPath: app.getPath('documents'), properties: ['openFile'],
    filters: [{ name: 'Sauvegarde du carnet', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return fs.readFileSync(r.filePaths[0], 'utf8'); } catch (err) { return null; }
});
ipcMain.handle('carnet:openFolder', () => { fs.mkdirSync(docsDir(), { recursive: true }); return shell.openPath(docsDir()); });

/* Emploi du temps (iCal) */
ipcMain.handle('carnet:icalFetch', async (_e, url) => {
  url = String(url || '').trim();
  if (!/^https:\/\//i.test(url)) return { ok: false, error: 'url' };
  try {
    const res = await net.fetch(url, { headers: { 'User-Agent': 'MonCarnet/4.0', 'Accept': 'text/calendar,*/*' } });
    if (!res.ok) return { ok: false, error: 'http', status: res.status };
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/.test(text)) return { ok: false, error: 'format' };
    writeAtomic(icsFile(), text);
    return { ok: true, text, at: Date.now() };
  } catch (e) { return { ok: false, error: 'network' }; }
});
ipcMain.handle('carnet:icalCached', () => {
  try { return fs.existsSync(icsFile()) ? { text: fs.readFileSync(icsFile(), 'utf8'), at: fs.statSync(icsFile()).mtimeMs } : null; }
  catch (e) { return null; }
});

/* Permis (Sarool) : connexion faite par l'utilisateur dans une fenêtre Sarool, session gardée sur le PC (aucun mot de passe stocké par l'appli) */
ipcMain.handle('sarool:login', (e) => sarool.login(BrowserWindow.fromWebContents(e.sender)));
ipcMain.handle('sarool:fetch', () => sarool.readPlanning());
ipcMain.handle('sarool:logout', () => sarool.logout());
ipcMain.handle('sarool:agenda', (_e, opts) => sarool.readAgenda(opts || {}));
ipcMain.handle('sarool:book', (_e, slot, opts) => sarool.book(slot || {}, opts || {}));
ipcMain.handle('sarool:open', (e) => sarool.openSite(BrowserWindow.fromWebContents(e.sender)));
ipcMain.handle('sarool:journal', () => { try { return shell.openPath(sarool.logFile()); } catch (err) { return 'introuvable'; } });

/* Mails de l'école (IMAP, lecture seule) */
ipcMain.handle('mail:status', () => mail.status());
ipcMain.handle('mail:setAccount', (_e, user, pass) => mail.setAccount(user, pass));
ipcMain.handle('mail:removeAccount', () => mail.removeAccount());
ipcMain.handle('mail:cached', () => mail.cached());
ipcMain.handle('mail:sync', (_e, opts) => mail.sync(opts || {}));
ipcMain.handle('mail:body', (_e, id) => mail.body(String(id || '')));
ipcMain.handle('mail:search', (_e, opts) => mail.search(opts || {}));
ipcMain.handle('mail:attachment', (_e, id, name, mode) => mail.attachment(String(id || ''), String(name || ''), mode === 'open' ? 'open' : 'text'));

/* Titan AI (Groq) */
ipcMain.handle('ai:chat', (_e, payload) => ai.chat(payload || {}));
ipcMain.handle('ai:setKey', (_e, k, id) => ai.setKey(k, id));
ipcMain.handle('ai:usage', () => ai.usage());
ipcMain.handle('ai:resetUsage', () => ai.resetUsage());
ipcMain.handle('ai:keyInfo', () => ai.keyInfo());
ipcMain.handle('ai:ping', () => ai.ping());
ipcMain.handle('ai:transcribe', (_e, data, mime) => ai.transcribe(data, mime));

/* Factures PDF : rendu dans une fenêtre cachée, sans JavaScript */
ipcMain.handle('carnet:invoiceFiles', () => { try { return fs.existsSync(invoicesDir()) ? fs.readdirSync(invoicesDir()).filter((f) => /^F-\d{4}-\d+\.pdf$/i.test(f)) : []; } catch (e) { return []; } });
ipcMain.handle('carnet:invoicePdf', async (_e, html, name, isNew) => {
  const safe = String(name || 'facture.pdf').replace(/[^A-Za-z0-9._-]/g, '_');
  if (isNew && fs.existsSync(path.join(invoicesDir(), safe))) return { exists: true };
  const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { javascript: false, sandbox: true, contextIsolation: true } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html)));
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    const file = path.join(invoicesDir(), safe);
    writeAtomic(file, pdf);
    return file;
  } catch (e) { return null; }
  finally { win.destroy(); }
});
ipcMain.handle('carnet:openPath', (_e, p) => {
  p = String(p || '');
  if (!inside(p, docsDir())) return 'refusé';
  return shell.openPath(p);
});
ipcMain.handle('carnet:openInvoices', () => { fs.mkdirSync(invoicesDir(), { recursive: true }); return shell.openPath(invoicesDir()); });
ipcMain.handle('carnet:saveText', async (e, name, text) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  fs.mkdirSync(docsDir(), { recursive: true });
  const ext = path.extname(String(name)).slice(1) || 'txt';
  const r = await dialog.showSaveDialog(win, {
    title: 'Exporter', defaultPath: path.join(docsDir(), String(name)),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  });
  if (r.canceled || !r.filePath) return null;
  const body = ext === 'csv' ? '﻿' + String(text) : String(text);
  fs.writeFileSync(r.filePath, body, 'utf8');
  return r.filePath;
});
ipcMain.on('carnet:focus', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
});

/* Arrière-plan : l'appli peut rester dans la zone de notification pour réserver et prévenir même fenêtre fermée */
let mainWin = null, tray = null, quitting = false, prefs = { background: true, autostart: false }, hintShown = false;
const startHidden = process.argv.includes('--cache');
function showMain() { if (!mainWin) { createWindow(); return; } if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); }
function ensureTray() {
  if (tray || !prefs.background) return;
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png')));
    tray.setToolTip('Mon Carnet');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir le carnet', click: showMain },
      { label: 'Vérifier la conduite maintenant', click: () => { if (mainWin) mainWin.webContents.send('app:command', 'permis-check'); } },
      { label: 'Synchroniser les mails', click: () => { if (mainWin) mainWin.webContents.send('app:command', 'mail-sync'); } },
      { label: 'Rechercher une mise à jour', click: () => updater.check(mainWin, true) },
      { type: 'separator' },
      { label: 'Quitter', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', showMain);
  } catch (e) { tray = null; }
}
ipcMain.handle('app:prefs', (_e, p) => {
  prefs = Object.assign(prefs, p || {});
  if (prefs.background) ensureTray(); else { if (tray) { tray.destroy(); tray = null; } if (mainWin && !mainWin.isVisible()) showMain(); }
  try { if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!prefs.autostart, args: ['--cache'] }); } catch (e) { /* ignoré */ }
  return true;
});
ipcMain.handle('update:check', () => updater.lookup(mainWin));
ipcMain.handle('update:state', () => updater.getState());
ipcMain.handle('update:apply', () => updater.apply());
ipcMain.handle('update:journal', () => updater.journal());
ipcMain.on('app:quit', () => { quitting = true; app.quit(); });
/* Raccourcis globaux (même quand la fenêtre est cachée) : Ctrl+Alt+T ouvre Titan, Ctrl+Alt+V lance un message vocal */
function registerShortcuts() {
  const send = (cmd) => { showMain(); setTimeout(() => { if (mainWin) mainWin.webContents.send('app:command', cmd); }, 120); };
  try { globalShortcut.register('Control+Alt+T', () => send('titan-open')); } catch (e) { /* déjà pris par une autre appli */ }
  try { globalShortcut.register('Control+Alt+V', () => send('titan-voice')); } catch (e) { /* déjà pris */ }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 940, minHeight: 620,
    title: 'Mon Carnet',
    backgroundColor: '#0d1424',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true, backgroundThrottling: false }
  });
  win.webContents.session.setSpellCheckerLanguages(['fr']);
  mainWin = win;
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  win.on('close', (e) => {
    if (quitting || !prefs.background) return;
    e.preventDefault(); win.hide(); ensureTray();
    if (!hintShown && Notification.isSupported()) { hintShown = true; try { new Notification({ title: 'Le carnet reste actif', body: 'Il continue de surveiller tes cours, tes mails et la conduite. Clic droit sur l’icône pour quitter.' }).show(); } catch (err) {} }
  });
  win.on('closed', () => { mainWin = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => showMain());
  app.on('before-quit', () => { quitting = true; });
  app.whenReady().then(() => { Menu.setApplicationMenu(null); migrateData(); dailyBackup(); createWindow(); if (startHidden) ensureTray(); registerShortcuts(); updater.start(() => mainWin); });
  app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (e) {} });
  app.on('window-all-closed', () => { if (quitting || !prefs.background) app.quit(); });
}
