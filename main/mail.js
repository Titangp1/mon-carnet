/* Mails de l'école (catégorie « Cours ») : lecture IMAP de la boîte Google de l'école, en lecture seule.
   Le mot de passe d'application est chiffré par Windows (safeStorage / DPAPI) et ne quitte jamais ce PC. */
const { app, safeStorage } = require('electron');
const SAFE_OPEN = /\.(pdf|png|jpe?g|gif|webp|bmp|txt|csv|ics|docx?|xlsx?|pptx?|odt|ods|odp|rtf|md)$/i;
const path = require('path');
const fs = require('fs');

const accFile = () => path.join(app.getPath('userData'), 'mail-compte.json');
const cacheFile = () => path.join(app.getPath('userData'), 'mails-cours.json');
const MAX_KEEP = 600, BODY_FETCH = 120, TEXT_MAX = 20000, ATT_MAX = 15 * 1024 * 1024;
let busy = null;

function writeAtomic(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); const t = file + '.tmp'; fs.writeFileSync(t, data); fs.renameSync(t, file); }
function readJson(f, def) { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : def; } catch (e) { return def; } }

function enc(s) { if (safeStorage.isEncryptionAvailable()) return { v: 1, d: safeStorage.encryptString(String(s)).toString('base64') }; return { v: 0, d: Buffer.from(String(s)).toString('base64') }; }
function dec(o) { try { if (!o) return ''; const b = Buffer.from(o.d, 'base64'); return o.v === 1 ? safeStorage.decryptString(b) : b.toString('utf8'); } catch (e) { return ''; } }
function account() { const a = readJson(accFile(), null); if (!a || !a.user) return null; return { user: a.user, pass: dec(a.pass), host: a.host || 'imap.gmail.com', port: a.port || 993 }; }

function errCode(e) {
  const m = String((e && (e.responseText || e.message)) || e || '');
  if (e && (e.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|Application-specific password|auth/i.test(m))) return 'auth';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket|timeout/i.test(m)) return 'network';
  if (/IMAP.*disabled|not enabled/i.test(m)) return 'imap';
  return 'other';
}
async function connect(acc) {
  const { ImapFlow } = require('imapflow');
  const client = new ImapFlow({ host: acc.host, port: acc.port, secure: true, auth: { user: acc.user, pass: acc.pass }, logger: false, emitLogs: false, socketTimeout: 90000, greetingTimeout: 20000, connectionTimeout: 25000 });
  client.on('error', () => {});
  await client.connect();
  return client;
}

async function setAccount(user, pass) {
  user = String(user || '').trim(); pass = String(pass || '').replace(/\s+/g, '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user)) return { ok: false, error: 'user' };
  if (!pass) return { ok: false, error: 'pass' };
  const acc = { user, pass, host: 'imap.gmail.com', port: 993 };
  let client;
  try { client = await connect(acc); await client.logout(); }
  catch (e) { try { client && client.close(); } catch (x) {} return { ok: false, error: errCode(e), detail: String((e && (e.responseText || e.message)) || '').slice(0, 200) }; }
  try { writeAtomic(accFile(), JSON.stringify({ user, pass: enc(pass), host: acc.host, port: acc.port })); }
  catch (e) { return { ok: false, error: 'other', detail: 'Écriture impossible sur le disque' }; }
  return { ok: true, user };
}
function removeAccount() { try { fs.unlinkSync(accFile()); } catch (e) {} try { fs.unlinkSync(cacheFile()); } catch (e) {} return true; }
function status() { const a = readJson(accFile(), null); const c = readJson(cacheFile(), null); return { configured: !!(a && a.user), user: a ? a.user : '', at: c ? c.at : null, count: c && c.mails ? c.mails.length : 0 }; }
function cached() { const c = readJson(cacheFile(), null); return c || { mails: [], at: null }; }

/* Conversion HTML -> texte lisible (le HTML des mails n'est jamais affiché tel quel) */
function decodeEntities(s) {
  const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', ndash: '–', mdash: '—', euro: '€', oelig: 'œ', Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g) => {
    if (g[0] === '#') { const n = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); try { return String.fromCodePoint(n); } catch (e) { return m; } }
    return Object.prototype.hasOwnProperty.call(map, g) ? map[g] : m;
  });
}
function htmlToText(h) {
  let s = String(h || '');
  s = s.replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => { const t = txt.replace(/<[^>]+>/g, '').trim(); return /^https?:/i.test(href) && t && t !== href ? t + ' (' + href + ')' : (t || href); });
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|h[1-6]|li|blockquote|table)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<\/t[dh]>/gi, '\t');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s.replace(/\r/g, '').replace(/[ \t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t ]{2,}/g, ' ').trim();
}
function cleanText(t) {
  return String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}


