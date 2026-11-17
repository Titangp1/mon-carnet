"use strict";
/* Mon Carnet : conduite. Créneaux libres de l'auto-école (Sarool), planification sur les temps libres,
   réservation automatique (de préférence avec le moniteur choisi) et historique. */

S.sarool={weeks:[],at:null,err:null,busy:false,booking:null,proposals:[],week:null};
try{var _sc=JSON.parse(localStorage.getItem("carnet-sarool-agenda")||"null");if(_sc&&Array.isArray(_sc.weeks)){S.sarool.weeks=_sc.weeks;S.sarool.at=_sc.at||null;}}catch(e){}
var bookFails={};try{bookFails=JSON.parse(localStorage.getItem("carnet-sarool-fails")||"{}")||{};}catch(e){}
var expectedPermis={}; /* leçons réservées par l'appli : pas de notification « nouvelle leçon » en double */
var JOURS=[[1,"Lun"],[2,"Mar"],[3,"Mer"],[4,"Jeu"],[5,"Ven"],[6,"Sam"],[7,"Dim"]];

function listOf(s){return String(s||"").split(/[\s,;]+/).map(function(x){return x.trim();}).filter(Boolean);}
function saveSaroolCache(){S.sarool.v=(S.sarool.v||0)+1;try{localStorage.setItem("carnet-sarool-agenda",JSON.stringify({weeks:S.sarool.weeks,at:S.sarool.at}));}catch(e){}}
function slotFrom(e){
  var d=String(e.start).slice(0,10),h=String(e.start).slice(11,16),f=String(e.end).slice(11,16),de=String(e.end).slice(0,10);
  var duree=Math.max(15,(de>d?24*60:0)+toMin(f)-toMin(h));
  return {id:e.id,kind:e.kind,date:d,heure:h,fin:f,duree:duree,start:String(e.start).slice(0,16),end:String(e.end).slice(0,16),moniteur:e.moniteur||"",lieu:e.lieu||"",rdv:e.rdv||"",nbMonit:e.nbMonit||1};
}
/* Mémorisation : ces listes sont relues des dizaines de fois par rendu */
var CMEMO={};
function saroolSlots(){if(CMEMO.slots&&CMEMO.v===S.sarool.v&&CMEMO.w===S.sarool.weeks)return CMEMO.slots;var seen={},out=[];S.sarool.weeks.forEach(function(w){(w.events||[]).forEach(function(e){if(seen[e.id])return;seen[e.id]=1;out.push(slotFrom(e));});});
  out.sort(function(a,b){return a.start.localeCompare(b.start);});CMEMO={slots:out,v:S.sarool.v,w:S.sarool.weeks};return out;}
function isPref(s){var p=norm(S.settings.moniteurPref).trim();return !!p&&norm(s.moniteur).indexOf(p)>=0;}
function moniteurShort(m){return String(m||"").trim()||"Moniteur";}

/* Toutes mes leçons : agenda Sarool (semaines lues) + planning (au-delà) */
function permisAll(){
  var sl=saroolSlots();if(CMEMO.all&&CMEMO.p===permis)return CMEMO.all;
  var seen={},out=[];
  saroolSlots().forEach(function(s){if(s.kind!=="mine")return;var k=s.date+s.heure;seen[k]=1;
    out.push({uid:"sarool-"+s.id,kind:"permis",titre:"Leçon de conduite",lieu:s.moniteur?"Moniteur : "+s.moniteur:"",rdv:s.rdv,moniteur:s.moniteur,desc:"Auto-école (Sarool)"+(s.lieu?" · "+s.lieu:""),date:s.date,heure:s.heure,duree:s.duree,allDay:false,saroolId:s.id});});
  (permis||[]).forEach(function(p){var k=p.date+p.heure;if(seen[k])return;seen[k]=1;out.push(Object.assign({moniteur:String(p.lieu||"").replace(/^Moniteur\s*:\s*/,"")},p));});
  out.sort(function(a,b){return (a.date+a.heure).localeCompare(b.date+b.heure);});CMEMO.all=out;CMEMO.p=permis;return out;
}
function nextLesson(){var now=Date.now();return permisAll().filter(function(p){var d=parseKey(p.date),m=toMin(p.heure);d.setHours(Math.floor(m/60),m%60);return d.getTime()+p.duree*60000>now;})[0]||null;}
function weekKey(k){return keyOf(startOfWeek(parseKey(k)));}
function lessonsInWeek(k){var wk=weekKey(k);return permisAll().filter(function(p){return weekKey(p.date)===wk;});}
function minutesInWeek(k){return lessonsInWeek(k).reduce(function(s,p){return s+(Number(p.duree)||60);},0);}
/* Heures déjà effectuées : leçons passées (gardées en mémoire même quand Sarool ne les affiche plus) + heures faites avant l'appli */
function doneMin(){
  var mem={},now=Date.now();try{mem=JSON.parse(localStorage.getItem("carnet-permis-fait")||"{}")||{};}catch(e){}
  var ch=false;permisAll().forEach(function(p){var d=parseKey(p.date),m=toMin(p.heure);d.setHours(Math.floor(m/60),m%60,0,0);if(d.getTime()+(Number(p.duree)||60)*60000<=now){var k=p.date+" "+p.heure;if(mem[k]!==(Number(p.duree)||60)){mem[k]=Number(p.duree)||60;ch=true;}}});
  if(ch)try{localStorage.setItem("carnet-permis-fait",JSON.stringify(mem));}catch(e){}
  var t=0,n=0;Object.keys(mem).forEach(function(k){t+=mem[k];n++;});
  return {min:t+Math.round((Number(S.settings.heuresAvant)||0)*60),n:n};
}
function capMin(){return Math.round((Number(S.settings.heuresSemaine)||4)*60);}
function hDur(m){m=Math.round(m);var h=Math.floor(m/60),r=m%60;return h+"h"+(r?pad(r):"");}

