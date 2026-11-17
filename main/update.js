/* Mises à jour automatiques depuis les releases GitHub (Titangp1/mon-carnet).
   1. Recherche au lancement puis toutes les 6 h.
   2. Téléchargement de app-update.bin (= nouvel app.asar) avec progression, vérifié par SHA-256.
   3. « Redémarrer le carnet » : un petit script PowerShell attend la fermeture du carnet, remplace
      app.asar puis relance le carnet (pas l'ordinateur). Chaque étape est écrite dans un journal. */
const { app, net, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = 'Titangp1/mon-carnet';
const resDir = () => process.resourcesPath;
const pending = () => path.join(resDir(), 'app-update.bin');
const logFile = () => path.join(app.getPath('userData'), 'mises-a-jour.log');
const prevFile = () => path.join(app.getPath('userData'), 'version-precedente.txt');
let ready = null, checking = false, applying = false, justUpdated = null;

const parse = (v) => String(v || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
function newer(a, b) { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }

/* Fichiers dans resources/ : on désactive la lecture des .asar le temps de l'accès */
function raw(fn) { const prev = process.noAsar; process.noAsar = true; try { return fn(); } finally { process.noAsar = prev; } }

/* ---------- Journal ---------- */
function stamp() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
function log(msg) {
  try {
    fs.appendFileSync(logFile(), stamp() + ' ' + msg + '\r\n', 'utf8');
    const t = fs.readFileSync(logFile(), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    if (t.length > 300) fs.writeFileSync(logFile(), t.slice(-200).join('\r\n') + '\r\n', 'utf8');
  } catch (e) { /* journal impossible */ }
}
function journal() {
  try { return fs.readFileSync(logFile(), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).slice(-40).reverse(); } catch (e) { return []; }
}

async function getJson(url) {
  const r = await net.fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mon-carnet' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function getBuf(url, onProgress) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'mon-carnet' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const total = Number(r.headers.get('content-length')) || 0;
  if (!r.body || !r.body.getReader) return Buffer.from(await r.arrayBuffer());
  const reader = r.body.getReader(), parts = [];
  let got = 0, lastSent = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(Buffer.from(value)); got += value.length;
    if (onProgress && Date.now() - lastSent > 250) { lastSent = Date.now(); onProgress(got, total); }
  }
  if (onProgress) onProgress(got, total || got);
  return Buffer.concat(parts);
}

let last = { state: 'idle', current: app.getVersion(), latest: null };
let winRef = () => null;
function setState(o, win) {
  last = Object.assign({ current: app.getVersion(), latest: last.latest, justUpdated }, o);
  win = win || winRef();
  if (win && !win.isDestroyed()) win.webContents.send('update:state', last);
  return last;
}
function getState() { return Object.assign({}, last, { justUpdated }); }

/* Cherche une version : renvoie tout de suite l'état, le téléchargement continue en arrière-plan. */
async function lookup(win) {
  if (!app.isPackaged) return setState({ state: 'dev' }, win);
  if (applying) return last;
  if (ready) return setState({ state: 'ready', latest: ready.version }, win);
  if (checking) return last;
  checking = true;
  setState({ state: 'checking' }, win);
  try {
    const rel = await getJson('https://api.github.com/repos/' + REPO + '/releases/latest');
    const ver = String(rel.tag_name || '').replace(/^v/i, '');
    if (!newer(ver, app.getVersion())) { checking = false; return setState({ state: 'uptodate', latest: ver }, win); }
    const bin = (rel.assets || []).find((x) => x.name === 'app-update.bin');
    const sum = (rel.assets || []).find((x) => x.name === 'app-update.sha256');
    if (!bin || !sum) { checking = false; return setState({ state: 'uptodate', latest: ver }, win); }
    log('Version ' + ver + ' trouvée (installée : ' + app.getVersion() + '), téléchargement…');
    const st = setState({ state: 'downloading', latest: ver, progress: 0, size: bin.size || 0 }, win);
    download(win, rel, ver, bin, sum);
    return st;
  } catch (e) {
    checking = false;
    console.error('[update]', e.message);
    return setState({ state: 'error', error: e.message }, win);
  }
}
async function download(win, rel, ver, bin, sum) {
  try {
    const expected = (await getBuf(sum.browser_download_url)).toString('utf8').trim().split(/\s+/)[0].toLowerCase();
    const data = await getBuf(bin.browser_download_url, (got, total) => setState({ state: 'downloading', latest: ver, progress: total ? got / total : 0, size: total }, win));
    if (crypto.createHash('sha256').update(data).digest('hex') !== expected) throw new Error('fichier corrompu (somme de contrôle)');
    raw(() => { fs.writeFileSync(pending() + '.part', data); fs.renameSync(pending() + '.part', pending()); });
    ready = { version: ver, notes: String(rel.body || '').slice(0, 600) };
    log('Version ' + ver + ' téléchargée et vérifiée (' + Math.round(data.length / 1048576) + ' Mo), prête à installer.');
    setState({ state: 'ready', latest: ver }, win);
  } catch (e) {
    log('Échec du téléchargement : ' + e.message);
    console.error('[update]', e.message);
    setState({ state: 'error', error: e.message }, win);
  } finally { checking = false; }
}

/* Menu de la zone de notification */
async function check(win, manual) {
  const r = await lookup(win);
  if (!manual) return;
  if (r.state === 'uptodate') dialog.showMessageBox(win, { type: 'info', message: 'Mon Carnet est à jour (version ' + app.getVersion() + ').' });
  else if (r.state === 'error') dialog.showMessageBox(win, { type: 'warning', message: 'Impossible de vérifier les mises à jour.', detail: r.error });
  else if (r.state === 'ready') ask(win);
  else if (r.state === 'downloading') dialog.showMessageBox(win, { type: 'info', message: 'Version ' + r.latest + ' trouvée : téléchargement en cours…' });
}
async function ask(win) {
  if (!ready) return;
  const opts = { type: 'info', buttons: ['Redémarrer le carnet', 'Plus tard'], defaultId: 0, cancelId: 1,
    message: 'Nouvelle version ' + ready.version + ' prête', detail: 'Seul le carnet se ferme et se rouvre (quelques secondes), pas l\'ordinateur.\nSi tu choisis « Plus tard », elle sera installée à la prochaine fermeture du carnet.' };
  const r = win && !win.isDestroyed() && win.isVisible() ? await dialog.showMessageBox(win, opts) : null;
  if (r && r.response === 0) applyAndRestart(true);
  else if (!r && Notification.isSupported()) new Notification({ title: 'Mon Carnet', body: 'Version ' + ready.version + ' téléchargée : elle sera installée au prochain démarrage du carnet.' }).show();
}

/* ---------- Installation ---------- */
const PS1 = [
  'param([int]$ProcId, [string]$Src, [string]$Dst, [string]$Exe, [string]$Relaunch, [string]$Log, [string]$Ver)',
  'function L($m) { Add-Content -LiteralPath $Log -Value ((Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " " + $m) -Encoding UTF8 }',
  'L "Installation de la version $Ver : attente de la fermeture du carnet…"',
  'try { Wait-Process -Id $ProcId -Timeout 40 -ErrorAction SilentlyContinue } catch {}',
  'Start-Sleep -Milliseconds 600',
  '$ok = $false; $err = ""',
  'for ($i = 0; $i -lt 60; $i++) {',
  '  try { Copy-Item -LiteralPath $Dst -Destination ($Dst + ".ancien") -Force -ErrorAction SilentlyContinue; Move-Item -LiteralPath $Src -Destination $Dst -Force -ErrorAction Stop; $ok = $true; break }',
  '  catch { $err = $_.Exception.Message; Start-Sleep -Milliseconds 500 }',
  '}',
  'if ($ok) { L "Installation réussie : version $Ver en place." } else { L "Échec de l\'installation : $err (l\'ancienne version reste en place, nouvel essai à la prochaine fermeture)." }',
  'if ($Relaunch -eq "1") { Start-Process -FilePath $Exe; L "Carnet relancé." }',
  ''
].join('\r\n');

function applyAndRestart(relaunch) {
  if (applying) return true;
  if (!raw(() => fs.existsSync(pending()))) return false;
  applying = true;
  const ver = (ready && ready.version) || '?';
  log((relaunch ? 'Redémarrage du carnet demandé' : 'Fermeture du carnet') + ' : installation de la version ' + ver + '.');
  setState({ state: 'installing', latest: ver });
  try {
    const script = path.join(app.getPath('temp'), 'carnet-maj.ps1');
    fs.writeFileSync(script, '\uFEFF' + PS1, 'utf8');
    try { fs.writeFileSync(prevFile(), app.getVersion(), 'utf8'); } catch (e) { /* tant pis */ }
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const q = (s) => '"' + String(s).replace(/"/g, '') + '"';
    const cmdLine = [q(ps), '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', q(script),
      '-ProcId', String(process.pid), '-Src', q(pending()), '-Dst', q(path.join(resDir(), 'app.asar')), '-Exe', q(process.execPath),
      '-Relaunch', relaunch ? '1' : '0', '-Log', q(logFile()), '-Ver', q(ver)].join(' ');
    /* Electron tue ses processus enfants en se fermant : on fait créer le script par Windows (WMI),
       il ne dépend alors plus du carnet. */
    const launcher = spawn(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      '$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$env:CARNET_MAJ_CMD}; exit [int]$r.ReturnValue'],
      { env: Object.assign({}, process.env, { CARNET_MAJ_CMD: cmdLine }), stdio: 'ignore', windowsHide: true });
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok, why) => {
        if (done) return; done = true;
        if (!ok) { applying = false; log('Impossible de lancer l\'installation : ' + why); setState({ state: 'error', error: 'installation impossible (' + why + ')' }); resolve(false); return; }
        log('Programme d\'installation lancé.');
        if (relaunch) setTimeout(() => app.exit(0), 200);
        resolve(true);
      };
      launcher.on('exit', (code) => finish(code === 0, 'code ' + code));
      launcher.on('error', (e) => finish(false, e.message));
      setTimeout(() => finish(false, 'délai dépassé'), 15000);
    });
  } catch (e) {
    applying = false;
    log('Impossible de lancer l\'installation : ' + e.message);
    setState({ state: 'error', error: e.message });
    return Promise.resolve(false);
  }
}

