"use strict";
/* Mon Carnet : pages. */

var main=document.getElementById("main"),focusHeading=false,lastView=null;
var VIEWS=[["jour","Aujourd'hui","sun"],["agenda","Agenda","calendar"],["conduite","Conduite","car"],["cours","Cours","school"],["titan","Titan AI","sparkle"],["clients","Clients","users"],["taches","Tâches","checks"],["finances","Finances","wallet"]];
var NAV_GROUPS=[["Planning",["jour","agenda","conduite"]],["École",["cours","titan"]],["Activité",["clients","taches","finances"]]];

function syncInfo(){
  if(S.error)return ["bad",S.error.code==="corrupt"?"Fichier de données illisible":"Enregistrement en échec"];
  if(S.mode==="pending")return ["","Chargement…"];
  if(S.mode==="local")return ["warn","Enregistré dans ce navigateur"];
  return ["ok","Enregistré sur ce PC"];
}
function navBtn(v,count,warnCount){
  var cur=S.ui.view===v[0];
  return '<button type="button" data-act="nav" data-view="'+v[0]+'"'+(cur?' aria-current="page"':'')+' title="'+esc(v[1])+'">'+icon(v[2])+'<span class="label">'+esc(v[1])+'</span>'+
    (count?'<span class="badge'+(warnCount?" warn":"")+'">'+count+'</span><span class="badge-dot"></span>':'')+'</button>';
}
function renderChrome(){
  var tk=todayKey(),nToday=0,todo=0,unpaid=0;
  S.rdv.forEach(function(r){if(r.date===tk&&r.statut!=="annule")nToday++;if(r.statut==="fait")unpaid++;});
  S.taches.forEach(function(t){if(!t.fait)todo++;});
  var mailU=typeof mailUnreadCount==="function"?mailUnreadCount():0,props=S.sarool?S.sarool.proposals.length:0;
  var counts={jour:nToday,agenda:0,conduite:props,cours:mailU,titan:0,clients:0,taches:todo,finances:unpaid};
  var byId={};VIEWS.forEach(function(v){byId[v[0]]=v;});
  var st=S.settings,hide={conduite:st.modConduite===false,cours:st.modEcole===false,clients:st.modPro===false,finances:st.modPro===false};var bs=document.getElementById("brand-sub");if(bs&&bs.textContent!==(st.prenom||""))bs.textContent=st.prenom||"";
  var navChanged=setHTML("nav",NAV_GROUPS.map(function(g){return [g[0],g[1].filter(function(id){return !hide[id];})];}).filter(function(g){return g[1].length;}).map(function(g){return '<p class="nav-group">'+esc(g[0]==="École"&&st.modEcole===false?"Assistant":g[0])+'</p>'+g[1].map(function(id){return navBtn(byId[id],counts[id],id==="finances"||id==="conduite");}).join("");}).join(""));
  navChanged=setHTML("nav-foot",navBtn(["reglages","Réglages","sliders"],0))||navChanged;
  var si=syncInfo(),el=document.getElementById("sync");if(el.className!=="sync "+si[0])el.className="sync "+si[0];setHTML("sync",'<span class="dot"></span><span>'+esc(si[1])+'</span>');
  setHTML("theme-btn",icon(isDark()?"sun":"moon"));
  document.getElementById("theme-btn").setAttribute("aria-label",isDark()?"Passer en thème clair":"Passer en thème sombre");
  var nb=document.getElementById("notif-btn");if(nb&&typeof unreadNotifs==="function"){var u=unreadNotifs();setHTML("notif-btn",icon("bell")+(u?'<span class="nb-count num">'+(u>9?"9+":u)+'</span>':''));nb.setAttribute("aria-label","Notifications"+(u?", "+u+" non lues":""));nb.setAttribute("aria-expanded",S.ui.notifOpen?"true":"false");}
  var tb=document.getElementById("titan-btn");if(tb)tb.setAttribute("aria-pressed",S.titan&&S.titan.open?"true":"false");
  if(nb&&typeof unreadNotifs==="function"){var un=unreadNotifs();if(un>lastUnread&&lastUnread>=0){nb.classList.remove("ring");void nb.offsetWidth;nb.classList.add("ring");}lastUnread=un;}
  if(navChanged)placeNavIndicator();
}
var lastUnread=-1,chromeHTML={};
function setHTML(id,html){if(chromeHTML[id]===html)return false;var el=document.getElementById(id);if(!el)return false;chromeHTML[id]=html;el.innerHTML=html;return true;}
/* Pastille de verre qui glisse vers la rubrique active */
function placeNavIndicator(){
  var ind=document.getElementById("nav-ind"),rail=document.querySelector(".rail"),cur=rail&&rail.querySelector('.nav button[aria-current="page"]');
  if(!ind||!rail)return;if(!cur){ind.style.opacity="0";return;}
  var rr=rail.getBoundingClientRect(),cr=cur.getBoundingClientRect();
  ind.style.opacity="1";ind.style.transform="translate("+(cr.left-rr.left)+"px,"+(cr.top-rr.top+rail.scrollTop)+"px)";ind.style.width=cr.width+"px";ind.style.height=cr.height+"px";
}
window.addEventListener("resize",function(){placeNavIndicator();});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){placeNavIndicator();});
/* Chiffres qui défilent jusqu'à leur valeur à l'arrivée sur une page */
function countUp(root){
  if(document.documentElement.getAttribute("data-fx")==="aucun")return;
  Array.prototype.forEach.call(root.querySelectorAll("[data-count]"),function(el){var to=Number(el.getAttribute("data-count"))||0,fmt=el.getAttribute("data-fmt")||"",t0=performance.now(),D=700;
    if(!to)return;function f(t){var p=Math.min(1,(t-t0)/D),v=to*(1-Math.pow(1-p,3));el.textContent=fmt==="h"?hDur(v):fmt==="eur"?euro(Math.round(v)):String(Math.round(v));if(p<1)requestAnimationFrame(f);}requestAnimationFrame(f);});
}
function render(){
  if(rsRaf){cancelAnimationFrame(rsRaf);rsRaf=0;}
  renderChrome();
  if(!S.ready){main.innerHTML='<p class="loading">Chargement de ton carnet…</p>';return;}
  var ae=document.activeElement,fid=(ae&&ae.id&&main.contains(ae))?ae.id:null,sel=null,st=main.scrollTop;
  if(fid&&typeof ae.selectionStart==="number")sel=[ae.selectionStart,ae.selectionEnd];
  var v=S.ui.view,html="";
  if(v==="jour")html=viewToday();else if(v==="agenda")html=viewAgenda();else if(v==="clients")html=viewClients();
  else if(v==="taches")html=viewTaches();else if(v==="finances")html=viewFinances();
  else if(v==="conduite")html=viewConduite();else if(v==="cours")html=viewCoursMails();else if(v==="titan")html=viewTitan();else html=viewReglages();
  var changed=lastView!==v;lastView=v;
  main.innerHTML='<div class="page'+(v==="reglages"?" narrow":"")+(v==="titan"?" chat":"")+(changed?" enter":"")+'">'+errBanner()+html+'</div>';
  if(changed)countUp(main);
  if(changed&&typeof drawTitanDrawer==="function")drawTitanDrawer();
  if(v==="titan"){var th=document.getElementById("t-thread");if(th&&changed)th.scrollTop=th.scrollHeight;if(typeof autoGrow==="function")autoGrow();}
  if(changed)main.scrollTop=0;else main.scrollTop=st;
  if(fid){var el=document.getElementById(fid);if(el){el.focus({preventScroll:true});if(sel&&el.setSelectionRange){try{el.setSelectionRange(sel[0],sel[1]);}catch(e){}}}}
  else if(focusHeading){var h=main.querySelector("h1");if(h)h.focus({preventScroll:true});}
  focusHeading=false;
}
function errBanner(){
  if(!S.error)return "";
  return '<div class="notice"><div><b>'+(S.error.code==="corrupt"?"Ton fichier de données est illisible.":"Le dernier enregistrement a échoué.")+'</b> '+
    (S.error.code==="corrupt"?"Il a été mis de côté (carnet-illisible-….json dans le dossier de données) : restaure la sauvegarde d'hier dans Réglages, Tes données.":"Vérifie l'espace disque, puis refais ta dernière modification.")+'</div></div>';
}
function chip(r){return '<span class="chip '+esc(r.statut)+'">'+STATUTS[r.statut]+'</span>';}
function rdvAction(r,cls){
  if(r.statut==="prevu")return '<button type="button" class="btn sm'+(cls||"")+'" data-act="set-fait" data-id="'+esc(r.id)+'">Marquer fait</button>';
  if(r.statut==="fait")return '<button type="button" class="btn sm primary" data-act="encaisser" data-id="'+esc(r.id)+'">Encaisser</button>';
  return "";
}
function ritem(r,showClient){
  var f=r.factureId?S.factures.get(r.factureId):null;
  return '<div class="ritem" data-act="edit-rdv" data-id="'+esc(r.id)+'" tabindex="0" role="button">'+
    '<div class="when">'+esc(relDay(r.date))+'<small>'+hm(r.heure)+', '+dur(r.duree)+'</small></div>'+
    '<div class="what"><b>'+esc(showClient===false?(r.forfaitNom||"Intervention"):rdvName(r))+'</b><span>'+esc(showClient===false?euro(r.prix)+(f?", facture "+f.numero:""):(r.forfaitNom||"")+", "+euro(r.prix))+'</span></div>'+
    '<div class="side">'+chip(r)+rdvAction(r)+'</div></div>';
}