/* Ce qui occupe une journée, avec la raison (pour expliquer pourquoi un créneau ne convient pas) */
var VACANCES=/vacance|ferie|conge|libre|pont|repos/;
function busyFor(date){
  var b=[];
  S.cours.forEach(function(c){if(c.date!==date)return;
    if(c.allDay){if(S.settings.allDayBloque&&!VACANCES.test(norm(c.titre)))b.push({a:0,b:24*60,why:c.titre+" (toute la journée)"});return;}
    var a=toMin(c.heure);b.push({a:a,b:a+c.duree,marge:true,why:"Cours « "+c.titre+" » "+hm(c.heure)+"–"+hm(fromM(a+c.duree))});});
  S.rdv.forEach(function(r){if(r.date!==date||r.statut==="annule")return;var a=toMin(r.heure),d=Number(r.duree)||60;b.push({a:a,b:a+d,marge:true,why:"Rendez-vous avec "+rdvName(r)+" à "+hm(r.heure)});});
  permisAll().forEach(function(p){if(p.date!==date)return;var a=toMin(p.heure);b.push({a:a,b:a+p.duree,why:"Leçon déjà prévue à "+hm(p.heure)});});
  eventsOn(date).forEach(function(e){if(e.allDay){if(e.cat!=="perso"||!VACANCES.test(norm(e.titre)))b.push({a:0,b:24*60,why:"« "+e.titre+" » (toute la journée)"});return;}var a=toMin(e.heure);b.push({a:a,b:a+(Number(e.duree)||60),marge:true,why:"« "+e.titre+" » "+hm(e.heure)+"–"+hm(evEnd(e))});});
  return b;
}
function slotStartMs(s){var d=parseKey(s.date),m=toMin(s.heure);d.setHours(Math.floor(m/60),m%60,0,0);return d.getTime();}
function slotCheck(s){
  var st=S.settings,wd=parseKey(s.date).getDay()||7;
  if((st.jours||[]).indexOf(wd)<0)return {ok:false,why:"Jour exclu de tes règles"};
  var a=toMin(s.heure),b=a+s.duree;
  if(a<toMin(st.plageDebut||"08:00")||b>toMin(st.plageFin||"20:00"))return {ok:false,why:"Hors de ta plage "+hm(st.plageDebut)+"–"+hm(st.plageFin)};
  if(slotStartMs(s)<Date.now()+(Number(st.delaiH)||0)*3600000)return {ok:false,why:slotStartMs(s)<Date.now()?"Créneau passé":"Trop proche (moins de "+st.delaiH+" h)"};
  var m=Number(st.marge)||0,hit=null;
  busyFor(s.date).forEach(function(x){if(hit)return;var mm=x.marge?m:0;if(a<x.b+mm&&x.a-mm<b)hit=x;});
  if(hit)return {ok:false,why:hit.why+(hit.marge&&m?" (marge "+m+" min)":"")};
  return {ok:true,why:"Compatible avec ton emploi du temps"};
}

/* Choix des créneaux à réserver : moniteur préféré d'abord, au plus tôt, dans la limite par semaine et par jour */
function planAuto(){
  var st=S.settings,tk=todayKey(),end=keyOf(addDays(new Date(),7*(Number(st.horizonSem)||3))),capM=capMin(),maxDay=Math.max(1,Number(st.maxJour)||1);
  var perWeek={},perDay={};permisAll().forEach(function(p){var wk=weekKey(p.date);perWeek[wk]=(perWeek[wk]||0)+(Number(p.duree)||60);perDay[p.date]=(perDay[p.date]||0)+1;});
  var hasPref=!!norm(st.moniteurPref).trim(),now=Date.now();
  var cands=saroolSlots().filter(function(s){return s.kind==="dispo"&&s.date>=tk&&s.date<=end&&!(bookFails[s.id]&&now-bookFails[s.id]<24*3600000);})
    .map(function(s){return {s:s,pref:isPref(s),chk:slotCheck(s)};})
    .filter(function(x){return x.chk.ok&&(x.pref||st.autreMoniteur||!hasPref);});
  cands.sort(function(x,y){return (y.pref-x.pref)||x.s.start.localeCompare(y.s.start);});
  var picks=[];
  cands.forEach(function(x){var s=x.s,wk=weekKey(s.date);
    if((perWeek[wk]||0)+s.duree>capM||(perDay[s.date]||0)>=maxDay)return;
    if(picks.some(function(p){return p.date===s.date&&toMin(s.heure)<toMin(p.heure)+p.duree&&toMin(p.heure)<toMin(s.heure)+s.duree;}))return;
    picks.push(s);perWeek[wk]=(perWeek[wk]||0)+s.duree;perDay[s.date]=(perDay[s.date]||0)+1;});
  return picks.sort(function(a,b){return a.start.localeCompare(b.start);});
}

