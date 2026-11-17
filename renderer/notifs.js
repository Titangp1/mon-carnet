"use strict";
/* Mon Carnet : notifications. Détecte les cours et leçons déplacés, modifiés, annulés ou ajoutés,
   les réservations de conduite et les nouveaux mails, avec un centre de notifications et des alertes Windows. */

var NOTIF_META={
  deplace:{ic:"move",label:"Déplacé"},modifie:{ic:"edit",label:"Modifié"},supprime:{ic:"trash",label:"Annulé"},ajoute:{ic:"plus",label:"Nouveau"},
  reserve:{ic:"check",label:"Réservé"},echec:{ic:"alert",label:"Problème"},propose:{ic:"sparkle",label:"À valider"},mail:{ic:"mail",label:"Mail"}
};
function pushNotif(n){
  var st=S.settings,cat=n.cat||"cours";
  var o={id:uid(),at:Date.now(),read:false,cat:cat,type:n.type||"modifie",title:String(n.title||""),body:String(n.body||""),date:n.date||null,view:n.view||null,ref:n.ref||null};
  S.notifs.unshift(o);S.notifs=S.notifs.slice(0,150);persist();renderChrome();
  if(S.ui.notifOpen)drawNotifPanel();
  var allowed=cat==="mail"?st.notifMail:cat==="permis"?st.notifPermis:st.notifCours;
  if((allowed||n.force)&&typeof Notification!=="undefined"){
    try{var w=new Notification(o.title,{body:o.body,silent:false});w.onclick=function(){if(fileApi&&fileApi.focus)fileApi.focus();openNotifTarget(o);};}catch(e){}
  }
  return o;
}
function unreadNotifs(){return S.notifs.filter(function(n){return !n.read;}).length;}
function openNotifTarget(n){
  n.read=true;persist();closeNotifPanel();
  if(n.cat==="mail"&&n.ref){go("cours",{mailSel:n.ref});return;}
  if(n.view==="conduite"){go("conduite");return;}
  if(n.date){go("agenda",{anchor:n.date,agendaMode:"jour"});return;}
  if(n.view)go(n.view);
}

/* ---------- Comparaison avant / après ---------- */
function evLabel(e){return cap(fShort.format(parseKey(e.date)).replace(/\./g,""))+(e.heure?" "+hm(e.heure):"");}
function snapLoad(k){try{return JSON.parse(localStorage.getItem("carnet-snap-"+k)||"null");}catch(e){return null;}}
function snapSave(k,v){try{localStorage.setItem("carnet-snap-"+k,JSON.stringify(v));}catch(e){}}
function futureOnly(list){var tk=todayKey();return list.filter(function(e){return e.date>=tk;});}

