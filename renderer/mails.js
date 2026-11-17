"use strict";
/* Mon Carnet : catégorie « Cours ». Les mails de l'école, filtrés sur les expéditeurs et domaines choisis dans Réglages. */

S.mail={list:[],at:null,err:null,detail:"",busy:false,account:null,checked:false,q:"",who:"all",loading:{}};
var mailRead=new Set();try{mailRead=new Set(JSON.parse(localStorage.getItem("carnet-mail-lus")||"[]"));}catch(e){}
var KNOWN_SENDERS={}; /* noms affichés pour certaines adresses (facultatif) */

function mailOpts(){return {senders:listOf(S.settings.mailSenders),domains:listOf(S.settings.mailDomains),days:Number(S.settings.mailDays)||180};}
function senderName(f){if(!f)return "Inconnu";var a=String(f.address||"").toLowerCase();if(f.name&&!/@/.test(f.name))return f.name.replace(/^"|"$/g,"");if(KNOWN_SENDERS[a])return KNOWN_SENDERS[a];
  var local=a.split("@")[0]||a;return local.replace(/[._-]+/g," ").replace(/\b\w/g,function(c){return c.toUpperCase();});}
function isUnread(m){return !m.seen&&!mailRead.has(m.id);}
function mailUnreadCount(){return S.mail.list.filter(isUnread).length;}
function markMailRead(id){if(mailRead.has(id))return;mailRead.add(id);try{localStorage.setItem("carnet-mail-lus",JSON.stringify(Array.from(mailRead).slice(-2000)));}catch(e){}}
function mailWhoKey(m){var a=(m.from&&m.from.address)||"";var s=listOf(S.settings.mailSenders).map(function(x){return x.toLowerCase();});return s.indexOf(a)>=0?a:"autres";}
function mailDateLabel(iso){var d=new Date(iso),k=keyOf(d),tk=todayKey();if(k===tk)return new Intl.DateTimeFormat("fr-FR",{hour:"2-digit",minute:"2-digit"}).format(d);
  if(k===keyOf(addDays(new Date(),-1)))return "Hier";if(d.getFullYear()===new Date().getFullYear())return fDM.format(d);return fNum.format(d);}
function mailFull(iso){return cap(new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(iso)));}
function mailById(id){for(var i=0;i<S.mail.list.length;i++)if(S.mail.list[i].id===id)return S.mail.list[i];return null;}
function mailErrText(e){return {auth:"Google refuse la connexion. Vérifie que tu as collé un mot de passe d'application (16 lettres), pas ton mot de passe habituel.",network:"Pas de connexion à Gmail pour l'instant : les derniers mails enregistrés restent affichés.",imap:"L'accès IMAP semble désactivé sur ce compte.",noaccount:"Aucun compte configuré.",user:"Adresse e-mail invalide.",pass:"Colle le mot de passe d'application.",other:"Gmail a répondu de façon inattendue."}[e]||"Gmail a répondu de façon inattendue.";}

