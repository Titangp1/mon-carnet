/* Mon Carnet : conversations de Titan (historique à gauche), heure et actions sous chaque message,
   réponse affichée en direct pendant qu'elle s'écrit. Chargé après titan.js. */
var TC_KEY="carnet-titan-convs";
S.titan.convs=[];S.titan.cur=null;S.titan.live="";S.titan.streamId=null;
function tcNew(){return {id:uid(),title:"",at:Date.now(),msgs:[]};}
function tcCur(){for(var i=0;i<S.titan.convs.length;i++)if(S.titan.convs[i].id===S.titan.cur)return S.titan.convs[i];return null;}
function tcTitle(c){if(c.title)return c.title;var u=(c.msgs||[]).find(function(m){return m.role==="user";});return u?String(u.content).replace(/\s+/g," ").slice(0,48)+(String(u.content).length>48?"…":""):"Nouvelle conversation";}
(function tcLoad(){
  try{var a=JSON.parse(localStorage.getItem(TC_KEY)||"null");if(a&&Array.isArray(a.convs)){S.titan.convs=a.convs;S.titan.cur=a.cur;}}catch(e){}
  if(!S.titan.convs.length&&S.titan.msgs.length){var c=tcNew();c.msgs=S.titan.msgs;c.at=(S.titan.msgs[S.titan.msgs.length-1]||{}).at||Date.now();S.titan.convs.push(c);S.titan.cur=c.id;}
  var cur=tcCur();
  if(!cur){cur=tcNew();S.titan.convs.unshift(cur);S.titan.cur=cur.id;}
  S.titan.msgs=cur.msgs;
})();
saveTitan=function(){
  var c=tcCur();if(c){c.msgs=S.titan.msgs.slice(-120);S.titan.msgs=c.msgs;if(c.msgs.length)c.at=(c.msgs[c.msgs.length-1].at)||Date.now();}
  /* on ne garde pas les conversations vides, sauf celle ouverte ; 60 conversations au plus */
  S.titan.convs=S.titan.convs.filter(function(x){return x.msgs.length||x.id===S.titan.cur;}).sort(function(a,b){return b.at-a.at;}).slice(0,60);
  try{localStorage.setItem(TC_KEY,JSON.stringify({cur:S.titan.cur,convs:S.titan.convs}));}catch(e){}
};
function tcOpen(id){if(S.titan.busy)return;saveTitan();var c=S.titan.convs.find(function(x){return x.id===id;});if(!c)return;S.titan.cur=c.id;S.titan.msgs=c.msgs;S.titan.needKey=false;saveTitan();titanRefresh(true);}
ACTS["titan-new"]=function(){if(S.titan.busy)return;saveTitan();var c=tcCur();if(c&&!c.msgs.length){titanRefresh();var i=document.getElementById("titan-in");if(i)i.focus();return;}
  c=tcNew();S.titan.convs.unshift(c);S.titan.cur=c.id;S.titan.msgs=c.msgs;saveTitan();titanRefresh(true);setTimeout(function(){var i=document.getElementById(S.ui.view==="titan"?"titan-in":"titan-in-d");if(i)i.focus();},30);};
ACTS["titan-conv"]=function(t){tcOpen(t.getAttribute("data-cid"));};
ACTS["titan-conv-del"]=function(t,e){if(e)e.stopPropagation();if(S.titan.busy)return;var id=t.getAttribute("data-cid");
  S.titan.convs=S.titan.convs.filter(function(x){return x.id!==id;});
  if(S.titan.cur===id){var n=S.titan.convs[0]||tcNew();if(!S.titan.convs.length)S.titan.convs.push(n);S.titan.cur=n.id;S.titan.msgs=n.msgs;}
  saveTitan();titanRefresh();toast("Conversation supprimée");};

/* ---------- Heure et actions sous les messages ---------- */
var fFull=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"});
function tcAgo(at){var s=Math.round((Date.now()-at)/1000);if(s<45)return "À l'instant";var m=Math.round(s/60);if(m<60)return "Il y a "+m+" minute"+(m>1?"s":"");var h=Math.round(m/60);if(h<24)return "Il y a "+h+" heure"+(h>1?"s":"");
  var d=new Date(at),y=new Date();y.setDate(y.getDate()-1);if(d.toDateString()===y.toDateString())return "Hier à "+pad(d.getHours())+"h"+pad(d.getMinutes());return cap(fFull.format(d));}
