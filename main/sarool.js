/* Sarool (auto-école) : lecture de l'agenda des créneaux et réservation automatique.
   Tout passe par la session Sarool gardée sur ce PC (partition persist:sarool) : l'appli ne connaît pas le mot de passe.
   La réservation reproduit exactement le clic « Réserver » du site (ObjDayPilotCalendar.eventDoubleClickPostBack). */
const { BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');

const PART = 'persist:sarool';
const BASE = (process.env.CARNET_SAROOL_BASE || 'https://www.sarool.fr').replace(/\/$/, '');
const AGENDA = BASE + '/agenda/';
const PLANNING = BASE + '/informations/planning';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let queue = Promise.resolve();
function enqueue(fn) { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; }

/* Journal de dépannage (sans aucune donnée de connexion) */
const logFile = () => path.join(app.getPath('userData'), 'sarool-journal.log');
function log(...a) {
  try {
    const f = logFile();
    if (fs.existsSync(f) && fs.statSync(f).size > 300000) fs.renameSync(f, f + '.old');
    fs.appendFileSync(f, new Date().toISOString() + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');
  } catch (e) { /* le journal ne doit jamais bloquer */ }
}

const HOOKS = `(function(){if(window.__carnetHooks)return true;window.__carnetHooks=true;window.__carnetMsgs=[];
window.alert=function(m){window.__carnetMsgs.push(String(m));};
window.confirm=function(m){window.__carnetMsgs.push(String(m));return true;};return true;})()`;

function makeWin(show) {
  const w = new BrowserWindow({
    show: !!show, width: 1280, height: 900, title: 'Sarool (Carnet)', autoHideMenuBar: true,
    webPreferences: { partition: PART, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('dom-ready', () => { w.webContents.executeJavaScript(HOOKS, true).catch(() => {}); });
  return w;
}
async function js(w, code) { return w.webContents.executeJavaScript(code, true); }
async function waitFor(w, code, timeout = 20000, step = 300) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (w.isDestroyed()) throw new Error('closed');
    try { const v = await js(w, code); if (v) return v; } catch (e) { /* page en cours de chargement */ }
    await sleep(step);
  }
  return null;
}
const isLogin = (url) => /\/compte\/connexion|login/i.test(url || '');

const CAL_READY = `(function(){var c=window.ObjDayPilotCalendar;return !!(c&&c.events&&c.events.list&&document.readyState==='complete'&&!(window.Sys&&Sys.WebForms&&Sys.WebForms.PageRequestManager&&Sys.WebForms.PageRequestManager.getInstance().get_isInAsyncPostBack()));})()`;
const READ = `(function(){var c=window.ObjDayPilotCalendar;if(!c||!c.events||!c.events.list)return null;
function v(d){return d==null?'':String(d.value||d);}
return {start:v(c.startDate).slice(0,10),days:c.days||7,events:c.events.list.map(function(e){var t=e.tag||[];
return {id:String(e.id||''),start:v(e.start),end:v(e.end),text:String(e.text||''),menu:String(e.contextMenu||''),css:String(e.cssClass||''),tag:t.map(String),bubble:String(e.bubbleHtml||'')};})};})()`;

function classify(e) {
  if (/simul/i.test(e.text + ' ' + (e.tag || []).join(' ') + ' ' + e.bubble) && !/EventDispo/i.test(e.menu) && !/^A\d/.test(e.id)) return 'mine';
  if (/eleve/i.test(e.css) || /EventEleve/i.test(e.menu) || /^E\d/.test(e.id)) return 'mine';
  if (/EventDispo/i.test(e.menu) || /^A\d/.test(e.id)) return 'dispo';
  return 'other';
}
function shape(raw) {
  if (!raw) return null;
  return {
    start: raw.start,
    events: raw.events.map((e) => ({
      id: e.id, start: e.start.slice(0, 16), end: e.end.slice(0, 16), kind: classify(e), titre: e.text || 'Leçon de conduite',
      rdv: e.tag[3] || '', moniteur: e.tag[4] || '', lieu: e.tag[5] || '', nbMonit: Number(e.tag[1]) || 1, nbLieux: Number(e.tag[2]) || 1
    }))
  };
}
function mondayOf(iso) { const d = new Date(iso.slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
function addDaysIso(iso, n) { const d = new Date(iso.slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

async function openAgenda(w) {
  await w.loadURL(AGENDA).catch((e) => log('loadURL', String(e)));
  if (isLogin(w.webContents.getURL())) return 'login';
  const ok = await waitFor(w, CAL_READY, 25000);
  if (!ok) { if (isLogin(w.webContents.getURL())) return 'login'; log('agenda: calendrier introuvable', w.webContents.getURL()); return 'nocal'; }
  await js(w, HOOKS).catch(() => {});
  return 'ok';
}
async function currentWeek(w) { try { const r = await js(w, READ); return r ? r.start : null; } catch (e) { return null; } }
async function gotoWeek(w, monday) {
  if ((await currentWeek(w)) === monday) return true;
  const how = await js(w, `(function(){var d=new DayPilot.Date('${monday}T00:00:00');var n=window.MainContent_DayPilotNavigator;
    if(n&&typeof n.select==='function'){n.select(d);return 'navigator';}
    var c=window.ObjDayPilotCalendar;if(c&&typeof c.commandCallBack==='function'){c.commandCallBack('navigate',{start:d,end:d.addDays(7),days:7,day:d});return 'command';}return 'none';})()`).catch((e) => 'err:' + e);
  const ok = await waitFor(w, `(function(){var c=window.ObjDayPilotCalendar;return !!(c&&c.startDate&&String(c.startDate.value||c.startDate).slice(0,10)==='${monday}')&&${CAL_READY};})()`, 15000);
  if (!ok) log('gotoWeek échec', monday, how);
  return !!ok;
}

/* Lecture de plusieurs semaines de créneaux */
function readAgenda(opts) {
  return enqueue(async () => {
    const weeks = Math.max(1, Math.min(6, Number(opts && opts.weeks) || 3));
    const w = makeWin(opts && opts.show);
    try {
      const st = await openAgenda(w);
      if (st !== 'ok') return { ok: false, error: st === 'login' ? 'login' : 'format' };
      const out = [];
      const now = new Date();
      let monday = mondayOf(now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'));
      // Sarool peut rouvrir sur la dernière semaine consultée : on revient toujours à la semaine en cours
      if ((await currentWeek(w)) !== monday) await gotoWeek(w, monday);
      let first = shape(await js(w, READ));
      if (!first) return { ok: false, error: 'format' };
      out.push(first);
      monday = first.start || monday;
      for (let i = 1; i < weeks; i++) {
        monday = addDaysIso(monday, 7);
        if (!(await gotoWeek(w, monday))) break;
        const wk = shape(await js(w, READ));
        if (wk) out.push(wk);
      }
      log('agenda lu', out.map((x) => x.start + ':' + x.events.length).join(' '));
      return { ok: true, weeks: out, at: Date.now() };
    } catch (e) { log('readAgenda erreur', String(e)); return { ok: false, error: 'network' }; }
    finally { if (!w.isDestroyed()) w.destroy(); }
  });
}

const POPUP = `(function(){function vis(el){if(!el)return false;var r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';}
var out={choix:false,alerts:[],msgs:(window.__carnetMsgs||[]).slice()};
var pan=document.getElementById('MainContent_ucPopupChoixMoniteur_radWdwChoixMoniteur_C_panChoixMoniteur')||document.getElementById('MainContent_ucPopupChoixMoniteur_radWdwChoixMoniteur_C');
if(pan&&vis(pan)){out.choix=true;out.choixText=(pan.innerText||'').trim().slice(0,1200);}
Array.prototype.forEach.call(document.querySelectorAll('.rwDialogText'),function(d){if(vis(d))out.alerts.push((d.innerText||'').trim());});
return out;})()`;
const chooseScript = (pref) => `(function(){function n(s){return String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();}
var pref=n(${JSON.stringify(pref || '')}).trim();
var pan=document.getElementById('MainContent_ucPopupChoixMoniteur_radWdwChoixMoniteur_C_panChoixMoniteur')||document.getElementById('MainContent_ucPopupChoixMoniteur_radWdwChoixMoniteur_C');if(!pan)return 'nopanel';
var scope=pan.closest('.RadWindow')||pan.closest('[id^="RadWindowWrapper"]')||pan;
var rows=Array.prototype.filter.call(pan.querySelectorAll('tr'),function(tr){return tr.querySelector('input,button,a');});
var row=null;if(pref)rows.forEach(function(tr){if(!row&&n(tr.innerText).indexOf(pref)>=0)row=tr;});if(!row)row=rows[0]||null;
var radio=null;if(row){radio=row.querySelector('input[type=radio],input[type=checkbox]');if(radio){radio.click();}
  else{var b=row.querySelector('input[type=submit],input[type=button],button,a[href],a[onclick]');if(b){b.click();return 'row';}}}
var btns=Array.prototype.slice.call(scope.querySelectorAll('input[type=submit],input[type=button],button,a'));
var ok=btns.filter(function(b){var t=n(b.value||b.innerText||b.title);return /(valid|reserv|confirm|^\\s*ok\\s*$)/.test(t)&&!/(annul|ferm|close|retour)/.test(t);})[0];
if(ok){ok.click();return 'valider';}return radio?'radio':'rien';})()`;
const DISMISS = `(function(){var n=0;Array.prototype.forEach.call(document.querySelectorAll('.rwDialogPopup .rwPopupButton'),function(b){var r=b.getBoundingClientRect();if(r.width>0){b.click();n++;}});return n;})()`;

async function settle(w) {
  await sleep(700);
  await waitFor(w, CAL_READY, 25000);
  await sleep(400);
}

/* Réservation d'un créneau précis */
function book(slot, opts) {
  return enqueue(async () => {
    const w = makeWin(opts && opts.show);
    const res = { ok: false, msgs: [] };
    try {
      log('réservation demandée', slot.id, slot.start, slot.moniteur);
      const st = await openAgenda(w);
      if (st !== 'ok') { res.error = st === 'login' ? 'login' : 'format'; return res; }
      const monday = mondayOf(slot.start);
      if (!(await gotoWeek(w, monday))) { res.error = 'week'; return res; }
      let wk = shape(await js(w, READ));
      let ev = wk && (wk.events.find((e) => e.id === slot.id) || wk.events.find((e) => e.start === slot.start && e.end === slot.end && (!slot.moniteur || e.moniteur === slot.moniteur)));
      if (!ev) { res.error = 'gone'; return res; }
      if (ev.kind === 'mine') { res.ok = true; res.already = true; res.id = ev.id; return res; }
      if (ev.kind !== 'dispo') { res.error = 'gone'; return res; }
      const fired = await js(w, `(function(){var c=window.ObjDayPilotCalendar;var e=c&&c.events&&c.events.find?c.events.find(${JSON.stringify(ev.id)}):null;
        if(!e)return 'notfound';window.__carnetMsgs=[];c.eventDoubleClickPostBack(e);return 'ok';})()`);
      log('postback réserver', fired);
      if (fired !== 'ok') { res.error = 'notfound'; return res; }
      await settle(w);
      for (let round = 0; round < 3; round++) {
        const p = await js(w, POPUP).catch(() => null);
        if (p) { res.msgs.push(...p.msgs, ...p.alerts); if (p.choixText) res.msgs.push(p.choixText); }
        if (p && p.choix) {
          const c = await js(w, chooseScript(opts && opts.pref)).catch((e) => 'err:' + e);
          log('fenêtre choix moniteur', c);
          await settle(w);
          continue;
        }
        if (p && p.alerts.length) { await js(w, DISMISS).catch(() => {}); await settle(w); }
        break;
      }
      // Vérification : le créneau doit maintenant être à moi
      await gotoWeek(w, monday);
      wk = shape(await js(w, READ));
      let mine = wk && wk.events.find((e) => e.kind === 'mine' && e.start === slot.start && e.end === slot.end);
      if (!mine) {
        // seconde chance : page rechargée à neuf
        const st2 = await openAgenda(w);
        if (st2 === 'ok' && (await gotoWeek(w, monday))) {
          wk = shape(await js(w, READ));
          mine = wk && wk.events.find((e) => e.kind === 'mine' && e.start === slot.start && e.end === slot.end);
        }
      }
      res.msgs = Array.from(new Set(res.msgs.filter(Boolean))).slice(0, 6);
      if (mine) { res.ok = true; res.id = mine.id; log('réservation confirmée', mine.id); }
      else {
        const still = wk && wk.events.find((e) => e.id === ev.id && e.kind === 'dispo');
        res.error = still ? 'refused' : 'gone';
        log('réservation non confirmée', res.error, res.msgs);
      }
      return res;
    } catch (e) { log('book erreur', String(e)); res.error = 'network'; return res; }
    finally { if (!w.isDestroyed()) w.destroy(); }
  });
}

/* Planning (toutes mes leçons à venir) */
function readPlanning() {
  return enqueue(async () => {
    const w = makeWin(false);
    try {
      await w.loadURL(PLANNING);
      if (isLogin(w.webContents.getURL())) return { ok: false, error: 'login' };
      const rows = await js(w, `Array.from(document.querySelectorAll('table tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())).filter(r => r.length >= 3)`);
      log('planning lu', rows.length + ' lignes', JSON.stringify(rows.slice(0, 40)).slice(0, 4000));
      return { ok: true, rows, at: Date.now() };
    } catch (err) { return { ok: false, error: 'network' }; }
    finally { w.destroy(); }
  });
}

function login(parent) {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ width: 1000, height: 760, parent, modal: true, title: 'Connexion à Sarool', autoHideMenuBar: true, webPreferences: { partition: PART, sandbox: true, contextIsolation: true } });
    let done = false;
    const check = (url) => { if (!done && /\/informations\/planning/i.test(url) && !/connexion/i.test(url)) { done = true; resolve(true); setTimeout(() => { if (!w.isDestroyed()) w.close(); }, 800); } };
    w.webContents.on('did-navigate', (_ev, url) => check(url));
    w.webContents.setWindowOpenHandler(({ url }) => { w.loadURL(url); return { action: 'deny' }; });
    w.on('closed', () => { if (!done) resolve(false); });
    w.loadURL(BASE + '/compte/connexion?ReturnUrl=%2Finformations%2Fplanning');
  });
}
function openSite(parent) {
  const w = new BrowserWindow({ width: 1200, height: 860, parent, title: 'Sarool', autoHideMenuBar: true, webPreferences: { partition: PART, sandbox: true, contextIsolation: true } });
  w.webContents.setWindowOpenHandler(({ url }) => { w.loadURL(url); return { action: 'deny' }; });
  w.loadURL(AGENDA);
  return true;
}
async function logout() { const { session } = require('electron'); await session.fromPartition(PART).clearStorageData(); return true; }

module.exports = { readAgenda, book, readPlanning, login, logout, openSite, logFile };