/* ---------- Aujourd'hui ---------- */
function viewToday(){
  var tk=todayKey(),now=new Date(),hr=now.getHours();
  var todays=rdvList().filter(function(r){return r.date===tk&&r.statut!=="annule";}),all=coursOn(tk);
  var nCours=all.filter(function(c){return c.kind!=="permis";}).length,nPermis=all.length-nCours;
  var nEv=eventsOn(tk).length;
  var parts=[];if(nCours)parts.push(nCours+" cours");if(nPermis)parts.push(nPermis+" leçon"+(nPermis>1?"s":"")+" de conduite");if(nEv)parts.push(nEv+" événement"+(nEv>1?"s":""));if(todays.length)parts.push(todays.length+" rendez-vous client"+(todays.length>1?"s":""));
  var lede=parts.length?cap(parts.length>1?parts.slice(0,-1).join(", ")+" et "+parts[parts.length-1]:parts[0])+" aujourd'hui.":"Rien de prévu aujourd'hui : profites-en.";
  var greet=hr<5?"Bonne nuit":hr<12?"Bonjour":hr<18?"Bon après-midi":"Bonsoir";
  var h='<header class="page-head"><div><p class="eyebrow">'+icon("calendar")+esc(cap(fDayY.format(now)))+'</p><h1 tabindex="-1">'+esc(greet+(S.settings.prenom?", "+S.settings.prenom:""))+'</h1><p class="lede">'+esc(lede)+'</p></div>'+
    '<div class="head-actions"><button class="btn" type="button" data-act="new-event">'+icon("plus")+'Événement</button><button class="btn ghost" type="button" data-act="new-client">'+icon("users")+'Client</button></div></header>';
  h+='<form class="ask-bar" id="quick-titan-form" autocomplete="off"><span class="t-av sm" aria-hidden="true">'+icon("sparkle")+'</span><input type="text" id="quick-titan" placeholder="Demande à Titan : « Ajoute une révision demain à 18h », « Trouve ma convocation »" aria-label="Poser une question à Titan AI"><kbd>Ctrl J</kbd><button class="btn ghost icon sm mic-btn" type="button" data-act="voice-quick" aria-label="Parler à Titan" title="Message vocal (Ctrl+Alt+V)">'+icon("mic")+'</button><button class="btn primary sm" type="submit">Demander</button></form>';
  h+=setupCard();
  if(S.settings.modPro!==false&&tk<START_KEY)h+='<div class="notice info slim"><div>'+icon("info")+'<span><b>Ton activité démarre '+esc(startLabel())+'.</b> Tu peux déjà prendre des rendez-vous clients, mais tu n\'encaisses rien avant.</span></div></div>';
  var r=nextRdv(),ev=nextEvent(),useEv=ev&&(!r||ev.start<rdvStart(r).getTime());
  h+='<div class="today">'+(useEv?eventTicket(ev):heroTicket(r))+'<section class="dayline" aria-labelledby="dl-h"><div class="sec-head"><h2 class="sec" id="dl-h">Ta journée</h2><button class="linklike" type="button" data-act="goto-agenda" data-date="'+tk+'" data-mode="jour">Ouvrir dans l\'agenda</button></div>'+dayline(tk)+'</section>'+sideCol()+'</div>';
  return h;
}
/* Prochain cours ou prochaine leçon (sur 7 jours) */
function nextEvent(){
  var now=Date.now();
  for(var i=0;i<8;i++){var k=keyOf(addDays(new Date(),i)),list=coursOn(k).concat(eventsOn(k).filter(function(e){return !e.allDay;}).map(function(e){return {kind:"event",uid:e.id,id:e.id,titre:e.titre,date:e.date,heure:e.heure,duree:Number(e.duree)||60,lieu:e.lieu,cat:e.cat};})).sort(function(a,b){return toMin(a.heure)-toMin(b.heure);});
    for(var j=0;j<list.length;j++){var c=list[j],d=parseKey(k),m=toMin(c.heure);d.setHours(Math.floor(m/60),m%60,0,0);var st=d.getTime(),en=st+c.duree*60000;if(en>now)return {c:c,start:st,end:en};}}
  return null;
}
function evCountdown(st,en){var now=Date.now();if(now>=st&&now<en)return {live:true,text:"En cours, fin à "+hm(fromM(new Date(en).getHours()*60+new Date(en).getMinutes()))};
  var mins=Math.round((st-now)/60000);if(mins<1)return {live:true,text:"Maintenant"};if(mins<60)return {text:"Dans "+mins+" min"};
  if(mins<24*60){var h=Math.floor(mins/60),m=mins%60;return {text:"Dans "+h+" h"+(m?" "+pad(m):"")};}
  var days=Math.round((parseKey(keyOf(new Date(st)))-parseKey(todayKey()))/86400000);return {text:days===1?"Demain":"Dans "+days+" jours"};}