function tcFoot(m,i,last){
  var b='<span class="t-time" title="'+esc(cap(fFull.format(new Date(m.at||Date.now()))))+'">'+esc(tcAgo(m.at||Date.now()))+'</span>';
  b+='<button class="t-ic" type="button" data-act="titan-copy" data-i="'+i+'" title="Copier" aria-label="Copier">'+icon("copy")+'</button>';
  if(m.role==="user")b+='<button class="t-ic" type="button" data-act="titan-edit" data-i="'+i+'" title="Modifier et renvoyer" aria-label="Modifier">'+icon("file")+'</button>';
  if(m.role!=="user"&&last&&!S.titan.busy)b+='<button class="t-ic" type="button" data-act="titan-retry" title="Réessayer" aria-label="Réessayer">'+icon("refresh")+'</button>';
  if(m.role!=="user"&&m.model)b+='<span class="t-model">'+esc(m.model)+'</span>';
  return '<div class="t-foot">'+b+'</div>';
}
ACTS["titan-copy"]=function(t){var m=S.titan.msgs[Number(t.getAttribute("data-i"))];if(m)copy(String(m.content),"Message copié");};
ACTS["titan-edit"]=function(t){if(S.titan.busy)return;var m=S.titan.msgs[Number(t.getAttribute("data-i"))];if(!m)return;S.titan.draft=String(m.content);titanRefresh();var i=document.getElementById(S.ui.view==="titan"?"titan-in":"titan-in-d");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}};
ACTS["titan-retry"]=function(){if(S.titan.busy)return;var ms=S.titan.msgs,k=ms.length-1;while(k>=0&&ms[k].role!=="user")k--;if(k<0)return;var q=ms[k].content,v=!!ms[k].voice;ms.splice(k);saveTitan();titanAsk(q,{voice:v});};

/* ---------- Fil de discussion (remplace celui de titan.js) ---------- */
titanThread=function(){
  var msgs=S.titan.msgs;
  if(!msgs.length&&!S.titan.busy)return '<div class="t-welcome">'+titanAvatar()+'<h2>Salut'+(S.settings.prenom?" "+esc(S.settings.prenom):"")+', je suis Titan.</h2><p>Je connais ton emploi du temps, ta conduite et tes mails de l\'école. Je peux aussi ajouter ou déplacer des choses dans ton agenda.</p><div class="t-sugg">'+
    TITAN_SUGG.map(function(q){return '<button type="button" class="qchip" data-act="titan-ask" data-q="'+esc(q)+'">'+esc(q)+'</button>';}).join("")+'</div></div>'+(S.titan.needKey?keyCard():"");
  var now=Date.now(),lastAi=-1;msgs.forEach(function(m,i){if(m.role!=="user")lastAi=i;});
  return msgs.map(function(m,i){
    if(m.role==="user")return '<div class="t-msg me'+(now-m.at<1200?" fresh":"")+'"><div class="t-col"><div class="t-bubble">'+(m.voice?'<span class="t-voice">'+icon("mic")+'Message vocal</span><br>':'')+esc(m.content).replace(/\n/g,"<br>")+'</div>'+tcFoot(m,i,false)+'</div></div>';
    return '<div class="t-msg ai'+(m.error?" err":"")+(now-m.at<1500&&!m.streamed?" fresh":"")+'">'+titanAvatar()+'<div class="t-col"><div class="t-bubble">'+md(m.content)+
      (m.trace&&m.trace.length?'<p class="t-src">'+icon("search")+'Consulté : '+esc(m.trace.join(" · "))+'</p>':'')+'</div>'+
      (m.actions&&m.actions.length?'<div class="t-cards">'+m.actions.map(actionCard).join("")+'</div>':'')+tcFoot(m,i,i===lastAi)+'</div></div>';
  }).join("")+(S.titan.needKey?keyCard():"")+(S.titan.busy?tcBusy():'');
};
function tcBusy(){
  if(S.titan.live)return '<div class="t-msg ai t-busy">'+titanAvatar()+'<div class="t-col"><div class="t-bubble t-live">'+md(S.titan.live)+'<span class="t-caret"></span></div><div class="t-foot"><button class="btn ghost sm" type="button" data-act="titan-stop">Arrêter</button></div></div></div>';
  return '<div class="t-msg ai t-busy">'+titanAvatar()+'<div class="t-bubble typing"><span class="dots"><i></i><i></i><i></i></span>'+esc(S.titan.step||"")+'<button class="btn ghost sm t-stop" type="button" data-act="titan-stop">Arrêter</button></div></div>';
}
/* texte en direct : on ne redessine que la bulle, et au plus une fois par image */
var tcRaf=0;
function tcPaintLive(){tcRaf=0;
  var bubbles=document.querySelectorAll(".t-busy");
  if(!bubbles.length||!document.querySelector(".t-live")){titanRefresh(true);return;}
  Array.prototype.forEach.call(document.querySelectorAll(".t-live"),function(b){b.innerHTML=md(S.titan.live)+'<span class="t-caret"></span>';});
  ["t-thread","t-thread-d"].forEach(function(id){var t=document.getElementById(id);if(t&&t.scrollHeight-t.scrollTop-t.clientHeight<160)t.scrollTop=t.scrollHeight;});
}
if(fileApi&&fileApi.onAiDelta)fileApi.onAiDelta(function(x){
  if(!x||x.id!==S.titan.streamId||!S.titan.busy)return;
  if(x.d===null){if(S.titan.live){S.titan.live="";titanRefresh();}return;}
  var wasEmpty=!S.titan.live;S.titan.live+=x.d;
  if(wasEmpty){titanRefresh(true);return;}
  if(!tcRaf)tcRaf=requestAnimationFrame(tcPaintLive);
});