function start(getWin) {
  winRef = getWin;
  if (!app.isPackaged) return;
  /* Après une mise à jour : on le note et on prévient l'interface */
  try {
    const prev = fs.existsSync(prevFile()) ? fs.readFileSync(prevFile(), 'utf8').trim() : '';
    if (prev && prev !== app.getVersion()) { justUpdated = { from: prev, to: app.getVersion() }; log('Carnet démarré en version ' + app.getVersion() + ' (avant : ' + prev + ').'); }
    else if (prev && prev === app.getVersion()) log('Carnet redémarré mais toujours en version ' + prev + ' : l\'installation n\'a pas abouti, nouvel essai.');
    if (prev) fs.unlinkSync(prevFile());
  } catch (e) { /* rien */ }
  /* Un ancien fichier téléchargé qui traîne : on le supprime, il sera retéléchargé si besoin */
  try { raw(() => { if (fs.existsSync(pending())) fs.unlinkSync(pending()); }); } catch (e) { /* verrouillé ? */ }
  setInterval(() => lookup(getWin()), 6 * 3600 * 1000);
  app.on('will-quit', (e) => {
    if (applying || !ready || !raw(() => fs.existsSync(pending()))) return;
    e.preventDefault();
    Promise.resolve(applyAndRestart(false)).then(() => app.exit(0), () => app.exit(0));
  });
}

module.exports = { start, check, lookup, getState, journal, apply: () => applyAndRestart(true) };
