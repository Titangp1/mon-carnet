/* Titan+ : mémoire, personnalisation, conscience de l'application et suivi des jetons.
   Chargé après titan.js : complète le prompt système, les outils et les réglages. */
var VIEW_NAMES={jour:"Aujourd'hui",agenda:"Agenda",conduite:"Conduite",cours:"Cours (emploi du temps et mails de l'école)",titan:"Titan AI (cette conversation)",clients:"Clients",taches:"Tâches",finances:"Finances",reglages:"Réglages"};
var TITAN_STYLES={bref:"Réponses courtes et directes (2 à 5 lignes).",detaille:"Réponses complètes et expliquées, avec étapes si utile.",coach:"Ton motivant de coach : encourage l'utilisateur, propose des priorités et un plan."};
function titanMemo(){return Array.isArray(S.settings.titanMemo)?S.settings.titanMemo:[];}

/* ---------- Ce que Titan sait de l'application à chaque message ---------- */
function envBlock(){
  var st=S.settings,tk=todayKey(),out=[];
  var ver=(typeof UPD!=="undefined"&&UPD.current)?UPD.current:"?";
  out.push("ENVIRONNEMENT (état actuel de l'application, mis à jour à chaque message)");
  out.push("- Application « Mon Carnet » version "+ver+" pour Windows. Données enregistrées sur ce PC, copie de secours chaque jour.");
  out.push("- Page ouverte en ce moment : "+(VIEW_NAMES[S.ui.view]||S.ui.view)+". Pages : "+Object.keys(VIEW_NAMES).map(function(k){return VIEW_NAMES[k].split(" (")[0];}).join(", ")+" (ouvrir_page pour y aller).");
  out.push("- Emploi du temps de l'école : "+(S.coursErr?"erreur de synchronisation":S.coursAt?S.cours.filter(function(c){return !c.allDay&&c.date>=tk;}).length+" cours à venir, synchronisé "+relTime(S.coursAt):"pas encore synchronisé")+".");
  if(st.saroolOn){var nx=nextLesson(),dn=doneMin();
    out.push("- Conduite (Sarool connecté"+(S.sarool.at?", vérifié "+relTime(S.sarool.at):"")+") : "+hDur(dn.min)+" de conduite effectuées au total ("+dn.n+" leçons suivies dans le carnet"+(st.heuresAvant?", dont "+st.heuresAvant+" h faites avant le carnet":"")+"), "+hDur(minutesInWeek(tk))+" cette semaine sur "+hDur(capMin())+" max"+(nx?", prochaine leçon "+relDay(nx.date).toLowerCase()+" à "+hm(nx.heure)+(nx.moniteur?" avec "+nx.moniteur:""):", aucune leçon à venir")+". Réservation auto "+(st.autoOn?"activée ("+(st.autoMode==="ask"?"me demander":"automatique")+")":"désactivée")+".");}
  else out.push("- Conduite : compte Sarool non connecté (page Conduite).");
  out.push("- Mails de l'école : "+(S.mail.account?S.mail.list.length+" synchronisés, "+mailUnreadCount()+" non lus":"boîte non reliée")+".");
  var todo=Array.from(S.taches.values()).filter(function(t){return !t.fait;}),late=todo.filter(function(t){return t.echeance&&t.echeance<tk;}).length;
  out.push("- Tâches : "+todo.length+" à faire"+(late?" dont "+late+" en retard":"")+". Notifications non lues : "+(typeof unreadNotifs==="function"?unreadNotifs():0)+". Clients : "+S.clients.size+".");
  out.push("- Réglages : thème "+(st.theme||"dark")+", brief du matin "+(st.briefOn?"à "+(st.briefHeure||"07:30"):"désactivé")+", lecture vocale "+(st.voixLecture||"vocal")+".");
  return out.join("\n");
}
function persoBlock(){
  var st=S.settings,m=titanMemo(),out=["PERSONNALISATION"];
  out.push("- Style voulu : "+(TITAN_STYLES[st.titanStyle]||TITAN_STYLES.bref));
  if(st.titanPerso)out.push("- Consignes de l'utilisateur (à respecter en priorité) : "+String(st.titanPerso).slice(0,1200));
  out.push(m.length?"CE QUE TU SAIS SUR L'UTILISATEUR (mémoire, numérotée pour oublier)\n"+m.map(function(x,i){return (i+1)+". "+x.t;}).join("\n"):"Mémoire : vide pour l'instant.");
  return out.join("\n");
}
var _titanSysPrompt=systemPrompt;
systemPrompt=function(){
  return _titanSysPrompt()+"\n\n"+envBlock()+"\n\n"+persoBlock()+"\n\n"+
    "RÈGLES SUPPLÉMENTAIRES\n"+
    "8. Tu connais l'application : réponds aux questions sur son fonctionnement à partir de l'ENVIRONNEMENT ; pour le détail des services ou réglages, appelle etat_carnet.\n"+
    "9. Quand l'utilisateur te dit une info durable sur lui (préférence, habitude, objectif, contrainte, personne importante), enregistre-la avec memoriser en une phrase courte. Jamais de mot de passe, code ou donnée bancaire. S'il demande d'oublier, utilise oublier.\n"+
    "10. Si l'utilisateur veut voir un écran (« montre-moi », « ouvre »), utilise ouvrir_page.\n"+
    "11. Avant de répondre, vérifie : date et jour exacts, heures cohérentes, rien d'inventé. Si une info manque, appelle l'outil adapté plutôt que de deviner.";
};