/* Structure MIME : texte lisible + pièces jointes (avec leur numéro de partie) + invitations agenda */
function walk(node, out) {
  if (!node) return out;
  if (node.childNodes && node.childNodes.length) { node.childNodes.forEach((c) => walk(c, out)); return out; }
  const type = String(node.type || '').toLowerCase();
  const disp = String(node.disposition || '').toLowerCase();
  const fname = (node.dispositionParameters && node.dispositionParameters.filename) || (node.parameters && node.parameters.name) || '';
  const part = node.part || '1';
  if (type === 'text/calendar') out.att.push({ name: fname || 'invitation.ics', size: node.size || 0, type, part, invite: true });
  else if (disp === 'attachment' || (fname && !/^text\/(plain|html)$/.test(type))) out.att.push({ name: fname || 'pièce jointe', size: node.size || 0, type, part });
  else if (type === 'text/plain' && !out.plain) out.plain = part;
  else if (type === 'text/html' && !out.html) out.html = part;
  return out;
}
async function streamToBuffer(stream, max) {
  const chunks = []; let len = 0;
  for await (const c of stream) { chunks.push(c); len += c.length; if (len > max) break; }
  return Buffer.concat(chunks);
}
async function streamToString(stream, max) { return (await streamToBuffer(stream, max)).toString('utf8'); }
function addr(a) { return a ? { name: String(a.name || '').trim(), address: String(a.address || '').toLowerCase() } : { name: '', address: '' }; }

