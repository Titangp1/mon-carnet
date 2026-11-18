/* Mon Carnet : voix naturelle pour Titan (Gemini). Les phrases sont préparées à l'avance pendant que la
   précédente est lue, pour enchaîner sans blanc. Si Gemini refuse, la voix de Windows prend le relais. */
var NV={q:[],gen:0,audio:null,playing:false,failUntil:0};
var VOIX=[["Kore","Ferme et claire"],["Aoede","Légère, naturelle"],["Sulafat","Chaleureuse"],["Achird","Amicale"],["Charon","Posée (grave)"],["Puck","Enjouée"],["Vindemiatrix","Douce"],["Iapetus","Nette"],["Orus","Assurée (grave)"],["Achernar","Calme"]];
function nvOn(){return S.settings.voixNat!==false&&fileApi&&fileApi.aiTts&&S.titanKey&&S.titanKey.providers&&S.titanKey.providers.some(function(p){return p.id==="gemini"&&p.has;})&&Date.now()>NV.failUntil;}
/* découpe en morceaux de 1 à 3 phrases (moins d'appels, voix plus fluide) */
function nvChunks(t){var parts=String(t).match(/[^.!?…\n]+[.!?…]*\s*|\n+/g)||[t],out=[],cur="";
  parts.forEach(function(p){if(!p.trim())return;if(cur&&(cur+p).length>240){out.push(cur.trim());cur="";}cur+=p;if(!out.length&&cur.length>60){out.push(cur.trim());cur="";}});
  if(cur.trim())out.push(cur.trim());return out;}
function nvBusy(){return NV.playing||NV.q.length>0;}
function nvSync(){var on=nvBusy();if(SPEAK.on!==on){SPEAK.on=on;titanSpeakUi();}}
function nvFetch(it){if(!it.p)it.p=fileApi.aiTts(it.text,S.settings.voixNom||"Kore","naturelle, chaleureuse, rythme de conversation").catch(function(){return {ok:false,error:"network"};});return it.p;}
function nvPump(){
  var g=NV.gen;if(NV.playing)return;var it=NV.q[0];if(!it){nvSync();return;}
  NV.playing=true;nvSync();
  if(NV.q[1])nvFetch(NV.q[1]); /* on prépare la suivante */
  nvFetch(it).then(function(r){
    if(g!==NV.gen)return;
    var done=function(){if(g!==NV.gen)return;NV.q.shift();NV.playing=false;NV.audio=null;nvPump();};
    if(NV.q[1])nvFetch(NV.q[1]);
    if(r&&r.ok&&r.data){var a=new Audio("data:"+(r.mime||"audio/wav")+";base64,"+r.data);NV.audio=a;a.onended=a.onerror=done;a.play().catch(done);return;}
    /* échec : voix Windows pour ce morceau, et pause de la voix naturelle une minute */
    NV.failUntil=Date.now()+60000;
    if(window.speechSynthesis){var u=new SpeechSynthesisUtterance(it.text);u.lang="fr-FR";var v=frVoice();if(v)u.voice=v;u.rate=1.05;u.onend=u.onerror=done;speechSynthesis.speak(u);}else done();
  });
}
function nvSpeak(text,append){
  var t=plainForSpeech(text);if(!t.trim())return;
  if(!append)nvStop();
  nvChunks(t).forEach(function(c){NV.q.push({text:c});});
  nvPump();
}
function nvStop(){NV.gen++;NV.q=[];NV.playing=false;if(NV.audio){try{NV.audio.pause();}catch(e){}NV.audio=null;}try{if(window.speechSynthesis)speechSynthesis.cancel();}catch(e){}nvSync();}

/* branchements : lecture des réponses, arrêt, et mode vocal */
var _speakWin=speak,_speakStopWin=speakStop;
speak=function(text){if(nvOn())nvSpeak(text,false);else _speakWin(text);};
speakStop=function(){nvStop();_speakStopWin();};
if(typeof vmSay==="function"){var _vmSayWin=vmSay;vmSay=function(text){if(nvOn()){VM.pending=0;nvSpeak(text,true);}else _vmSayWin(text);};}

/* Réglages : choix de la voix */
function voixSection(){
  if(!fileApi||!fileApi.aiTts)return "";var s=S.settings,hasG=S.titanKey&&S.titanKey.providers&&S.titanKey.providers.some(function(p){return p.id==="gemini"&&p.has;});
  return '<section class="set-section" aria-labelledby="s-voix"><h2 class="sec" id="s-voix">Voix de Titan</h2>'+
    '<div class="toggle"><div><b>Voix naturelle</b><small>'+(hasG?"Voix humaine de Google (avec ta clé Gemini). Sinon, voix de Windows.":"Ajoute une clé Gemini pour une voix naturelle ; en attendant, Titan utilise la voix de Windows.")+'</small></div><input type="checkbox" class="switch" data-set="voixNat" data-type="bool"'+(s.voixNat!==false?" checked":"")+' aria-label="Voix naturelle"></div>'+
    '<div class="row"><div class="field" style="flex:1;margin:0"><label for="set-voixnom">Voix</label><select id="set-voixnom" data-set="voixNom" data-type="str">'+VOIX.map(function(v){return '<option value="'+v[0]+'"'+((s.voixNom||"Kore")===v[0]?" selected":"")+'>'+esc(v[0]+" — "+v[1])+'</option>';}).join("")+'</select></div>'+
    '<button class="btn sm" type="button" data-act="voix-test" style="align-self:flex-end">'+icon("volume")+'Écouter</button></div></section>';
}
ACTS["voix-test"]=function(){NV.failUntil=0;var n=S.settings.prenom?" "+S.settings.prenom:"";speak("Salut"+n+" ! Je suis Titan. C'est avec cette voix que je te répondrai. Tu as cours demain à neuf heures, et ta prochaine leçon de conduite est jeudi.");};