/* ---------- Outils supplémentaires ---------- */
TITAN_TOOLS.push(
  T("memoriser","Retient durablement une information utile sur l'utilisateur (préférence, habitude, objectif, contrainte). Une phrase courte.",{fait:{type:"string"}},["fait"]),
  T("oublier","Oublie une information de la mémoire (numéro donné dans la liste CE QUE TU SAIS SUR L'UTILISATEUR).",{numero:{type:"integer"}},["numero"]),
  T("ouvrir_page","Affiche une page de l'application à l'utilisateur.",{page:{type:"string",enum:Object.keys(VIEW_NAMES)}},["page"]),
  T("etat_carnet","État détaillé de l'application : version et mises à jour, services connectés, réglages, IA utilisée et consommation de jetons.",{})
);
TOOL_STEP.memoriser="Je retiens ça…";TOOL_STEP.oublier="J'oublie…";TOOL_STEP.ouvrir_page="J'ouvre la page…";TOOL_STEP.etat_carnet="Je regarde l'état du carnet…";
var _titanRunTool=runTool;
runTool=function(name,a){
  a=a||{};
  switch(name){
    case "memoriser":{var f=String(a.fait||"").trim().slice(0,240);if(!f)return {ok:false,erreur:"fait vide"};
      if(/mot de passe|password|\bcode\b.*\d{4}|iban|carte bancaire|\b\d{13,19}\b/i.test(f))return {ok:false,erreur:"Information sensible : je ne la mémorise pas."};
      var m=titanMemo().slice();if(m.some(function(x){return norm(x.t)===norm(f);}))return {ok:true,deja:true};
      m.push({t:f,at:Date.now()});if(m.length>60)m=m.slice(-60);putSettings({titanMemo:m});return {ok:true,memorise:f,total:m.length};}
    case "oublier":{var m2=titanMemo().slice(),i=Number(a.numero)-1;if(!(i>=0&&i<m2.length))return {ok:false,erreur:"Numéro inconnu"};var gone=m2.splice(i,1)[0];putSettings({titanMemo:m2});return {ok:true,oublie:gone.t};}
    case "ouvrir_page":{if(!VIEW_NAMES[a.page])return {ok:false,erreur:"Page inconnue"};var pg=a.page;setTimeout(function(){go(pg);},400);return {ok:true,page:VIEW_NAMES[pg]};}
    case "etat_carnet":{
      return Promise.resolve(fileApi&&fileApi.aiUsage?fileApi.aiUsage():null).then(function(u){var st=S.settings,t=u?usageTotals(u):null;
        return {version:(typeof UPD!=="undefined"&&UPD.current)||"?",mises_a_jour:typeof updText==="function"?updText():"",
          page_ouverte:VIEW_NAMES[S.ui.view]||S.ui.view,
          services:{emploi_du_temps:S.coursErr?"erreur":S.coursAt?"ok":"non synchronisé",sarool:st.saroolOn?(S.sarool.err?saroolErrText(S.sarool.err):"ok"):"non connecté",mails:S.mail.account?"relié":"non relié"},
          ia:u?{cles:u.providers.filter(function(p){return p.has;}).map(function(p){return p.name+(p.model?" ("+p.model+")":"");}),jetons_aujourdhui:t.today,jetons_7_jours:t.week,requetes_aujourdhui:t.todayReq}:"inconnu",
          memoire:titanMemo().length+" éléments",style:st.titanStyle||"bref",
          reglages:{prenom:st.prenom,theme:st.theme,effets:st.effets,brief:st.briefOn?st.briefHeure:"off",notifications_conduite:!!st.notifPermis,arriere_plan:!!st.background,heures_max_conduite_semaine:st.heuresSemaine}};});}
  }
  return _titanRunTool(name,a);
};