function checkChanges(kind){
  if(!S.ready)return;
  if(kind==="cours")diffCours();else diffPermis();
}
function diffCours(){
  var cur=futureOnly(S.cours.filter(function(c){return !c.allDay;})).map(function(c){return {k:c.uid,date:c.date,heure:c.heure,duree:c.duree,titre:c.titre,lieu:c.lieu};});
  var old=snapLoad("cours");
  if(!old||!Array.isArray(old.items)){snapSave("cours",{items:cur,max:maxDate(cur)});return;}
  var tk=todayKey(),prev=old.items.filter(function(e){return e.date>=tk;});
  if(prev.length>5&&cur.length===0)return; /* flux vide momentanément : on ne crie pas au loup */
  var cancelled={};(S.cours.cancelled||[]).forEach(function(u){cancelled[u]=1;});
  var byOld={},byNew={};prev.forEach(function(e){byOld[e.k]=e;});cur.forEach(function(e){byNew[e.k]=e;});
  var changes=[],removed=[],added=[];
  prev.forEach(function(o){var n=byNew[o.k];
    if(!n){removed.push(o);return;}
    if(n.date!==o.date||n.heure!==o.heure)changes.push({type:"deplace",o:o,n:n});
    else if(n.duree!==o.duree||n.lieu!==o.lieu||n.titre!==o.titre)changes.push({type:"modifie",o:o,n:n});});
  var newMax=maxDate(cur);
  /* disparition massive : on attend de la revoir à la synchro suivante avant d'y croire (flux momentanément incomplet) */
  if(removed.length>=4&&removed.length>prev.length*0.5){if(!old.suspect){old.suspect=true;snapSave("cours",old);return;}}
  cur.forEach(function(n){if(!byOld[n.k]&&n.date<=(old.max||"0000"))added.push(n);});
  /* un cours supprimé + un cours ajouté avec le même intitulé = cours déplacé */
  removed=removed.filter(function(o){var i=-1;added.forEach(function(n,j){if(i<0&&n.titre===o.titre&&Math.abs(parseKey(n.date)-parseKey(o.date))<=14*86400000)i=j;});
    if(i>=0){changes.push({type:"deplace",o:o,n:added[i]});added.splice(i,1);return false;}return true;});
  removed=removed.filter(function(o){return o.date<=newMax||cancelled[o.k];});
  var total=changes.length+removed.length+added.length;
  snapSave("cours",{items:cur,max:newMax});
  if(!total)return;
  changes.forEach(function(c){
    if(c.type==="deplace")pushNotif({cat:"cours",type:"deplace",title:"Cours déplacé : "+c.n.titre,body:evLabel(c.o)+" → "+evLabel(c.n)+(c.n.lieu?" · "+c.n.lieu:""),date:c.n.date});
    else{var what=[];if(c.n.lieu!==c.o.lieu)what.push("salle : "+(c.o.lieu||"—")+" → "+(c.n.lieu||"—"));if(c.n.duree!==c.o.duree)what.push("fin à "+hm(fromM(toMin(c.n.heure)+c.n.duree)));if(c.n.titre!==c.o.titre)what.push("intitulé : "+c.n.titre);
      pushNotif({cat:"cours",type:"modifie",title:"Cours modifié : "+c.o.titre,body:evLabel(c.n)+" · "+what.join(", "),date:c.n.date});}});
  removed.forEach(function(o){pushNotif({cat:"cours",type:"supprime",title:(cancelled[o.k]?"Cours annulé : ":"Cours supprimé : ")+o.titre,body:evLabel(o)+"–"+hm(fromM(toMin(o.heure)+o.duree))+(o.lieu?" · "+o.lieu:""),date:o.date});});
  added.forEach(function(n){pushNotif({cat:"cours",type:"ajoute",title:"Nouveau cours : "+n.titre,body:evLabel(n)+"–"+hm(fromM(toMin(n.heure)+n.duree))+(n.lieu?" · "+n.lieu:""),date:n.date});});
  renderSoon();
}
function maxDate(list){var m="0000";list.forEach(function(e){if(e.date>m)m=e.date;});return m;}
function diffPermis(){
  var cur=futureOnly(permisAll()).map(function(p){return {k:p.date+"T"+p.heure,date:p.date,heure:p.heure,duree:p.duree,moniteur:p.moniteur||"",rdv:p.rdv||""};});
  var old=snapLoad("permis"),withAgenda=!!(S.sarool&&S.sarool.weeks.length);
  /* premier passage, ou première lecture de l'agenda Sarool : on mémorise sans notifier */
  if(!old||!Array.isArray(old.items)||(withAgenda&&!old.agenda)){snapSave("permis",{items:cur,agenda:withAgenda});return;}
  var tk=todayKey(),prev=old.items.filter(function(e){return e.date>=tk;});
  if(prev.length>3&&cur.length===0)return;
  var byNew={},byOld={};cur.forEach(function(e){byNew[e.k]=e;});prev.forEach(function(e){byOld[e.k]=e;});
  var removed=prev.filter(function(o){return !byNew[o.k];}),added=cur.filter(function(n){return !byOld[n.k];}),changed=[];
  prev.forEach(function(o){var n=byNew[o.k];if(n&&(n.duree!==o.duree||(n.moniteur&&o.moniteur&&n.moniteur!==o.moniteur)))changed.push({o:o,n:n});});
  var moves=[];
  removed=removed.filter(function(o){var i=-1;added.forEach(function(n,j){if(i<0&&!expectedPermis[n.date+n.heure]&&(!o.moniteur||!n.moniteur||o.moniteur===n.moniteur)&&Math.abs(parseKey(n.date)-parseKey(o.date))<=14*86400000)i=j;});
    if(i>=0){moves.push({o:o,n:added[i]});added.splice(i,1);return false;}return true;});
  snapSave("permis",{items:cur,agenda:withAgenda});
  moves.forEach(function(m){pushNotif({cat:"permis",type:"deplace",title:"Leçon de conduite déplacée",body:evLabel(m.o)+" → "+evLabel(m.n)+(m.n.moniteur?" avec "+m.n.moniteur:""),date:m.n.date});});
  changed.forEach(function(c){pushNotif({cat:"permis",type:"modifie",title:"Leçon de conduite modifiée",body:evLabel(c.n)+(c.n.moniteur!==c.o.moniteur?" · moniteur : "+c.n.moniteur:"")+(c.n.duree!==c.o.duree?" · durée "+dur(c.n.duree):""),date:c.n.date});});
  removed.forEach(function(o){pushNotif({cat:"permis",type:"supprime",title:"Leçon de conduite annulée",body:evLabel(o)+"–"+hm(fromM(toMin(o.heure)+o.duree))+(o.moniteur?" avec "+o.moniteur:""),date:o.date});});
  added.forEach(function(n){if(expectedPermis[n.date+n.heure]){delete expectedPermis[n.date+n.heure];return;}
    pushNotif({cat:"permis",type:"ajoute",title:"Nouvelle leçon de conduite",body:evLabel(n)+"–"+hm(fromM(toMin(n.heure)+n.duree))+(n.moniteur?" avec "+n.moniteur:""),date:n.date});});
  if(moves.length||changed.length||removed.length||added.length)renderSoon();
}

