/* Mon Carnet (téléphone) : remplace ce que fait le PC (fichiers, réseau, IA) par l'équivalent Android.
   Les modules main/ai.js et main/tts.js du PC sont réutilisés tels quels grâce aux petites imitations ci-dessous. */
(function(){
"use strict";
var G=window;G.CARNET_MOBILE=true;G.CARNET_NO_STREAM=true;G.process=G.process||{env:{}};
var NATIVE=function(){return G.Capacitor&&G.Capacitor.Plugins&&G.Capacitor.Plugins.CapacitorHttp;};

/* ---------- Buffer minimal (ce dont ai.js et tts.js ont besoin) ---------- */
var TE=new TextEncoder(),TD=new TextDecoder();
function b64enc(u){var s="",C=0x8000;for(var i=0;i<u.length;i+=C)s+=String.fromCharCode.apply(null,u.subarray(i,i+C));return btoa(s);}
function b64dec(s){var b=atob(String(s).replace(/[^A-Za-z0-9+/=]/g,"")),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
class Buf extends Uint8Array{
  static from(x,enc){if(typeof x==="string")return Buf.wrap(enc==="base64"?b64dec(x):TE.encode(x));if(x instanceof ArrayBuffer)return Buf.wrap(new Uint8Array(x));return Buf.wrap(Uint8Array.from(x||[]));}
  static wrap(u){var b=new Buf(u.length);b.set(u);return b;}
  static alloc(n){return new Buf(n);}
  static concat(list){var n=0;list.forEach(function(x){n+=x.length;});var b=new Buf(n),o=0;list.forEach(function(x){b.set(x,o);o+=x.length;});return b;}
  static isBuffer(x){return x instanceof Buf;}
  toString(enc){return enc==="base64"?b64enc(this):TD.decode(this);}
  write(s,off){var e=TE.encode(s);this.set(e,off||0);return e.length;}
  writeUInt32LE(v,o){new DataView(this.buffer,this.byteOffset).setUint32(o,v,true);return o+4;}
  writeUInt16LE(v,o){new DataView(this.buffer,this.byteOffset).setUint16(o,v,true);return o+2;}
  slice(a,b){return Buf.wrap(Uint8Array.prototype.slice.call(this,a,b));}
}
G.Buffer=Buf;

/* ---------- fs / path / electron imités ---------- */
var FS="mcfs:";
var fs={existsSync:function(p){return localStorage.getItem(FS+p)!==null;},
  readFileSync:function(p){var v=localStorage.getItem(FS+p);if(v===null)throw new Error("ENOENT");return v;},
  writeFileSync:function(p,d){localStorage.setItem(FS+p,typeof d==="string"?d:String(d));},
  appendFileSync:function(p,d){localStorage.setItem(FS+p,(localStorage.getItem(FS+p)||"")+d);},
  unlinkSync:function(p){localStorage.removeItem(FS+p);},renameSync:function(a,b){var v=localStorage.getItem(FS+a);if(v!==null){localStorage.setItem(FS+b,v);localStorage.removeItem(FS+a);}},
  mkdirSync:function(){},readdirSync:function(){return [];},statSync:function(){return {mtimeMs:Date.now(),isDirectory:function(){return false;}};}};
var path={join:function(){return Array.prototype.slice.call(arguments).join("/").replace(/\/+/g,"/");},extname:function(p){var m=/\.[^./]+$/.exec(p);return m?m[0]:"";}};
/* réseau : appels natifs Android (pas de blocage CORS), sinon fetch du navigateur */
function nativeFetch(url,opt){
  opt=opt||{};var H=NATIVE(),body=opt.body;
  if(!H||(body&&typeof body!=="string"))return G.fetch(url,opt);
  var data;if(typeof body==="string"){try{data=JSON.parse(body);}catch(e){data=body;}}
  return H.request({url:url,method:opt.method||"GET",headers:opt.headers||{},data:data,responseType:"text",connectTimeout:30000,readTimeout:90000}).then(function(r){
    var txt=typeof r.data==="string"?r.data:JSON.stringify(r.data),hd={};Object.keys(r.headers||{}).forEach(function(k){hd[k.toLowerCase()]=r.headers[k];});
    return {ok:r.status>=200&&r.status<300,status:r.status,headers:{get:function(k){return hd[String(k).toLowerCase()]||null;}},body:null,
      text:function(){return Promise.resolve(txt);},json:function(){return Promise.resolve(JSON.parse(txt));},
      arrayBuffer:function(){return Promise.resolve(TE.encode(txt).buffer);}};});
}
var electron={app:{getPath:function(){return "/data";},isPackaged:true,getVersion:function(){return G.MC_VERSION||"";}},net:{fetch:nativeFetch},safeStorage:{isEncryptionAvailable:function(){return false;}}};
var MODS={},SRC=G.__MC_MODULES||{};
function req(name){
  if(name==="electron")return electron;if(name==="fs")return fs;if(name==="path")return path;
  var key=name.replace(/^\.\/|^\.\.\/main\//,"").replace(/\.js$/,"");
  if(MODS[key])return MODS[key].exports;
  if(!SRC[key])throw new Error("module absent : "+name);
  var m={exports:{}};MODS[key]=m;SRC[key](m,m.exports,req);return m.exports;
}
var ai=req("ai");

/* ---------- API attendue par l'interface (comme window.carnet sur PC) ---------- */
var deltaFns=[];
function pickFile(accept){return new Promise(function(ok){var i=document.createElement("input");i.type="file";i.accept=accept||"";i.onchange=function(){var f=i.files&&i.files[0];if(!f){ok(null);return;}var r=new FileReader();r.onload=function(){ok(String(r.result));};r.onerror=function(){ok(null);};r.readAsText(f);};i.click();});}
function share(name,text){ /* sur Android, on propose « Partager » (Drive, mail…) ; sinon téléchargement */
  try{var file=new File([text],name,{type:"application/octet-stream"});if(navigator.canShare&&navigator.canShare({files:[file]}))return navigator.share({files:[file],title:name}).then(function(){return name;},function(){return null;});}catch(e){}
  var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text]));a.download=name;a.click();return Promise.resolve(name);}
G.carnet={
  mobile:true,
  load:function(){return Promise.resolve(localStorage.getItem("mc-data"));},
  save:function(t){try{localStorage.setItem("mc-data",String(t));var k="mc-backup-"+new Date().toISOString().slice(0,10);if(!localStorage.getItem(k)){localStorage.setItem(k,String(t));Object.keys(localStorage).filter(function(x){return /^mc-backup-/.test(x);}).sort().slice(0,-7).forEach(function(x){localStorage.removeItem(x);});}return Promise.resolve(true);}catch(e){return Promise.resolve(false);}},
  saveSync:function(t){try{localStorage.setItem("mc-data",String(t));return true;}catch(e){return false;}},
  exportBackup:function(t){return share("carnet-sauvegarde-"+new Date().toISOString().slice(0,10)+".json",String(t));},
  importBackup:function(){return pickFile(".json,application/json");},
  saveText:function(name,t){return share(String(name),String(t));},
  icalFetch:function(url){url=String(url||"").trim();if(!/^https:\/\//i.test(url))return Promise.resolve({ok:false,error:"url"});
    return nativeFetch(url,{headers:{"Accept":"text/calendar,*/*"}}).then(function(r){if(!r.ok)return {ok:false,error:"http",status:r.status};return r.text().then(function(t){if(!/BEGIN:VCALENDAR/.test(t))return {ok:false,error:"format"};try{localStorage.setItem("mc-ics",t);localStorage.setItem("mc-ics-at",String(Date.now()));}catch(e){}return {ok:true,text:t,at:Date.now()};});},function(){return {ok:false,error:"network"};});},
  icalCached:function(){var t=localStorage.getItem("mc-ics");return Promise.resolve(t?{text:t,at:Number(localStorage.getItem("mc-ics-at"))||Date.now()}:null);},
  invoiceFiles:function(){return Promise.resolve([]);},
  aiChat:function(p){var id=p&&p.streamId;return ai.chat(p||{},id?function(d){deltaFns.forEach(function(fn){try{fn({id:id,d:d});}catch(e){}});}:null);},
  onAiDelta:function(fn){deltaFns.push(fn);},
  aiSetKey:function(k,id){return Promise.resolve(ai.setKey(k,id));},
  aiKeyInfo:function(){return Promise.resolve(ai.keyInfo());},
  aiPing:function(){return ai.ping();},
  aiUsage:function(){return Promise.resolve(ai.usage());},
  aiResetUsage:function(){return Promise.resolve(ai.resetUsage());},
  aiSetOrder:function(o,a){return Promise.resolve(ai.setOrder(o,a));},
  aiBench:function(){return ai.bench();},
  aiTranscribe:function(data,mime){return mcTranscribe(data,mime);},
  aiTts:function(t,v,s){return ai.tts(t,v,s);},
  setPrefs:function(){return Promise.resolve(true);}
};
/* transcription (Groq Whisper) en FormData, plus simple que le multipart fait main du PC */
function mcTranscribe(data,mime){
  var info=ai.keyInfo(),g=(info.providers||[]).filter(function(p){return p.id==="groq"&&p.has;})[0];if(!g)return Promise.resolve({ok:false,error:"nokey"});
  var key="";try{var o=JSON.parse(fs.readFileSync("/data/titan-cle.json"));key=TD.decode(b64dec(o.d));}catch(e){}
  mime=String(mime||"audio/webm").split(";")[0];var fd=new FormData();fd.append("file",new Blob([data],{type:mime}),"vocal."+(/ogg/.test(mime)?"ogg":/mp4|m4a|aac/.test(mime)?"m4a":"webm"));
  fd.append("model","whisper-large-v3-turbo");fd.append("language","fr");fd.append("response_format","json");
  return G.fetch("https://api.groq.com/openai/v1/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+key},body:fd}).then(function(r){return r.json().then(function(j){
    if(r.ok&&j)return {ok:true,text:String(j.text||"").trim()};if(r.status===401)return {ok:false,error:"key"};if(r.status===429)return {ok:false,error:"busy"};return {ok:false,error:"api"};});},function(){return {ok:false,error:"network"};});
}
})();