function allowed(from, filt) {
  const a = (from && from.address) || '';
  if (!a) return false;
  if (filt.own && a === filt.own) return false;
  if (filt.senders.includes(a)) return true;
  return filt.domains.some((d) => a.endsWith('@' + d));
}
function filterOf(opts, acc) {
  return {
    senders: (opts.senders || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean),
    domains: (opts.domains || []).map((s) => String(s).trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
    own: acc.user.toLowerCase()
  };
}
function gmDate(d) { return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0'); }
async function openAll(client) {
  const boxes = await client.list();
  const all = boxes.find((b) => b.specialUse === '\\All');
  const boxPath = all ? all.path : 'INBOX';
  const lock = await client.getMailboxLock(boxPath, { readOnly: true });
  return { boxPath, lock };
}
function entryOf(msg, uidValidity, byId) {
  const env = msg.envelope || {};
  const from = addr((env.from || [])[0]);
  const id = msg.emailId ? 'g' + msg.emailId : uidValidity + ':' + msg.uid;
  const parts = walk(msg.bodyStructure, { plain: null, html: null, att: [] });
  const old = byId.get(id);
  return {
    id, uid: msg.uid, gmid: msg.emailId || null, thread: msg.threadId || null,
    from, to: (env.to || []).map(addr), cc: (env.cc || []).map(addr),
    subject: String(env.subject || '(sans objet)'),
    date: new Date(env.date || msg.internalDate || Date.now()).toISOString(),
    seen: !!(msg.flags && msg.flags.has('\\Seen')),
    flagged: !!(msg.flags && msg.flags.has('\\Flagged')),
    att: parts.att, parts: { p: parts.plain, h: parts.html },
    text: old ? old.text : null, snippet: old ? old.snippet : '', found: old ? !!old.found : false
  };
}
async function fetchEntries(client, uids, filt, byId) {
  const out = [];
  if (!uids.length) return out;
  const uidValidity = String(client.mailbox && client.mailbox.uidValidity || '0');
  for await (const msg of client.fetch(uids, { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true, threadId: true, emailId: true }, { uid: true })) {
    const e = entryOf(msg, uidValidity, byId);
    if (allowed(e.from, filt)) out.push(e);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
/* Écriture du cache en fusionnant (une synchro et une recherche peuvent se croiser) */
function saveCache(list, meta, replaceWindow) {
  const cur = cached();
  const map = new Map();
  if (!replaceWindow) (cur.mails || []).forEach((m) => map.set(m.id, m));
  else (cur.mails || []).forEach((m) => { if (m.found) map.set(m.id, m); });
  list.forEach((m) => { const o = map.get(m.id); map.set(m.id, o ? Object.assign({}, o, m, { found: o.found || m.found, text: m.text != null ? m.text : o.text, snippet: m.snippet || o.snippet }) : m); });
  const mails = Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_KEEP);
  const data = Object.assign({}, cur, meta || {}, { mails });
  writeAtomic(cacheFile(), JSON.stringify(data));
  return data;
}

async function sync(opts) {
  if (busy) return busy;
  busy = (async () => {
    const acc = account();
    if (!acc) return { ok: false, error: 'noaccount' };
    if (!acc.pass) return { ok: false, error: 'auth' };
    const filt = filterOf(opts, acc);
    const days = Math.max(14, Math.min(730, Number(opts.days) || 180));
    if (!filt.senders.length && !filt.domains.length) return { ok: true, mails: [], at: Date.now() };
    const byId = new Map((cached().mails || []).map((m) => [m.id, m]));
    let client;
    try {
      client = await connect(acc);
      const { boxPath, lock } = await openAll(client);
      let fresh = [];
      try {
        const since = new Date(Date.now() - days * 86400000);
        const terms = filt.senders.concat(filt.domains);
        if (!terms.length) return { ok: true, mails: [], at: Date.now() };
        let uids;
        if (client.capabilities && client.capabilities.has('X-GM-EXT-1')) uids = await client.search({ gmraw: 'from:(' + terms.join(' OR ') + ') after:' + gmDate(since) }, { uid: true });
        else {
          const or = filt.senders.map((s) => ({ from: s })).concat(filt.domains.map((d) => ({ from: d })));
          uids = await client.search(or.length > 1 ? { since, or } : Object.assign({ since }, or[0]), { uid: true });
        }
        uids = (uids || []).sort((a, b) => b - a).slice(0, 500);
        fresh = await fetchEntries(client, uids, filt, byId);
        // Texte des messages (lecture seule : BODY.PEEK, rien n'est marqué comme lu). Les suivants viendront aux prochaines synchros.
        let n = 0;
        for (const m of fresh) { if (m.text != null) continue; if (n++ >= BODY_FETCH) break; await fetchBody(client, m); }
      } finally { lock.release(); }
      await client.logout().catch(() => {});
      const data = saveCache(fresh, { at: Date.now(), user: acc.user, box: boxPath }, true);
      return { ok: true, mails: data.mails, at: data.at, user: acc.user };
    } catch (e) {
      try { client && client.close(); } catch (x) {}
      return { ok: false, error: errCode(e), detail: String((e && (e.responseText || e.message)) || '').slice(0, 200) };
    }
  })();
  try { return await busy; } finally { busy = null; }
}

/* Recherche côté Gmail (texte complet, pièces jointes, tout l'historique) parmi les expéditeurs suivis */
async function search(opts) {
  const acc = account();
  if (!acc) return { ok: false, error: 'noaccount' };
  const filt = filterOf(opts, acc);
  const q = String(opts.query || '').replace(/[(){}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  const terms = filt.senders.concat(filt.domains);
  if (!q || !terms.length) return { ok: true, mails: [] };
  const byId = new Map((cached().mails || []).map((m) => [m.id, m]));
  let client;
  try {
    client = await connect(acc);
    const { boxPath, lock } = await openAll(client);
    let found = [];
    try {
      let uids;
      if (client.capabilities && client.capabilities.has('X-GM-EXT-1')) uids = await client.search({ gmraw: 'from:(' + terms.join(' OR ') + ') ' + q }, { uid: true });
      else uids = await client.search({ body: q }, { uid: true });
      uids = (uids || []).sort((a, b) => b - a).slice(0, 25);
      found = await fetchEntries(client, uids, filt, byId);
      for (const m of found) { m.found = true; if (m.text == null) await fetchBody(client, m); }
    } finally { lock.release(); }
    await client.logout().catch(() => {});
    const data = saveCache(found, { box: boxPath }, false);
    const ids = new Set(found.map((m) => m.id));
    return { ok: true, mails: data.mails.filter((m) => ids.has(m.id)), all: data.mails };
  } catch (e) { try { client && client.close(); } catch (x) {} return { ok: false, error: errCode(e) }; }
}

async function fetchBody(client, m) {
  const part = m.parts && (m.parts.p || m.parts.h);
  const isHtml = !!(m.parts && !m.parts.p && m.parts.h);
  if (!part) { m.text = ''; m.snippet = ''; return; }
  try {
    const dl = await client.download(String(m.uid), part, { uid: true, maxBytes: 400000 });
    let txt = await streamToString(dl.content, 400000);
    const looksHtml = isHtml || /^\s*<(!doctype|html|div|table|p|body)/i.test(txt);
    txt = looksHtml ? htmlToText(txt) : cleanText(txt);
    m.text = txt.slice(0, TEXT_MAX);
    m.snippet = txt.replace(/\s+/g, ' ').trim().slice(0, 220);
  } catch (e) { m.text = null; }
}

async function withMessage(id, fn) {
  const c = cached();
  const m = (c.mails || []).find((x) => x.id === id);
  if (!m) return { ok: false, error: 'notfound' };
  const acc = account();
  if (!acc) return { ok: false, error: 'noaccount' };
  let client;
  try {
    client = await connect(acc);
    const lock = await client.getMailboxLock(c.box || 'INBOX', { readOnly: true });
    let r;
    try { r = await fn(client, m, c); } finally { lock.release(); }
    await client.logout().catch(() => {});
    return r;
  } catch (e) { try { client && client.close(); } catch (x) {} return { ok: false, error: errCode(e) }; }
}

/* Corps d'un message à la demande (anciens messages) */
async function body(id) {
  const c0 = cached();
  const m0 = (c0.mails || []).find((x) => x.id === id);
  if (m0 && m0.text != null) return { ok: true, text: m0.text };
  return withMessage(id, async (client, m) => {
    await fetchBody(client, m);
    saveCache([m], null, false);
    return { ok: true, text: m.text || '', snippet: m.snippet };
  });
}

/* Pièce jointe : texte extrait (PDF, texte, invitation agenda, HTML) ou fichier enregistré pour l'ouvrir */
const attDir = () => path.join(process.env.CARNET_DOCS_DIR || path.join(app.getPath('documents'), 'Mon_Carnet'), 'Pièces jointes');
async function attachment(id, name, mode) {
  return withMessage(id, async (client, m) => {
    let att = (m.att || []).find((a) => a.name === name) || (!name && (m.att || [])[0]);
    if (!att || !att.part) {
      const one = await client.fetchOne(String(m.uid), { uid: true, bodyStructure: true }, { uid: true });
      const parts = walk(one && one.bodyStructure, { plain: null, html: null, att: [] });
      att = parts.att.find((a) => a.name === name) || (!name && parts.att[0]);
      if (parts.att.length) { m.att = parts.att; saveCache([m], null, false); }
    }
    if (!att) return { ok: false, error: 'noatt' };
    const dl = await client.download(String(m.uid), att.part, { uid: true, maxBytes: ATT_MAX });
    const buf = await streamToBuffer(dl.content, ATT_MAX);
    const lname = att.name.toLowerCase();
    if (mode === 'open') {
      const clean = att.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '');
      const ext = path.extname(clean).toLowerCase(), base = clean.slice(0, clean.length - ext.length).slice(0, 100) || 'piece-jointe';
      const safe = base + ext;
      // l'extension est vérifiée sur le nom FINAL (un nom tronqué ne peut plus devenir .exe)
      if (!ext || !SAFE_OPEN.test(safe)) return { ok: false, error: 'unsafe', name: att.name };
      fs.mkdirSync(attDir(), { recursive: true });
      const file = path.join(attDir(), new Date(m.date).toISOString().slice(0, 10) + ' ' + safe);
      fs.writeFileSync(file, buf);
      // « marque du web » : Office et Windows traitent le fichier comme venant d'Internet (macros bloquées)
      try { fs.writeFileSync(file + ':Zone.Identifier', '[ZoneTransfer]\r\nZoneId=3\r\n'); } catch (e) { /* hors NTFS */ }
      return { ok: true, path: file, name: att.name };
    }
    let text = '', kind = 'autre';
    if (/pdf/.test(att.type) || /\.pdf$/.test(lname)) {
      kind = 'pdf';
      try { const pdf = require('pdf-parse/lib/pdf-parse.js'); const r = await pdf(buf); text = String(r.text || ''); }
      catch (e) { return { ok: false, error: 'pdf', name: att.name }; }
    } else if (att.invite || /calendar/.test(att.type) || /\.ics$/.test(lname)) { kind = 'ics'; text = buf.toString('utf8'); }
    else if (/html/.test(att.type) || /\.html?$/.test(lname)) { kind = 'texte'; text = htmlToText(buf.toString('utf8')); }
    else if (/^text\//.test(att.type) || /\.(txt|csv|md)$/.test(lname)) { kind = 'texte'; text = buf.toString('utf8'); }
    else return { ok: false, error: 'type', name: att.name, type: att.type };
    text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { ok: true, name: att.name, kind, text: text.slice(0, 30000), truncated: text.length > 30000 };
  });
}

module.exports = { setAccount, removeAccount, status, cached, sync, search, body, attachment };