function eventTicket(ev){
  var c=ev.c,isP=c.kind==="permis",isE=c.kind==="event",cd=evCountdown(ev.start,ev.end),k=c.date;
  if(isE){var cat=evCat(c.cat);
    return '<section class="ticket t-event" style="--evc:'+cat[2]+'" aria-labelledby="t-h"><div class="stub"><p class="t-label" id="t-h">Prochain événement</p><p class="t-time num">'+hm(c.heure)+'</p>'+
      '<p class="t-when'+(cd.live?" live":"")+'" data-cd-start="'+ev.start+'" data-cd-end="'+ev.end+'">'+esc(cd.text)+'</p><p class="t-day">'+esc(relDay(k))+', '+dur(c.duree)+'</p></div><div class="perf" aria-hidden="true"></div>'+
      '<div class="t-body"><div class="t-client"><span class="t-kind">'+icon("calendar")+'</span><div><h2>'+esc(c.titre)+'</h2><p>'+esc(cat[1])+'</p></div></div>'+(c.lieu?'<p class="t-addr">'+icon("pin")+esc(c.lieu)+'</p>':'')+
      '<div class="t-actions"><button class="btn primary" type="button" data-act="edit-event" data-eid="'+esc(c.id)+'">'+icon("edit")+'Modifier</button><button class="btn" type="button" data-act="goto-agenda" data-date="'+k+'" data-mode="jour">'+icon("calendar")+'Voir la journée</button></div></div></section>';}
  var actions='<button class="btn primary" type="button" data-act="goto-agenda" data-date="'+k+'" data-mode="jour">'+icon("calendar")+'Voir la journée</button>'+
    (isP?'<button class="btn" type="button" data-act="nav" data-view="conduite">'+icon("car")+'Conduite</button>'+(c.rdv?'<a class="btn" href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(c.rdv)+'" target="_blank" rel="noopener">'+icon("pin")+'Itinéraire</a>':''):'<button class="btn" type="button" data-act="show-cours" data-uid="'+esc(c.uid)+'">'+icon("info")+'Détails</button>')+
    '<button class="btn" type="button" data-act="titan-ask" data-q="'+esc("Qu'est-ce que j'ai "+(k===todayKey()?"aujourd'hui":"le "+fDay.format(parseKey(k)))+" ?")+'">'+icon("sparkle")+'Demander à Titan</button>';
  return '<section class="ticket '+(isP?"t-permis":"t-cours")+'" aria-labelledby="t-h"><div class="stub"><p class="t-label" id="t-h">'+(isP?"Prochaine leçon de conduite":"Prochain cours")+'</p><p class="t-time num">'+hm(c.heure)+'</p>'+
    '<p class="t-when'+(cd.live?" live":"")+'" data-cd-start="'+ev.start+'" data-cd-end="'+ev.end+'">'+esc(cd.text)+'</p><p class="t-day">'+esc(relDay(k))+', '+dur(c.duree)+'</p></div><div class="perf" aria-hidden="true"></div>'+
    '<div class="t-body"><div class="t-client"><span class="t-kind">'+icon(isP?"car":"school")+'</span><div><h2>'+esc(c.titre)+'</h2><p>'+esc(isP?(c.moniteur?"Avec "+c.moniteur:(S.settings.autoEcole?"Auto-école "+S.settings.autoEcole:"Auto-école")):(S.settings.ecole||"École"))+'</p></div></div>'+
    (c.lieu&&!isP?'<p class="t-addr">'+icon("pin")+esc(c.lieu)+'</p>':'')+(isP&&c.rdv?'<p class="t-addr">'+icon("pin")+'RDV '+esc(c.rdv)+'</p>':'')+
    '<div class="t-actions">'+actions+'</div></div></section>';
}
function heroTicket(r){
  if(!r)return '<section class="ticket empty" aria-labelledby="t-h"><div class="stub"><p class="t-label" id="t-h">Prochain rendez-vous</p><p class="t-time">Aucun</p><p class="t-day">Ton agenda est libre.</p></div><div class="perf" aria-hidden="true"></div>'+
    '<div class="t-body"><p style="font-size:15px">Prends ton prochain rendez-vous en quelques secondes : tape le nom du client, choisis un créneau libre, c\'est noté.</p><div class="t-actions"><button class="btn primary" type="button" data-act="new-rdv">'+icon("plus")+'Nouveau rendez-vous</button><button class="btn" type="button" data-act="nav" data-view="agenda">Voir l\'agenda</button></div></div></section>';
  var c=clientOf(r),cd=countdown(r),adr=rdvAddr(r),f=forfait(r.forfait);
  var started=Date.now()>=rdvStart(r).getTime(),actions="";
  if(started)actions+='<button class="btn primary" type="button" data-act="set-fait" data-id="'+esc(r.id)+'">'+icon("check")+'Marquer fait</button>';
  if(adr)actions+='<a class="btn'+(started?"":" primary")+'" href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(adr)+'" target="_blank" rel="noopener">'+icon("pin")+'Itinéraire</a>';
  actions+='<button class="btn'+(!started&&!adr?" primary":"")+'" type="button" data-act="copy-sms" data-id="'+esc(r.id)+'">'+icon("message")+'Copier le SMS</button>';
  if(c&&c.tel)actions+='<button class="btn" type="button" data-act="copy" data-copy="'+esc(c.tel)+'" title="'+esc(c.tel)+'">'+icon("phone")+'Copier le numéro</button>';
  actions+='<button class="btn icon" type="button" data-act="edit-rdv" data-id="'+esc(r.id)+'" aria-label="Modifier le rendez-vous">'+icon("edit")+'</button>';
  var mats=c&&c.materiel&&c.materiel.length?c.materiel.map(function(m){return m.modele||m.type;}).join(", "):"";
  return '<section class="ticket" aria-labelledby="t-h"><div class="stub"><p class="t-label" id="t-h">Prochain rendez-vous</p><p class="t-time num">'+hm(r.heure)+'</p>'+
    '<p class="t-when'+(cd.live?" live":"")+'" data-countdown="'+esc(r.id)+'">'+esc(cd.text)+'</p><p class="t-day">'+esc(relDay(r.date))+', '+dur(r.duree)+'</p></div><div class="perf" aria-hidden="true"></div>'+
    '<div class="t-body"><div class="t-client">'+avatar(rdvName(r))+'<div><h2>'+esc(rdvName(r))+'</h2><p>'+esc((r.forfaitNom||(f?f.nom:"Intervention"))+", "+euro(r.prix))+'</p></div></div>'+
    (adr?'<p class="t-addr">'+icon("pin")+esc(adr)+'</p>':'')+(r.note?'<p class="t-note">'+esc(r.note)+'</p>':'')+(mats?'<p class="t-addr">'+icon("monitor")+esc(mats)+'</p>':'')+
    '<div class="t-actions">'+actions+'</div></div></section>';
}
function dayline(k){
  var now=new Date(),isToday=k===todayKey(),nowMin=now.getHours()*60+now.getMinutes();
  var items=busyOn(k,null).map(function(x){return x;});
  var out=[],cursor=9*60;
  function gap(a,b){if(b-a<60)return;if(isToday&&b<=nowMin)return;var from=isToday?Math.max(a,Math.ceil(nowMin/15)*15):a;if(b-from<45)return;
    out.push('<li class="li gap"><span class="li-time">'+hm(fromM(from))+'</span><span class="li-dot"></span><div class="li-body"><span>Libre jusqu\'à '+hm(fromM(b))+'</span><button class="btn sm" type="button" data-act="new-event" data-date="'+k+'" data-heure="'+fromM(from)+'">'+icon("plus")+'Ajouter</button></div></li>');}
  items.forEach(function(x){
    if(x.a>cursor)gap(Math.max(cursor,9*60),Math.min(x.a,19*60));
    cursor=Math.max(cursor,x.b);
    var past=isToday&&x.b<=nowMin,live=isToday&&x.a<=nowMin&&x.b>nowMin;
    if(x.c){out.push('<li class="li cours'+(x.c.kind==="permis"?" permis":"")+(past?" past":"")+(live?" now":"")+'"><span class="li-time">'+hm(x.c.heure)+'<small>'+hm(fromM(x.b))+'</small></span><span class="li-dot"></span><div class="li-body" data-act="show-cours" data-uid="'+esc(x.c.uid)+'" tabindex="0" role="button"><div class="li-main"><b>'+esc(x.c.titre)+'</b><span>'+kindLabel(x.c)+(x.c.lieu?", "+esc(x.c.lieu):"")+'</span></div><span class="chip cours'+(x.c.kind==="permis"?" permis":"")+'">'+kindLabel(x.c)+'</span></div></li>');return;}
    if(x.e){var e=x.e,ct=evCat(e.cat);out.push('<li class="li evt'+(past?" past":"")+(live?" now":"")+'" style="--evc:'+ct[2]+'"><span class="li-time">'+hm(e.heure)+'<small>'+hm(fromM(x.b))+'</small></span><span class="li-dot"></span><div class="li-body" data-act="edit-event" data-eid="'+esc(e.id)+'" tabindex="0" role="button"><div class="li-main"><b>'+esc(e.titre)+'</b><span>'+esc(ct[1]+(e.lieu?", "+e.lieu:""))+'</span></div><span class="chip evc">'+esc(ct[1])+'</span></div></li>');return;}
    var r=x.r;
    out.push('<li class="li rdv st-'+esc(r.statut)+(past?" past":"")+(live?" now":"")+'"><span class="li-time">'+hm(r.heure)+'<small>'+hm(fromM(x.b))+'</small></span><span class="li-dot"></span><div class="li-body" data-act="edit-rdv" data-id="'+esc(r.id)+'" tabindex="0" role="button"><div class="li-main"><b>'+esc(rdvName(r))+'</b><span>'+esc((r.forfaitNom||"")+(rdvAddr(r)?", "+rdvAddr(r):""))+'</span></div><div class="row">'+chip(r)+rdvAction(r)+'</div></div></li>');
  });
  if(cursor<19*60)gap(Math.max(cursor,9*60),19*60);
  if(!out.length)return '<div class="empty">Ta journée est passée. Prépare demain depuis l\'agenda.<button class="btn sm" type="button" data-act="goto-agenda" data-date="'+keyOf(addDays(parseKey(k),1))+'" data-mode="jour">Voir demain</button></div>';
  return '<ol class="line">'+out.join("")+'</ol>';
}
function widgetConduite(){
  var st=S.settings,h='<section class="widget" aria-labelledby="wc-h"><div class="sec-head"><h2 class="sec" id="wc-h"><span class="w-ico drive">'+icon("car")+'</span>Conduite</h2><button class="linklike" type="button" data-act="nav" data-view="conduite">Ouvrir</button></div>';
  if(!st.saroolOn)return h+'<p class="hint">Connecte Sarool pour voir tes leçons et réserver automatiquement sur tes temps libres.</p><button class="btn sm" type="button" data-act="sarool-login">'+icon("power")+'Se connecter à Sarool</button></section>';
  var nx=nextLesson(),wm=minutesInWeek(todayKey()),capM=capMin(),props=S.sarool.proposals.length;
  h+='<div class="w-line">'+(nx?'<b>'+esc(relDay(nx.date))+' · '+hm(nx.heure)+'–'+hm(fromM(toMin(nx.heure)+nx.duree))+'</b><small>'+esc(nx.moniteur?"Avec "+nx.moniteur:"Leçon de conduite")+'</small>':'<b>Aucune leçon à venir</b>')+'</div>'+
    '<div class="meter sm" aria-hidden="true"><i style="width:'+(capM?Math.min(100,Math.round(wm/capM*100)):0)+'%"></i></div><p class="w-foot"><span class="num">'+hDur(wm)+' / '+hDur(capM)+' cette semaine</span><span class="chip '+(st.autoOn?"ok-soft":"plain")+'">'+icon(st.autoOn?"zap":"power")+(st.autoOn?(st.autoMode==="ask"?"Propositions":"Auto activée"):"Auto désactivée")+'</span></p>'+
    (props?'<button class="btn sm ok" type="button" data-act="nav" data-view="conduite">'+props+' créneau'+(props>1?"x":"")+' à valider</button>':'');
  return h+'</section>';
}
function widgetMails(){
  var h='<section class="widget" aria-labelledby="wm-h"><div class="sec-head"><h2 class="sec" id="wm-h"><span class="w-ico school">'+icon("mail")+'</span>Mails de cours</h2><button class="linklike" type="button" data-act="nav" data-view="cours">Tout voir</button></div>';
  if(typeof S.mail==="undefined"||!S.mail.account)return h+'<p class="hint">Relie ta boîte de l\'école pour voir ici les mails de tes profs.</p><button class="btn sm" type="button" data-act="mail-account">'+icon("power")+'Relier la boîte mail</button></section>';
  var list=S.mail.list.slice(0,4);if(!list.length)return h+'<p class="hint">'+(S.mail.busy?"Synchronisation…":"Aucun mail récent de l'école.")+'</p></section>';
  return h+'<div class="w-mails">'+list.map(function(m){var u=isUnread(m),nm=senderName(m.from);return '<button type="button" class="w-mail'+(u?" unread":"")+'" data-act="goto-mail" data-id="'+esc(m.id)+'">'+avatar(nm,"sm")+'<span class="grow"><b>'+esc(nm)+'</b><small>'+esc(m.subject)+'</small></span><time class="num">'+esc(mailDateLabel(m.date))+'</time></button>';}).join("")+'</div></section>';
}
function widgetNotifs(){
  var list=S.notifs.slice(0,3);if(!list.length)return "";
  return '<section class="widget" aria-labelledby="wn-h"><div class="sec-head"><h2 class="sec" id="wn-h"><span class="w-ico info">'+icon("bell")+'</span>Derniers changements</h2><button class="linklike" type="button" data-act="notif-toggle">Tout voir</button></div><div class="w-notifs">'+
    list.map(function(n){var m=NOTIF_META[n.type]||NOTIF_META.modifie;return '<button type="button" class="w-notif t-'+esc(n.type)+(n.read?"":" unread")+'" data-act="notif-open" data-id="'+esc(n.id)+'"><span class="np-ico">'+icon(m.ic)+'</span><span class="grow"><b>'+esc(n.title)+'</b><small>'+esc(n.body)+'</small></span></button>';}).join("")+'</div></section>';
}
/* À venir : examens, rendus, convocations et échéances, avec compte à rebours */
var IMPORTANT=/exam|partiel|soutenance|rendu|convocation|oral|controle|evaluation|ds\b|projet|entretien|code de la route|permis/;
function widgetCountdown(){
  var tk=todayKey(),lim=keyOf(addDays(new Date(),45)),items=[];
  S.events.forEach(function(e){if(e.date<tk||e.date>lim)return;var t=norm(e.titre+" "+(e.note||""));if(e.cat==="ecole"&&IMPORTANT.test(t)||e.cat==="revision"&&/exam|partiel/.test(t)||IMPORTANT.test(t))items.push({k:e.date,t:e.titre,s:(e.allDay?"":hm(e.heure)+" · ")+(e.lieu||evCat(e.cat)[1]),c:evCat(e.cat)[2],act:'data-act="edit-event" data-eid="'+esc(e.id)+'"'});});
  S.cours.forEach(function(c){if(c.date<tk||c.date>lim)return;if(IMPORTANT.test(norm(c.titre)))items.push({k:c.date,t:c.titre,s:(c.heure?hm(c.heure)+" · ":"")+(c.lieu||"École"),c:"#c084fc",act:'data-act="goto-agenda" data-date="'+c.date+'" data-mode="jour"'});});
  S.taches.forEach(function(t){if(!t.fait&&t.echeance&&t.echeance>=tk&&t.echeance<=keyOf(addDays(new Date(),30)))items.push({k:t.echeance,t:t.titre,s:"Tâche à rendre",c:"#f5b94a",act:'data-act="nav" data-view="taches"'});});
  if(!items.length)return "";
  items.sort(function(a,b){return a.k.localeCompare(b.k);});
  return '<section class="widget" aria-labelledby="wd-h"><div class="sec-head"><h2 class="sec" id="wd-h"><span class="w-ico info">'+icon("flag")+'</span>À venir</h2></div><div class="countdown-list">'+
    items.slice(0,5).map(function(x){var d=Math.round((parseKey(x.k)-parseKey(tk))/86400000);return '<button type="button" class="cd-item" '+x.act+'><span class="cd-j num" style="--evc:'+x.c+'">'+(d===0?"Auj.":d===1?"Dem.":"J-"+d)+'</span><span class="grow"><b>'+esc(x.t)+'</b><small>'+esc(cap(fShort.format(parseKey(x.k)).replace(/\./g,""))+" · "+x.s)+'</small></span></button>';}).join("")+'</div></section>';
}
function sideCol(){
  var unpaid=rdvList().filter(function(r){return r.statut==="fait";});
  var todo=Array.from(S.taches.values()).filter(function(t){return !t.fait;}).sort(taskSort);
  var now=new Date(),mk=monthKey(now),enc=sumOf(recettes(function(r){return r.payeLe.slice(0,7)===mk;}));
  var h='<aside class="side-col">'+widgetCountdown()+widgetConduite()+widgetMails()+widgetNotifs();
  if(unpaid.length){var tot=sumOf(unpaid);
    h+='<section aria-labelledby="enc-h"><div class="sec-head"><h2 class="sec" id="enc-h">À encaisser</h2><span class="chip fait num">'+euro(tot)+'</span></div><div class="mini-list">'+
      unpaid.map(function(r){return '<div class="mini">'+avatar(rdvName(r))+'<div class="grow"><b>'+esc(rdvName(r))+'</b><small>'+esc(relDay(r.date))+', '+euro(r.prix)+'</small></div><button class="btn sm primary" type="button" data-act="encaisser" data-id="'+esc(r.id)+'">Encaisser</button></div>';}).join("")+'</div></section>';}
  h+='<section aria-labelledby="todo-h"><div class="sec-head"><h2 class="sec" id="todo-h">Tâches</h2><button class="linklike" type="button" data-act="nav" data-view="taches">Tout voir</button></div>'+quickTask()+
    (todo.length?'<div style="margin-top:6px">'+todo.slice(0,6).map(taskRow).join("")+'</div>'+(todo.length>6?'<p class="hint" style="margin:6px">Et '+(todo.length-6)+' autres tâches.</p>':''):
      '<div class="empty" style="margin-top:10px">Aucune tâche en cours.'+(S.taches.size?'':'<button class="btn sm" type="button" data-act="import-tasks">Ajouter les étapes de lancement</button>')+'</div>')+'</section>';
  h+='<section aria-labelledby="mo-h"><div class="sec-head"><h2 class="sec" id="mo-h">'+esc(cap(fMonth.format(now)))+'</h2><button class="linklike" type="button" data-act="nav" data-view="finances">Finances</button></div>'+
    '<p class="month-line">Encaissé ce mois-ci : <strong class="num">'+euro(enc)+'</strong>. Reste à encaisser : <strong class="num">'+euro(sumOf(unpaid))+'</strong>. Repère CAF : <strong class="num">'+Math.round(enc/CAF_PLAFOND*100)+' %</strong> des '+euro(CAF_PLAFOND)+' mensuels.</p></section>';
  return h+'</aside>';
}
function taskRow(t){
  var chipH="";if(t.echeance&&!t.fait){var tk=todayKey(),soon=keyOf(addDays(new Date(),3));
    var cls=t.echeance<tk?"late":(t.echeance<=soon?"soon":"plain");chipH='<span class="chip '+cls+'">'+(t.echeance<tk?"En retard, ":"")+esc(fDM.format(parseKey(t.echeance)))+'</span>';}
  return '<div class="task'+(t.fait?" done":"")+'"><button type="button" class="check" data-act="toggle-task" data-id="'+esc(t.id)+'" aria-label="'+(t.fait?"Marquer à faire : ":"Marquer fait : ")+esc(t.titre)+'" aria-pressed="'+(t.fait?"true":"false")+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+IC.check+'</svg></button><div class="tt">'+esc(t.titre)+'</div>'+chipH+
    '<button type="button" class="btn ghost icon sm x" data-act="del-task" data-id="'+esc(t.id)+'" aria-label="Supprimer la tâche '+esc(t.titre)+'">'+icon("x")+'</button></div>';
}
function quickTask(){
  return '<form class="quick" id="task-form" autocomplete="off"><input type="text" id="task-input" placeholder="Nouvelle tâche" value="'+esc(S.ui.taskDraft)+'" aria-label="Nouvelle tâche">'+
    '<input type="date" id="task-date" value="'+esc(S.ui.taskDate)+'" aria-label="Échéance (facultatif)" style="width:auto"><button class="btn primary" type="submit">Ajouter</button></form>';
}

/* ---------- Agenda ---------- */
function agendaDays(){var a=parseKey(S.ui.anchor),m=S.ui.agendaMode;if(m==="jour")return [a];var s=startOfWeek(a),d=[];for(var i=0;i<7;i++)d.push(addDays(s,i));return d;}
function viewAgenda(){
  var mode=S.ui.agendaMode,a=parseKey(S.ui.anchor),title;
  if(mode==="jour")title=cap(fDay.format(a));
  else if(mode==="mois")title=cap(fMonthY.format(a));
  else{var s=startOfWeek(a),e=addDays(s,6);title=s.getMonth()===e.getMonth()?"Du "+s.getDate()+" au "+fDM.format(e):"Du "+fDM.format(s)+" au "+fDM.format(e);}
  var h='<header class="agenda-head"><h1 tabindex="-1">'+esc(title)+'</h1>'+
    '<span class="seg" role="group" aria-label="Vue">'+[["jour","Jour"],["semaine","Semaine"],["mois","Mois"]].map(function(o){return '<button type="button" data-act="agenda-mode" data-mode="'+o[0]+'" aria-pressed="'+(mode===o[0])+'">'+o[1]+'</button>';}).join("")+'</span>'+
    '<span class="navgroup"><button class="btn icon" type="button" data-act="agenda-nav" data-dir="-1" aria-label="Période précédente">'+icon("left")+'</button><button class="btn" type="button" data-act="agenda-nav" data-dir="0">Aujourd\'hui</button><button class="btn icon" type="button" data-act="agenda-nav" data-dir="1" aria-label="Période suivante">'+icon("right")+'</button></span></header>';
  if(mode==="mois")return h+monthGrid(a)+'<p class="hint">Clique sur un jour pour l\'ouvrir.</p>';
  h+=timeGrid(agendaDays());
  h+='<div class="legend"><span><i class="l-prevu"></i>Prévu</span><span><i class="l-fait"></i>À encaisser</span><span><i class="l-paye"></i>Payé</span><span><i class="l-cours"></i>Cours</span><span><i class="l-permis"></i>Conduite</span><span><i class="l-evt"></i>Événements perso</span>'+
    (S.settings.saroolOn?'<button type="button" class="legend-toggle" data-act="toggle-dispo" aria-pressed="'+(S.ui.showDispo?"true":"false")+'"><i class="l-dispo"></i>Créneaux auto-école compatibles</button>':'')+'<span><i class="l-libre"></i>Disponible (9h–19h)</span>'+
    '<span class="tip">Glisse un événement ou un rendez-vous pour le déplacer (ou Alt + flèches). Clique sur un créneau vide pour ajouter.</span></div>';
  return h;
}
function timeGrid(days){
  var tk=todayKey(),lo=8*60,hi=20*60,n=days.length,one=n===1;
  days.forEach(function(d){busyOn(keyOf(d),null).forEach(function(x){if(x.a<lo)lo=Math.floor(x.a/60)*60;if(x.b>hi)hi=Math.ceil(x.b/60)*60;});});
  var H=(hi-lo)/30*GH,now=new Date(),nowMin=now.getHours()*60+now.getMinutes();
  var h='<div class="tg-wrap"><div class="tg'+(one?" one":"")+'" style="--n:'+n+';--h:'+H+'px"><div class="tg-corner"></div>';
  days.forEach(function(d){var k=keyOf(d);
    h+='<div class="tg-head'+(k===tk?" today":"")+'"><span class="dn">'+esc(cap(fWd.format(d).replace(".","")))+'</span><span class="dd num">'+d.getDate()+'</span>'+
      (one?'<span class="dn">'+esc(fMonthY.format(d))+'</span>':'')+
      '<button class="btn ghost icon sm tg-add" type="button" data-act="new-event" data-date="'+k+'" aria-label="Ajouter un événement le '+esc(fDay.format(d))+'">'+icon("plus")+'</button>'+
      coursOn(k,true).filter(function(c){return c.allDay;}).map(function(c){return '<span class="tg-allday" title="'+esc(c.titre)+'">'+esc(c.titre)+'</span>';}).join("")+
      eventsOn(k).filter(function(e){return e.allDay;}).map(function(e){return '<button type="button" class="tg-allday evt" style="--evc:'+evCat(e.cat)[2]+'" data-act="edit-event" data-eid="'+esc(e.id)+'" title="'+esc(e.titre)+'">'+esc(e.titre)+'</button>';}).join("")+'</div>';});
  h+='<div class="tg-hours" aria-hidden="true">';for(var m=lo;m<hi;m+=60)h+='<span style="top:'+((m-lo)/30*GH)+'px">'+pad(m/60)+'h</span>';h+='</div>';
  days.forEach(function(d){var k=keyOf(d),past=k<tk;
    h+='<div class="tg-col'+(past?" past":"")+'" data-act="grid-slot" data-date="'+k+'" data-lo="'+lo+'" data-hi="'+hi+'">';
    var fa=Math.max(9*60,lo),fb=Math.min(19*60,hi);
    if(!past)h+='<div class="tg-free" style="top:'+((fa-lo)/30*GH)+'px;height:'+((fb-fa)/30*GH)+'px"></div>';
    if(past)h+='<div class="tg-past"></div>';
    else if(k===tk&&nowMin>lo){h+='<div class="tg-past" style="height:'+Math.min(H,(nowMin-lo)/30*GH)+'px"></div>';if(nowMin<hi)h+='<div class="tg-now" style="top:'+((nowMin-lo)/30*GH)+'px"></div>';}
    var evs=[];S.rdv.forEach(function(r){if(r.date===k){var a=toMin(r.heure);evs.push({r:r,a:a,b:a+(Number(r.duree)||60)});}});
    eventsOn(k).forEach(function(e){if(e.allDay)return;var a=toMin(e.heure);evs.push({ev:e,a:a,b:a+(Number(e.duree)||60)});});
    coursOn(k).forEach(function(c){var a=toMin(c.heure);evs.push({c:c,a:a,b:a+c.duree});});
    if(!past&&typeof dispoOn==="function")dispoOn(k).forEach(function(s){var a=toMin(s.heure);evs.push({d:s,a:a,b:a+s.duree});});
    evs.sort(function(x,y){return x.a-y.a;});
    var cluster=[],cEnd=-1;
    function flushC(){var ends=[];cluster.forEach(function(e){var l=0;while(ends[l]>e.a)l++;ends[l]=e.b;e.l=l;});cluster.forEach(function(e){e.n=ends.length;});cluster=[];}
    evs.forEach(function(e){if(e.a>=cEnd)flushC();cluster.push(e);cEnd=Math.max(cEnd,e.b);});flushC();
    evs.forEach(function(e){var top=(e.a-lo)/30*GH+1,ht=Math.max(24,(e.b-e.a)/30*GH-3),pos='top:'+top+'px;height:'+ht+'px;left:calc('+(e.l/e.n*100)+'% + 3px);width:calc('+(100/e.n)+'% - 6px)';
      if(e.ev){var x=e.ev,ct=evCat(x.cat);h+='<div class="tg-ev evt" style="'+pos+';--evc:'+ct[2]+'" data-act="edit-event" data-eid="'+esc(x.id)+'" tabindex="0" role="button" aria-label="'+esc(hm(x.heure)+", "+x.titre+", "+ct[1]+". Alt et flèches pour déplacer.")+'"><b class="ev-time">'+hm(x.heure)+'</b><span class="ev-name">'+esc(x.titre)+'</span>'+(ht>44?'<small>'+esc(x.lieu||ct[1])+'</small>':'')+'</div>';return;}
      if(e.d){var s=e.d;h+='<div class="tg-ev dispo'+(isPref(s)?" pref":"")+'" data-act="slot-open" data-sid="'+esc(s.id)+'" tabindex="0" role="button" aria-label="'+esc("Créneau libre à l'auto-école, "+hm(s.heure)+" à "+hm(s.fin)+", avec "+moniteurShort(s.moniteur)+". Entrée pour réserver.")+'" style="'+pos+'"><b>'+hm(s.heure)+'</b><em>Libre</em><span class="ev-name">'+(isPref(s)?icon("star"):'')+esc(moniteurShort(s.moniteur))+'</span>'+(ht>44?'<small>Cliquer pour réserver</small>':'')+'</div>';return;}
      if(e.c){var c=e.c;h+='<div class="tg-ev cours'+(c.kind==="permis"?" permis":"")+'" data-act="show-cours" data-uid="'+esc(c.uid)+'" tabindex="0" role="button" aria-label="'+esc(kindLabel(c)+", "+hm(c.heure)+", "+c.titre+(c.lieu?", "+c.lieu:""))+'" style="'+pos+'"><b>'+hm(c.heure)+'</b><em>'+kindLabel(c)+'</em><span class="ev-name">'+esc(c.titre)+'</span>'+(ht>44&&c.lieu?'<small>'+esc(c.lieu)+'</small>':'')+'</div>';return;}
      var r=e.r,lab=r.statut==="prevu"?"":'<em>'+STATUTS[r.statut]+'</em>';
      h+='<div class="tg-ev st-'+esc(r.statut)+'" data-act="edit-rdv" data-id="'+esc(r.id)+'" tabindex="0" role="button" aria-label="'+esc(hm(r.heure)+", "+rdvName(r)+", "+(r.forfaitNom||"")+", "+STATUTS[r.statut]+". Alt et flèches pour déplacer.")+'" style="'+pos+'">'+
        '<b class="ev-time">'+hm(r.heure)+'</b>'+lab+'<span class="ev-name">'+esc(rdvName(r))+'</span>'+(ht>44?'<small>'+esc(r.forfaitNom||"")+'</small>':'')+(one&&ht>70&&rdvAddr(r)?'<small>'+esc(rdvAddr(r))+'</small>':'')+'</div>';});
    h+='<div class="tg-ghost" hidden></div></div>';});
  return h+'</div></div>';
}
function monthGrid(a){
  var first=new Date(a.getFullYear(),a.getMonth(),1),start=startOfWeek(first),tk=todayKey(),last=new Date(a.getFullYear(),a.getMonth()+1,0);
  var weeks=Math.ceil(((last-start)/86400000+1)/7);
  var h='<div class="month">'+["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(function(d){return '<div class="m-head">'+d+'</div>';}).join("");
  for(var i=0;i<weeks*7;i++){var d=addDays(start,i),k=keyOf(d),out=d.getMonth()!==a.getMonth();
    var items=[];rdvList().forEach(function(r){if(r.date===k&&r.statut!=="annule")items.push('<span class="m-item st-'+esc(r.statut)+'">'+hm(r.heure)+' '+esc(rdvName(r))+'</span>');});
    coursOn(k).forEach(function(c){items.push('<span class="m-item cours'+(c.kind==="permis"?" permis":"")+'">'+kindLabel(c)+' '+hm(c.heure)+'</span>');});
    coursOn(k,true).filter(function(c){return c.allDay;}).forEach(function(c){items.push('<span class="m-item cours">'+esc(c.titre)+'</span>');});
    eventsOn(k).forEach(function(e){items.push('<span class="m-item evt" style="--evc:'+evCat(e.cat)[2]+'">'+(e.allDay?"":hm(e.heure)+" ")+esc(e.titre)+'</span>');});
    var more=items.length>3?'<span class="m-more">+'+(items.length-3)+' autres</span>':"";
    h+='<button type="button" class="m-cell'+(out?" out":"")+(k===tk?" today":"")+'" data-act="month-day" data-date="'+k+'" aria-label="'+esc(fDay.format(d))+', '+items.length+' éléments"><span class="m-num num">'+d.getDate()+'</span>'+items.slice(0,3).join("")+more+'</button>';}
  return h+'</div>';
}

/* ---------- Clients ---------- */
function viewClients(){
  var q=norm(S.ui.q.trim());
  var list=Array.from(S.clients.values()).sort(function(a,b){return String(a.nom).localeCompare(String(b.nom),"fr");});
  var counts={};S.rdv.forEach(function(r){if(r.clientId)counts[r.clientId]=(counts[r.clientId]||0)+1;});
  var shown=q?list.filter(function(c){return norm([c.nom,c.tel,c.adresse,c.email,(c.materiel||[]).map(function(m){return m.type+" "+m.modele;}).join(" ")].join(" ")).indexOf(q)>=0;}):list;
  var sel=S.ui.clientId&&S.clients.get(S.ui.clientId);
  var h='<header class="page-head"><div><h1 tabindex="-1">Clients</h1><p class="lede">'+(list.length?list.length+" client"+(list.length>1?"s":"")+" dans ton carnet.":"Ton carnet d'adresses.")+'</p></div>'+
    '<div class="head-actions"><button class="btn primary" type="button" data-act="new-client">'+icon("plus")+'Nouveau client</button></div></header>';
  h+='<div class="split'+(sel?" has-detail":"")+'"><section class="clientside" aria-label="Liste des clients"><input type="search" id="client-search" placeholder="Nom, téléphone, rue ou appareil" value="'+esc(S.ui.q)+'" aria-label="Rechercher un client">';
  if(!list.length)h+='<div class="empty" style="margin-top:12px">Aucun client pour l\'instant. Ils s\'ajoutent tout seuls quand tu prends un rendez-vous.</div>';
  else if(!shown.length)h+='<div class="empty" style="margin-top:12px">Aucun client ne correspond à « '+esc(S.ui.q)+' ». Cherche par numéro ou par rue, ou crée la fiche.<button class="btn sm primary" type="button" data-act="new-client" data-name="'+esc(S.ui.q.trim())+'">Créer « '+esc(S.ui.q.trim())+' »</button></div>';
  else h+='<div class="clist">'+shown.map(function(c){var n=counts[c.id]||0;
    return '<button type="button" class="crow" data-act="open-client" data-id="'+esc(c.id)+'"'+(sel&&sel.id===c.id?' aria-current="true"':'')+'>'+avatar(c.nom)+'<div><div class="cn">'+esc(c.nom)+'</div><div class="cm">'+esc(c.tel||c.adresse||"Pas de coordonnées")+'</div></div><span class="chip plain num">'+n+'</span></button>';}).join("")+'</div>';
  h+='</section><section class="cdetail" aria-label="Fiche client">'+(sel?clientDetail(sel):'<div class="empty">Choisis un client pour voir sa fiche, son matériel et son historique.</div>')+'</section></div>';
  return h;
}
function clientDetail(c){
  var tab=S.ui.clientTab,hist=rdvList().filter(function(r){return r.clientId===c.id;}).reverse();
  var total=hist.reduce(function(s,r){return s+(r.statut==="paye"?(Number(r.prix)||0):0);},0),mats=c.materiel||[];
  var h='<button class="btn ghost sm backbtn" type="button" data-act="back-clients" style="align-self:flex-start">'+icon("left")+'Clients</button>';
  h+='<div class="row" style="justify-content:space-between;gap:16px"><div class="row" style="gap:14px;flex-wrap:nowrap;min-width:0">'+avatar(c.nom,"lg")+'<div style="min-width:0"><h1 tabindex="-1">'+esc(c.nom)+'</h1><p class="lede">'+hist.length+' rendez-vous, '+euro(total)+' encaissés</p></div></div>'+
    '<div class="row"><button class="btn" type="button" data-act="edit-client" data-id="'+esc(c.id)+'">'+icon("edit")+'Modifier</button><button class="btn primary" type="button" data-act="new-rdv" data-client="'+esc(c.id)+'">'+icon("plus")+'Rendez-vous</button></div></div>';
  h+='<div class="tabs" role="tablist">'+[["infos","Coordonnées"],["historique","Historique ("+hist.length+")"],["materiel","Matériel ("+mats.length+")"]].map(function(t){return '<button type="button" class="tab" role="tab" data-act="client-tab" data-tab="'+t[0]+'" aria-selected="'+(tab===t[0])+'">'+esc(t[1])+'</button>';}).join("")+'</div>';
  if(tab==="historique")h+=hist.length?'<div class="rlist">'+hist.map(function(r){return ritem(r,false);}).join("")+'</div>':'<div class="empty">Pas encore de rendez-vous.<button class="btn sm primary" type="button" data-act="new-rdv" data-client="'+esc(c.id)+'">Prendre un rendez-vous</button></div>';
  else if(tab==="materiel"){
    h+=mats.length?'<div class="mat">'+mats.map(function(m){return '<div class="mat-item"><span class="ico-box">'+icon(matIcon(m.type))+'</span><div class="grow"><b>'+esc(m.modele||m.type)+'</b><small>'+esc(m.type+(m.note?", "+m.note:""))+'</small></div><button class="btn ghost icon sm" type="button" data-act="del-mat" data-id="'+esc(c.id)+'" data-mat="'+esc(m.id)+'" aria-label="Retirer '+esc(m.modele||m.type)+'">'+icon("trash")+'</button></div>';}).join("")+'</div>':
      '<p class="hint">Note les appareils de ce client : tu sauras quoi prévoir avant de venir.</p>';
    h+='<form class="mat-form" id="mat-form" data-id="'+esc(c.id)+'" autocomplete="off"><div class="field"><label for="mat-type">Type</label><select id="mat-type">'+MAT_TYPES.map(function(t){return '<option>'+esc(t)+'</option>';}).join("")+'</select></div>'+
      '<div class="field"><label for="mat-modele">Marque et modèle</label><input type="text" id="mat-modele" placeholder="HP Pavilion 15"></div><div class="field"><label for="mat-note">Remarque</label><input type="text" id="mat-note" placeholder="Windows 11, acheté en 2022"></div>'+
      '<button class="btn primary" type="submit">Ajouter</button></form>';
  } else {
    h+='<dl class="kv"><dt>Téléphone</dt><dd>'+(c.tel?'<span class="num">'+esc(c.tel)+'</span><button class="btn sm" type="button" data-act="copy" data-copy="'+esc(c.tel)+'">'+icon("copy")+'Copier</button>':'<span class="muted">Non renseigné</span>')+'</dd>'+
      '<dt>E-mail</dt><dd>'+(c.email?esc(c.email)+'<button class="btn sm" type="button" data-act="copy" data-copy="'+esc(c.email)+'">'+icon("copy")+'Copier</button>':'<span class="muted">Non renseigné</span>')+'</dd>'+
      '<dt>Adresse</dt><dd>'+(c.adresse?esc(c.adresse)+'<a class="btn sm" href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(c.adresse)+'" target="_blank" rel="noopener">'+icon("pin")+'Itinéraire</a>':'<span class="muted">Non renseignée</span>')+'</dd>'+
      (c.note?'<dt>Notes</dt><dd style="white-space:pre-wrap">'+esc(c.note)+'</dd>':'')+'</dl>';
    var next=hist.filter(function(r){return r.statut==="prevu"&&r.date>=todayKey();}).reverse()[0];
    if(next)h+='<div><h2 class="sec" style="margin-bottom:6px">Prochain rendez-vous</h2><div class="rlist">'+ritem(next,false)+'</div></div>';
  }
  return h;
}

/* ---------- Tâches ---------- */
function viewTaches(){
  var all=Array.from(S.taches.values()),todo=all.filter(function(t){return !t.fait;}).sort(taskSort),done=all.filter(function(t){return t.fait;}).sort(function(a,b){return (b.doneAt||0)-(a.doneAt||0);});
  var tk=todayKey(),groups=[["En retard","late",function(t){return t.echeance&&t.echeance<tk;}],["Aujourd'hui","",function(t){return t.echeance===tk;}],["À venir","",function(t){return t.echeance&&t.echeance>tk;}],["Sans date","",function(t){return !t.echeance;}]];
  var h='<header class="page-head"><div><h1 tabindex="-1">Tâches</h1><p class="lede">'+(todo.length?todo.length+" à faire.":"Tout est fait.")+'</p></div></header><section>'+quickTask();
  if(!all.length)h+='<div class="empty" style="margin-top:14px">Aucune tâche. Commence par les étapes de lancement de ta micro-entreprise.<button class="btn primary sm" type="button" data-act="import-tasks">Ajouter les '+LAUNCH_TASKS.length+' étapes de lancement</button></div>';
  groups.forEach(function(g){var items=todo.filter(g[2]);if(items.length)h+='<p class="group-label'+(g[1]?" "+g[1]:"")+'">'+g[0]+'</p>'+items.map(taskRow).join("");});
  h+='</section>';
  if(done.length)h+='<section><div class="sec-head"><h2 class="sec">Terminées <span class="muted num">('+done.length+')</span></h2><button class="btn ghost sm" type="button" data-act="toggle-done">'+(S.ui.showDone?"Masquer":"Afficher")+'</button></div>'+(S.ui.showDone?done.map(taskRow).join(""):'')+'</section>';
  return h;
}

/* ---------- Finances ---------- */
function urssafDue(ym){var y=+ym.slice(0,4),m=+ym.slice(5,7);if(FIRST_A&&ym>=FIRST_A&&ym<=FIRST_B)return FIRST_DUE;return new Date(y,m+1,0);}
function viewFinances(){
  var now=new Date(),prev=new Date(now.getFullYear(),now.getMonth()-1,1);
  if(!S.ui.finMonth)S.ui.finMonth=monthKey(prev);
  if(FIRST_A&&S.ui.finMonth>FIRST_A&&S.ui.finMonth<=FIRST_B)S.ui.finMonth=FIRST_A;
  if(!S.ui.finYear)S.ui.finYear=now.getFullYear();
  var ym=S.ui.finMonth,year=S.ui.finYear,first=!!FIRST_A&&ym>=FIRST_A&&ym<=FIRST_B;
  var periodList=first?recettes(function(r){var k=r.payeLe.slice(0,7);return k>=FIRST_A&&k<=FIRST_B;}):recettes(function(r){return r.payeLe.slice(0,7)===ym;});
  var amount=sumOf(periodList),due=urssafDue(ym),periodLabel=first?cap(fMonthY.format(parseKey(FIRST_A+"-01")))+" à "+fMonthY.format(parseKey(FIRST_B+"-01")):cap(fMonthY.format(parseKey(ym+"-01")));
  var h='<header class="page-head"><div><h1 tabindex="-1">Finances</h1><p class="lede">Ce que tu as encaissé, ce que tu dois déclarer, et tes factures.</p></div>'+
    '<div class="head-actions"><button class="btn" type="button" data-act="export-recettes">'+icon("download")+'Livre des recettes (CSV)</button><button class="btn" type="button" data-act="open-invoices">'+icon("folder")+'Dossier des factures</button></div></header>';
  if(!proReady())h+='<div class="notice info"><div><b>Complète ton profil pro pour des factures conformes.</b> Ajoute ton SIRET dès que tu le reçois, dans Réglages. <button class="linklike" type="button" data-act="nav" data-view="reglages">Ouvrir les réglages</button></div></div>';
  h+='<div class="fin-top"><section class="urssaf" aria-labelledby="ur-h"><h2 class="sec" id="ur-h">À déclarer à l\'Urssaf</h2>'+
    '<div class="period"><button class="btn icon sm" type="button" data-act="fin-month" data-dir="-1" aria-label="Mois précédent">'+icon("left")+'</button><b>'+esc(periodLabel)+'</b><button class="btn icon sm" type="button" data-act="fin-month" data-dir="1" aria-label="Mois suivant">'+icon("right")+'</button></div>'+
    '<p class="big-amount">'+euro(amount)+'</p><dl class="facts"><dt>Cotisations estimées ('+pct(rate())+')</dt><dd>'+euro(Math.round(amount*rate()))+'</dd><dt>À déclarer avant le</dt><dd>'+esc(fDMY.format(due))+'</dd><dt>Encaissements</dt><dd>'+periodList.length+'</dd></dl>'+
    (first?'<p class="hint">Ta première déclaration regroupe tes trois premiers mois d\'activité.</p>':'')+
    '<p class="hint">Déclare les sommes encaissées (pas celles facturées), même à 0 €.</p><a class="btn" href="https://www.autoentrepreneur.urssaf.fr" target="_blank" rel="noopener">'+icon("external")+'Ouvrir autoentrepreneur.urssaf.fr</a></section>';
  h+='<section class="chart-box" aria-labelledby="ch-h"><div class="sec-head"><h2 class="sec" id="ch-h">Encaissé par mois</h2><span class="seg" role="group" aria-label="Année">'+yearsAvailable().map(function(y){return '<button type="button" data-act="fin-year" data-year="'+y+'" aria-pressed="'+(y===year)+'">'+y+'</button>';}).join("")+'</span></div>'+chartSvg(year)+'</section></div>';
  var list=recettes(function(r){return r.payeLe.slice(0,4)===String(year);}).reverse();
  h+='<section aria-labelledby="lr-h"><div class="sec-head"><h2 class="sec" id="lr-h">Livre des recettes '+year+'</h2><span class="hint num">Total : '+euro(sumOf(list))+'</span></div>';
  if(!list.length)h+='<div class="empty">Aucun encaissement en '+year+'. Quand un client te paie, utilise « Encaisser » : la recette s\'inscrit ici avec sa facture.</div>';
  else h+='<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Client</th><th>Prestation</th><th>Mode</th><th>Facture</th><th class="r">Montant</th></tr></thead><tbody>'+
    list.map(function(r){var f=r.factureId?S.factures.get(r.factureId):null;
      return '<tr><td class="num">'+esc(fNum.format(parseKey(r.payeLe)))+'</td><td>'+esc(rdvName(r))+'</td><td>'+esc(r.forfaitNom||"")+'</td><td>'+esc(payLabel(r.payMode)||"—")+'</td><td>'+
        (f?'<button class="linklike num" type="button" data-act="open-invoice" data-id="'+esc(f.id)+'">'+esc(f.numero)+'</button>':'<button class="btn sm" type="button" data-act="make-invoice" data-id="'+esc(r.id)+'">Créer</button>')+'</td><td class="r">'+euro2(r.prix)+'</td></tr>';}).join("")+
    '</tbody><tfoot><tr><td colspan="5">Total '+year+'</td><td class="r">'+euro2(sumOf(list))+'</td></tr></tfoot></table></div>';
  h+='</section>';
  return h;
}
function yearsAvailable(){var ys={},cur=new Date().getFullYear();ys[cur]=1;if(START_KEY>"2000-01-01")ys[+START_KEY.slice(0,4)]=1;S.rdv.forEach(function(r){if(r.payeLe)ys[+r.payeLe.slice(0,4)]=1;});return Object.keys(ys).map(Number).sort();}
function chartSvg(year){
  var vals=[];for(var m=0;m<12;m++){var ym=year+"-"+pad(m+1);vals.push(sumOf(recettes(function(r){return r.payeLe.slice(0,7)===ym;})));}
  var W=640,Hh=240,padL=58,padB=26,padT=18,iw=W-padL-8,ih=Hh-padB-padT,max=Math.max(CAF_PLAFOND*1.12,Math.max.apply(null,vals)*1.12),bw=iw/12;
  var y=function(v){return padT+ih-(v/max)*ih;},curYm=monthKey(new Date());
  var s='<svg class="chart" viewBox="0 0 '+W+' '+Hh+'" role="img" aria-label="'+esc("Recettes encaissées par mois en "+year+" : total "+euro(vals.reduce(function(a,b){return a+b;},0))+". Repère CAF à "+euro(CAF_PLAFOND)+" par mois.")+'">';
  [0,500,1000].forEach(function(t){if(t>max)return;s+='<text x="'+(padL-8)+'" y="'+(y(t)+4)+'" text-anchor="end">'+esc(t?euro(t):"0")+'</text>';});
  s+='<line class="base" x1="'+padL+'" x2="'+(W-8)+'" y1="'+y(0)+'" y2="'+y(0)+'"/>';
  vals.forEach(function(v,i){var x=padL+i*bw+bw*.18,w=bw*.64,ym=year+"-"+pad(i+1);
    if(v>0){s+='<rect class="bar'+(ym===curYm?" cur":"")+'" x="'+x+'" y="'+y(v)+'" width="'+w+'" height="'+(y(0)-y(v))+'" rx="4"><title>'+esc(cap(fMonthY.format(new Date(year,i,1)))+" : "+euro(v))+'</title></rect>';
      s+='<text class="val" x="'+(x+w/2)+'" y="'+(y(v)-6)+'" text-anchor="middle">'+esc(euro(v))+'</text>';}
    s+='<text x="'+(x+w/2)+'" y="'+(Hh-8)+'" text-anchor="middle"'+(ym===curYm?' style="fill:var(--ink);font-weight:600"':'')+'>'+esc(fMonthS.format(new Date(year,i,1)).replace(".",""))+'</text>';});
  s+='<line class="caf" x1="'+padL+'" x2="'+(W-8)+'" y1="'+y(CAF_PLAFOND)+'" y2="'+y(CAF_PLAFOND)+'"/><text class="caf-l" x="'+(W-10)+'" y="'+(y(CAF_PLAFOND)-6)+'" text-anchor="end">Repère CAF 1 144 €</text>';
  return s+'</svg>';
}

/* ---------- Réglages ---------- */
function setToggle(key,title,sub){return '<div class="toggle"><div><b>'+esc(title)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div><input type="checkbox" class="switch" id="set-'+key+'" data-set="'+key+'" data-type="bool"'+(S.settings[key]?" checked":"")+' aria-label="'+esc(title)+'"></div>';}
function setInput(id,label,val,ph,type,hint){return '<div class="field"><label for="'+id+'">'+label+'</label><input type="'+(type||"text")+'" id="'+id+'" value="'+esc(val||"")+'" placeholder="'+esc(ph||"")+'" spellcheck="false">'+(hint?'<p class="hint">'+hint+'</p>':'')+'</div>';}
function viewReglages(){
  var s=S.settings,si=syncInfo(),th=s.theme||"dark";
  var cstat=S.coursBusy?"Synchronisation en cours…":(S.coursErr?coursErrText():(S.coursAt?S.cours.filter(function(c){return !c.allDay;}).length+" cours importés, mis à jour le "+new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(S.coursAt))+".":"Pas encore synchronisé."));
  var h='<header class="page-head"><div><h1 tabindex="-1">Réglages</h1><p class="lede">Ton profil, ton emploi du temps, la conduite, les mails, Titan et tes préférences.</p></div></header>';
  var proS='<section class="set-section" aria-labelledby="s-pro"><h2 class="sec" id="s-pro">Profil professionnel</h2><p class="hint">Ces informations apparaissent sur tes factures. La mention « EI » est ajoutée automatiquement après ton nom.</p>'+
    '<div class="grid2">'+setInput("set-proNom","Nom",s.proNom,"Prénom Nom")+setInput("set-siret","SIRET",s.siret,"14 chiffres","text","Tu le recevras par e-mail de l'INSEE.")+'</div>'+
    setInput("set-proAdresse","Adresse",s.proAdresse,"Rue, code postal, ville")+
    '<div class="grid2">'+setInput("set-proTel","Téléphone",s.proTel,"06 12 34 56 78","tel")+setInput("set-proEmail","E-mail",s.proEmail,"toi@exemple.fr","email")+'</div>'+
    '<div class="grid2">'+setInput("set-sapNumero","N° de déclaration services à la personne",s.sapNumero,"SAP…","text","Après ta déclaration NOVA.")+setInput("set-sapDate","Date de la déclaration",s.sapDate,"","date")+'</div>'+
    setInput("set-mentionTva","Mention de TVA",s.mentionTva,"TVA non applicable, art. 293 B du CGI","text","Valable jusqu'au 31 décembre 2026. Le transfert vers le nouveau code (CIBS) est prévu au 1er janvier 2027 : vérifie la nouvelle référence et modifie-la ici.")+
    setInput("set-mentionPlus","Mention complémentaire (facultatif)",s.mentionPlus,"Assurance RC pro : …")+'</section>';
  h+='<section class="set-section" aria-labelledby="s-rap"><h2 class="sec" id="s-rap">Notifications et rappels</h2>'+
    '<div class="toggle"><div><b>Rappel avant chaque rendez-vous et leçon de conduite</b><small>Une alerte Windows s\'affiche même si l\'application est réduite.</small></div>'+
    '<select id="set-rappel" style="width:auto">'+[[0,"Désactivés"],[15,"15 min avant"],[30,"30 min avant"],[60,"1 h avant"],[120,"2 h avant"]].map(function(o){return '<option value="'+o[0]+'"'+(Number(s.rappel)===o[0]?" selected":"")+'>'+o[1]+'</option>';}).join("")+'</select></div>'+
    setToggle("notifCours","Cours de l'école déplacés, annulés ou ajoutés","Comparaison automatique de ton emploi du temps toutes les 5 minutes.")+
    setToggle("notifPermis","Leçons de conduite","Réservées, déplacées ou annulées par l'auto-école.")+
    setToggle("notifMail","Nouveaux mails de l'école","Dès qu'un prof ou l'école t'écrit.")+
    '<div class="row"><button class="btn sm" type="button" data-act="notif-test">'+icon("bell")+'Tester une notification</button></div></section>';
  var bgS='<section class="set-section" aria-labelledby="s-bg"><h2 class="sec" id="s-bg">Fonctionnement en arrière-plan</h2>'+
    setToggle("background","Rester actif quand je ferme la fenêtre","Le carnet reste dans la zone de notification (à côté de l'heure) pour réserver, surveiller tes cours et tes mails. Clic droit sur l'icône pour quitter.")+
    setToggle("autostart","Lancer au démarrage de Windows","Discrètement, sans ouvrir la fenêtre.")+'</section>';
  var mk=S.mail||{};
  var mailS='<section class="set-section" aria-labelledby="s-mail"><h2 class="sec" id="s-mail">Mails de l\'école (Cours)</h2><p class="hint">Lecture seule par IMAP : rien n\'est envoyé, supprimé ni marqué comme lu. Le mot de passe d\'application est chiffré par Windows sur ce PC.</p>'+
    '<div class="row"><span class="chip '+(mk.account?"ok-soft":"plain")+'">'+icon(mk.account?"check":"mail")+esc(mk.account?"Reliée : "+mk.account:"Non reliée")+'</span><button class="btn sm'+(mk.account?"":" primary")+'" type="button" data-act="mail-account">'+(mk.account?"Changer":"Relier la boîte")+'</button></div>'+
    '<div class="field"><label for="set-mailSenders">Expéditeurs suivis</label><textarea id="set-mailSenders" data-set="mailSenders" data-type="lines" rows="4" spellcheck="false">'+esc(listOf(s.mailSenders).join("\n"))+'</textarea><p class="hint">Une adresse par ligne.</p></div>'+
    '<div class="grid2"><div class="field"><label for="set-mailDomains">Domaines suivis (toutes les adresses)</label><input type="text" id="set-mailDomains" data-set="mailDomains" data-type="str" value="'+esc(s.mailDomains)+'" spellcheck="false"><p class="hint">Ex. monecole.fr</p></div>'+
    '<div class="field"><label for="set-mailDays">Remonter jusqu\'à</label><select id="set-mailDays" data-set="mailDays" data-type="num">'+[[30,"1 mois"],[90,"3 mois"],[180,"6 mois"],[365,"1 an"]].map(function(o){return '<option value="'+o[0]+'"'+(Number(s.mailDays)===o[0]?" selected":"")+'>'+o[1]+'</option>';}).join("")+'</select></div></div></section>';
  var titanS='<section class="set-section" aria-labelledby="s-titan"><h2 class="sec" id="s-titan">Titan AI</h2><p class="hint">Titan utilise des IA gratuites : Gemini (Google), Groq et Cerebras. Ajoute une ou plusieurs clés : si l’une est saturée, Titan passe tout seul à la suivante. Tes questions et les éléments utiles de ton carnet sont envoyés au service utilisé. Les messages vocaux ont besoin de la clé Groq.</p>'+
    '<div class="row"><span class="chip plain">'+icon("shield")+esc(S.titanKey?(S.titanKey.hint?"Clés : "+S.titanKey.hint:"Aucune clé : Titan et les messages vocaux sont désactivés"):"…")+'</span>'+((S.titanKey&&S.titanKey.providers)||[]).filter(function(p){return p.has;}).map(function(p){return '<button class="btn ghost sm" type="button" data-act="ai-key-del" data-pid="'+p.id+'">Supprimer '+esc(p.name)+'</button>';}).join("")+'</div>'+
    '<div class="field"><label for="set-groq">Nouvelle clé API (Gemini, Groq ou Cerebras)</label><div class="pw"><input type="password" id="set-groq" placeholder="AQ.… ou AIza… / gsk_… / csk-…" spellcheck="false" autocomplete="off"><button class="btn ghost icon sm" type="button" data-act="pw-toggle" aria-label="Afficher la clé">'+icon("eye")+'</button></div><p class="hint">Gratuit sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (Gemini, le plus généreux), <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> ou <a href="https://cloud.cerebras.ai" target="_blank" rel="noopener">cloud.cerebras.ai</a>.</p></div>'+
    '<div class="row"><button class="btn sm" type="button" data-act="groq-save">Enregistrer la clé</button>'+'</div>'+
    '<div class="toggle"><div><b>Lire les réponses à voix haute</b><small>Avec les voix françaises de Windows, sans connexion.</small></div><select data-set="voixLecture" data-type="str" style="width:auto">'+[["vocal","Après un message vocal"],["toujours","Toujours"],["jamais","Jamais"]].map(function(o){return '<option value="'+o[0]+'"'+((s.voixLecture||"vocal")===o[0]?" selected":"")+'>'+o[1]+'</option>';}).join("")+'</select></div>'+
    setToggle("voixAuto","Envoyer le vocal dès que je me tais","Sinon, clique sur Envoyer quand tu as fini de parler.")+'</section>';
  h+='<section class="set-section" aria-labelledby="s-brief"><h2 class="sec" id="s-brief">Brief du matin</h2>'+setToggle("briefOn","Résumé de ma journée chaque matin","Cours, conduite, événements, tâches à rendre et mails non lus, dans une notification Windows.")+
    '<div class="row"><label class="flabel" for="set-briefHeure">Heure</label><input type="time" id="set-briefHeure" data-set="briefHeure" data-type="str" value="'+esc(s.briefHeure||"07:30")+'" style="width:auto"><button class="btn ghost sm" type="button" data-act="brief-test">'+icon("bell")+'Voir le brief maintenant</button></div></section>';
  h+='<section class="set-section" aria-labelledby="s-edt"><h2 class="sec" id="s-edt">Emploi du temps de l\'école</h2><p class="hint">Tes cours s\'affichent dans l\'agenda, bloquent les créneaux libres et déclenchent une alerte si un rendez-vous tombe pendant un cours. Mise à jour automatique toutes les 5 minutes.</p>'+
    setInput("set-ical","Lien iCal",s.icalUrl,"https://…","url")+
    '<div class="row"><button class="btn primary" type="button" data-act="sync-cours"'+(S.coursBusy?" disabled":"")+'>'+icon("refresh")+(S.coursBusy?"Synchronisation…":"Synchroniser maintenant")+'</button><span class="'+(S.coursErr?"field-error":"hint")+'" role="status">'+esc(cstat)+'</span></div></section>';
  var pstat=S.permisBusy?"Synchronisation en cours…":S.permisErr==="login"?"Session expirée : reconnecte-toi.":S.permisErr?"Sarool injoignable pour l'instant : la dernière version reste affichée.":S.permisAt?permis.length+" heures de conduite, mises à jour le "+new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(S.permisAt))+".":"Pas encore connecté.";
  h+='<section class="set-section" aria-labelledby="s-permis"><h2 class="sec" id="s-permis">Permis de conduire (Sarool)</h2><p class="hint">Connecte-toi une fois sur la page Sarool qui s\'ouvre (coche « Se souvenir de moi »). Ton mot de passe reste sur le site de Sarool : l\'appli garde seulement la session, sur ce PC. Tes heures de conduite apparaissent en orange dans l\'agenda.</p>'+
    '<div class="row"><button class="btn primary" type="button" data-act="sarool-login">'+(S.settings.saroolOn?"Se reconnecter à Sarool":"Se connecter à Sarool")+'</button>'+(S.settings.saroolOn?'<button class="btn" type="button" data-act="sarool-sync"'+(S.permisBusy?" disabled":"")+'>'+icon("refresh")+'Synchroniser</button><button class="btn ghost" type="button" data-act="sarool-logout">Se déconnecter</button>':'')+'<span class="'+(S.permisErr?"field-error":"hint")+'" role="status">'+esc(pstat)+'</span></div>'+
    '<div class="toggle"><div><b>Réservation automatique des leçons</b><small>'+(s.autoOn?"Activée":"Désactivée")+' · '+esc(s.moniteurPref?s.moniteurPref+" en priorité":"tous les moniteurs")+', '+hDur(capMin())+' max par semaine. <button class="linklike" type="button" data-act="permis-rules">Modifier les règles</button></small></div><input type="checkbox" class="switch" data-set="autoOn" data-type="bool"'+(s.autoOn?" checked":"")+' aria-label="Réservation automatique"></div>'+
    setToggle("saroolShow","Montrer la fenêtre Sarool pendant les vérifications","Pour dépanner : tu vois le carnet travailler sur le site.")+
    '<div class="row"><button class="btn ghost sm" type="button" data-act="sarool-journal">'+icon("file")+'Journal technique Sarool</button></div></section>';
  h+=profileSection()+mailS+titanS+iaOrderSection()+titanPersoSection()+usageSection()+bgS+proS;
  h+='<section class="set-section" aria-labelledby="s-cot"><h2 class="sec" id="s-cot">Cotisations et crédit d\'impôt</h2>'+
    '<div class="toggle"><div><b>ACRE obtenue</b><small>Estime tes cotisations à 15,9 % au lieu de 21,2 % (plus environ 0,8 % de taxes chambre et formation).</small></div><input type="checkbox" class="switch" id="set-acre"'+(s.acre?" checked":"")+' aria-label="ACRE obtenue"></div>'+
    '<div class="toggle"><div><b>Déclaré services à la personne (NOVA)</b><small>Ajoute le crédit d\'impôt aux messages de confirmation et aux factures. À activer seulement avec ton récépissé NOVA.</small></div><input type="checkbox" class="switch" id="set-nova"'+(s.nova?" checked":"")+' aria-label="Déclaré services à la personne"></div>'+
    '<div class="toggle"><div><b>Taux du crédit d\'impôt</b><small>50 % aujourd\'hui. Le budget 2027 pourrait le passer à 40 % pour l\'assistance informatique.</small></div><select id="set-taux" style="width:auto"><option value="50"'+(Number(s.taux)!==40?" selected":"")+'>50 %</option><option value="40"'+(Number(s.taux)===40?" selected":"")+'>40 %</option></select></div>'+
    setInput("set-prenom","Signature des SMS",s.prenom,"Ton prénom")+'</section>';
  h+='<section class="set-section" aria-labelledby="s-app"><h2 class="sec" id="s-app">Apparence</h2><span class="seg" role="group" aria-label="Thème">'+[["dark","Sombre"],["light","Clair"],["auto","Comme Windows"]].map(function(o){return '<button type="button" data-act="set-theme" data-theme="'+o[0]+'" aria-pressed="'+(th===o[0])+'">'+o[1]+'</button>';}).join("")+'</span>'+
    '<div class="toggle"><div><b>Effets visuels</b><small>Verre liquide, reflets et animations. « Léger » si ton PC rame, « Aucun » pour tout couper.</small></div><span class="seg" role="group" aria-label="Effets visuels">'+[["complet","Complet"],["leger","Léger"],["aucun","Aucun"]].map(function(o){return '<button type="button" data-act="set-fx" data-fx="'+o[0]+'" aria-pressed="'+((s.effets||"complet")===o[0])+'">'+o[1]+'</button>';}).join("")+'</span></div></section>';
  h+=updSection();
  h+='<section class="set-section" aria-labelledby="s-kb"><h2 class="sec" id="s-kb">Raccourcis clavier</h2><dl class="shortcuts"><dt><kbd>Ctrl K</kbd></dt><dd>Rechercher ou lancer une action</dd><dt><kbd>Ctrl J</kbd></dt><dd>Ouvrir Titan AI</dd><dt><kbd>Ctrl Alt T</kbd></dt><dd>Titan, même quand le carnet est caché</dd><dt><kbd>Ctrl Alt V</kbd></dt><dd>Parler à Titan (message vocal), de partout</dd><dt><kbd>Ctrl N</kbd> / <kbd>Ctrl Maj N</kbd></dt><dd>Nouvel événement / rendez-vous client</dd><dt><kbd>Ctrl Entrée</kbd></dt><dd>Enregistrer la fenêtre ouverte</dd><dt><kbd>Échap</kbd></dt><dd>Fermer la fenêtre ouverte</dd><dt><kbd>Alt</kbd> + flèches</dt><dd>Déplacer le rendez-vous sélectionné dans l\'agenda</dd></dl></section>';
  h+='<section class="set-section" aria-labelledby="s-data"><h2 class="sec" id="s-data">Tes données</h2><div class="sync '+si[0]+'" style="padding:0"><span class="dot"></span><span>'+esc(si[1])+'</span></div>'+
    '<p class="hint">'+(S.mode==="file"?"Tes clients, rendez-vous, tâches et factures sont dans un fichier sur ce PC, avec une copie de secours chaque jour (30 jours gardés). Les factures PDF sont dans Documents, Mon_Carnet, Factures.":"Tes données restent dans ce navigateur.")+'</p>'+
    '<p class="hint num">'+S.clients.size+' clients, '+S.rdv.size+' rendez-vous, '+S.taches.size+' tâches, '+S.factures.size+' factures.</p>'+
    '<div class="row"><button class="btn" type="button" data-act="export-ics">'+icon("calendar")+'Exporter mon agenda (.ics)</button><span class="hint">Pour l\'ajouter à Google Agenda ou à ton téléphone.</span></div>'+
    '<div class="row">'+(S.mode==="file"?'<button class="btn primary" type="button" data-act="export-backup">'+icon("download")+'Exporter une sauvegarde</button><button class="btn" type="button" data-act="import-backup">Restaurer une sauvegarde</button><button class="btn ghost" type="button" data-act="open-folder">'+icon("folder")+'Dossier de données</button>':'<button class="btn" type="button" data-act="copy-backup">'+icon("copy")+'Copier une sauvegarde</button>')+'</div>'+
    (S.ui.restoreAsk?'<div class="notice"><div><b>Remplacer toutes tes données par cette sauvegarde ?</b> '+esc(S.ui.restoreAsk.info)+'<div class="row" style="margin-top:8px"><button class="btn danger solid sm" type="button" data-act="restore-ok">Remplacer</button><button class="btn ghost sm" type="button" data-act="restore-cancel">Annuler</button></div></div></div>':'')+'</section>';
  return h;
}