function slotLabel(s){return cap(fShort.format(parseKey(s.date)).replace(/\./g,""))+" "+hm(s.heure)+"–"+hm(s.fin);}
function addLog(type,text,s,auto){S.permisLog.unshift({at:Date.now(),type:type,text:text,auto:!!auto,slot:s?{date:s.date,heure:s.heure,fin:s.fin,moniteur:s.moniteur}:null});S.permisLog=S.permisLog.slice(0,120);persist();}
function saroolErrText(e){return {login:"Ta session Sarool a expiré : reconnecte-toi.",refused:"Sarool a refusé la réservation.",gone:"Ce créneau n'est plus disponible (pris entre-temps).",week:"Impossible d'afficher la bonne semaine sur Sarool.",format:"La page Sarool n'a pas répondu comme prévu.",notfound:"Créneau introuvable sur la page Sarool.",network:"Sarool est injoignable pour l'instant."}[e]||"Sarool n'a pas répondu comme prévu.";}

/* Cycle : lire l'agenda des créneaux, puis réserver (ou proposer) */
function permisCycle(manual){
  if(!fileApi||!fileApi.saroolAgenda){if(manual)toast("Disponible dans l'application.");return Promise.resolve();}
  if(!S.settings.saroolOn){if(manual)toast("Connecte d'abord ton compte Sarool.");return Promise.resolve();}
  if(S.sarool.busy||S.sarool.booking)return Promise.resolve();
  S.sarool.busy=true;renderSoon();
  return fileApi.saroolAgenda({weeks:Math.max(1,Math.min(6,Number(S.settings.horizonSem)||3)),show:!!S.settings.saroolShow}).then(function(r){
    S.sarool.busy=false;
    if(r&&r.ok){S.sarool.weeks=r.weeks||[];S.sarool.at=r.at;S.sarool.err=null;saveSaroolCache();if(typeof checkChanges==="function")checkChanges("permis");
      if(S.settings.autoOn)return runAuto(manual);
      S.sarool.proposals=[];if(manual){var n=saroolSlots().filter(function(s){return s.kind==="dispo"&&slotCheck(s).ok;}).length;toast(n?n+" créneau"+(n>1?"x":"")+" libre"+(n>1?"s":"")+" compatible"+(n>1?"s":"")+" avec ton emploi du temps":"Aucun créneau libre compatible pour l'instant");}
    }else{S.sarool.err=(r&&r.error)||"network";if(manual)toast(saroolErrText(S.sarool.err));
      if(S.sarool.err==="login"&&!S.sarool.loginWarned&&typeof pushNotif==="function"){S.sarool.loginWarned=true;pushNotif({cat:"permis",type:"echec",title:"Session Sarool expirée",body:"Reconnecte-toi pour que les réservations automatiques continuent.",view:"conduite"});}}
  },function(){S.sarool.busy=false;S.sarool.err="network";}).then(function(){renderSoon();});
}
function runAuto(manual){
  var picks=planAuto();
  if(!picks.length){S.sarool.proposals=[];if(manual)toast("Rien à réserver : tes règles sont respectées ou aucun créneau compatible.");return Promise.resolve();}
  if(S.settings.autoMode==="ask"){
    var fresh=picks.filter(function(p){return !S.sarool.proposals.some(function(q){return q.id===p.id;});});
    S.sarool.proposals=picks;
    if(fresh.length&&typeof pushNotif==="function")pushNotif({cat:"permis",type:"propose",title:fresh.length+" créneau"+(fresh.length>1?"x":"")+" de conduite à valider",body:fresh.slice(0,3).map(function(s){return slotLabel(s)+" avec "+moniteurShort(s.moniteur);}).join(" · "),view:"conduite"});
    if(manual)toast(picks.length+" créneau"+(picks.length>1?"x":"")+" proposé"+(picks.length>1?"s":"")+" : valide-les dans Conduite");
    return Promise.resolve();
  }
  var n=0;
  return picks.reduce(function(p,s){return p.then(function(){return bookSlot(s,true).then(function(ok){if(ok)n++;});});},Promise.resolve()).then(function(){
    if(manual&&!n)toast("Aucune réservation n'a abouti : regarde l'historique.");
    if(n&&typeof syncPermis==="function")syncPermis(false);
  });
}
function bookSlot(s,auto){
  if(!fileApi||!fileApi.saroolBook)return Promise.resolve(false);
  S.sarool.booking=s.id;render();
  return fileApi.saroolBook({id:s.id,start:s.start,end:s.end,moniteur:s.moniteur},{pref:S.settings.moniteurPref,show:!!S.settings.saroolShow}).then(function(r){
    S.sarool.booking=null;
    if(r&&r.ok){
      S.sarool.weeks.forEach(function(w){(w.events||[]).forEach(function(e){if(e.id===s.id){e.kind="mine";if(r.id)e.id=r.id;}});});
      saveSaroolCache();expectedPermis[s.date+s.heure]=1;
      S.sarool.proposals=S.sarool.proposals.filter(function(p){return p.id!==s.id;});
      addLog("booked",(r.already?"Déjà réservée : ":"Réservée : ")+slotLabel(s)+" avec "+moniteurShort(s.moniteur),s,auto);
      if(typeof pushNotif==="function"&&!r.already)pushNotif({cat:"permis",type:"reserve",title:auto?"Leçon réservée automatiquement":"Leçon réservée",body:slotLabel(s)+" avec "+moniteurShort(s.moniteur)+(s.rdv?" · RDV "+s.rdv:""),date:s.date,view:"conduite",force:true});
      if(typeof checkChanges==="function")checkChanges("permis");
      if(!auto)toast("Leçon réservée : "+slotLabel(s));
      render();return true;
    }
    var err=(r&&r.error)||"network",detail=r&&r.msgs&&r.msgs.length?" « "+r.msgs.join(" ").slice(0,160)+" »":"";
    if(err!=="network"&&err!=="login"){bookFails[s.id]=Date.now();try{localStorage.setItem("carnet-sarool-fails",JSON.stringify(bookFails));}catch(e){}}
    if(err==="gone"){S.sarool.weeks.forEach(function(w){w.events=(w.events||[]).filter(function(e){return e.id!==s.id;});});saveSaroolCache();}
    addLog("failed","Échec "+slotLabel(s)+" : "+saroolErrText(err)+detail,s,auto);
    if(typeof pushNotif==="function"&&(!auto||err==="refused"||err==="login"))pushNotif({cat:"permis",type:"echec",title:"Réservation impossible",body:slotLabel(s)+" : "+saroolErrText(err)+detail,view:"conduite"});
    if(!auto)toast(saroolErrText(err));
    render();return false;
  },function(){S.sarool.booking=null;render();return false;});
}
function initConduite(){
  if(!fileApi||!fileApi.saroolAgenda)return;
  setTimeout(function(){permisCycle(false);},15000);
  setInterval(function(){permisCycle(false);},15*60*1000);
}

