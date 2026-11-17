"use strict";
/* Mon Carnet : messages vocaux pour Titan.
   Micro → enregistrement (onde en direct, arrêt auto après un silence) → transcription Whisper (Groq) → envoi à Titan.
   Les réponses peuvent être lues à voix haute (voix françaises de Windows, hors ligne). */

var VOICE={state:"idle",rec:null,stream:null,chunks:[],mime:"",t0:0,ctx:null,an:null,raf:0,tick:0,heard:false,quietSince:0,peak:0,target:"drawer",cancelled:false};
var VOICE_MAX=120000,VOICE_SILENCE=1800;
function voiceOk(){return !!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder&&fileApi&&fileApi.aiTranscribe);}
function voiceRefresh(){if(typeof titanRefresh==="function")titanRefresh();var q=document.getElementById("quick-mic");if(q){q.classList.toggle("rec",VOICE.state==="rec");q.classList.toggle("busy",VOICE.state==="busy");}}
function voiceErr(e){var n=e&&e.name||"";
  if(n==="NotAllowedError"||n==="SecurityError")return "Le micro est bloqué : Paramètres Windows > Confidentialité > Microphone > autorise les applications de bureau.";
  if(n==="NotFoundError"||n==="OverconstrainedError")return "Aucun micro détecté.";
  if(n==="NotReadableError")return "Le micro est utilisé par une autre application.";
  return "Impossible d'utiliser le micro.";}
function voiceStart(target){
  if(VOICE.state!=="idle")return;
  if(!voiceOk()){toast("Les messages vocaux fonctionnent uniquement dans l'application.");return;}
  if(S.titan.busy){toast("Titan répond encore, un instant…");return;}
  speakStop();VOICE.target=target||"drawer";VOICE.state="asking";VOICE.cancelled=false;voiceRefresh();
  navigator.mediaDevices.getUserMedia(window.__voiceRaw?{audio:true}:{audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}}).then(function(stream){
    if(VOICE.state!=="asking"){stream.getTracks().forEach(function(t){t.stop();});return;}
    VOICE.stream=stream;VOICE.chunks=[];VOICE.heard=false;VOICE.quietSince=0;VOICE.peak=0;VOICE.floor=1;
    VOICE.mime=["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"].filter(function(m){return MediaRecorder.isTypeSupported(m);})[0]||"";
    var rec=new MediaRecorder(stream,VOICE.mime?{mimeType:VOICE.mime,audioBitsPerSecond:32000}:{});VOICE.rec=rec;
    rec.ondataavailable=function(ev){if(ev.data&&ev.data.size)VOICE.chunks.push(ev.data);};
    rec.onstop=voiceFinish;
    try{VOICE.ctx=new (window.AudioContext||window.webkitAudioContext)();if(VOICE.ctx.state==='suspended')VOICE.ctx.resume();var src=VOICE.ctx.createMediaStreamSource(stream);VOICE.an=VOICE.ctx.createAnalyser();VOICE.an.fftSize=512;VOICE.an.smoothingTimeConstant=.6;src.connect(VOICE.an);}catch(e){VOICE.an=null;}
    if(!VOICE.an)VOICE.heard=true; /* sans analyseur, on ne peut pas juger : on envoie */
    rec.start(250);VOICE.t0=Date.now();VOICE.state="rec";voiceRefresh();voiceLoop();
  },function(e){VOICE.state="idle";voiceRefresh();toast(voiceErr(e));});
}
/* Onde en direct + détection de silence (arrêt automatique quand tu as fini de parler) */
function voiceLoop(){
  cancelAnimationFrame(VOICE.raf);
  var buf=VOICE.an?new Uint8Array(VOICE.an.fftSize):null,bars=[];
  function frame(){
    if(VOICE.state!=="rec")return;
    var now=Date.now(),lvl=0;
    if(VOICE.an){VOICE.an.getByteTimeDomainData(buf);var sum=0;for(var i=0;i<buf.length;i++){var v=(buf[i]-128)/128;sum+=v*v;}lvl=Math.sqrt(sum/buf.length);}
    VOICE.peak=Math.max(VOICE.peak*.97,lvl);
    if(VOICE.an){VOICE.floor=Math.min(VOICE.floor*1.002+0.00005,Math.max(lvl,0.002));}
    var thr=Math.max(0.012,(VOICE.floor||0)*2.6+0.008);
    if(lvl>thr){VOICE.heard=true;VOICE.quietSince=0;}else if(VOICE.heard){if(!VOICE.quietSince)VOICE.quietSince=now;else if(now-VOICE.quietSince>VOICE_SILENCE&&S.settings.voixAuto!==false){voiceStop();return;}}
    if(now-VOICE.t0>VOICE_MAX){voiceStop();return;}
    bars.push(Math.min(1,lvl*5));if(bars.length>64)bars.shift();
    Array.prototype.forEach.call(document.querySelectorAll(".rec-wave"),function(cv){
      var w=cv.clientWidth,h=cv.clientHeight,dpr=window.devicePixelRatio||1;if(!w)return;
      if(cv.width!==Math.round(w*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);}
      var g=cv.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
      var n=bars.length,bw=w/64,col=getComputedStyle(cv).color;g.fillStyle=col;
      for(var j=0;j<n;j++){var bh=Math.max(2,bars[j]*h);var x=w-(n-j)*bw;g.globalAlpha=.35+.65*(j/n);if(g.roundRect){g.beginPath();g.roundRect(x+1,(h-bh)/2,Math.max(1.5,bw-2),bh,1.5);g.fill();}else g.fillRect(x+1,(h-bh)/2,Math.max(1.5,bw-2),bh);}
      g.globalAlpha=1;});
    if(now-VOICE.tick>250){VOICE.tick=now;Array.prototype.forEach.call(document.querySelectorAll(".rec-time"),function(el){var s=Math.floor((now-VOICE.t0)/1000);el.textContent=Math.floor(s/60)+":"+pad(s%60);});}
    VOICE.raf=requestAnimationFrame(frame);
  }
  VOICE.raf=requestAnimationFrame(frame);
}
function voiceRelease(){cancelAnimationFrame(VOICE.raf);try{VOICE.stream&&VOICE.stream.getTracks().forEach(function(t){t.stop();});}catch(e){}try{VOICE.ctx&&VOICE.ctx.close();}catch(e){}VOICE.stream=null;VOICE.ctx=null;VOICE.an=null;}
function voiceStop(){if(VOICE.state==="asking"){VOICE.state="idle";voiceRefresh();return;}if(VOICE.state!=="rec"||!VOICE.rec)return;VOICE.state="busy";voiceRefresh();try{VOICE.rec.stop();}catch(e){voiceFinish();}}
function voiceCancel(){if(VOICE.state==="rec"){VOICE.cancelled=true;VOICE.state="busy";try{VOICE.rec.stop();}catch(e){}}else if(VOICE.state==="asking")VOICE.state="idle";voiceRelease();VOICE.state="idle";voiceRefresh();}
function voiceFinish(){
  var dur=Date.now()-VOICE.t0,heard=VOICE.heard,chunks=VOICE.chunks,mime=VOICE.mime||"audio/webm";voiceRelease();VOICE.rec=null;
  if(VOICE.cancelled){VOICE.cancelled=false;VOICE.state="idle";voiceRefresh();return;}
  if(dur<600||!chunks.length||!heard){VOICE.state="idle";voiceRefresh();toast(heard?"Message trop court.":"Je n'ai rien entendu : vérifie ton micro.");return;}
  new Blob(chunks,{type:mime}).arrayBuffer().then(function(ab){return fileApi.aiTranscribe(new Uint8Array(ab),mime);}).then(function(r){
    VOICE.state="idle";
    if(r&&r.ok&&r.text){voiceRefresh();if(VOICE.target==="quick")openTitan(null);titanAsk(r.text,{voice:true});return;}
    voiceRefresh();
    toast(r&&r.error==="key"||r&&r.error==="nokey"?"Ajoute une clé Groq valide (Réglages > Titan AI) pour les messages vocaux.":r&&r.error==="network"?"Pas de connexion pour transcrire le message.":r&&r.error==="busy"?"Service vocal saturé, réessaie dans un instant.":r&&r.ok?"Je n'ai pas compris, réessaie.":"La transcription a échoué.");
  },function(){VOICE.state="idle";voiceRefresh();toast("La transcription a échoué.");});
}
function voiceToggle(target){if(VOICE.state==="idle")voiceStart(target);else if(VOICE.state==="rec")voiceStop();}

