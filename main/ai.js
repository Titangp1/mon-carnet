/* Titan AI : appels à l'API Groq (compatible OpenAI) depuis le processus principal.
   La page de l'appli n'a aucun accès réseau (CSP connect-src 'none') : tout passe par ici. */
const { app, net, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

/* La clé d'origine a été révoquée : chaque installation utilise désormais sa propre clé (Réglages > Titan AI). */
const API = (process.env.CARNET_GROQ_BASE || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
const WHISPER = ['whisper-large-v3-turbo', 'whisper-large-v3'];
/* Plusieurs fournisseurs gratuits compatibles OpenAI : Titan passe au suivant si l'un sature (limite de jetons, quota…). */
const PROVIDERS = [
  { id: 'gemini', name: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', prefix: /^(AIza|AQ.)/, file: 'titan-cle-gemini.json',
    preferred: ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.0-flash'], skip: /embedding|imagen|veo|tts|image|live|aqa|gemma/i },
  { id: 'groq', name: 'Groq', base: API, prefix: /^gsk_/, file: 'titan-cle.json',
    preferred: ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3.8-27b', 'qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'], skip: /whisper|guard|orpheus|tts|allam|compound/i },
  { id: 'cerebras', name: 'Cerebras', base: 'https://api.cerebras.ai/v1', prefix: /^csk-/, file: 'titan-cle-cerebras.json',
    preferred: ['gpt-oss-120b', 'qwen-3-235b-a22b-instruct-2507', 'llama-3.3-70b', 'llama-4-scout-17b-16e-instruct', 'llama3.1-8b'], skip: /^$/ }
];
const prov = (id) => PROVIDERS.find((p) => p.id === id);
const keyFile = (p) => path.join(app.getPath('userData'), (p || prov('groq')).file);
const cache = {};
const C = (p) => cache[p.id] || (cache[p.id] = { model: null, ids: null, at: 0 });

function getKey(p) {
  p = p || prov('groq');
  try {
    if (fs.existsSync(keyFile(p))) {
      const o = JSON.parse(fs.readFileSync(keyFile(p), 'utf8'));
      const b = Buffer.from(o.d, 'base64');
      const k = o.v === 1 ? safeStorage.decryptString(b) : b.toString('utf8');
      if (k) return k;
    }
  } catch (e) { /* clé illisible */ }
  return '';
}
/* setKey(cle) : le fournisseur est reconnu au début de la clé. setKey('', id) supprime celle de ce fournisseur. */
function setKey(k, id) {
  k = String(k || '').trim();
  const p = k ? PROVIDERS.find((x) => x.prefix.test(k)) : prov(id || 'groq');
  if (!p) return false;
  try {
    if (!k) { if (fs.existsSync(keyFile(p))) fs.unlinkSync(keyFile(p)); cache[p.id] = null; return true; }
    const o = safeStorage.isEncryptionAvailable() ? { v: 1, d: safeStorage.encryptString(k).toString('base64') } : { v: 0, d: Buffer.from(k).toString('base64') };
    fs.writeFileSync(keyFile(p), JSON.stringify(o)); cache[p.id] = null; return p.id;
  } catch (e) { return false; }
}
function keyInfo() {
  const list = PROVIDERS.map((p) => { const k = getKey(p); return { id: p.id, name: p.name, has: !!k, hint: k ? k.slice(0, 4) + '…' + k.slice(-4) : '' }; });
  return { custom: list.some((x) => x.has), hint: list.filter((x) => x.has).map((x) => x.name + ' ' + x.hint).join(', '), providers: list, voice: list.find((x) => x.id === 'groq').has };
}
/* Gemini accepte aussi l'en-tête x-goog-api-key (nécessaire pour les nouvelles clés « AQ. ») */
const authH = (p) => { const k = getKey(p); return p.id === 'gemini' ? { Authorization: 'Bearer ' + k, 'x-goog-api-key': k } : { Authorization: 'Bearer ' + k }; };
const withKeys = () => PROVIDERS.filter((p) => getKey(p));

async function listModels(p) {
  const c = C(p);
  if (c.ids && Date.now() - c.at < 3600000) return c.ids;
  const r = await net.fetch(p.base + '/models', { headers: authH(p) });
  if (!r.ok) throw Object.assign(new Error('models'), { status: r.status });
  const j = await r.json();
  c.ids = ((j && j.data) || []).map((m) => String(m.id || '').replace(/^models\//, '')); c.at = Date.now();
  return c.ids;
}
async function pickModel(p, exclude) {
  exclude = exclude || [];
  try {
    const ids = await listModels(p);
    const f = p.preferred.find((m) => ids.includes(m) && !exclude.includes(m));
    if (f) return f;
    return ids.find((m) => !p.skip.test(m) && !exclude.includes(m)) || null;
  } catch (e) { return p.preferred.find((m) => !exclude.includes(m)) || null; }
}

async function post(p, body) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await net.fetch(p.base + '/chat/completions', { method: 'POST', headers: Object.assign(authH(p), { 'Content-Type': 'application/json' }), body: JSON.stringify(body), signal: ctl.signal });
    let j = null; try { j = await r.json(); } catch (e) { /* réponse vide */ }
    if (Array.isArray(j)) j = j[0];
    /* délai conseillé : en-tête Retry-After ou « retryDelay: "23s" » de Google */
    let wait = Number(r.headers.get('retry-after')) || 0;
    const rd = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(JSON.stringify(j || {}));
    if (rd) wait = Math.max(wait, Math.ceil(Number(rd[1])));
    return { status: r.status, ok: r.ok, json: j, retryAfter: wait };
  } finally { clearTimeout(to); }
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
/* Fournisseur bloqué pour la journée (quota quotidien atteint) ou quelques secondes (limite par minute) */
const blocked = {};
const isBlocked = (p) => blocked[p.id] && blocked[p.id] > Date.now();

/* Gemini (modèles récents) refuse un appel d'outil sans thought_signature : ceux produits par une autre IA
   reçoivent la valeur neutre prévue par Google ; les autres IA ne reçoivent pas ce champ. */
function withSignatures(messages) {
  return messages.map((m) => {
    if (m.role !== 'assistant' || !Array.isArray(m.tool_calls) || !m.tool_calls.length) return m;
    return Object.assign({}, m, { tool_calls: m.tool_calls.map((t) => (t.extra_content && t.extra_content.google && t.extra_content.google.thought_signature) ? t
      : Object.assign({}, t, { extra_content: { google: { thought_signature: 'skip_thought_signature_validator' } } })) });
  });
}
function stripSignatures(messages) {
  return messages.map((m) => (m.role === 'assistant' && Array.isArray(m.tool_calls)) ? Object.assign({}, m, { tool_calls: m.tool_calls.map((t) => { const x = Object.assign({}, t); delete x.extra_content; return x; }) }) : m);
}

/* ---------- Taille des requêtes ---------- */
const estTokens = (x) => Math.ceil(JSON.stringify(x || '').length / 3.2);
/* Réduit la conversation sous un budget de jetons : résultats d'outils raccourcis, puis anciens messages retirés. */
function shrink(messages, budget) {
  let m = messages.map((x) => Object.assign({}, x));
  const cut = (n) => m.forEach((x) => { if (x.role === 'tool' && String(x.content).length > n) x.content = String(x.content).slice(0, n) + '…[tronqué]'; });
  for (const n of [6000, 3000, 1500, 800]) { if (estTokens(m) <= budget) return m; cut(n); }
  /* retire les plus anciens échanges (on garde le système et la dernière question) */
  const lastUser = () => { for (let i = m.length - 1; i >= 0; i--) if (m[i].role === 'user') return i; return m.length - 1; };
  while (estTokens(m) > budget) {
    const i = m.findIndex((x, k) => k > 0 && k < lastUser() && x.role !== 'system');
    if (i < 0) break;
    m.splice(i, 1);
  }
  /* un message d'outil ne doit pas rester sans l'appel qui l'a demandé */
  m = m.filter((x, k) => x.role !== 'tool' || m.slice(0, k).some((y) => y.tool_calls && y.tool_calls.some((t) => t.id === x.tool_call_id)));
  if (estTokens(m) > budget && m[0] && m[0].role === 'system') {
    const s = String(m[0].content), keep = Math.max(2000, Math.round((budget - estTokens(m.slice(1))) * 3.2));
    if (s.length > keep) m[0] = { role: 'system', content: s.slice(0, keep) + '\n…[contexte raccourci : utilise les outils pour le reste]' };
  }
  return m;
}

/* ---------- Suivi de l'utilisation (jetons) ---------- */
const usageFile = () => path.join(app.getPath('userData'), 'titan-usage.json');
let usageData = null;
function loadUsage() {
  if (usageData) return usageData;
  try { usageData = JSON.parse(fs.readFileSync(usageFile(), 'utf8')); } catch (e) { usageData = null; }
  if (!usageData || typeof usageData.days !== 'object') usageData = { since: Date.now(), days: {} };
  return usageData;
}
let usageTimer = null;
function record(p, model, u, messages, msg) {
  const d = loadUsage(), now = new Date();
  const day = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const inT = Number(u && (u.prompt_tokens || u.input_tokens)) || estTokens(messages);
  const outT = Number(u && (u.completion_tokens || u.output_tokens)) || estTokens(msg);
  const e = ((d.days[day] = d.days[day] || {})[p.id] = d.days[day][p.id] || { req: 0, in: 0, out: 0, models: {} });
  e.req++; e.in += inT; e.out += outT; e.models[model] = (e.models[model] || 0) + inT + outT;
  d.last = { at: Date.now(), provider: p.name, model, in: inT, out: outT };
  const keys = Object.keys(d.days).sort(); while (keys.length > 120) delete d.days[keys.shift()];
  clearTimeout(usageTimer);
  usageTimer = setTimeout(() => { try { fs.writeFileSync(usageFile(), JSON.stringify(d)); } catch (e2) { /* disque plein ? */ } }, 500);
}
/* Incidents récents (affichés dans Réglages pour comprendre un échec) */
function incident(p, model, kind, detail) {
  const d = loadUsage();
  d.errors = (d.errors || []).concat([{ at: Date.now(), provider: p ? p.name : '', model: model || '', kind, detail: String(detail || '').slice(0, 220) }]).slice(-25);
  clearTimeout(usageTimer);
  usageTimer = setTimeout(() => { try { fs.writeFileSync(usageFile(), JSON.stringify(d)); } catch (e2) { /* rien */ } }, 500);
}
function usage() { const d = loadUsage(); return { since: d.since, days: d.days, last: d.last || null, errors: (d.errors || []).slice().reverse(), blocked: Object.keys(blocked).filter((k) => blocked[k] > Date.now()).map((k) => ({ id: k, until: blocked[k] })), providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, has: !!getKey(p), model: C(p).model })) }; }
function resetUsage() { usageData = { since: Date.now(), days: {} }; try { fs.writeFileSync(usageFile(), JSON.stringify(usageData)); } catch (e) { return false; } return true; }

/* Un fournisseur : renvoie {ok,...}, ou {next:true} pour passer au suivant */
async function chatWith(p, messages, tools) {
  const c = C(p);
  if (!c.model) c.model = await pickModel(p);
  const tried = [];
  let shrinks = 0, netRetry = false, waited = 0, noReason = false;
  for (let attempt = 0; attempt < 8 && c.model; attempt++) {
    const body = { model: c.model, messages: p.id === 'gemini' ? withSignatures(messages) : stripSignatures(messages), temperature: 0.2 };
    if (p.id === 'gemini') body.max_tokens = 3000; else body.max_completion_tokens = 3000;
    if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
    if (/gpt-oss/.test(c.model)) body.reasoning_effort = 'medium';
    if (p.id === 'gemini' && /gemini-2\.5-flash$|flash-latest/.test(c.model)) body.reasoning_effort = 'low';
    if (noReason) delete body.reasoning_effort; /* réfléchit moins = moins de jetons et plus rapide */
    let r;
    try { r = await post(p, body); }
    catch (e) {
      /* coupure réseau ou délai dépassé : un nouvel essai avant de passer à l'IA suivante */
      if (!netRetry) { netRetry = true; await sleep(1500); attempt--; continue; }
      incident(p, c.model, 'réseau', e && e.name === 'AbortError' ? 'pas de réponse en 90 s' : (e && e.message) || 'connexion impossible');
      return { next: true, error: 'network', why: p.name + ' injoignable' };
    }
    if (r.ok && r.json && r.json.choices && r.json.choices[0]) {
      const msg = r.json.choices[0].message || {};
      delete msg.reasoning; delete msg.reasoning_content;
      if (msg.content == null && !(msg.tool_calls && msg.tool_calls.length)) msg.content = '';
      record(p, c.model, r.json.usage, messages, msg);
      return { ok: true, message: msg, provider: p.id, model: p.name + ' · ' + c.model, usage: r.json.usage || null };
    }
    const err = (r.json && r.json.error) || {};
    const txt = String(err.message || '') + ' ' + String(err.code || err.type || err.status || '');
    if (r.status === 401 || (r.status === 403 && /key|permission/i.test(txt)) || (r.status === 400 && /API_KEY_INVALID|api key not valid|valid API key|invalid api key|invalid auth key/i.test(txt))) {
      incident(p, c.model, 'clé refusée', err.message || r.status);
      return { next: true, error: 'key', why: 'clé ' + p.name + ' refusée' };
    }
    if (r.status === 413 || /too large|tokens per minute|TPM|context.length|context_length|maximum context/i.test(txt)) {
      /* D'abord on compresse la conversation à la taille permise, puis seulement on change de modèle */
      const lim = Number((/Limit\s+(\d+)/i.exec(txt) || [])[1]) || 0;
      if (shrinks < 2) { shrinks++; messages = shrink(messages, Math.round((lim || 6000) * (shrinks === 1 ? 0.8 : 0.6)) - estTokens(tools)); continue; }
      tried.push(c.model); c.model = await pickModel(p, tried); continue;
    }
    if (r.status === 429) {
      const daily = /per.?day|PerDay|daily|quota.*(day|jour)|RPD|TPD/i.test(txt);
      incident(p, c.model, daily ? 'quota du jour atteint' : 'limite par minute', err.message || '429');
      /* limite par minute : on attend le délai conseillé (jusqu'à 25 s au total) puis on réessaie le même modèle */
      if (!daily && r.retryAfter && waited + r.retryAfter <= 25) { waited += r.retryAfter; await sleep(r.retryAfter * 1000 + 300); continue; }
      if (!daily && !r.retryAfter && waited < 8) { waited += 4; await sleep(4000); continue; }
      tried.push(c.model); c.model = await pickModel(p, tried);
      if (!c.model) { blocked[p.id] = Date.now() + (daily ? 3 * 3600000 : 60000); c.model = null; return { next: true, error: 'busy', why: p.name + (daily ? ' : quota du jour atteint' : ' : trop de demandes par minute') }; }
      continue;
    }
    if (r.status === 400 && /reasoning/i.test(txt) && body.reasoning_effort && !noReason) { noReason = true; continue; }
    if (r.status === 404 || (r.status === 400 && /model_not_found|decommissioned|not found|not supported/i.test(txt))) {
      tried.push(c.model); c.ids = null; c.model = await pickModel(p, tried); continue;
    }
    if (r.status === 400 && /tool|function/i.test(txt) && attempt < 2) continue;
    if (r.status >= 500) {
      /* « high demand » : un nouvel essai, puis un autre modèle du même fournisseur, puis l'IA suivante */
      if (attempt < 1) { await sleep(2000); continue; }
      incident(p, c.model, 'modèle surchargé', err.message || r.status);
      tried.push(c.model); c.model = await pickModel(p, tried);
      if (c.model) continue;
      c.model = null;
      return { next: true, error: 'server', why: p.name + ' surchargé' };
    }
    /* Autre refus : on note l'erreur et on laisse sa chance à l'IA suivante */
    incident(p, c.model, 'erreur ' + r.status, err.message || '');
    return { next: true, error: 'api', why: p.name + ' : ' + String(err.message || r.status).slice(0, 160), detail: (p.name + ' : ' + String(err.message || r.status)).slice(0, 300), status: r.status };
  }
  c.model = null;
  return { next: true, error: 'busy', why: p.name + ' : tous les modèles sont saturés' };
}

async function chat(payload) {
  const list = withKeys();
  if (!list.length) return { ok: false, error: 'nokey' };
  const messages = (payload && payload.messages) || [];
  const tools = payload && payload.tools;
  /* les IA bloquées passent en dernier (au cas où le blocage serait levé) */
  let order = list.filter((p) => !isBlocked(p)).concat(list.filter(isBlocked));
  /* pendant une même question, on garde l'IA qui a déjà commencé à répondre */
  const pref = payload && payload.prefer && order.find((p) => p.id === payload.prefer);
  if (pref) order = [pref].concat(order.filter((p) => p !== pref));
  const why = [];
  let last = null, keyErr = 0;
  for (const p of order) {
    const r = await chatWith(p, messages, tools);
    if (!r.next) { if (r.ok) delete blocked[p.id]; return r; }
    last = r; why.push(r.why || p.name); if (r.error === 'key') keyErr++;
  }
  if (keyErr === list.length) return { ok: false, error: 'key', detail: why.join(' ; ') };
  const allNet = why.length && order.length && last && last.error === 'network' && why.every((w) => /injoignable/.test(w));
  return { ok: false, error: allNet ? 'network' : last && last.error === 'api' ? 'api' : 'busy', detail: why.join(' ; '), providers: list.length };
}

async function ping() {
  const list = withKeys();
  if (!list.length) return { ok: false, error: 'nokey' };
  let err = 'network';
  for (const p of list) {
    try { await listModels(p); const c = C(p); if (!c.model) c.model = await pickModel(p); return { ok: true, model: p.name + ' · ' + c.model }; }
    catch (e) { if (e && (e.status === 401 || e.status === 403 || e.status === 400)) err = 'key'; }
  }
  return { ok: false, error: err };
}

/* Message vocal : transcription Whisper (Groq), envoi multipart construit à la main */
async function transcribe(data, mime) {
  const key = getKey(prov('groq'));
  if (!key) return { ok: false, error: 'nokey' };
  const buf = Buffer.from(data || []);
  if (buf.length < 1200) return { ok: false, error: 'short' };
  if (buf.length > 24 * 1024 * 1024) return { ok: false, error: 'long' };
  mime = String(mime || 'audio/webm').split(';')[0];
  const ext = /ogg/.test(mime) ? 'ogg' : /mp4|m4a|aac/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : 'webm';
  const prompt = 'Titan, Mon Carnet, Sarool, cours, convocation, examen, permis, leçon de conduite, rendez-vous, tâche.';
  for (const mdl of WHISPER) {
    const b = '----carnet' + Date.now().toString(16) + Math.random().toString(16).slice(2);
    const field = (n, v) => Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="' + n + '"\r\n\r\n' + v + '\r\n');
    const body = Buffer.concat([field('model', mdl), field('language', 'fr'), field('response_format', 'json'), field('temperature', '0'), field('prompt', prompt),
      Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="file"; filename="vocal.' + ext + '"\r\nContent-Type: ' + mime + '\r\n\r\n'), buf, Buffer.from('\r\n--' + b + '--\r\n')]);
    let r;
    try { r = await net.fetch(API + '/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'multipart/form-data; boundary=' + b }, body }); }
    catch (e) { return { ok: false, error: 'network' }; }
    let j = null; try { j = await r.json(); } catch (e) { /* vide */ }
    if (r.ok && j) return { ok: true, text: String(j.text || '').trim(), model: mdl };
    if (r.status === 401) return { ok: false, error: 'key' };
    if (r.status === 404 || r.status === 400 && /model/i.test(JSON.stringify(j || {}))) continue;
    if (r.status === 429) return { ok: false, error: 'busy' };
    return { ok: false, error: 'api', detail: String((j && j.error && j.error.message) || r.status).slice(0, 200) };
  }
  return { ok: false, error: 'api' };
}

module.exports = { chat, setKey, keyInfo, ping, transcribe, usage, resetUsage };