/* ---------- Page Conduite ---------- */
function ruleChips(){var st=S.settings,days=JOURS.filter(function(j){return (st.jours||[]).indexOf(j[0])>=0;}).map(function(j){return j[1];});
  var c=[(st.moniteurPref?icon("star")+esc(st.moniteurPref)+(st.autreMoniteur?" en priorité":" uniquement"):"Tous les moniteurs"),hDur(capMin())+" max / semaine",st.maxJour+" max / jour",hm(st.plageDebut)+"–"+hm(st.plageFin),(days.length===7?"Tous les jours":days.join(" ")),"Marge "+st.marge+" min","Au moins "+st.delaiH+" h avant","Sur "+st.horizonSem+" semaine"+(st.horizonSem>1?"s":"")];
  return '<div class="rule-chips">'+c.map(function(x){return '<span class="rchip">'+x+'</span>';}).join("")+'</div>';}
function lessonRow(p){var d=parseKey(p.date),past=p.date<todayKey();
  return '<div class="lesson'+(past?" past":"")+'"><div class="lesson-date"><span class="ld-d num">'+d.getDate()+'</span><span class="ld-m">'+esc(fMonthS.format(d).replace(".",""))+'</span></div>'+
    '<div class="grow"><b>'+esc(relDay(p.date))+', '+hm(p.heure)+'–'+hm(fromM(toMin(p.heure)+p.duree))+'</b><small>'+esc([p.moniteur?"Avec "+p.moniteur:"",p.rdv?"RDV "+p.rdv:""].filter(Boolean).join(" · ")||"Leçon de conduite")+'</small></div>'+
    (p.moniteur&&isPref(p)?'<span class="chip ok-soft">'+icon("star")+'Préféré</span>':'')+'</div>';}