/* ---------- Lecture à voix haute ---------- */
var SPEAK={on:false,voice:null};
function frVoice(){if(SPEAK.voice)return SPEAK.voice;var vs=(window.speechSynthesis&&speechSynthesis.getVoices())||[];
  var fr=vs.filter(function(v){return /^fr/i.test(v.lang);});SPEAK.voice=fr.filter(function(v){return /denise|henri|vivienne|remy|hortense|julie|paul/i.test(v.name);})[0]||fr[0]||null;return SPEAK.voice;}
if(window.speechSynthesis)speechSynthesis.onvoiceschanged=function(){SPEAK.voice=null;};
function plainForSpeech(md){return String(md||"").replace(/```[\s\S]*?```/g," ").replace(/\|/g,", ").replace(/[*_`#>]+/g,"").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/(\d{1,2})h(\d{2})/g,"$1 heures $2").replace(/(\d{1,2})h\b/g,"$1 heures").replace(/–|—/g,", ").replace(/\n+/g,". ").replace(/\s+/g," ").trim().slice(0,1800);}
function speak(text){
  if(!window.speechSynthesis)return;speakStop();var t=plainForSpeech(text);if(!t)return;
  var parts=t.match(/[^.!?]+[.!?]*/g)||[t];SPEAK.on=true;titanSpeakUi();
  parts.forEach(function(p,i){var u=new SpeechSynthesisUtterance(p.trim());u.lang="fr-FR";var v=frVoice();if(v)u.voice=v;u.rate=1.05;
    if(i===parts.length-1){u.onend=u.onerror=function(){SPEAK.on=false;titanSpeakUi();};}speechSynthesis.speak(u);});
}
function speakStop(){try{if(window.speechSynthesis)speechSynthesis.cancel();}catch(e){}if(SPEAK.on){SPEAK.on=false;titanSpeakUi();}}
function titanSpeakUi(){Array.prototype.forEach.call(document.querySelectorAll(".speak-stop"),function(b){b.hidden=!SPEAK.on;});}
/* Faut-il lire cette réponse ? réglage : "vocal" (après un message vocal), "toujours", "jamais" */
function shouldSpeak(fromVoice){var m=S.settings.voixLecture||"vocal";return m==="toujours"||(m==="vocal"&&fromVoice);}

ACTS["voice-toggle"]=function(t){voiceToggle(t.getAttribute("data-target")||"drawer");};
ACTS["voice-cancel"]=function(){voiceCancel();};
ACTS["voice-stop"]=function(){voiceStop();};
ACTS["speak-stop"]=function(){speakStop();};
document.addEventListener("keydown",function(e){if(VOICE.state==="rec"&&e.key==="Escape"){e.preventDefault();e.stopPropagation();voiceCancel();}else if(VOICE.state==="rec"&&e.key==="Enter"){e.preventDefault();e.stopPropagation();voiceStop();}},true);