/* ---------- Page Titan avec la liste des conversations ---------- */
function tcGroup(at){var d=new Date(at),t=new Date();t.setHours(0,0,0,0);var diff=(t-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/86400000;
  return diff<=0?"Aujourd'hui":diff===1?"Hier":diff<7?"7 derniers jours":diff<30?"30 derniers jours":"Plus ancien";}
function tcList(){
  var list=S.titan.convs.filter(function(c){return c.msgs.length||c.id===S.titan.cur;}).slice().sort(function(a,b){return b.at-a.at;}),out="",g="";
  list.forEach(function(c){var gg=c.msgs.length?tcGroup(c.at):"Aujourd'hui";if(gg!==g){g=gg;out+='<p class="tc-group">'+esc(g)+'</p>';}
    out+='<div class="tc-item'+(c.id===S.titan.cur?" cur":"")+'"><button type="button" class="tc-open" data-act="titan-conv" data-cid="'+c.id+'"'+(c.id===S.titan.cur?' aria-current="true"':'')+'><span class="tc-t">'+esc(tcTitle(c))+'</span><span class="tc-d">'+esc(c.msgs.length?tcAgo(c.at):"vide")+'</span></button>'+
      (c.msgs.length?'<button type="button" class="t-ic tc-del" data-act="titan-conv-del" data-cid="'+c.id+'" title="Supprimer" aria-label="Supprimer la conversation">'+icon("trash")+'</button>':'')+'</div>';});
  return '<aside class="tc-side" aria-label="Conversations"><button class="btn primary sm tc-new" type="button" data-act="titan-new">'+icon("plus")+'Nouvelle conversation</button><div class="tc-list">'+out+'</div></aside>';
}
viewTitan=function(){
  return '<div class="titan-page with-side">'+tcList()+'<div class="tc-main"><div class="tc-mobile"><select aria-label="Conversation" onchange="tcOpen(this.value)">'+S.titan.convs.filter(function(c){return c.msgs.length||c.id===S.titan.cur;}).map(function(c){return '<option value="'+c.id+'"'+(c.id===S.titan.cur?" selected":"")+'>'+esc(tcTitle(c))+'</option>';}).join("")+'</select><button class="btn sm" type="button" data-act="titan-new">'+icon("plus")+'Nouvelle</button></div><header class="page-head"><div><p class="eyebrow">'+icon("sparkle")+'Assistant intégré</p><h1 tabindex="-1">'+esc(tcCur()&&tcCur().msgs.length?tcTitle(tcCur()):"Titan AI")+'</h1></div>'+
    '<div class="head-actions"><button class="btn ghost speak-stop" type="button" data-act="speak-stop"'+(typeof SPEAK!=="undefined"&&SPEAK.on?"":" hidden")+'>'+icon("volumeX")+'Arrêter la lecture</button></div></header>'+
    '<div class="t-thread" id="t-thread">'+titanThread()+'</div>'+titanComposer("")+'</div></div>';
};
