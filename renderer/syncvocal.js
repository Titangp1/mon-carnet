/* Mon Carnet : synchronisation de tout d'un clic (Agenda) et mode vocal continu avec Titan. */

/* ---------- Tout synchroniser ---------- */
var SYNC={busy:false,at:0};
function syncAll(manual){
  if(SYNC.busy)return Promise.resolve();
  SYNC.busy=true;if(manual)render();
  var jobs=[];
  if(typeof syncCours==="function"&&S.settings.modEcole!==false)jobs.push(syncCours(false).then(function(r){return r&&r.error==="nourl"?null:["Emploi du temps",r&&r.ok];}));
  if(S.settings.saroolOn&&S.settings.modConduite!==false){
    jobs.push(syncPermis(false).then(function(r){return ["Planning de conduite",r&&r.ok];}));
    if(typeof permisCycle==="function")jobs.push(Promise.resolve(permisCycle(false)).then(function(){return ["Agenda Sarool",!S.sarool.err];}));}
  if(typeof syncMail==="function"&&S.mail&&S.mail.account)jobs.push(Promise.resolve(syncMail(false)).then(function(){return ["Mails",!S.mail.err];}));
  return Promise.all(jobs.map(function(p){return p.catch(function(){return ["?",false];});})).then(function(res){res=res.filter(Boolean);
    SYNC.busy=false;SYNC.at=Date.now();render();
    if(manual){var bad=res.filter(function(x){return !x[1];}).map(function(x){return x[0];});
      toast(!res.length?"Rien à synchroniser : relie tes services dans Réglages.":bad.length?"Synchronisé, sauf : "+bad.join(", "):"Tout est à jour ✓");}
  });
}
ACTS["sync-all"]=function(){syncAll(true);};
/* quand tu reviens sur l'appli après 3 minutes ou plus, on resynchronise tout seul */
window.addEventListener("focus",function(){if(S.ready&&Date.now()-SYNC.at>3*60*1000)syncAll(false);});
document.addEventListener("visibilitychange",function(){if(!document.hidden&&S.ready&&Date.now()-SYNC.at>3*60*1000)syncAll(false);});
function syncBtn(){return '<button class="btn" type="button" data-act="sync-all"'+(SYNC.busy?" disabled":"")+' title="Emploi du temps, conduite et mails">'+(SYNC.busy?'<span class="spin"></span>Synchronisation…':icon("refresh")+'Synchroniser')+'</button>';}