function initMail(){
  if(!fileApi||!fileApi.mailStatus){S.mail.checked=true;splashSet("mail","off","Indisponible");return;}
  fileApi.mailStatus().then(function(st){S.mail.checked=true;S.mail.account=st&&st.configured?st.user:null;
    if(!S.mail.account){splashSet("mail","off","Boîte non reliée");render();return;}
    return fileApi.mailCached().then(function(c){S.mail.list=(c&&c.mails)||[];S.mail.at=c&&c.at;render();
      return syncMail(false).then(function(){if(S.mail.err)splashSet("mail",S.mail.list.length?"warn":"err",S.mail.list.length?"Hors ligne : derniers mails affichés":mailErrText(S.mail.err).split(".")[0]);else splashSet("mail","ok",S.mail.list.length+" mails, "+mailUnreadCount()+" non lus");});});
  },function(){S.mail.checked=true;splashSet("mail","err","Indisponible");});
  setInterval(function(){syncMail(false);},5*60*1000);
}
function syncMail(manual){
  if(!fileApi||!fileApi.mailSync||!S.mail.account||S.mail.busy)return Promise.resolve();
  S.mail.busy=true;renderSoon();
  var before={};S.mail.list.forEach(function(m){before[m.id]=1;});var hadList=S.mail.list.length>0||!!S.mail.at;
  return fileApi.mailSync(mailOpts()).then(function(r){S.mail.busy=false;
    if(r&&r.ok){S.mail.list=r.mails||[];S.mail.at=r.at;S.mail.err=null;S.mail.detail="";
      var fresh=S.mail.list.filter(function(m){return !before[m.id]&&isUnread(m)&&Date.now()-new Date(m.date).getTime()<3*86400000;});
      if(hadList&&fresh.length){
        if(fresh.length>3)pushNotif({cat:"mail",type:"mail",title:fresh.length+" nouveaux mails de l'école",body:fresh.slice(0,3).map(function(m){return senderName(m.from)+" : "+m.subject;}).join(" · "),view:"cours"});
        else fresh.forEach(function(m){pushNotif({cat:"mail",type:"mail",title:"Mail de "+senderName(m.from),body:m.subject+(m.snippet?" — "+m.snippet.slice(0,90):""),ref:m.id,view:"cours"});});}
      if(manual)toast(S.mail.list.length+" mail"+(S.mail.list.length>1?"s":"")+" de cours à jour");}
    else{S.mail.err=(r&&r.error)||"network";S.mail.detail=(r&&r.detail)||"";if(manual)toast(mailErrText(S.mail.err));}
    renderSoon();},function(){S.mail.busy=false;S.mail.err="network";renderSoon();});
}
function loadMailBody(m){
  if(!m||m.text!=null||S.mail.loading[m.id]||!fileApi||!fileApi.mailBody)return;
  S.mail.loading[m.id]=true;
  fileApi.mailBody(m.id).then(function(r){delete S.mail.loading[m.id];if(r&&r.ok){m.text=r.text||"";if(r.snippet)m.snippet=r.snippet;}else m.text=m.text==null?"":m.text;renderSoon();},function(){delete S.mail.loading[m.id];});
}
function linkify(t){
  return esc(t).replace(/\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?)]/g,function(u){var safe=u.replace(/&amp;/g,"&");return /^https:/i.test(safe)?'<a href="'+esc(safe)+'" target="_blank" rel="noopener">'+u+'</a>':u;});
}
function gmailLink(m){var u=encodeURIComponent(S.mail.account||S.settings.mailUser);var id="";try{if(m.gmid)id=BigInt(m.gmid).toString(16);}catch(e){}
  return "https://mail.google.com/mail/u/?authuser="+u+(id?"#all/"+id:"#inbox");}
function gmailReply(m){var u=encodeURIComponent(S.mail.account||S.settings.mailUser);var su=/^re\s*:/i.test(m.subject)?m.subject:"Re: "+m.subject;
  return "https://mail.google.com/mail/?authuser="+u+"&view=cm&fs=1&to="+encodeURIComponent(m.from.address)+"&su="+encodeURIComponent(su);}

/* ---------- Recherche dans les mails (par mots, sans accents, tolérante aux fautes) ---------- */
var STOP=" le la les l de du des d un une et ou a au aux en dans sur pour par avec sans ce cet cette ces mon ma mes ton ta tes son sa ses mail mails email emails message messages courriel recu recus recue recues trouve trouver cherche chercher trouves trouvez est il elle y j je tu moi me m qui que quoi quel quelle quels quelles dont ai as avoir ete pas ne plus tout tous toutes ".split(" ");
function tokens(q){return norm(q).replace(/[^a-z0-9@._-]+/g," ").split(" ").map(function(t){return t.replace(/^[._-]+|[._-]+$/g,"");}).filter(function(t){return (t.length>1&&STOP.indexOf(t)<0)||/^\d+$/.test(t);}).map(function(t){return t.length>4?t.replace(/(s|x)$/,""):t;});}
function lev1(a,b){if(Math.abs(a.length-b.length)>1)return false;var i=0,j=0,d=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++d>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}return d+(a.length-i)+(b.length-j)<=1;}
/* deux lettres voisines inversées (« convoaction » pour « convocation ») */
function swap1(a,b){if(a.length!==b.length)return false;for(var i=0;i<a.length;i++){if(a[i]!==b[i])return i+1<a.length&&a[i]===b[i+1]&&a[i+1]===b[i]&&a.slice(i+2)===b.slice(i+2);}return false;}
function hitIn(words,t){for(var i=0;i<words.length;i++){var w=words[i];if(w===t||w.indexOf(t)===0||(t.length>=4&&w.indexOf(t)>=0))return true;
  if(t.length>=6&&(lev1(w.slice(0,t.length+1),t)||lev1(w.slice(0,t.length),t)||lev1(w,t)))return true;
  if(t.length>=5&&swap1(w.slice(0,t.length),t))return true;}return false;}