function slotRow(s){
  var chk=slotCheck(s),pref=isPref(s),busy=S.sarool.booking===s.id,anyBusy=!!S.sarool.booking;
  return '<div class="slot '+(chk.ok?"ok":"ko")+'"><div class="slot-time num">'+hm(s.heure)+'<small>'+hm(s.fin)+'</small></div>'+
    '<div class="slot-who">'+avatar(s.moniteur||"?","sm")+'<div class="grow"><b>'+esc(moniteurShort(s.moniteur))+(pref?' <span class="pref-star" title="Moniteur préféré">'+icon("star")+'</span>':'')+'</b><small>'+esc([dur(s.duree),s.rdv||s.lieu].filter(Boolean).join(" · "))+'</small></div></div>'+
    '<div class="slot-why">'+(chk.ok?(minutesInWeek(s.date)+s.duree>capMin()?'<span class="chip soon" title="Tu as déjà '+hDur(minutesInWeek(s.date))+' cette semaine-là">'+icon("alert")+'Dépasserait tes '+hDur(capMin())+'</span>':'<span class="chip ok-soft">'+icon("check")+'Compatible</span>'):'<span class="why" title="'+esc(chk.why)+'">'+icon("info")+esc(chk.why)+'</span>')+'</div>'+
    '<button class="btn sm'+(chk.ok?" ok":"")+'" type="button" data-act="slot-open" data-sid="'+esc(s.id)+'"'+(anyBusy?" disabled":"")+'>'+(busy?'<span class="spin"></span>Réservation…':(chk.ok?"Réserver":"Voir"))+'</button></div>';
}
function viewConduite(){
  var st=S.settings,sr=S.sarool,tk=todayKey(),connected=!!st.saroolOn;
  var wkMin=minutesInWeek(tk),capM=capMin(),wk=lessonsInWeek(tk).length,nx=nextLesson();
  var h='<header class="page-head"><div><p class="eyebrow">'+icon("car")+'Permis B · '+esc(st.autoEcole?"Auto-école "+st.autoEcole:"Auto-école")+'</p><h1 tabindex="-1">Conduite</h1><p class="lede">'+
    (connected?esc(hDur(wkMin)+" de conduite cette semaine sur "+hDur(capM)+" max ("+wk+" leçon"+(wk>1?"s":"")+")"+(nx?". Prochaine : "+relDay(nx.date).toLowerCase()+" à "+hm(nx.heure)+".":".")):"Tes leçons, les créneaux libres et la réservation automatique.")+'</p></div>'+
    '<div class="head-actions">'+(connected?'<button class="btn" type="button" data-act="permis-check"'+(sr.busy||sr.booking?" disabled":"")+'>'+(sr.busy?'<span class="spin"></span>Vérification…':icon("refresh")+'Vérifier maintenant')+'</button><button class="btn ghost" type="button" data-act="sarool-open">'+icon("external")+'Ouvrir Sarool</button>':'')+'</div></header>';
  if(!connected)return h+'<section class="hero-empty"><span class="he-ico">'+icon("car")+'</span><h2>Connecte ton compte Sarool</h2><p>Le carnet lira les créneaux libres de l\'auto-école et réservera tout seul tes leçons sur tes temps libres, de préférence avec '+esc(st.moniteurPref||"ton moniteur")+'. Ton mot de passe reste sur le site de Sarool.</p><button class="btn primary" type="button" data-act="sarool-login">'+icon("power")+'Se connecter à Sarool</button></section>';
  if(sr.err)h+='<div class="notice'+(sr.err==="login"?"":" info")+'"><div><b>'+esc(saroolErrText(sr.err))+'</b> '+(sr.err==="login"?'<button class="linklike" type="button" data-act="sarool-login">Se reconnecter</button>':'La dernière version lue reste affichée.')+'</div></div>';
  var dn=doneMin(),pct2=capM?Math.min(100,Math.round(wkMin/capM*100)):0;
  h+='<div class="cd-top"><section class="card stat-card"><p class="card-label">Cette semaine</p><p class="big num"><b data-count="'+wkMin+'" data-fmt="h">'+hDur(wkMin)+'</b><span>/'+hDur(capM)+'</span></p><div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="'+capM+'" aria-valuenow="'+wkMin+'" aria-label="Heures de conduite cette semaine"><i style="width:'+pct2+'%"></i></div>'+
    '<p class="card-sub">Déjà effectuées : <b class="num">'+hDur(dn.min)+'</b> de conduite</p><p class="card-sub">'+(nx?'Prochaine : <b>'+esc(relDay(nx.date))+' '+hm(nx.heure)+'</b>'+(nx.moniteur?' avec '+esc(nx.moniteur):''):'Aucune leçon à venir')+'</p><p class="card-sub muted">'+(sr.at?"Vérifié "+relTime(sr.at):"Pas encore vérifié")+'</p></section>';
  h+='<section class="card auto-card'+(st.autoOn?" on":"")+'"><div class="auto-head"><span class="auto-ico">'+icon("zap")+'</span><div class="grow"><h2>Réservation automatique</h2><p>'+(st.autoOn?(st.autoMode==="ask"?"Je te propose les créneaux, tu valides d'un clic.":"Le carnet réserve tout seul sur tes temps libres, toutes les 15 minutes."):"Désactivée : rien n'est réservé sans toi.")+'</p></div>'+
    '<input type="checkbox" class="switch lg" data-set="autoOn" data-type="bool"'+(st.autoOn?" checked":"")+' aria-label="Réservation automatique"></div>'+
    '<span class="seg" role="group" aria-label="Mode">'+[["auto","Automatique"],["ask","Me demander"]].map(function(o){return '<button type="button" data-act="set-auto-mode" data-mode="'+o[0]+'" aria-pressed="'+(st.autoMode===o[0])+'">'+o[1]+'</button>';}).join("")+'</span>'+
    ruleChips()+'<div class="row"><button class="btn sm" type="button" data-act="permis-rules">'+icon("sliders")+'Modifier les règles</button>'+(sr.booking?'<span class="hint"><span class="spin"></span> Réservation en cours sur Sarool…</span>':'')+'</div></section></div>';
  if(sr.proposals.length)h+='<section class="card proposals" aria-labelledby="pr-h"><div class="sec-head"><h2 class="sec" id="pr-h">'+icon("sparkle")+'À valider</h2><button class="btn sm ok" type="button" data-act="book-all"'+(sr.booking?" disabled":"")+'>Tout réserver</button></div>'+sr.proposals.map(slotRow).join("")+'</section>';
  var up=permisAll().filter(function(p){return p.date>=tk;});
  h+='<div class="cd-cols"><section aria-labelledby="ml-h"><div class="sec-head"><h2 class="sec" id="ml-h">Mes prochaines leçons</h2><span class="hint num">'+up.length+'</span></div>'+
    (up.length?'<div class="card list-card">'+up.slice(0,12).map(lessonRow).join("")+'</div>':'<div class="empty">Aucune leçon à venir.'+(st.autoOn?' La réservation automatique s\'en occupe dès qu\'un créneau compatible se libère.':' Active la réservation automatique ou choisis un créneau à droite.')+'</div>')+'</section>';
  var weeks=sr.weeks,wi=sr.week;
  if(wi==null){wi=0;for(var w2=0;w2<weeks.length;w2++){if((weeks[w2].events||[]).some(function(e){return e.kind==="dispo"&&String(e.start).slice(0,10)>=tk;})){wi=w2;break;}}}
  wi=Math.min(wi,Math.max(0,weeks.length-1));
  h+='<section aria-labelledby="sl-h"><div class="sec-head"><h2 class="sec" id="sl-h">Créneaux libres de l\'auto-école</h2>'+(weeks.length>1?'<span class="seg sm" role="group" aria-label="Semaine">'+weeks.map(function(w,i){var s=parseKey(w.start||tk);return '<button type="button" data-act="slot-week" data-i="'+i+'" aria-pressed="'+(i===wi)+'">'+(i===0?"Cette sem.":"Sem. du "+s.getDate()+" "+fMonthS.format(s).replace(".",""))+'</button>';}).join("")+'</span>':'')+'</div>';
  var slots=weeks[wi]?(weeks[wi].events||[]).map(slotFrom).filter(function(s){return s.kind==="dispo"&&s.date>=tk;}).sort(function(a,b){return a.start.localeCompare(b.start);}):[];
  if(!weeks.length)h+='<div class="empty">'+(sr.busy?'<span class="spin"></span>Lecture des créneaux sur Sarool…':'Pas encore de créneaux lus.<button class="btn sm primary" type="button" data-act="permis-check">Lire les créneaux</button>')+'</div>';
  else if(!slots.length)h+='<div class="empty">Aucun créneau libre cette semaine-là.</div>';
  else{var byDay={};slots.forEach(function(s){(byDay[s.date]=byDay[s.date]||[]).push(s);});
    h+='<div class="card list-card">'+Object.keys(byDay).sort().map(function(k){return '<p class="day-label">'+esc(cap(fDay.format(parseKey(k))))+'</p>'+byDay[k].map(slotRow).join("");}).join("")+'</div>';}
  h+='</section></div>';
  h+='<section aria-labelledby="lg-h"><div class="sec-head"><h2 class="sec" id="lg-h">Historique</h2>'+(S.permisLog.length?'<button class="btn ghost sm" type="button" data-act="sarool-journal">'+icon("file")+'Journal technique</button>':'')+'</div>'+
    (S.permisLog.length?'<div class="card list-card log">'+S.permisLog.slice(0,15).map(function(l){return '<div class="log-row '+esc(l.type)+'"><span class="log-ico">'+icon(l.type==="booked"?"check":l.type==="failed"?"alert":"info")+'</span><div class="grow"><b>'+esc(l.text)+'</b><small>'+esc((l.auto?"Automatique · ":"")+relTime(l.at))+'</small></div></div>';}).join("")+'</div>':'<div class="empty">Les réservations faites par le carnet apparaîtront ici.</div>')+'</section>';
  return h;
}
function relTime(ts){var m=Math.round((Date.now()-ts)/60000);if(m<1)return "à l'instant";if(m<60)return "il y a "+m+" min";var h=Math.round(m/60);if(h<24)return "il y a "+h+" h";var d=Math.round(h/24);if(d<7)return "il y a "+d+" j";return "le "+fDM.format(new Date(ts));}

