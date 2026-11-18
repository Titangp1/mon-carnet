/* Voix naturelle de Titan : synthèse vocale Gemini (voix humaines, français compris), avec la clé Gemini.
   Renvoie un WAV en base64 ; si Gemini refuse, l'interface repasse sur la voix de Windows. */
const { net } = require('electron');

const BASE = process.env.CARNET_GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta';
/* modèles essayés dans l'ordre (le plus rapide d'abord) ; on retient celui qui marche */
const MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts'];
let good = null, pausedUntil = 0;

function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
/* cherche le premier bloc audio (base64) dans une réponse, quel que soit son format */
function findAudio(o, depth) {
  if (!o || typeof o !== 'object' || depth > 8) return null;
  const mime = o.mime_type || o.mimeType || '';
  if (typeof o.data === 'string' && o.data.length > 200 && (!mime || /audio|l16|pcm|wav/i.test(mime))) return { data: o.data, mime };
  for (const k of Object.keys(o)) { const r = findAudio(o[k], (depth || 0) + 1); if (r) return r; }
  return null;
}
function toWav(a) {
  const buf = Buffer.from(a.data, 'base64');
  if (buf.slice(0, 4).toString() === 'RIFF') return buf.toString('base64');
  const rate = Number((/rate=(\d+)/.exec(a.mime) || [])[1]) || 24000;
  return wav(buf, rate).toString('base64');
}
async function postJson(url, key, body) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await net.fetch(url, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    let j = null; try { j = await r.json(); } catch (e) { /* vide */ }
    return { status: r.status, ok: r.ok, json: j };
  } finally { clearTimeout(to); }
}
async function tryModel(model, key, text, voice, style) {
  /* nouvelle API « interactions » */
  let r = await postJson(BASE + '/interactions', key, {
    model, input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }],
    response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] }
  });
  let a = r.ok && findAudio(r.json, 0);
  if (a) return { ok: true, data: toWav(a) };
  if (r.status === 401 || r.status === 403 || r.status === 429) return { ok: false, status: r.status, msg: r.json && r.json.error && r.json.error.message };
  /* ancienne API generateContent */
  r = await postJson(BASE + '/models/' + model + ':generateContent', key, {
    contents: [{ parts: [{ text: 'Dis en français, de façon ' + style + ' : ' + text }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
  });
  a = r.ok && findAudio(r.json, 0);
  if (a) return { ok: true, data: toWav(a) };
  return { ok: false, status: r.status, msg: r.json && r.json.error && r.json.error.message };
}
async function speakText(key, text, voice, style) {
  if (!key) return { ok: false, error: 'nokey' };
  if (Date.now() < pausedUntil) return { ok: false, error: 'busy' };
  text = String(text || '').slice(0, 1200);
  if (!text.trim()) return { ok: false, error: 'empty' };
  voice = voice || 'Kore'; style = style || 'naturelle, chaleureuse et posée';
  const list = good ? [good].concat(MODELS.filter((m) => m !== good)) : MODELS;
  let last = null;
  for (const m of list) {
    let r;
    try { r = await tryModel(m, key, text, voice, style); } catch (e) { return { ok: false, error: 'network' }; }
    if (r.ok) { good = m; return { ok: true, mime: 'audio/wav', data: r.data, model: m }; }
    last = r;
    if (r.status === 401 || r.status === 403 || (r.status === 400 && /key/i.test(r.msg || ''))) return { ok: false, error: 'key', detail: r.msg };
    if (r.status === 429) { pausedUntil = Date.now() + 60000; return { ok: false, error: 'busy', detail: r.msg }; }
  }
  return { ok: false, error: 'api', detail: last && (last.msg || last.status) };
}
module.exports = { speakText };