function wordsOf(s){return norm(s).replace(/[^a-z0-9@._-]+/g," ").split(" ").filter(Boolean);}
function mailFields(m){if(!m._idx||m._idxText!==m.text){m._idxText=m.text;m._idx={who:wordsOf(senderName(m.from)+" "+m.from.address+" "+(m.from.name||"")),subj:wordsOf(m.subject),att:wordsOf((m.att||[]).map(function(a){return a.name.replace(/[._-]+/g," ");}).join(" ")),body:wordsOf((m.snippet||"")+" "+(m.text||""))};}return m._idx;}
function excerpt(m,toks){var t=String(m.text||m.snippet||"");if(!t)return "";var n=norm(t),pos=-1;toks.some(function(k){var p=n.indexOf(k);if(p>=0){pos=p;return true;}return false;});
  if(pos<0)return t.replace(/\s+/g," ").slice(0,200);var a=Math.max(0,pos-80);return (a?"…":"")+t.slice(a,a+240).replace(/\s+/g," ").trim()+"…";}
/* opts : {texte, expediteur, depuis, jusqu_a, non_lus, pj} → {strict:bool, list:[{m,score,extrait}]} */
function mailSearch(opts){
  opts=opts||{};var toks=tokens(opts.texte||""),who=tokens(opts.expediteur||""),from=opts.depuis||null,to=opts.jusqu_a||null;
  function base(m,ignoreDates){var dk=keyOf(new Date(m.date));if(!ignoreDates){if(from&&dk<from)return false;if(to&&dk>to)return false;}if(opts.non_lus&&!isUnread(m))return false;if(opts.pj&&!(m.att&&m.att.length))return false;return true;}
  function score(m,needAll){var f=mailFields(m),sc=0,hits=0;
    if(who.length&&!who.some(function(t){return hitIn(f.who,t);}))return -1;
    toks.forEach(function(t){var h=0;if(hitIn(f.subj,t))h+=6;if(hitIn(f.att,t))h+=5;if(hitIn(f.who,t))h+=3;if(hitIn(f.body,t))h+=2;if(h){hits++;sc+=h;}});
    if(toks.length&&(needAll?hits<toks.length:hits<Math.max(1,Math.ceil(toks.length/2))))return -1;
    return sc+(isUnread(m)?0.5:0)+new Date(m.date).getTime()/1e13;}
  function run(needAll,ignoreDates){var out=[];S.mail.list.forEach(function(m){if(!base(m,ignoreDates))return;var sc=score(m,needAll);if(sc>=0)out.push({m:m,score:sc});});
    out.sort(function(a,b){return toks.length?b.score-a.score:b.m.date.localeCompare(a.m.date);});return out;}
  var res=run(true,false),strict=true;
  if(!res.length&&toks.length){res=run(false,false);strict=false;}
  if(!res.length&&(from||to)){res=run(false,true);strict=false;}
  res.forEach(function(r){r.extrait=excerpt(r.m,toks);});
  return {strict:strict,toks:toks,list:res};
}
/* Recherche côté Gmail (texte intégral, pièces jointes, tout l'historique) puis fusion dans la liste */
function serverMailSearch(q){
  if(!fileApi||!fileApi.mailSearch||!S.mail.account||!String(q||"").trim())return Promise.resolve([]);
  return fileApi.mailSearch(Object.assign(mailOpts(),{query:q})).then(function(r){
    if(!r||!r.ok)return [];
    if(r.all)S.mail.list=r.all;return r.mails||[];
  },function(){return [];});
}
function attKind(a){var n=String(a.name||"").toLowerCase(),t=String(a.type||"");
  if(a.invite||/calendar/.test(t)||/\.ics$/.test(n))return "ics";if(/pdf/.test(t)||/\.pdf$/.test(n))return "pdf";
  if(/^text\//.test(t)||/\.(txt|csv|md|html?)$/.test(n))return "texte";return "fichier";}
function attIcon(k){return k==="ics"?"calendar":k==="pdf"?"file":"clip";}
function openAttachment(id,name){
  if(!fileApi||!fileApi.mailAttachment)return;toast("Téléchargement de la pièce jointe…");
  fileApi.mailAttachment(id,name,"open").then(function(r){if(r&&r.ok){fileApi.openPath(r.path);toast("Ouverte : "+r.name);}
    else toast(r&&r.error==="unsafe"?"Ce type de fichier n'est pas ouvert par sécurité : passe par Gmail.":"Impossible de récupérer la pièce jointe.");});
}
function previewAttachment(id,name){
  if(!fileApi||!fileApi.mailAttachment)return;closePalette();M={type:"att"};
  openSheet('<header><h2>'+esc(name)+'</h2><button class="btn ghost icon" type="button" data-act="close-modal" aria-label="Fermer">'+icon("x")+'</button></header><div class="body" id="att-body"><p class="hint"><span class="spin"></span> Lecture de la pièce jointe…</p></div>'+
    '<footer><button class="btn ghost" type="button" data-act="att-open" data-id="'+esc(id)+'" data-name="'+esc(name)+'">'+icon("external")+'Ouvrir le fichier</button><span class="spacer"></span><button class="btn" type="button" data-act="titan-ask" data-q="'+esc("Lis la pièce jointe « "+name+" » du mail "+id+" et résume-la. S'il y a une date, propose de l'ajouter à mon agenda.")+'">'+icon("sparkle")+'Demander à Titan</button><button class="btn primary" type="button" data-act="close-modal">Fermer</button></footer>');
  fileApi.mailAttachment(id,name,"text").then(function(r){var b=document.getElementById("att-body");if(!b||!M||M.type!=="att")return;
    if(!r||!r.ok){b.innerHTML='<p class="hint">'+esc(r&&r.error==="type"?"Aperçu impossible pour ce type de fichier : ouvre-le.":r&&r.error==="pdf"?"Ce PDF ne contient pas de texte lisible (scan ?) : ouvre-le.":"Impossible de lire la pièce jointe.")+'</p>';return;}
    if(r.kind==="ics"){var evs=parseICS(r.text).filter(function(e){return e.date;});M.ics=evs;
      b.innerHTML=evs.length?'<p class="hint">Invitation contenant '+evs.length+' événement'+(evs.length>1?"s":"")+' :</p><div class="card list-card">'+evs.map(function(e){return '<div class="lesson"><div class="lesson-date ev"><span class="ld-d num">'+parseKey(e.date).getDate()+'</span><span class="ld-m">'+esc(fMonthS.format(parseKey(e.date)).replace(".",""))+'</span></div><div class="grow"><b>'+esc(e.titre)+'</b><small>'+esc(cap(fDay.format(parseKey(e.date)))+(e.allDay?"":" · "+hm(e.heure)+"–"+hm(fromM(toMin(e.heure)+e.duree)))+(e.lieu?" · "+e.lieu:""))+'</small></div></div>';}).join("")+'</div><button class="btn primary" type="button" data-act="att-ics-add">'+icon("plus")+'Ajouter à mon agenda</button>':'<p class="hint">Aucun événement lisible dans cette invitation.</p>';return;}
    b.innerHTML='<div class="mail-body att-text">'+linkify(r.text||"(vide)")+'</div>'+(r.truncated?'<p class="hint">Texte tronqué.</p>':'');});
}
function addIcsEvents(evs){
  var list=[];(evs||[]).forEach(function(e){list=list.concat(buildEvents({titre:e.titre,date:e.date,heure:e.allDay?"":e.heure,duree:e.allDay?0:e.duree,allDay:e.allDay,lieu:e.lieu,note:e.desc,cat:"ecole",source:"invitation"}));});
  if(!list.length)return [];putMany("events",list);return list;
}
ACTS["att-open"]=function(t){openAttachment(t.getAttribute("data-id"),t.getAttribute("data-name"));};
ACTS["att-view"]=function(t){previewAttachment(t.getAttribute("data-id"),t.getAttribute("data-name"));};
ACTS["att-ics-add"]=function(){if(!M||!M.ics)return;var list=addIcsEvents(M.ics);closeModal(true);if(list.length)toast(list.length+" événement"+(list.length>1?"s":"")+" ajouté"+(list.length>1?"s":"")+" à l'agenda",{label:"Voir",fn:function(){go("agenda",{anchor:list[0].date,agendaMode:"jour"});}});};

/* ---------- Page Cours ---------- */
function viewCoursMails(){
  var acc=S.mail.account,list=S.mail.list,unread=mailUnreadCount();
  var h='<header class="page-head"><div><p class="eyebrow">'+icon("school")+esc(S.settings.ecole||"Mon école")+'</p><h1 tabindex="-1">Cours</h1><p class="lede">'+
    (acc?esc((unread?unread+" non lu"+(unread>1?"s":"")+" · ":"")+list.length+" mail"+(list.length>1?"s":"")+" de l'école"+(S.mail.at?", à jour "+relTime(S.mail.at):"")):"Tous les mails de tes profs et de l'école, au même endroit.")+'</p></div>'+
    '<div class="head-actions">'+(acc?'<button class="btn" type="button" data-act="mail-sync"'+(S.mail.busy?" disabled":"")+'>'+(S.mail.busy?'<span class="spin"></span>Synchronisation…':icon("refresh")+'Actualiser')+'</button><button class="btn ghost" type="button" data-act="titan-ask" data-q="Résume mes mails de cours non lus et dis-moi s\'il y a quelque chose à faire.">'+icon("sparkle")+'Résumer avec Titan</button>':'')+'</div></header>';
  if(!S.mail.checked)return h+'<p class="loading">Chargement…</p>';
  if(!acc)return h+mailSetupCard();
  if(S.mail.err)h+='<div class="notice'+(S.mail.err==="network"?" info":"")+'"><div><b>'+esc(mailErrText(S.mail.err))+'</b>'+(S.mail.err==="auth"?' <button class="linklike" type="button" data-act="mail-account">Changer le mot de passe</button>':'')+'</div></div>';
  var who=S.mail.who,q=S.mail.q.trim(),found=q?mailSearch({texte:q}):null,rank={};if(found)found.list.forEach(function(r,i){rank[r.m.id]=i;});
  var groups={};list.forEach(function(m){var k=mailWhoKey(m);if(!groups[k])groups[k]={n:0,u:0,name:k==="autres"?(S.settings.ecole||"École"):senderName(m.from)};groups[k].n++;if(isUnread(m))groups[k].u++;});
  var shown=list.filter(function(m){if(who==="unread"&&!isUnread(m))return false;if(who!=="all"&&who!=="unread"&&mailWhoKey(m)!==who)return false;
    if(found&&!(m.id in rank))return false;return true;});
  if(found)shown.sort(function(a,b){return rank[a.id]-rank[b.id];});
  var sel=S.ui.mailSel&&mailById(S.ui.mailSel);
  h+='<div class="mail-filters"><input type="search" id="mail-search" placeholder="Rechercher dans les mails de cours" value="'+esc(S.mail.q)+'" aria-label="Rechercher dans les mails">'+
    '<div class="chiprow" role="group" aria-label="Filtrer">'+[["all","Tous",list.length,0],["unread","Non lus",unread,0]].concat(Object.keys(groups).sort(function(a,b){return a==="autres"?1:b==="autres"?-1:groups[a].name.localeCompare(groups[b].name);}).map(function(k){return [k,groups[k].name,groups[k].n,groups[k].u];}))
      .map(function(o){return '<button type="button" class="qchip" data-act="mail-who" data-who="'+esc(o[0])+'" aria-pressed="'+(who===o[0])+'">'+esc(o[1])+' <span class="num muted">'+o[2]+'</span>'+(o[3]?'<i class="mini-dot"></i>':'')+'</button>';}).join("")+'</div></div>';
  h+='<div class="mail-split'+(sel?" has-detail":"")+'"><section class="mail-list" aria-label="Liste des mails">';
  if(!list.length)h+='<div class="empty">'+(S.mail.busy?'<span class="spin"></span>Première synchronisation avec Gmail…':'Aucun mail de ces expéditeurs sur les '+(Number(S.settings.mailDays)||180)+' derniers jours.')+'</div>';
  else if(!shown.length)h+='<div class="empty">Aucun mail ne correspond dans ceux déjà chargés.'+(q?'<button class="btn sm primary" type="button" data-act="mail-deep" data-q="'+esc(q)+'"'+(S.mail.deep?" disabled":"")+'>'+(S.mail.deep?'<span class="spin"></span>Recherche dans Gmail…':icon("search")+'Chercher dans tout Gmail')+'</button>':'')+'</div>';
  else h+=shown.slice(0,200).map(function(m){var u=isUnread(m),nm=senderName(m.from);
    return '<button type="button" class="mrow'+(u?" unread":"")+'" data-act="mail-open" data-id="'+esc(m.id)+'"'+(sel&&sel.id===m.id?' aria-current="true"':'')+'>'+avatar(nm)+
      '<span class="grow"><span class="mr-top"><b>'+esc(nm)+'</b><time class="num">'+esc(mailDateLabel(m.date))+'</time></span><span class="mr-subj">'+(u?'<i class="mini-dot" aria-label="Non lu"></i>':'')+esc(m.subject)+'</span><span class="mr-snip">'+esc(m.snippet||"")+'</span></span>'+(m.att&&m.att.length?'<span class="mr-att" title="Pièces jointes">'+icon("clip")+'</span>':'')+'</button>';}).join("");
  h+='</section><section class="mail-read" aria-label="Lecture">'+(sel?mailDetail(sel):'<div class="empty tall">'+icon("inbox")+'Choisis un mail pour le lire.</div>')+'</section></div>';
  return h;
}
function mailDetail(m){
  loadMailBody(m);
  var nm=senderName(m.from),to=(m.to||[]).map(function(a){return a.name||a.address;}).join(", ");
  var body=m.text==null?'<p class="hint"><span class="spin"></span> Chargement du message…</p>':(m.text?'<div class="mail-body">'+linkify(m.text)+'</div>':'<p class="hint">Ce message n\'a pas de texte lisible. Ouvre-le dans Gmail.</p>');
  return '<button class="btn ghost sm backbtn" type="button" data-act="mail-back">'+icon("left")+'Mails</button>'+
    '<h2 class="mail-subject">'+esc(m.subject)+'</h2><div class="mail-from">'+avatar(nm,"lg")+'<div class="grow"><b>'+esc(nm)+'</b> <span class="muted">&lt;'+esc(m.from.address)+'&gt;</span><small>'+esc(mailFull(m.date))+(to?' · à '+esc(to):'')+'</small></div></div>'+
    '<div class="row mail-actions"><a class="btn sm primary" href="'+esc(gmailReply(m))+'" target="_blank" rel="noopener">'+icon("reply")+'Répondre</a><a class="btn sm" href="'+esc(gmailLink(m))+'" target="_blank" rel="noopener">'+icon("external")+'Ouvrir dans Gmail</a>'+
    '<button class="btn sm ghost" type="button" data-act="titan-ask" data-q="'+esc("Lis le mail « "+m.subject+" » (id "+m.id+") et ses pièces jointes, puis crée dans mon agenda les tâches (devoirs, dates limites) et les événements (examens, convocations, réunions) qu'il contient. Dis-moi ce que tu as ajouté.")+'">'+icon("plus")+'Ajouter à mon agenda</button><button class="btn sm ghost" type="button" data-act="titan-ask" data-q="'+esc("Résume le mail « "+m.subject+" » de "+nm+" (id "+m.id+") et dis-moi ce que je dois faire.")+'">'+icon("sparkle")+'Résumer</button></div>'+
    (m.att&&m.att.length?'<div class="att-list">'+m.att.map(function(a){var k=attKind(a);return '<span class="att '+k+'">'+icon(attIcon(k))+'<span class="att-n">'+esc(a.name)+(a.size?' <small>'+Math.max(1,Math.round(a.size/1024))+' Ko</small>':'')+'</span>'+
      (k!=="fichier"?'<button class="btn ghost sm" type="button" data-act="att-view" data-id="'+esc(m.id)+'" data-name="'+esc(a.name)+'">'+(k==="ics"?"Ajouter à l'agenda":"Aperçu")+'</button>':'')+(k!=="ics"?'<button class="btn ghost sm" type="button" data-act="att-open" data-id="'+esc(m.id)+'" data-name="'+esc(a.name)+'">Ouvrir</button>':'')+'</span>';}).join("")+'</div>':'')+body;
}
function mailSetupCard(){
  return '<section class="hero-empty setup"><span class="he-ico">'+icon("mail")+'</span><h2>Relier ta boîte mail de l\'école</h2><p>Le carnet lit (sans rien modifier) les mails de '+esc(listOf(S.settings.mailSenders).map(function(a){return KNOWN_SENDERS[a.toLowerCase()]||a;}).join(", "))+' et de toutes les adresses @'+esc(listOf(S.settings.mailDomains).join(", @"))+'.</p>'+
    '<ol class="steps"><li><b>Active la validation en deux étapes</b> sur ton compte Google de l\'école. <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener">Ouvrir</a></li>'+
    '<li><b>Crée un mot de passe d\'application</b> nommé « Carnet ». <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">Ouvrir</a></li>'+
    '<li><b>Colle les 16 lettres</b> dans le carnet. Il est chiffré par Windows et reste sur ce PC.</li></ol>'+
    '<button class="btn primary" type="button" data-act="mail-account">'+icon("power")+'Connecter '+esc(S.settings.mailUser)+'</button></section>';
}
function openMailAccount(){
  closePalette();M={type:"mail-acc"};
  openSheet('<header><h2>Boîte mail de l\'école</h2><button class="btn ghost icon" type="button" data-act="close-modal" aria-label="Fermer">'+icon("x")+'</button></header><form id="macc-form" class="body" autocomplete="off" novalidate>'+
    '<div class="field"><label for="ma-user">Adresse</label><input type="email" id="ma-user" value="'+esc(S.mail.account||S.settings.mailUser)+'" spellcheck="false"></div>'+
    '<div class="field"><label for="ma-pass">Mot de passe d\'application</label><div class="pw"><input type="password" id="ma-pass" placeholder="abcd efgh ijkl mnop" spellcheck="false" autocomplete="off"><button class="btn ghost icon sm" type="button" data-act="pw-toggle" aria-label="Afficher le mot de passe">'+icon("eye")+'</button></div>'+
    '<p class="hint">À créer sur <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a> (validation en deux étapes requise). Ce n\'est pas ton mot de passe habituel.</p></div>'+
    '<p class="field-error" id="ma-err" role="alert" hidden></p><button type="submit" hidden></button></form>'+
    '<footer>'+(S.mail.account?'<button class="btn danger" type="button" data-act="mail-remove">'+icon("trash")+'Déconnecter</button>':'')+'<span class="spacer"></span><button class="btn ghost" type="button" data-act="close-modal">Annuler</button><button class="btn primary" type="button" data-act="mail-connect">Connecter</button></footer>',"sm");
  document.getElementById("macc-form").addEventListener("submit",function(e){e.preventDefault();connectMail();});
  document.getElementById("ma-pass").focus();
}
function connectMail(){
  if(!M||M.type!=="mail-acc"||M.busy)return;var u=document.getElementById("ma-user").value.trim(),p=document.getElementById("ma-pass").value,err=document.getElementById("ma-err"),btn=mroot.querySelector('[data-act="mail-connect"]');
  if(!fileApi||!fileApi.mailSetAccount){err.hidden=false;err.textContent="Disponible dans l'application.";return;}
  M.busy=true;btn.disabled=true;btn.innerHTML='<span class="spin"></span>Connexion…';err.hidden=true;
  fileApi.mailSetAccount(u,p).catch(function(){return {ok:false,error:"other"};}).then(function(r){if(!M)return;M.busy=false;
    if(r&&r.ok){closeModal(true);S.mail.account=r.user;S.mail.err=null;putSettings({mailUser:r.user});toast("Boîte mail reliée : synchronisation…");go("cours");syncMail(true);}
    else{btn.disabled=false;btn.textContent="Connecter";err.hidden=false;err.textContent=mailErrText(r&&r.error)+(r&&r.detail&&r.error!=="auth"?" ("+r.detail+")":"");}});
}
ACTS["mail-sync"]=function(){syncMail(true);};
ACTS["mail-deep"]=function(t){var q=t.getAttribute("data-q");S.mail.deep=true;render();serverMailSearch(q).then(function(r){S.mail.deep=false;render();toast(r.length?r.length+" mail"+(r.length>1?"s":"")+" trouvé"+(r.length>1?"s":"")+" dans Gmail":"Rien trouvé dans Gmail non plus.");});};
ACTS["mail-account"]=function(){openMailAccount();};
ACTS["mail-connect"]=function(){connectMail();};
ACTS["mail-remove"]=function(){if(!fileApi)return;fileApi.mailRemoveAccount().then(function(){closeModal(true);S.mail.account=null;S.mail.list=[];S.mail.at=null;render();toast("Boîte mail déconnectée");});};
ACTS["mail-open"]=function(t){var id=t.getAttribute("data-id");S.ui.mailSel=id;markMailRead(id);render();renderChrome();};
ACTS["mail-back"]=function(){S.ui.mailSel=null;render();};
ACTS["mail-who"]=function(t){S.mail.who=t.getAttribute("data-who");render();};
ACTS["pw-toggle"]=function(t){var i=t.parentNode.querySelector("input");if(i)i.type=i.type==="password"?"text":"password";};