/* Fenêtre d'un créneau : détail + confirmation de réservation */
function findSlot(id){var all=saroolSlots();for(var i=0;i<all.length;i++)if(all[i].id===id)return all[i];return null;}
function openSlot(id){
  var s=findSlot(id);if(!s)return;var chk=slotCheck(s);closePalette();M={type:"slot",sid:id};
  openSheet('<header><h2>Leçon de conduite</h2><button class="btn ghost icon" type="button" data-act="close-modal" aria-label="Fermer">'+icon("x")+'</button></header><div class="body">'+
    '<div class="slot-hero"><span class="sh-date"><b class="num">'+parseKey(s.date).getDate()+'</b>'+esc(fMonthS.format(parseKey(s.date)).replace(".",""))+'</span><div><p class="sh-title">'+esc(cap(fDay.format(parseKey(s.date))))+'</p><p class="sh-time num">'+hm(s.heure)+' – '+hm(s.fin)+' · '+dur(s.duree)+'</p></div></div>'+
    '<dl class="kv"><dt>Moniteur</dt><dd>'+esc(moniteurShort(s.moniteur))+(isPref(s)?' <span class="chip ok-soft">'+icon("star")+'Préféré</span>':'')+'</dd>'+(s.rdv?'<dt>Rendez-vous</dt><dd>'+esc(s.rdv)+'</dd>':'')+(s.lieu?'<dt>Lieu</dt><dd>'+esc(s.lieu)+'</dd>':'')+
    '<dt>Ton planning</dt><dd>'+(chk.ok?'<span class="chip ok-soft">'+icon("check")+esc(chk.why)+'</span>':'<span class="chip late">'+icon("alert")+esc(chk.why)+'</span>')+'</dd></dl>'+
    (chk.ok?'':'<p class="warnline">Ce créneau ne respecte pas tes règles. Tu peux quand même le réserver.</p>')+
    '<p class="hint">La réservation est faite sur Sarool avec ta session, comme si tu cliquais sur « Réserver ». Pour annuler, passe par le site de l\'auto-école.</p></div>'+
    '<footer><span class="spacer"></span><button class="btn ghost" type="button" data-act="close-modal">Fermer</button><button class="btn '+(chk.ok?"ok":"primary")+'" type="button" data-act="slot-book" data-sid="'+esc(s.id)+'"'+(S.sarool.booking?" disabled":"")+'>'+icon("check")+(chk.ok?"Réserver ce créneau":"Réserver quand même")+'</button></footer>',"sm");
}
/* Règles de la réservation automatique */
function openRules(){
  var st=S.settings;closePalette();M={type:"rules"};
  var opt=function(vals,cur,fmt){return vals.map(function(v){return '<option value="'+v+'"'+(String(cur)===String(v)?" selected":"")+'>'+fmt(v)+'</option>';}).join("");};
  openSheet('<header><h2>Règles de réservation</h2><button class="btn ghost icon" type="button" data-act="close-modal" aria-label="Fermer">'+icon("x")+'</button></header><form id="rules-form" class="body" autocomplete="off">'+
    '<div class="grid2"><div class="field"><label for="r-pref">Moniteur préféré</label><input type="text" id="r-pref" value="'+esc(st.moniteurPref)+'" placeholder="Prénom du moniteur"><p class="hint">Une partie du nom suffit.</p></div>'+
    '<div class="field"><span class="flabel">Si ce moniteur n\'a rien</span><label class="pill"><input type="checkbox" id="r-autre"'+(st.autreMoniteur?" checked":"")+'><span>Accepter un autre moniteur</span></label></div></div>'+
    '<div class="field"><label for="r-avant">Heures déjà faites avant le carnet</label><input type="number" id="r-avant" min="0" max="200" step="0.5" value="'+esc(String(st.heuresAvant||0))+'"><p class="hint">Ajoutées au total des heures effectuées.</p></div>'+'<div class="grid3"><div class="field"><label for="r-sem">Heures max par semaine</label><select id="r-sem">'+opt([1,1.5,2,2.5,3,3.5,4,4.5,5,6,7,8,10],st.heuresSemaine,function(v){return hDur(v*60);})+'</select></div>'+
    '<div class="field"><label for="r-jour">Maximum par jour</label><select id="r-jour">'+opt([1,2,3],st.maxJour,String)+'</select></div>'+
    '<div class="field"><label for="r-hor">Regarder sur</label><select id="r-hor">'+opt([1,2,3,4,5,6],st.horizonSem,function(v){return v+" semaine"+(v>1?"s":"");})+'</select></div></div>'+
    '<div class="grid3"><div class="field"><label for="r-deb">Pas avant</label><input type="time" id="r-deb" step="900" value="'+esc(st.plageDebut)+'"></div><div class="field"><label for="r-fin">Pas après</label><input type="time" id="r-fin" step="900" value="'+esc(st.plageFin)+'"></div>'+
    '<div class="field"><label for="r-marge">Marge autour des cours</label><select id="r-marge">'+opt([0,15,30,45,60,90],st.marge,function(v){return v+" min";})+'</select></div></div>'+
    '<div class="field"><span class="flabel">Jours autorisés</span><div class="pills">'+JOURS.map(function(j){return '<label class="pill"><input type="checkbox" name="r-day" value="'+j[0]+'"'+((st.jours||[]).indexOf(j[0])>=0?" checked":"")+'><span>'+j[1]+'</span></label>';}).join("")+'</div></div>'+
    '<div class="grid2"><div class="field"><label for="r-delai">Réserver au moins</label><select id="r-delai">'+opt([2,6,12,24,48,72],st.delaiH,function(v){return v+" h à l'avance";})+'</select></div>'+
    '<div class="field"><span class="flabel">Journées « toute la journée »</span><label class="pill"><input type="checkbox" id="r-allday"'+(st.allDayBloque?" checked":"")+'><span>Bloquent la journée (sauf vacances)</span></label></div></div>'+
    '<p class="hint">Le carnet ne réserve jamais pendant un cours, un événement perso, un rendez-vous client ou une autre leçon, en gardant la marge choisie, et ne dépasse jamais ton maximum d\'heures par semaine. Il ne fait jamais d\'annulation.</p><button type="submit" hidden></button></form>'+
    '<footer><span class="spacer"></span><button class="btn ghost" type="button" data-act="close-modal">Annuler</button><button class="btn primary" type="button" data-act="save-rules">Enregistrer</button></footer>');
  document.getElementById("rules-form").addEventListener("submit",function(e){e.preventDefault();saveRules();});
}
function saveRules(){
  if(!M||M.type!=="rules")return;var g=function(id){return document.getElementById(id);};
  var days=Array.prototype.map.call(document.querySelectorAll('input[name="r-day"]:checked'),function(x){return Number(x.value);});
  if(!days.length){toast("Garde au moins un jour autorisé.");return;}
  if(toMin(g("r-fin").value)-toMin(g("r-deb").value)<60){toast("La plage horaire doit faire au moins une heure.");return;}
  var p={heuresAvant:Math.max(0,Number(g("r-avant").value)||0),moniteurPref:g("r-pref").value.trim(),autreMoniteur:g("r-autre").checked,heuresSemaine:Number(g("r-sem").value),maxJour:Number(g("r-jour").value),horizonSem:Number(g("r-hor").value),
    plageDebut:g("r-deb").value||"08:00",plageFin:g("r-fin").value||"20:00",marge:Number(g("r-marge").value),jours:days,delaiH:Number(g("r-delai").value),allDayBloque:g("r-allday").checked};
  closeModal(true);putSettings(p);S.sarool.proposals=[];toast("Règles enregistrées");
  if(S.settings.autoOn)permisCycle(false);
}