/* ---------- Mode vocal : on parle, Titan répond à voix haute, et ça repart ---------- */
var VM={on:false,queued:"",pending:0,wasBusy:false,timer:0,raf:0,lastHeard:""};
function vmPhase(){
  if(VOICE.state==="asking")return ["listen","J'ouvre le micro…"];
  if(VOICE.state==="rec")return ["listen","Je t'écoute…"];
  if(VOICE.state==="busy")return ["think","Je transcris…"];
  if(S.titan.busy)return ["think",S.titan.step||"Je réfléchis…"];
  if(SPEAK.on||VM.pending)return ["speak","Je réponds… (touche pour m'interrompre)"];
  return ["idle","…"];
}
function vmLastText(role){for(var i=S.titan.msgs.length-1;i>=0;i--)if(S.titan.msgs[i].role===role)return String(S.titan.msgs[i].content||"");return "";}
function vmDraw(){
  var el=document.getElementById("vm");if(!el)return;var ph=vmPhase();
  el.setAttribute("data-phase",ph[0]);
  el.querySelector(".vm-state").textContent=ph[1];
  var you=VOICE.state==="rec"?"":vmLastText("user"),ai=S.titan.busy?(S.titan.live||""):vmLastText("assistant");
  el.querySelector(".vm-you").textContent=you?"Toi : "+you:"";
  el.querySelector(".vm-ai").textContent=ai?plainForSpeech(ai).slice(-420):"";
}
function vmOpen(){
  if(!voiceOk()){toast("Le mode vocal fonctionne uniquement dans l'application.");return;}
  if(S.titanKey&&S.titanKey.voice===false){toast("Le mode vocal a besoin d'une clé Groq (gratuite) pour comprendre ta voix : Réglages > Titan AI.");return;}
  if(VM.on)return;VM.on=true;VM.queued="";VM.pending=0;
  var el=document.createElement("div");el.id="vm";el.className="vm";el.setAttribute("role","dialog");el.setAttribute("aria-label","Mode vocal avec Titan");
  el.innerHTML='<div class="vm-top"><span class="vm-badge">'+icon("sparkle")+'Mode vocal</span><button class="btn ghost" type="button" data-act="vm-close">'+icon("x")+'Terminer</button></div>'+
    '<button class="vm-orb" type="button" data-act="vm-tap" aria-label="Parler ou interrompre"><span class="vm-ring"></span><span class="vm-core"></span></button>'+
    '<p class="vm-state" role="status" aria-live="polite"></p><p class="vm-you"></p><p class="vm-ai"></p>'+
    '<p class="vm-hint">Parle normalement : Titan envoie quand tu te tais, répond à voix haute, puis t\'écoute à nouveau. Échap pour quitter.</p>';
  document.body.appendChild(el);
  if(S.ui.view!=="titan"&&!S.titan.open)openTitan(null);
  VM.timer=setInterval(vmTick,250);vmLoopLevel();vmTick();
}
function vmClose(){if(!VM.on)return;VM.on=false;clearInterval(VM.timer);cancelAnimationFrame(VM.raf);if(VOICE.state==="rec"||VOICE.state==="asking")voiceCancel();speakStop();VM.pending=0;var el=document.getElementById("vm");if(el)el.remove();}
/* machine à états : écoute → réflexion → réponse parlée → écoute */
function vmTick(){
  if(!VM.on)return;
  if(VM.wasBusy&&!S.titan.busy){ /* fin de la réponse : on lit ce qui reste */
    var full=vmLastText("assistant"),rest=full.indexOf(VM.queued)===0?full.slice(VM.queued.length):(VM.queued?"":full);
    VM.queued="";if(rest.trim())vmSay(rest);}
  VM.wasBusy=S.titan.busy;
  var speaking=SPEAK.on||VM.pending||(window.speechSynthesis&&speechSynthesis.speaking);
  if(VOICE.state==="idle"&&!S.titan.busy&&!speaking)voiceStart(S.ui.view==="titan"?"page":"drawer");
  vmDraw();
}
/* lecture phrase par phrase pendant que la réponse s'écrit : Titan commence à parler tout de suite */
function vmSay(text){
  if(!window.speechSynthesis)return;var t=plainForSpeech(text);if(!t.trim())return;
  (t.match(/[^.!?…\n]+[.!?…\n]*/g)||[t]).forEach(function(p){p=p.trim();if(!p)return;
    var u=new SpeechSynthesisUtterance(p);u.lang="fr-FR";var v=frVoice();if(v)u.voice=v;u.rate=1.08;VM.pending++;SPEAK.on=true;
    u.onend=u.onerror=function(){VM.pending=Math.max(0,VM.pending-1);if(!VM.pending){SPEAK.on=false;titanSpeakUi();}};speechSynthesis.speak(u);});
  titanSpeakUi();
}
if(fileApi&&fileApi.onAiDelta)fileApi.onAiDelta(function(x){
  if(!VM.on||!x||x.id!==S.titan.streamId)return;
  if(x.d===null){VM.queued="";return;}
  setTimeout(function(){ /* après la mise à jour de S.titan.live */
    var live=S.titan.live||"";if(live.indexOf(VM.queued)!==0){VM.queued="";}
    var rest=live.slice(VM.queued.length),m=rest.match(/^[\s\S]*[.!?…\n](?=\s|$)/);
    if(m&&m[0].trim().length>2){VM.queued+=m[0];vmSay(m[0]);}
  },0);
});
/* en mode vocal, c'est le mode vocal qui lit les réponses */
var _shouldSpeak=shouldSpeak;shouldSpeak=function(v){return VM.on?false:_shouldSpeak(v);};
/* le cercle suit le niveau du micro */
function vmLoopLevel(){cancelAnimationFrame(VM.raf);(function f(){if(!VM.on)return;var el=document.getElementById("vm");if(el){var lv=VOICE.state==="rec"?Math.min(1,(VOICE.peak||0)*6):0;el.style.setProperty("--lv",lv.toFixed(3));}VM.raf=requestAnimationFrame(f);})();}
ACTS["vm-open"]=function(){vmOpen();};
ACTS["vm-close"]=function(){vmClose();};
ACTS["vm-tap"]=function(){if(SPEAK.on||VM.pending||(window.speechSynthesis&&speechSynthesis.speaking)){speakStop();VM.pending=0;}else if(VOICE.state==="rec")voiceStop();};
document.addEventListener("keydown",function(e){if(VM.on&&e.key==="Escape"){e.preventDefault();vmClose();}},true);
/* bouton « Mode vocal » à côté du micro */
var _titanComposer=titanComposer;
titanComposer=function(sfx){var h=_titanComposer(sfx);
  return h.replace('<button class="btn ghost icon mic-btn','<button class="btn ghost icon vm-btn" type="button" data-act="vm-open" aria-label="Mode vocal" title="Mode vocal : parler avec Titan"'+(S.titan.busy?" disabled":"")+'>'+icon("volume")+'</button><button class="btn ghost icon mic-btn');};