/* ---------- Consommation de jetons ---------- */
function dayKeyOff(n){var d=new Date();d.setDate(d.getDate()-n);return keyOf(d);}
function usageTotals(u){
  var r={today:0,todayReq:0,week:0,month:0,all:0,allReq:0,per:{}};
  Object.keys(u.days||{}).forEach(function(k){var day=u.days[k];Object.keys(day).forEach(function(pid){var e=day[pid],n=(e.in||0)+(e.out||0);
    r.all+=n;r.allReq+=e.req||0;if(k===dayKeyOff(0)){r.today+=n;r.todayReq+=e.req||0;}if(k>=dayKeyOff(6))r.week+=n;
    if(k>=dayKeyOff(29)){var p=r.per[pid]=r.per[pid]||{req:0,in:0,out:0};p.req+=e.req||0;p.in+=e.in||0;p.out+=e.out||0;r.month+=n;}});});
  return r;
}
function fmtTok(n){n=Number(n)||0;return n>=1e6?(n/1e6).toFixed(1).replace(".",",")+" M":n>=1e4?Math.round(n/1e3)+" k":n>=1e3?(n/1e3).toFixed(1).replace(".",",")+" k":String(n);}
var TU={data:null,at:0,busy:false};
function loadUsage(force){
  if(!fileApi||!fileApi.aiUsage||TU.busy)return;if(!force&&TU.data&&Date.now()-TU.at<15000)return;
  TU.busy=true;fileApi.aiUsage().then(function(u){TU.data=u;TU.at=Date.now();TU.busy=false;if(S.ui.view==="reglages")render();},function(){TU.busy=false;});
}
function usageSection(){
  if(!fileApi||!fileApi.aiUsage)return "";
  loadUsage(false);var u=TU.data;
  var h='<section class="set-section" aria-labelledby="s-tok"><h2 class="sec" id="s-tok">Utilisation de Titan (jetons)</h2><p class="hint">Un jeton ≈ ¾ de mot. Chaque question envoie ton contexte (agenda, conduite…) puis la réponse : c\'est ce qui est compté ici. Les offres gratuites limitent les jetons par minute et par jour.</p>';
  if(!u)return h+'<p class="hint">Chargement…</p></section>';
  var t=usageTotals(u),names={};u.providers.forEach(function(p){names[p.id]=p.name;});
  h+='<div class="tu-kpis">'+[["Aujourd'hui",t.today,t.todayReq+" requête"+(t.todayReq>1?"s":"")],["7 jours",t.week,""],["30 jours",t.month,""],["Depuis le début",t.all,t.allReq+" requêtes"]].map(function(k){return '<div class="tu-kpi"><span>'+k[0]+'</span><b class="num">'+fmtTok(k[1])+'</b><small>'+k[2]+'</small></div>';}).join("")+'</div>';
  var days=[];for(var i=13;i>=0;i--){var k=dayKeyOff(i),d=u.days[k]||{},n=0;Object.keys(d).forEach(function(p){n+=(d[p].in||0)+(d[p].out||0);});days.push({k:k,n:n});}
  var mx=Math.max.apply(null,days.map(function(d){return d.n;}).concat([1]));
  h+='<div class="tu-bars" role="img" aria-label="Jetons par jour sur 14 jours">'+days.map(function(d){return '<i style="height:'+Math.max(2,Math.round(d.n/mx*100))+'%" title="'+esc(fDM.format(parseKey(d.k))+" : "+fmtTok(d.n)+" jetons")+'"></i>';}).join("")+'</div><div class="tu-axis"><span>'+esc(fDM.format(parseKey(days[0].k)))+'</span><span>aujourd\'hui</span></div>';
  var per=Object.keys(t.per);
  h+=per.length?'<div class="tu-table">'+per.map(function(pid){var p=t.per[pid];return '<div class="tu-row"><b>'+esc(names[pid]||pid)+'</b><span class="num">'+p.req+' req.</span><span class="num">'+fmtTok(p.in)+' envoyés</span><span class="num">'+fmtTok(p.out)+' reçus</span></div>';}).join("")+'</div><p class="hint">Sur les 30 derniers jours.</p>':'<p class="hint">Aucune question posée à Titan pour l\'instant.</p>';
  if(u.last)h+='<p class="hint">Dernière requête : '+esc(u.last.provider+" · "+u.last.model)+', '+fmtTok(u.last.in)+' jetons envoyés, '+fmtTok(u.last.out)+' reçus ('+esc(relTime(u.last.at))+').</p>';
  var errs=(u.errors||[]).slice(0,8),blk=u.blocked||[];
  if(blk.length)h+='<p class="hint">En pause : '+blk.map(function(b){return esc((names[b.id]||b.id)+" jusqu'à "+hm(fromM(new Date(b.until).getHours()*60+new Date(b.until).getMinutes())));}).join(", ")+' (Titan utilise les autres IA en attendant).</p>';
  h+='<details class="upd-log"'+(errs.length&&Date.now()-errs[0].at<3600000?" open":"")+'><summary>Incidents récents ('+(u.errors||[]).length+')</summary>'+(errs.length?'<ul>'+errs.map(function(e){return '<li class="bad"><time>'+esc(relTime(e.at))+'</time>'+esc(e.provider+(e.model?" · "+e.model:"")+" : "+e.kind+(e.detail?" — "+e.detail:""))+'</li>';}).join("")+'</ul>':'<p class="hint">Aucun incident.</p>')+'</details>';
  h+='<div class="row"><button class="btn sm" type="button" data-act="tu-refresh">'+icon("refresh")+'Actualiser</button><button class="btn ghost sm" type="button" data-act="tu-reset">Remettre à zéro</button></div></section>';
  return h;
}