/* Créneaux de l'auto-école compatibles, pour l'agenda */
function dispoOn(k){if(!S.settings.saroolOn||!S.ui.showDispo)return [];return saroolSlots().filter(function(s){return s.kind==="dispo"&&s.date===k&&slotCheck(s).ok;});}

ACTS["permis-check"]=function(){permisCycle(true);};
ACTS["permis-rules"]=function(){openRules();};
ACTS["save-rules"]=function(){saveRules();};
ACTS["set-auto-mode"]=function(t){putSettings({autoMode:t.getAttribute("data-mode")});S.sarool.proposals=[];};
ACTS["slot-open"]=function(t){openSlot(t.getAttribute("data-sid"));};
ACTS["slot-book"]=function(t){var s=findSlot(t.getAttribute("data-sid"));if(!s)return;closeModal(true);bookSlot(s,false);};
ACTS["slot-week"]=function(t){S.sarool.week=Number(t.getAttribute("data-i"))||0;render();};
ACTS["book-all"]=function(){var list=S.sarool.proposals.slice();list.reduce(function(p,s){return p.then(function(){return bookSlot(s,false);});},Promise.resolve()).then(function(){if(typeof syncPermis==="function")syncPermis(false);});};
ACTS["sarool-open"]=function(){if(fileApi&&fileApi.saroolOpen)fileApi.saroolOpen();};
ACTS["sarool-journal"]=function(){if(fileApi&&fileApi.saroolJournal)fileApi.saroolJournal();};
ACTS["toggle-dispo"]=function(){S.ui.showDispo=!S.ui.showDispo;render();};