/* ---------- Centre de notifications ---------- */
var notifRoot=null;
function drawNotifPanel(){
  if(!notifRoot)notifRoot=document.getElementById("notif-root");if(!notifRoot)return;
  if(!S.ui.notifOpen){notifRoot.innerHTML="";return;}
  var list=S.notifs.slice(0,60),unread=unreadNotifs();
  notifRoot.innerHTML='<div class="np-overlay" data-act="notif-close-bg"></div><section class="notif-panel" role="dialog" aria-label="Notifications"><header><h2>Notifications</h2>'+(unread?'<span class="chip">'+unread+' non lue'+(unread>1?"s":"")+'</span>':'')+'<span class="spacer"></span>'+
    (unread?'<button class="btn ghost sm" type="button" data-act="notif-readall">Tout lire</button>':'')+(list.length?'<button class="btn ghost icon sm" type="button" data-act="notif-clear" aria-label="Effacer les notifications" title="Effacer">'+icon("trash")+'</button>':'')+'</header>'+
    '<div class="np-list">'+(list.length?groupNotifs(list):'<div class="np-empty">'+icon("bell")+'<b>Tout est calme</b><span>Tu seras prévenu dès qu\'un cours ou une leçon bouge, qu\'une leçon est réservée ou qu\'un mail de l\'école arrive.</span></div>')+'</div></section>';
  var first=notifRoot.querySelector(".notif-panel button");if(first)first.focus({preventScroll:true});
}
function groupNotifs(list){
  var h="",lastG=null,tk=todayKey();
  list.forEach(function(n){var k=keyOf(new Date(n.at)),g=k===tk?"Aujourd'hui":k===keyOf(addDays(new Date(),-1))?"Hier":cap(fDM.format(new Date(n.at)));
    if(g!==lastG){lastG=g;h+='<p class="np-group">'+esc(g)+'</p>';}
    var m=NOTIF_META[n.type]||NOTIF_META.modifie;
    h+='<button type="button" class="np-item '+esc(n.cat)+' t-'+esc(n.type)+(n.read?"":" unread")+'" data-act="notif-open" data-id="'+esc(n.id)+'"><span class="np-ico">'+icon(m.ic)+'</span><span class="grow"><b>'+esc(n.title)+'</b><small>'+esc(n.body)+'</small><em>'+esc(m.label+" · "+new Intl.DateTimeFormat("fr-FR",{hour:"2-digit",minute:"2-digit"}).format(new Date(n.at)))+'</em></span>'+(n.read?'':'<span class="np-dot" aria-label="Non lue"></span>')+'</button>';});
  return h;
}
function toggleNotifPanel(){S.ui.notifOpen=!S.ui.notifOpen;drawNotifPanel();}
function closeNotifPanel(){if(!S.ui.notifOpen)return;S.ui.notifOpen=false;drawNotifPanel();var b=document.getElementById("notif-btn");if(b)b.focus();}
ACTS["notif-toggle"]=function(){toggleNotifPanel();};
ACTS["notif-close-bg"]=function(){closeNotifPanel();};
ACTS["notif-readall"]=function(){S.notifs.forEach(function(n){n.read=true;});persist();renderChrome();drawNotifPanel();};
ACTS["notif-clear"]=function(){var keep=S.notifs.slice();S.notifs=[];persist();renderChrome();drawNotifPanel();toast("Notifications effacées",{label:"Annuler",fn:function(){S.notifs=keep;persist();renderChrome();drawNotifPanel();}});};
ACTS["notif-open"]=function(t){var n=S.notifs.filter(function(x){return x.id===t.getAttribute("data-id");})[0];if(n)openNotifTarget(n);renderChrome();};