/* ---------- Réglages : personnalisation et mémoire ---------- */
function titanPersoSection(){
  var st=S.settings,m=titanMemo();
  return '<section class="set-section" aria-labelledby="s-tperso"><h2 class="sec" id="s-tperso">Personnaliser Titan</h2>'+
    '<span class="seg" role="group" aria-label="Style de réponse">'+[["bref","Bref"],["detaille","Détaillé"],["coach","Coach"]].map(function(o){return '<button type="button" data-act="set-titan-style" data-style="'+o[0]+'" aria-pressed="'+((st.titanStyle||"bref")===o[0])+'">'+o[1]+'</button>';}).join("")+'</span>'+
    '<div class="field"><label for="set-tperso">Consignes pour Titan</label><textarea id="set-tperso" rows="3" data-set="titanPerso" data-type="str" placeholder="Ex. : appelle-moi par mon surnom, rappelle-moi de réviser la crypto, je préfère conduire le samedi matin…">'+esc(st.titanPerso||"")+'</textarea><p class="hint">Titan les suit à chaque message.</p></div>'+
    '<h3 class="sec" style="font-size:1rem;margin-top:8px">Ce que Titan retient sur toi <span class="muted num">('+m.length+')</span></h3>'+
    (m.length?'<ul class="tu-memo">'+m.map(function(x,i){return '<li><span>'+esc(x.t)+'</span><button class="btn ghost sm" type="button" data-act="memo-del" data-i="'+i+'" aria-label="Oublier">'+icon("x")+'</button></li>';}).join("")+'</ul><div class="row"><button class="btn ghost sm" type="button" data-act="memo-clear">Tout oublier</button></div>':'<p class="hint">Rien pour l\'instant. Dis par exemple à Titan « retiens que je travaille le mercredi après-midi ».</p>')+
    '</section>';
}
ACTS["set-titan-style"]=function(t){putSettings({titanStyle:t.getAttribute("data-style")});};
ACTS["memo-del"]=function(t){var m=titanMemo().slice();m.splice(Number(t.getAttribute("data-i")),1);putSettings({titanMemo:m});toast("Oublié");};
ACTS["memo-clear"]=function(){putSettings({titanMemo:[]});toast("Mémoire de Titan effacée");};
ACTS["tu-refresh"]=function(){loadUsage(true);};
ACTS["tu-reset"]=function(){if(!fileApi||!fileApi.aiResetUsage)return;fileApi.aiResetUsage().then(function(){toast("Compteur remis à zéro");loadUsage(true);});};
