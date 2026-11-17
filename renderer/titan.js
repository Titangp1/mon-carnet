"use strict";
/* Carnet de l'utilisateur 3.4 : Titan AI. Assistant intégré (Groq) qui comprend tout le carnet :
   cours, conduite, événements perso, rendez-vous clients, tâches, mails de l'école et leurs pièces jointes.
   Il crée et modifie directement (annulable d'un clic) ; il demande confirmation pour supprimer ou réserver. */

S.titan={msgs:[],busy:false,open:false,draft:"",step:"",stop:false};
try{var _tm=JSON.parse(localStorage.getItem("carnet-titan")||"[]");if(Array.isArray(_tm))S.titan.msgs=_tm.slice(-60);}catch(e){}
function saveTitan(){try{localStorage.setItem("carnet-titan",JSON.stringify(S.titan.msgs.slice(-60)));}catch(e){}}

var TITAN_SUGG=["Qu'est-ce que j'ai demain ?","Trouve ma convocation et ajoute-la à l'agenda","Ajoute une révision jeudi à 18h","Ai-je reçu des mails de mes profs cette semaine ?","Quand est ma prochaine leçon de conduite ?","Quels sont mes temps libres ce week-end ?"];

/* ---------- Données de l'agenda, lisibles par le modèle ---------- */
function tDate(s){var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||""));return m&&validDate(m[1]+"-"+m[2]+"-"+m[3])?m[1]+"-"+m[2]+"-"+m[3]:null;}
function dayItems(k){
  var out=[];
  S.cours.forEach(function(c){if(c.date!==k)return;out.push(c.allDay?{type:"journee_ecole",titre:c.titre,modifiable:false}:{type:"cours",debut:c.heure,fin:fromM(toMin(c.heure)+c.duree),titre:c.titre,salle:c.lieu||undefined,details:c.desc?c.desc.slice(0,160):undefined,modifiable:false});});
  permisAll().forEach(function(p){if(p.date!==k)return;out.push({type:"conduite",debut:p.heure,fin:fromM(toMin(p.heure)+p.duree),moniteur:p.moniteur||undefined,rdv:p.rdv||undefined,modifiable:false});});
  eventsOn(k).forEach(function(e){out.push({type:"evenement",id:e.id,titre:e.titre,debut:e.allDay?"journée entière":e.heure,fin:e.allDay?undefined:evEnd(e),categorie:evCat(e.cat)[1],lieu:e.lieu||undefined,note:e.note?e.note.slice(0,160):undefined,serie:e.serie?true:undefined});});
  S.rdv.forEach(function(r){if(r.date!==k||r.statut==="annule")return;out.push({type:"rendez_vous_client",id:r.id,debut:r.heure,fin:fromM(toMin(r.heure)+(Number(r.duree)||60)),client:rdvName(r),prestation:r.forfaitNom,adresse:rdvAddr(r)||undefined,statut:STATUTS[r.statut]});});
  S.taches.forEach(function(t){if(!t.fait&&t.echeance===k)out.push({type:"tache_a_rendre",id:t.id,titre:t.titre});});
  return out.sort(function(a,b){return String(a.debut||"").localeCompare(String(b.debut||""));});
}
function compactDay(k){var it=dayItems(k);if(!it.length)return "libre";return it.map(function(x){
  var t=x.type==="cours"?"Cours « "+x.titre+" »"+(x.salle?" ("+x.salle+")":""):x.type==="conduite"?"Conduite"+(x.moniteur?" avec "+x.moniteur:""):x.type==="evenement"?"Événement « "+x.titre+" » [id "+x.id+"]":x.type==="rendez_vous_client"?"RDV client "+x.client+" [id "+x.id+"]":x.type==="tache_a_rendre"?"Tâche à rendre « "+x.titre+" » [id "+x.id+"]":"Journée « "+x.titre+" »";
  return (x.debut&&x.fin?hm(x.debut)+"–"+hm(x.fin)+" ":x.debut?x.debut+" ":"")+t;}).join(" ; ");}
function freeWindows(k,minDur,lo,hi){
  var busy=[];busyOn(k,null).forEach(function(x){busy.push([x.a,x.b]);});busy.sort(function(x,y){return x[0]-y[0];});
  var out=[],cur=lo==null?7*60:lo,end=hi==null?22*60:hi;
  if(k===todayKey()){var n=new Date();cur=Math.max(cur,n.getHours()*60+n.getMinutes());}
  busy.forEach(function(b){if(b[0]>cur&&Math.min(b[0],end)-cur>=minDur)out.push({debut:fromM(cur),fin:fromM(Math.min(b[0],end))});cur=Math.max(cur,b[1]);});
  if(end-cur>=minDur)out.push({debut:fromM(cur),fin:fromM(end)});return out;
}
function mailOut(m,extrait){return {id:m.id,de:senderName(m.from)+" <"+m.from.address+">",objet:m.subject,date:new Date(m.date).toLocaleString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}),non_lu:isUnread(m),pieces_jointes:(m.att||[]).map(function(a){return a.name+(a.invite?" (invitation agenda)":"");}),extrait:(extrait||m.snippet||"").slice(0,260)};}

/* ---------- Actions de Titan (création immédiate annulable, suppression et réservation à confirmer) ---------- */
var TURN=null; /* actions du tour en cours */
function snapOp(col,id){var o=S[col].get(id);return {col:col,id:id,before:o?Object.assign({},o):null};}
function applyUndo(ops){ops.slice().reverse().forEach(function(op){if(op.before)S[op.col].set(op.id,op.before);else S[op.col].delete(op.id);});render();persist();}
function stampOps(ops){(ops||[]).forEach(function(op){op.now=JSON.stringify(S[op.col].get(op.id)||null);});return ops;}
function registerAction(a){a.id=uid();stampOps(a.undo);(TURN||[]).push(a);return a;}
function argTimes(a,base){
  var deb=a.debut!=null?normTime(a.debut):(base?base.heure:null),dur=null;
  if(a.fin!=null){var f=normTime(a.fin);if(f&&deb&&toMin(f)>toMin(deb))dur=toMin(f)-toMin(deb);else if(f)return {err:"L'heure de fin doit être après le début."};}
  if(dur==null&&a.duree_min!=null)dur=Math.max(5,Math.min(24*60,Number(a.duree_min)||60));
  if(dur==null)dur=base?(Number(base.duree)||60):60;
  if(a.debut!=null&&!deb)return {err:"Heure de début illisible (format attendu 14:30)."};
  return {heure:deb,duree:dur};
}
var EXEC={
  creer_evenement:function(a){
    var titre=String(a.titre||"").trim(),date=tDate(a.date),allDay=!!a.journee_entiere;
    if(!titre)return {ok:false,erreur:"Il manque le titre."};if(!date)return {ok:false,erreur:"Date invalide (format AAAA-MM-JJ)."};
    var t=allDay?{heure:"",duree:0}:argTimes(a,null);if(t.err)return {ok:false,erreur:t.err};if(!allDay&&!t.heure)return {ok:false,erreur:"Il manque l'heure de début (ou mets journee_entiere à true)."};
    var list=buildEvents({titre:titre,date:date,heure:t.heure,duree:t.duree,allDay:allDay,lieu:a.lieu,note:a.note,cat:catFrom(a.categorie),repeat:a.repeter_semaines,source:"titan"});
    putMany("events",list);var c=eventConflicts(list[0]);
    registerAction({tool:"creer_evenement",status:"done",label:list.length>1?list.length+" événements créés":"Événement créé",detail:"« "+titre+" » · "+evWhen(list[0])+(list.length>1?" (chaque semaine)":""),undo:list.map(function(e){return {col:"events",id:e.id,before:null};}),go:{date:list[0].date}});
    return {ok:true,statut:"fait (l'utilisateur peut annuler)",ids:list.map(function(e){return e.id;}),quand:evWhen(list[0]),conflits:c.length?c:undefined};},
  modifier_evenement:function(a){
    var e=S.events.get(String(a.id||""));if(!e)return {ok:false,erreur:"Événement introuvable : utilise l'id donné par l'agenda."};
    var x=Object.assign({},e),date=a.date!=null?tDate(a.date):e.date;if(!date)return {ok:false,erreur:"Date invalide."};x.date=date;
    if(a.journee_entiere===true){x.allDay=true;x.heure="";x.duree=0;}
    else if(a.debut!=null||a.fin!=null||a.duree_min!=null||a.journee_entiere===false){var t=argTimes(a,e.allDay?{heure:"09:00",duree:60}:e);if(t.err)return {ok:false,erreur:t.err};x.allDay=false;x.heure=t.heure||"09:00";x.duree=t.duree;}
    if(a.titre!=null)x.titre=String(a.titre).trim()||e.titre;if(a.lieu!=null)x.lieu=String(a.lieu).trim();if(a.note!=null)x.note=String(a.note).trim();if(a.categorie!=null)x.cat=catFrom(a.categorie);
    x.updated=Date.now();var op=snapOp("events",e.id);put("events",x);
    registerAction({tool:"modifier_evenement",status:"done",label:"Événement modifié",detail:"« "+x.titre+" » · "+evWhen(x),undo:[op],go:{date:x.date}});
    var c=eventConflicts(x);return {ok:true,statut:"fait (l'utilisateur peut annuler)",quand:evWhen(x),conflits:c.length?c:undefined};},
  supprimer_evenement:function(a,confirmed){
    var e=S.events.get(String(a.id||""));if(!e)return {ok:false,erreur:"Événement introuvable."};
    var all=a.toute_la_serie&&e.serie?Array.from(S.events.values()).filter(function(x){return x.serie===e.serie;}):[e];
    if(!confirmed){registerAction({tool:"supprimer_evenement",args:a,status:"pending",label:all.length>1?"Supprimer la série « "+e.titre+" » ("+all.length+") ?":"Supprimer « "+e.titre+" » ?",detail:evWhen(e)});return {ok:true,statut:"en attente : l'utilisateur doit cliquer sur Confirmer"};}
    var ops=all.map(function(x){return snapOp("events",x.id);});all.forEach(function(x){S.events.delete(x.id);});render();persist();return {ok:true,undo:ops};},
  creer_tache:function(a){
    var titre=String(a.titre||"").trim();if(!titre)return {ok:false,erreur:"Il manque le titre."};var ech=a.echeance?tDate(a.echeance):"";if(a.echeance&&!ech)return {ok:false,erreur:"Échéance invalide (AAAA-MM-JJ)."};
    var t={id:uid(),titre:titre.slice(0,200),echeance:ech||"",fait:false,created:Date.now()};put("taches",t);
    registerAction({tool:"creer_tache",status:"done",label:"Tâche ajoutée",detail:titre+(ech?" · pour le "+fDM.format(parseKey(ech)):""),undo:[{col:"taches",id:t.id,before:null}],go:{view:"taches"}});
    return {ok:true,statut:"fait",id:t.id};},
  modifier_tache:function(a){
    var t=S.taches.get(String(a.id||""));if(!t)return {ok:false,erreur:"Tâche introuvable."};var x=Object.assign({},t);
    if(a.titre!=null)x.titre=String(a.titre).trim()||t.titre;if(a.echeance!=null){var e=a.echeance?tDate(a.echeance):"";if(a.echeance&&!e)return {ok:false,erreur:"Échéance invalide."};x.echeance=e||"";}
    if(a.faite!=null){x.fait=!!a.faite;x.doneAt=x.fait?Date.now():null;}
    var op=snapOp("taches",t.id);put("taches",x);registerAction({tool:"modifier_tache",status:"done",label:x.fait&&!t.fait?"Tâche cochée":"Tâche modifiée",detail:x.titre,undo:[op],go:{view:"taches"}});return {ok:true,statut:"fait"};},
  supprimer_tache:function(a,confirmed){
    var t=S.taches.get(String(a.id||""));if(!t)return {ok:false,erreur:"Tâche introuvable."};
    if(!confirmed){registerAction({tool:"supprimer_tache",args:a,status:"pending",label:"Supprimer la tâche « "+t.titre+" » ?",detail:t.echeance?"Pour le "+fDM.format(parseKey(t.echeance)):"Sans date"});return {ok:true,statut:"en attente : l'utilisateur doit cliquer sur Confirmer"};}
    var op=snapOp("taches",t.id);S.taches.delete(t.id);render();persist();return {ok:true,undo:[op]};},
  creer_rendez_vous_client:function(a){
    var nom=String(a.client||"").trim(),date=tDate(a.date),h=normTime(a.heure);if(!nom)return {ok:false,erreur:"Il manque le nom du client."};if(!date||!h)return {ok:false,erreur:"Date (AAAA-MM-JJ) ou heure (HH:MM) invalide."};
    var f=null;if(a.prestation){var q=norm(a.prestation);FORFAITS.forEach(function(x){if(!f&&(x.id===a.prestation||norm(x.nom).indexOf(q)>=0||q.indexOf(norm(x.nom))>=0))f=x;});}f=f||forfait("express");
    var ops=[],c=null;S.clients.forEach(function(x){if(!c&&norm(x.nom)===norm(nom))c=x;});
    if(!c){c={id:uid(),nom:nom,tel:String(a.telephone||"").trim(),email:"",adresse:String(a.adresse||"").trim(),note:"",materiel:[],created:Date.now()};ops.push({col:"clients",id:c.id,before:null});S.clients.set(c.id,c);}
    var r={id:uid(),clientId:c.id,clientName:c.nom,date:date,heure:h,duree:Math.max(15,Number(a.duree_min)||f.duree),forfait:f.id,forfaitNom:f.nom,prix:a.prix!=null?Math.max(0,Number(a.prix)||0):f.prix,adresse:String(a.adresse||c.adresse||"").trim(),note:String(a.note||"").trim(),statut:"prevu",created:Date.now()};
    ops.push({col:"rdv",id:r.id,before:null});put("rdv",r);
    registerAction({tool:"creer_rendez_vous_client",status:"done",label:"Rendez-vous client créé",detail:c.nom+" · "+relDay(date)+" à "+hm(h)+" · "+f.nom,undo:ops,go:{date:date}});
    var cf=conflictText(date,h,r.duree,r.id);return {ok:true,statut:"fait (l'utilisateur peut annuler)",id:r.id,nouveau_client:ops.length>1,conflit:cf||undefined};},
  modifier_rendez_vous_client:function(a){
    var r=S.rdv.get(String(a.id||""));if(!r)return {ok:false,erreur:"Rendez-vous introuvable."};var x=Object.assign({},r);
    if(a.date!=null){var d=tDate(a.date);if(!d)return {ok:false,erreur:"Date invalide."};x.date=d;}
    if(a.heure!=null){var h=normTime(a.heure);if(!h)return {ok:false,erreur:"Heure invalide."};x.heure=h;}
    if(a.duree_min!=null)x.duree=Math.max(15,Number(a.duree_min)||60);if(a.note!=null)x.note=String(a.note);if(a.adresse!=null)x.adresse=String(a.adresse);if(a.prix!=null)x.prix=Math.max(0,Number(a.prix)||0);
    if(a.statut!=null){if(["prevu","fait","annule"].indexOf(a.statut)<0)return {ok:false,erreur:"Statut possible : prevu, fait ou annule (l'encaissement se fait dans l'appli)."};x.statut=a.statut;}
    x.updated=Date.now();var op=snapOp("rdv",r.id);put("rdv",x);
    registerAction({tool:"modifier_rendez_vous_client",status:"done",label:"Rendez-vous modifié",detail:rdvName(x)+" · "+relDay(x.date)+" à "+hm(x.heure)+" · "+STATUTS[x.statut],undo:[op],go:{date:x.date}});
    var cf=conflictText(x.date,x.heure,x.duree,x.id);return {ok:true,statut:"fait",conflit:cf||undefined};},
  reserver_lecon:function(a,confirmed){
    var s=findSlot(String(a.creneau_id||""));if(!s||s.kind!=="dispo")return {ok:false,erreur:"Créneau introuvable ou plus libre : relance l'outil conduite."};
    var chk=slotCheck(s);
    if(!confirmed){registerAction({tool:"reserver_lecon",args:a,status:"pending",label:"Réserver la leçon ?",detail:slotLabel(s)+" avec "+moniteurShort(s.moniteur)+(chk.ok?"":" · "+chk.why)});return {ok:true,statut:"en attente : l'utilisateur doit cliquer sur Confirmer (la leçon est payante)",compatible:chk.ok,raison:chk.ok?undefined:chk.why};}
    return bookSlot(s,false).then(function(ok){return {ok:ok};});}
};
function catFrom(c){var q=norm(c||"");if(!q)return "perso";for(var i=0;i<EV_CATS.length;i++){if(EV_CATS[i][0]===q||norm(EV_CATS[i][1])===q||norm(EV_CATS[i][1]).indexOf(q)===0)return EV_CATS[i][0];}
  if(/revis|exam|partiel|devoir|td|projet/.test(q))return "revision";if(/sport|muscu|foot|course|piscine|salle/.test(q))return "sport";if(/medec|dent|sante|docteur/.test(q))return "sante";if(/cours|ecole|exam|partiel/.test(q))return "ecole";if(/soir|sortie|cine|resto|anniv/.test(q))return "sortie";if(/travail|job|alternance|entreprise|stage/.test(q))return "travail";return "autre";}

/* ---------- Outils (définitions pour le modèle) ---------- */
function T(name,desc,props,req){return {type:"function",function:{name:name,description:desc,parameters:{type:"object",properties:props||{},required:req||[]}}};}
var FMT_D="AAAA-MM-JJ",FMT_H="HH:MM (24 h)";
var TITAN_TOOLS=[
  T("agenda","Tout ce qui est prévu entre deux dates incluses : cours de l'école, leçons de conduite, événements perso (avec id), rendez-vous clients (avec id), tâches à rendre (avec id). À utiliser pour toute question d'emploi du temps et pour retrouver un id avant de modifier.",{debut:{type:"string",description:FMT_D},fin:{type:"string",description:FMT_D+" (incluse)"}},["debut","fin"]),
  T("chercher_agenda","Cherche par mots-clés dans l'agenda (cours, événements, rendez-vous, tâches, conduite), par défaut des 30 derniers jours aux 6 prochains mois. Ex. « crypto », « examen », « dentiste ».",{texte:{type:"string"},debut:{type:"string",description:FMT_D},fin:{type:"string",description:FMT_D}},["texte"]),
  T("creneaux_libres","Temps libres d'une journée (hors cours, conduite, événements et rendez-vous).",{date:{type:"string",description:FMT_D},duree_min:{type:"integer",description:"Durée minimale en minutes (60 par défaut)"},entre:{type:"string",description:FMT_H+" début de la plage (7:00 par défaut)"},et:{type:"string",description:FMT_H+" fin de la plage (22:00 par défaut)"}},["date"]),
  T("chercher_mails","Cherche dans les mails de l'école synchronisés (expéditeurs et domaines choisis dans Réglages) : objet, texte, expéditeur ET noms des pièces jointes. Utilise 1 à 3 mots-clés courts (ex. « convocation », « examen », « planning »). Si rien n'est trouvé localement, l'outil interroge aussi tout Gmail. Sans texte, renvoie les plus récents.",{texte:{type:"string",description:"Mots-clés"},expediteur:{type:"string",description:"Nom ou adresse, même partiel"},depuis:{type:"string",description:FMT_D},jusqu_a:{type:"string",description:FMT_D},non_lus:{type:"boolean"},avec_pieces_jointes:{type:"boolean"},limite:{type:"integer"}}),
  T("lire_mail","Texte complet d'un mail (id obtenu avec chercher_mails) et liste de ses pièces jointes.",{id:{type:"string"}},["id"]),
  T("lire_piece_jointe","Lit le contenu d'une pièce jointe d'un mail : PDF (convocation, planning…), texte ou invitation agenda (.ics, avec les événements décodés).",{id:{type:"string",description:"id du mail"},nom:{type:"string",description:"Nom exact de la pièce jointe"}},["id","nom"]),
  T("conduite","Permis : leçons à venir, heures faites cette semaine et maximum, créneaux libres de l'auto-école (avec creneau_id et compatibilité), règles et historique de la réservation automatique.",{}),
  T("notifications","Derniers changements détectés (cours ou leçons déplacés, annulés, ajoutés, réservations, nouveaux mails).",{limite:{type:"integer"}}),
  T("clients","Cherche un client de l'activité d'aide informatique.",{recherche:{type:"string"}},["recherche"]),
  T("taches","Liste des tâches avec leur id.",{inclure_faites:{type:"boolean"}}),
  T("finances","Encaissements d'un mois de l'activité.",{mois:{type:"string",description:"AAAA-MM"}}),
  T("actualiser","Relance une synchronisation et attend le résultat : mails, emploi_du_temps ou conduite.",{service:{type:"string",enum:["mails","emploi_du_temps","conduite"]}},["service"]),
  T("creer_evenement","Crée un événement perso dans l'agenda (révision, sport, rendez-vous perso, examen, convocation…). Appliqué tout de suite, annulable par l'utilisateur.",{titre:{type:"string"},date:{type:"string",description:FMT_D},debut:{type:"string",description:FMT_H},fin:{type:"string",description:FMT_H},duree_min:{type:"integer",description:"si pas de fin"},journee_entiere:{type:"boolean"},lieu:{type:"string"},note:{type:"string"},categorie:{type:"string",enum:["perso","revision","ecole","sport","sante","sortie","travail","autre"]},repeter_semaines:{type:"integer",description:"Nombre de répétitions hebdomadaires en plus (0 = une seule fois)"}},["titre","date"]),
  T("modifier_evenement","Modifie un événement perso existant (id requis). Seuls les champs donnés changent.",{id:{type:"string"},titre:{type:"string"},date:{type:"string",description:FMT_D},debut:{type:"string",description:FMT_H},fin:{type:"string",description:FMT_H},duree_min:{type:"integer"},journee_entiere:{type:"boolean"},lieu:{type:"string"},note:{type:"string"},categorie:{type:"string"}},["id"]),
  T("supprimer_evenement","Supprime un événement perso (l'utilisateur doit confirmer).",{id:{type:"string"},toute_la_serie:{type:"boolean"}},["id"]),
  T("creer_tache","Ajoute une tâche (devoir, démarche…), avec échéance facultative.",{titre:{type:"string"},echeance:{type:"string",description:FMT_D}},["titre"]),
  T("modifier_tache","Modifie ou coche une tâche (id requis).",{id:{type:"string"},titre:{type:"string"},echeance:{type:"string",description:FMT_D+" ou vide pour retirer"},faite:{type:"boolean"}},["id"]),
  T("supprimer_tache","Supprime une tâche (l'utilisateur doit confirmer).",{id:{type:"string"}},["id"]),
  T("creer_rendez_vous_client","Crée un rendez-vous client pour l'activité d'aide informatique (le client est créé s'il n'existe pas).",{client:{type:"string"},date:{type:"string",description:FMT_D},heure:{type:"string",description:FMT_H},duree_min:{type:"integer"},prestation:{type:"string",description:"Dépannage express, Nouvel appareil, Check-up sécurité, Cours à domicile, Diagnostic…"},prix:{type:"number"},adresse:{type:"string"},telephone:{type:"string"},note:{type:"string"}},["client","date","heure"]),
  T("modifier_rendez_vous_client","Déplace ou modifie un rendez-vous client (id requis). statut : prevu, fait ou annule.",{id:{type:"string"},date:{type:"string",description:FMT_D},heure:{type:"string",description:FMT_H},duree_min:{type:"integer"},statut:{type:"string",enum:["prevu","fait","annule"]},note:{type:"string"},adresse:{type:"string"},prix:{type:"number"}},["id"]),
  T("reserver_lecon","Prépare la réservation d'un créneau de conduite libre (creneau_id donné par l'outil conduite). l'utilisateur doit confirmer : la leçon est payante.",{creneau_id:{type:"string"}},["creneau_id"])
];
var TOOL_STEP={agenda:"Je regarde ton agenda…",chercher_agenda:"Je cherche dans ton agenda…",creneaux_libres:"Je cherche tes temps libres…",chercher_mails:"Je fouille tes mails…",lire_mail:"Je lis le mail…",lire_piece_jointe:"J'ouvre la pièce jointe…",conduite:"Je regarde la conduite…",notifications:"Je regarde les changements…",clients:"Je cherche le client…",taches:"Je regarde tes tâches…",finances:"Je regarde tes finances…",actualiser:"Je synchronise…"};
function traceLabel(name,a){a=a||{};
  switch(name){case "agenda":return "agenda "+(a.debut===a.fin?fmtD(a.debut):fmtD(a.debut)+" → "+fmtD(a.fin));case "chercher_agenda":return "agenda « "+(a.texte||"")+" »";case "creneaux_libres":return "temps libres "+fmtD(a.date);
    case "chercher_mails":return "mails"+(a.texte?" « "+a.texte+" »":"")+(a.expediteur?" de "+a.expediteur:"");case "lire_mail":return "lecture d'un mail";case "lire_piece_jointe":return "pièce jointe « "+(a.nom||"")+" »";
    case "actualiser":return "synchro "+(a.service||"");default:return {conduite:"conduite",notifications:"notifications",clients:"clients",taches:"tâches",finances:"finances"}[name]||name;}}
function fmtD(k){var d=tDate(k);return d?fDM.format(parseKey(d)):String(k||"");}

function runTool(name,a){
  a=a||{};var tk=todayKey();
  if(EXEC[name])return EXEC[name](a,false);
  switch(name){
    case "agenda":{var d0=tDate(a.debut)||tk,d1=tDate(a.fin)||d0;if(d1<d0){var t=d0;d0=d1;d1=t;}var out=[],d=parseKey(d0),n=0;
      while(keyOf(d)<=d1&&n<62){var k=keyOf(d),it=dayItems(k);out.push({date:k,jour:fDayY.format(d),elements:it.length?it:"rien de prévu"});d=addDays(d,1);n++;}
      return {periode:d0+" → "+d1,jours:out,emploi_du_temps_synchronise:S.coursAt?relTime(S.coursAt):"jamais"};}
    case "chercher_agenda":{var toks=tokens(a.texte||""),from=tDate(a.debut)||keyOf(addDays(new Date(),-30)),to=tDate(a.fin)||keyOf(addDays(new Date(),183)),res=[],dd=parseKey(from),guard=0;
      if(!toks.length)return {erreur:"Donne au moins un mot-clé."};
      while(keyOf(dd)<=to&&guard<400){var kk=keyOf(dd);dayItems(kk).forEach(function(x){var w=wordsOf([x.titre,x.salle,x.details,x.lieu,x.note,x.client,x.prestation,x.moniteur,x.type==="conduite"?"conduite lecon permis":"",x.type==="cours"?"cours":""].filter(Boolean).join(" "));
        if(toks.every(function(t2){return hitIn(w,t2);}))res.push(Object.assign({date:kk,jour:fDayY.format(dd)},x));});dd=addDays(dd,1);guard++;}
      return {recherche:a.texte,periode:from+" → "+to,trouves:res.length,resultats:res.slice(0,40)};}
    case "creneaux_libres":{var k2=tDate(a.date)||tk;return {date:k2,jour:fDayY.format(parseKey(k2)),libres:freeWindows(k2,Number(a.duree_min)||60,a.entre?toMin(normTime(a.entre)||"07:00"):null,a.et?toMin(normTime(a.et)||"22:00"):null),occupe:dayItems(k2)};}
    case "chercher_mails":{
      if(!S.mail.account)return {erreur:"La boîte mail de l'école n'est pas reliée (page Cours > Connecter)."};
      var lim=Math.min(25,Number(a.limite)||10),opts={texte:a.texte||"",expediteur:a.expediteur||"",depuis:tDate(a.depuis),jusqu_a:tDate(a.jusqu_a),non_lus:!!a.non_lus,pj:!!a.avec_pieces_jointes};
      var local=mailSearch(opts);
      function pack(r,source){return {source:source,correspondance_exacte:r.strict,total:r.list.length,mails_dans_la_boite:S.mail.list.length,resultats:r.list.slice(0,lim).map(function(x){return mailOut(x.m,x.extrait);})};}
      if((local.list.length&&local.strict)||!(a.texte||a.expediteur))return pack(local,"boîte synchronisée");
      return serverMailSearch([a.texte||"",a.expediteur?"from:"+String(a.expediteur).split(/\s+/)[0]:""].join(" ").trim()).then(function(){var again=mailSearch(opts);var p=pack(again.list.length?again:local,"boîte synchronisée + recherche Gmail complète");if(!again.list.length)p.conseil="Rien trouvé : essaie un autre mot-clé (synonyme, nom du prof) ou sans filtre de date.";return p;});}
    case "lire_mail":{var m=mailById(String(a.id||""));if(!m)return {erreur:"Mail introuvable : relance chercher_mails."};markMailRead(m.id);
      var done=function(){return Object.assign(mailOut(m),{texte:String(m.text||m.snippet||"").slice(0,9000),pieces_jointes:(m.att||[]).map(function(x){return {nom:x.name,type:attKind(x),taille_ko:x.size?Math.round(x.size/1024):undefined};})});};
      if(m.text!=null||!fileApi||!fileApi.mailBody)return done();
      return fileApi.mailBody(m.id).then(function(r){if(r&&r.ok)m.text=r.text||"";return done();},done);}
    case "lire_piece_jointe":{if(!fileApi||!fileApi.mailAttachment)return {erreur:"Disponible dans l'application."};
      return fileApi.mailAttachment(String(a.id||""),String(a.nom||""),"text").then(function(r){
        if(!r||!r.ok)return {erreur:r&&r.error==="type"?"Type de fichier non lisible (seulement PDF, texte et invitations .ics).":r&&r.error==="pdf"?"PDF sans texte lisible (probablement un scan).":r&&r.error==="noatt"?"Pièce jointe introuvable : vérifie le nom exact avec lire_mail.":"Lecture impossible."};
        var o={nom:r.name,type:r.kind,texte:String(r.text||"").slice(0,12000),tronque:r.truncated||undefined};
        if(r.kind==="ics")o.evenements=parseICS(r.text).slice(0,10).map(function(e){return {titre:e.titre,date:e.date,debut:e.allDay?"journée":e.heure,fin:e.allDay?undefined:fromM(toMin(e.heure)+e.duree),lieu:e.lieu||undefined};});
        return o;});}
    case "conduite":{var st=S.settings;
      return {compte_sarool_connecte:!!st.saroolOn,derniere_verification:S.sarool.at?relTime(S.sarool.at):"jamais",
        heures_conduite_effectuees_au_total:hDur(doneMin().min),heures_cette_semaine:hDur(minutesInWeek(tk)),maximum_par_semaine:hDur(capMin()),
        lecons_a_venir:permisAll().filter(function(p){return p.date>=tk;}).slice(0,8).map(function(p){return {date:fDayY.format(parseKey(p.date)),debut:p.heure,fin:fromM(toMin(p.heure)+p.duree),moniteur:p.moniteur||undefined,rdv:p.rdv||undefined};}),
        creneaux_libres_auto_ecole:saroolSlots().filter(function(s){return s.kind==="dispo"&&s.date>=tk&&slotCheck(s).ok;}).slice(0,8).map(function(s){return {creneau_id:s.id,date:fDayY.format(parseKey(s.date)),debut:s.heure,fin:s.fin,moniteur:s.moniteur};}),
        reservation_auto:{active:!!st.autoOn,mode:st.autoMode==="ask"?"me demander":"automatique",moniteur_prefere:st.moniteurPref,autre_moniteur_accepte:!!st.autreMoniteur,heures_max_par_semaine:st.heuresSemaine,max_lecons_par_jour:st.maxJour,plage:st.plageDebut+"-"+st.plageFin,marge_minutes:st.marge},
        historique:S.permisLog.slice(0,4).map(function(l){return l.text+" ("+relTime(l.at)+")";})};}
    case "notifications":return {notifications:S.notifs.slice(0,Math.min(30,Number(a.limite)||12)).map(function(n){return {quand:relTime(n.at),titre:n.title,detail:n.body,lu:n.read};})};
    case "clients":{var qq=norm(a.recherche||"");var cl=Array.from(S.clients.values()).filter(function(c){return norm([c.nom,c.tel,c.adresse,c.email].join(" ")).indexOf(qq)>=0;}).slice(0,5);
      return {clients:cl.map(function(c){return {nom:c.nom,tel:c.tel,email:c.email,adresse:c.adresse,notes:c.note,materiel:(c.materiel||[]).map(function(x){return x.type+" "+(x.modele||"");}),rendez_vous:rdvList().filter(function(r){return r.clientId===c.id;}).slice(-6).map(function(r){return {id:r.id,date:r.date,heure:r.heure,prestation:r.forfaitNom,statut:STATUTS[r.statut]};})};})};}
    case "taches":return {taches:Array.from(S.taches.values()).filter(function(t){return a.inclure_faites||!t.fait;}).sort(taskSort).map(function(t){return {id:t.id,titre:t.titre,echeance:t.echeance||undefined,faite:!!t.fait};})};
    case "finances":{var mk=/^\d{4}-\d{2}$/.test(a.mois||"")?a.mois:monthKey(new Date());var enc=recettes(function(r){return r.payeLe.slice(0,7)===mk;});
      return {mois:mk,encaisse:sumOf(enc),nombre_encaissements:enc.length,reste_a_encaisser:sumOf(rdvList().filter(function(r){return r.statut==="fait";})),debut_activite:startLabel()||"non renseigné"};}
    case "actualiser":{var sv=a.service;
      if(sv==="mails")return syncMail(false).then(function(){return S.mail.err?{erreur:mailErrText(S.mail.err)}:{ok:true,mails:S.mail.list.length,non_lus:mailUnreadCount()};});
      if(sv==="emploi_du_temps")return syncCours(false).then(function(r){return r&&r.ok?{ok:true,cours_a_venir:S.cours.filter(function(c){return c.date>=tk&&!c.allDay;}).length}:{erreur:coursErrText()};});
      if(sv==="conduite")return permisCycle(false).then(function(){return S.sarool.err?{erreur:saroolErrText(S.sarool.err)}:{ok:true,lecons_a_venir:permisAll().filter(function(p){return p.date>=tk;}).length};});
      return {erreur:"Service inconnu"};}
  }
  return {erreur:"Outil inconnu"};
}

/* ---------- Contexte donné au modèle ---------- */
function systemPrompt(){
  var now=new Date(),s=startOfWeek(now),days=[],week=[];
  for(var i=-1;i<15;i++){var d=addDays(now,i);days.push(fDayY.format(d)+" = "+keyOf(d)+(i===0?" (aujourd'hui)":i===1?" (demain)":i===-1?" (hier)":""));}
  for(var j=0;j<7;j++){var d2=addDays(now,j);week.push("- "+cap(fDay.format(d2))+" ("+keyOf(d2)+") : "+compactDay(keyOf(d2)));}
  var ml="";
  if(S.mail.account){var sd={};S.mail.list.forEach(function(m){var n=senderName(m.from);sd[n]=(sd[n]||0)+1;});
    ml="Boîte mail de l'école reliée : "+S.mail.list.length+" mails synchronisés ("+mailUnreadCount()+" non lus), expéditeurs : "+Object.keys(sd).sort(function(a,b){return sd[b]-sd[a];}).slice(0,10).map(function(n){return n+" ("+sd[n]+")";}).join(", ")+".\nDerniers mails :\n"+
      S.mail.list.slice(0,8).map(function(m){return "- [id "+m.id+"] "+fNum.format(new Date(m.date))+" · "+senderName(m.from)+" · « "+m.subject+" »"+(m.att&&m.att.length?" · PJ : "+m.att.map(function(a){return a.name;}).join(", "):"")+(isUnread(m)?" · non lu":"");}).join("\n");}
  else ml="Boîte mail de l'école non reliée (page Cours > Connecter).";
  var cond=S.settings.saroolOn?"Conduite : "+hDur(minutesInWeek(todayKey()))+" faites cette semaine sur "+hDur(capMin())+" max ; réservation automatique "+(S.settings.autoOn?"activée":"désactivée")+".":"Sarool non connecté.";
  return titanIntro()+"\n"+
    "Nous sommes le "+fDayY.format(now)+", il est "+pad(now.getHours())+"h"+pad(now.getMinutes())+" (heure de Paris). Semaine en cours : du "+fDM.format(s)+" au "+fDM.format(addDays(s,6))+".\n\n"+
    "CALENDRIER DE RÉFÉRENCE\n"+days.join("\n")+"\n\n"+
    "LES 7 PROCHAINS JOURS (aperçu, les ids servent aux modifications)\n"+week.join("\n")+"\n\n"+
    "CE QUE CONTIENT LE CARNET\n"+
    "- cours : emploi du temps officiel de l'école (iCal), lecture seule. Si un cours change, c'est l'école qui le modifie.\n"+
    "- conduite : leçons réservées sur Sarool, lecture seule (réservation possible via reserver_lecon, avec confirmation).\n"+
    "- evenement : agenda perso de l'utilisateur (révisions, sport, examens, convocations, rendez-vous perso), modifiable.\n"+
    "- rendez_vous_client : activité d'indépendant (clients), modifiable. tache : liste de tâches, modifiable.\n"+cond+"\n"+ml+"\n\n"+
    "RÈGLES\n"+
    "1. Réponds en français, tutoie l'utilisateur et appelle-le par son prénom, sois bref et concret (listes courtes, heures au format 14h30). Pas de tableau large.\n"+
    "2. N'invente jamais un événement, un horaire ou un mail : appuie-toi sur l'aperçu ci-dessus ou appelle les outils. Ne déduis rien qui ne figure pas dans les résultats.\n"+
    "3. Mails : appelle chercher_mails avec 1 à 3 mots-clés courts (ex. « convocation »), sans filtre de date sauf demande explicite. Si le résultat est vide, réessaie avec un synonyme ou le nom de l'expéditeur avant de conclure. Pour une convocation ou un document joint, appelle lire_mail puis lire_piece_jointe pour en lire le contenu (date, heure, salle).\n"+
    "4. Pour créer ou modifier, appelle directement l'outil (creer_evenement, modifier_evenement, creer_tache, creer_rendez_vous_client…) : c'est appliqué tout de suite et l'utilisateur peut annuler d'un clic. Ne dis jamais que c'est fait si l'outil n'a pas répondu ok. Récupère l'id via l'aperçu ou l'outil agenda avant une modification.\n"+
    "5. Les suppressions et les réservations de leçons attendent la confirmation de l'utilisateur : dis-lui de cliquer sur « Confirmer ».\n"+
    "6. Si une heure de fin n'est pas précisée, prends 1 h. Si l'outil signale des conflits, préviens l'utilisateur. Si une info essentielle manque (date), demande-la.\n"+
    "7. Après une action, résume en une phrase ce qui a été fait.";
}
function titanIntro(){var st=S.settings,who=[st.prenom,st.proNom&&st.proNom.indexOf(st.prenom||"\u0000")<0?st.proNom:""].filter(Boolean).join(" ")||"l'utilisateur",bits=[];
  if(st.modEcole!==false&&st.ecole)bits.push("étudie à "+st.ecole);
  if(st.modConduite!==false)bits.push("passe son permis"+(st.autoEcole?" à l'auto-école "+st.autoEcole:"")+(st.saroolOn?" (réservations via Sarool)":""));
  if(st.modPro!==false)bits.push("a une activité d'indépendant (clients, rendez-vous, factures)");
  return "Tu es Titan, l'assistant intégré à « Mon Carnet », l'application d'organisation de "+who+(bits.length?", qui "+bits.join(", "):"")+"."+(st.prenom?" Son prénom : "+st.prenom+".":"");}
function titanApiHistory(){
  return S.titan.msgs.filter(function(m){return m.role==="user"||(m.role==="assistant"&&!m.error);}).slice(-12).map(function(m){
    var c=String(m.content).slice(0,2500);
    if(m.actions&&m.actions.length)c+="\n[Actions : "+m.actions.map(function(a){return a.label+" — "+a.detail+" ("+({done:"fait",pending:"en attente de confirmation",undone:"annulé par l'utilisateur",dismissed:"refusé",failed:"échec"}[a.status]||a.status)+")";}).join(" ; ")+"]";
    return {role:m.role,content:c};});
}
function titanAsk(text,opts){
  opts=opts||{};text=String(text||"").trim();if(!text||S.titan.busy)return;speakStop();
  if(!fileApi||!fileApi.aiChat){S.titan.msgs.push({role:"user",content:text,at:Date.now()},{role:"assistant",content:"Titan fonctionne uniquement dans l'application installée.",at:Date.now(),error:true});titanRefresh();return;}
  S.titan.msgs.push({role:"user",content:text,at:Date.now(),voice:!!opts.voice});S.titan.busy=true;S.titan.needKey=false;S.titan.stop=false;S.titan.step="Je réfléchis…";S.titan.draft="";saveTitan();titanRefresh(true);
  var base=[{role:"system",content:systemPrompt()}].concat(titanApiHistory()),scratch=[],trace=[];TURN=[];
  function step(i){
    if(S.titan.stop)return finish("D'accord, j'arrête là.",false);
    if(i>9)return finish("Je n'ai pas réussi à aller au bout. Reformule ta question ?",true);
    return fileApi.aiChat({messages:base.concat(scratch),tools:TITAN_TOOLS}).then(function(r){
      if(!r||!r.ok){if(r&&(r.error==="key"||r.error==="nokey"))S.titan.needKey=true;return finish(titanErr(r),true);}
      var msg=r.message||{};
      if(msg.tool_calls&&msg.tool_calls.length){
        scratch.push({role:"assistant",content:msg.content||"",tool_calls:msg.tool_calls});
        return msg.tool_calls.reduce(function(p,tc){return p.then(function(){var args={};try{args=JSON.parse(tc.function.arguments||"{}");}catch(e){}
          var nm=tc.function&&tc.function.name;var lb=EXEC[nm]?null:traceLabel(nm,args);if(lb&&trace.indexOf(lb)<0)trace.push(lb);S.titan.step=TOOL_STEP[nm]||(EXEC[nm]?"J'applique…":"Je cherche…");titanRefresh();
          var res;try{res=runTool(nm,args);}catch(err){res={erreur:"échec de l'outil : "+err.message};}
          return Promise.resolve(res).then(function(out){scratch.push({role:"tool",tool_call_id:tc.id,content:JSON.stringify(out).slice(0,9000)});},function(){scratch.push({role:"tool",tool_call_id:tc.id,content:'{"erreur":"échec de l\'outil"}'});});});},Promise.resolve()).then(function(){return step(i+1);});
      }
      return finish(String(msg.content||"").trim()||"C'est fait.",false);
    },function(){return finish(titanErr({error:"network"}),true);});
  }
  function finish(content,err){var acts=TURN||[];TURN=null;S.titan.busy=false;S.titan.step="";S.titan.msgs.push({role:"assistant",content:content,at:Date.now(),error:!!err,trace:trace,actions:acts.length?acts:undefined});saveTitan();titanRefresh(true);
    if(!err&&typeof shouldSpeak==="function"&&shouldSpeak(!!opts.voice))speak(content);}
  step(0);
}
function titanErr(r){var e=r&&r.error;if(r&&r.detail&&(e==="busy"||e==="api"||e==="network"))return (e==="network"?"Je n’arrive à joindre aucune IA":e==="api"?"Les IA ont refusé la demande":"Toutes tes IA sont occupées pour l’instant")+" ("+r.detail+"). "+(e==="network"?"Vérifie ta connexion Internet.":"Réessaie dans une minute"+((r.providers||0)<2?", ou ajoute une deuxième clé (Gemini, Groq ou Cerebras) dans Réglages > Titan AI pour avoir un relais.":".")+" Le détail est dans Réglages > Utilisation de Titan.");return {nokey:"Il me faut une clé d’IA pour répondre : colle-la ci-dessous (Gemini gratuite sur aistudio.google.com/apikey).",key:"Ta clé d’IA est refusée (elle a peut-être été révoquée) : colle une nouvelle clé ci-dessous.",network:"Pas de connexion à Internet pour joindre Titan.",busy:"Toutes tes IA sont saturées pour l’instant (limite gratuite). Réessaie dans une minute, ou ajoute une clé Gemini dans Réglages > Titan AI.",server:"Le service d’IA a un souci passager. Réessaie dans un instant."}[e]||("Titan n'a pas pu répondre"+(r&&r.detail?" : "+r.detail:"."));}
function findAction(aid){for(var i=S.titan.msgs.length-1;i>=0;i--){var acts=S.titan.msgs[i].actions||[];for(var j=0;j<acts.length;j++)if(acts[j].id===aid)return acts[j];}return null;}

/* ---------- Rendu Markdown minimal et sûr ---------- */
function mdInline(s){return s.replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g,"$1<em>$2</em>")
  .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');}
function md(src){
  var lines=esc(src).split(/\r?\n/),out=[],list=null,para=[],i;
  function flushP(){if(para.length){out.push("<p>"+mdInline(para.join("<br>"))+"</p>");para=[];}}
  function flushL(){if(list){out.push("<"+list.t+">"+list.items.map(function(x){return "<li>"+mdInline(x)+"</li>";}).join("")+"</"+list.t+">");list=null;}}
  for(i=0;i<lines.length;i++){var l=lines[i],m;
    if(/^\s*\|.*\|\s*$/.test(l)){flushP();flushL();var rows=[];while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){if(!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i]))rows.push(lines[i].trim().replace(/^\||\|$/g,"").split("|").map(function(c){return c.trim();}));i++;}i--;
      if(rows.length)out.push('<div class="md-table"><table><thead><tr>'+rows[0].map(function(c){return "<th>"+mdInline(c)+"</th>";}).join("")+"</tr></thead><tbody>"+rows.slice(1).map(function(r){return "<tr>"+r.map(function(c){return "<td>"+mdInline(c)+"</td>";}).join("")+"</tr>";}).join("")+"</tbody></table></div>");continue;}
    if((m=/^\s*#{1,4}\s+(.*)$/.exec(l))){flushP();flushL();out.push("<h4>"+mdInline(m[1])+"</h4>");continue;}
    if((m=/^\s*[-*•]\s+(.*)$/.exec(l))){flushP();if(!list||list.t!=="ul"){flushL();list={t:"ul",items:[]};}list.items.push(m[1]);continue;}
    if((m=/^\s*\d+[.)]\s+(.*)$/.exec(l))){flushP();if(!list||list.t!=="ol"){flushL();list={t:"ol",items:[]};}list.items.push(m[1]);continue;}
    if(!l.trim()){flushP();flushL();continue;}
    if(list&&/^\s{2,}\S/.test(l)){list.items[list.items.length-1]+="<br>"+l.trim();continue;}
    flushL();para.push(l);}
  flushP();flushL();return out.join("");
}

/* ---------- Interface ---------- */
function titanLogo(){return '<svg class="titan-logo" viewBox="0 0 40 40" aria-hidden="true"><rect x="1.5" y="1.5" width="37" height="37" rx="12.5" fill="url(#tl-g)"/><rect x="1.5" y="1.5" width="37" height="37" rx="12.5" fill="url(#tl-h)"/><rect x="2" y="2" width="36" height="36" rx="12" fill="none" stroke="#fff" stroke-opacity=".28"/>'+
  '<ellipse cx="20" cy="21" rx="15.5" ry="5.2" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="1.5" transform="rotate(-20 20 21)"/><path class="tl-core" d="M20 8.6l2.7 7.7 7.7 2.7-7.7 2.7L20 29.4l-2.7-7.7L9.6 19l7.7-2.7z" fill="#fff"/><circle cx="30.4" cy="10.6" r="1.7" fill="#fff" fill-opacity=".9"/></svg>';}
function titanAvatar(){return '<span class="t-av">'+titanLogo()+'</span>';}
function actionCard(a){
  var ic=a.status==="pending"?"alert":a.status==="done"?"check":a.status==="failed"?"x":a.status==="running"?"refresh":"history";
  var st={done:"",pending:"",undone:"Annulé",dismissed:"Ignoré",failed:"Échec",running:"En cours…"}[a.status]||"";
  var btns="";
  if(a.status==="done"){if(a.undo&&a.undo.length)btns+='<button class="btn ghost sm" type="button" data-act="titan-undo" data-aid="'+esc(a.id)+'">'+icon("history")+'Annuler</button>';if(a.go)btns+='<button class="btn ghost sm" type="button" data-act="titan-go" data-aid="'+esc(a.id)+'">Voir</button>';}
  else if(a.status==="pending")btns='<button class="btn sm '+(a.tool==="reserver_lecon"?"ok":"danger solid")+'" type="button" data-act="titan-confirm" data-aid="'+esc(a.id)+'">Confirmer</button><button class="btn ghost sm" type="button" data-act="titan-dismiss" data-aid="'+esc(a.id)+'">Ignorer</button>';
  return '<div class="t-card s-'+esc(a.status)+'"><span class="tc-ico">'+icon(ic)+'</span><div class="grow"><b>'+esc(a.label)+'</b><small>'+esc(a.detail||"")+(st?' · '+st:'')+'</small></div><div class="tc-btns">'+btns+'</div></div>';
}
function titanThread(){
  var msgs=S.titan.msgs;
  if(!msgs.length)return '<div class="t-welcome">'+titanAvatar()+'<h2>Salut '+esc(S.settings.prenom||"")+', je suis Titan.</h2><p>Je connais ton emploi du temps, ta conduite et tes mails de l\'école. Je peux aussi ajouter ou déplacer des choses dans ton agenda.</p><div class="t-sugg">'+
    TITAN_SUGG.map(function(q){return '<button type="button" class="qchip" data-act="titan-ask" data-q="'+esc(q)+'">'+esc(q)+'</button>';}).join("")+'</div></div>';
  var now=Date.now();
  return msgs.map(function(m){
    if(m.role==="user")return '<div class="t-msg me'+(now-m.at<1200?" fresh":"")+'"><div class="t-bubble">'+(m.voice?'<span class="t-voice">'+icon("mic")+'Message vocal</span><br>':'')+esc(m.content).replace(/\n/g,"<br>")+'</div></div>';
    return '<div class="t-msg ai'+(m.error?" err":"")+(now-m.at<1500?" fresh":"")+'">'+titanAvatar()+'<div class="t-col"><div class="t-bubble">'+md(m.content)+
      (m.trace&&m.trace.length?'<p class="t-src">'+icon("search")+'Consulté : '+esc(m.trace.join(" · "))+'</p>':'')+'</div>'+
      (m.actions&&m.actions.length?'<div class="t-cards">'+m.actions.map(actionCard).join("")+'</div>':'')+'</div></div>';
  }).join("")+(S.titan.needKey?keyCard():"")+(S.titan.busy?'<div class="t-msg ai t-busy">'+titanAvatar()+'<div class="t-bubble typing"><span class="dots"><i></i><i></i><i></i></span>'+esc(S.titan.step||"")+'<button class="btn ghost sm t-stop" type="button" data-act="titan-stop">Arrêter</button></div></div>':'');
}
function titanComposer(sfx){
  var tgt=sfx?"drawer":"page",mine=typeof VOICE!=="undefined"&&VOICE.target===tgt;
  if(mine&&(VOICE.state==="rec"||VOICE.state==="asking"))
    return '<form class="t-compose rec" data-titan-form="'+sfx+'" autocomplete="off"><button class="btn ghost icon sm" type="button" data-act="voice-cancel" aria-label="Annuler le message vocal" title="Annuler (Échap)">'+icon("x")+'</button>'+
      '<div class="rec-bar" role="status"><span class="rec-dot" aria-hidden="true"></span><span class="rec-time num">0:00</span><canvas class="rec-wave" aria-hidden="true"></canvas><span class="hint hide-sm">'+(VOICE.state==="asking"?"Accès au micro…":"Je t\'écoute… j\'envoie quand tu te tais")+'</span></div>'+
      '<button class="btn icon mic-btn rec" type="button" data-act="voice-stop" aria-label="Envoyer le message vocal" title="Envoyer (Entrée)">'+icon("send")+'</button></form>';
  var busyV=mine&&VOICE.state==="busy";
  return '<form class="t-compose" data-titan-form="'+sfx+'" autocomplete="off"><textarea id="titan-in'+sfx+'" rows="1" placeholder="'+(busyV?"Transcription du message vocal…":"Demande à Titan… (Entrée pour envoyer, ou le micro pour parler)")+'" aria-label="Message pour Titan AI"'+(busyV?" disabled":"")+'>'+esc(S.titan.draft)+'</textarea>'+
    '<button class="btn ghost icon mic-btn'+(busyV?" busy":"")+'" type="button" data-act="voice-toggle" data-target="'+tgt+'" aria-label="Message vocal" title="Message vocal (Ctrl+Alt+V)"'+(S.titan.busy||busyV?" disabled":"")+'>'+icon(busyV?"refresh":"mic")+'</button>'+
    '<button class="btn primary icon t-send" type="submit" aria-label="Envoyer"'+(S.titan.busy?" disabled":"")+'>'+icon("send")+'</button></form>';
}
function keyCard(){return '<div class="t-card s-pending keycard"><span class="tc-ico">'+icon("shield")+'</span><div class="grow"><b>Clé d’IA nécessaire</b><small>Crée une clé gratuite sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> (Gemini, conseillé) ou <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> et colle-la ici. Elle reste chiffrée sur ce PC.</small>'+
  '<div class="pw" style="margin-top:8px"><input type="password" id="titan-key" placeholder="gsk_…" spellcheck="false" autocomplete="off"><button class="btn primary sm" type="button" data-act="titan-key-save">Enregistrer</button></div></div></div>';}
function viewTitan(){
  return '<div class="titan-page"><header class="page-head"><div><p class="eyebrow">'+icon("sparkle")+'Assistant intégré</p><h1 tabindex="-1">Titan AI</h1><p class="lede">Il lit ton agenda, ta conduite et tes mails (pièces jointes comprises) et peut ajouter ou déplacer des choses pour toi.</p></div>'+
    '<div class="head-actions"><button class="btn ghost speak-stop" type="button" data-act="speak-stop"'+(typeof SPEAK!=="undefined"&&SPEAK.on?"":" hidden")+'>'+icon("volumeX")+'Arrêter la lecture</button>'+(S.titan.msgs.length?'<button class="btn ghost" type="button" data-act="titan-new">'+icon("plus")+'Nouvelle conversation</button>':'')+'</div></header>'+
    '<div class="t-thread" id="t-thread">'+titanThread()+'</div>'+titanComposer("")+'</div>';
}
function drawTitanDrawer(){
  var root=document.getElementById("titan-root");if(!root)return;
  if(!S.titan.open||S.ui.view==="titan"){root.innerHTML="";return;}
  var had=root.querySelector(".titan-drawer");
  root.innerHTML='<aside class="titan-drawer glass'+(had?"":" enter")+'" role="dialog" aria-label="Titan AI"><header>'+titanAvatar()+'<div class="grow"><b>Titan AI</b><small>'+(S.titan.busy?esc(S.titan.step||"Je réfléchis…"):"Ton assistant")+'</small></div>'+
    (S.titan.msgs.length?'<button class="btn ghost icon sm" type="button" data-act="titan-new" aria-label="Nouvelle conversation" title="Nouvelle conversation">'+icon("plus")+'</button>':'')+
    '<button class="btn ghost icon sm speak-stop" type="button" data-act="speak-stop" aria-label="Arrêter la lecture" title="Arrêter la lecture"'+(typeof SPEAK!=="undefined"&&SPEAK.on?"":" hidden")+'>'+icon("volumeX")+'</button><button class="btn ghost icon sm" type="button" data-act="titan-full" aria-label="Plein écran" title="Ouvrir en grand">'+icon("external")+'</button><button class="btn ghost icon sm" type="button" data-act="titan-close" aria-label="Fermer">'+icon("x")+'</button></header>'+
    '<div class="t-thread" id="t-thread-d">'+titanThread()+'</div>'+titanComposer("-d")+'</aside>';
}
function titanRefresh(scroll){
  var ae=document.activeElement,fid=ae&&ae.id&&/^titan-in/.test(ae.id)?ae.id:null;
  if(S.ui.view==="titan")render();drawTitanDrawer();
  ["t-thread","t-thread-d"].forEach(function(id){var t=document.getElementById(id);if(t)t.scrollTop=t.scrollHeight;});
  var f=fid&&document.getElementById(fid);if(f){f.focus({preventScroll:true});var v=f.value;f.setSelectionRange(v.length,v.length);}
  autoGrow();
}
function autoGrow(){Array.prototype.forEach.call(document.querySelectorAll(".t-compose textarea"),function(t){t.style.height="auto";t.style.height=Math.min(160,t.scrollHeight)+"px";});}
function openTitan(q){
  if(S.ui.view!=="titan"){S.titan.open=true;closePalette();drawTitanDrawer();renderChrome();}
  if(q)titanAsk(q);
  setTimeout(function(){var i=document.getElementById(S.ui.view==="titan"?"titan-in":"titan-in-d");if(i)i.focus();["t-thread","t-thread-d"].forEach(function(id){var t=document.getElementById(id);if(t)t.scrollTop=t.scrollHeight;});},30);
}
function closeTitan(){var d=document.querySelector(".titan-drawer");S.titan.open=false;renderChrome();
  if(d&&document.documentElement.getAttribute("data-fx")!=="aucun"){d.classList.add("leave");setTimeout(drawTitanDrawer,200);}else drawTitanDrawer();}
document.addEventListener("submit",function(e){var f=e.target.closest&&e.target.closest("[data-titan-form]");if(!f)return;e.preventDefault();var ta=f.querySelector("textarea");if(ta){var v=ta.value;ta.value="";S.titan.draft="";titanAsk(v);}});
document.addEventListener("keydown",function(e){var t=e.target;if(!t||!t.id||!/^titan-in/.test(t.id))return;
  if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();var v=t.value;if(!v.trim()||S.titan.busy)return;t.value="";S.titan.draft="";titanAsk(v);}
  else if(e.key==="Escape"&&t.id==="titan-in-d"){e.preventDefault();e.stopPropagation();closeTitan();}},true);
document.addEventListener("input",function(e){if(e.target&&e.target.id&&/^titan-in/.test(e.target.id)){S.titan.draft=e.target.value;autoGrow();}});
ACTS["titan-open"]=function(){if(S.titan.open)closeTitan();else openTitan();};
ACTS["titan-close"]=function(){closeTitan();};
ACTS["titan-full"]=function(){S.titan.open=false;drawTitanDrawer();go("titan");setTimeout(function(){titanRefresh(true);var i=document.getElementById("titan-in");if(i)i.focus();},20);};
ACTS["titan-new"]=function(){if(S.titan.busy)return;S.titan.msgs=[];saveTitan();titanRefresh();};
ACTS["titan-ask"]=function(t){openTitan(t.getAttribute("data-q"));};
ACTS["titan-quick"]=function(){var i=document.getElementById("quick-titan");var v=i?i.value.trim():"";if(i)i.value="";openTitan(v||null);};
ACTS["titan-key-save"]=function(){var i=document.getElementById("titan-key"),k=i?i.value.trim():"";if(!/^(gsk_|AIza|AQ.|csk-)/.test(k)||k.length<20){toast("Clé non reconnue : Gemini commence par AIza ou AQ., Groq par gsk_, Cerebras par csk-.");return;}
  fileApi.aiSetKey(k).then(function(ok){if(!ok){toast("Impossible d'enregistrer la clé.");return;}return fileApi.aiPing().then(function(r){if(r&&r.ok){S.titan.needKey=false;titanRefresh();toast("Clé "+provOf(k)+" enregistrée : Titan est prêt");loadKeyInfo();}else toast(r&&r.error==="key"?"La clé est refusée.":"Clé enregistrée, mais le service est injoignable pour l'instant.");});});};
ACTS["titan-stop"]=function(){S.titan.stop=true;S.titan.step="J'arrête…";titanRefresh();};
ACTS["titan-undo"]=function(t){var a=findAction(t.getAttribute("data-aid"));if(!a||a.status!=="done"||!a.undo)return;
  if(a.undo.some(function(op){return op.now!==undefined&&op.now!==JSON.stringify(S[op.col].get(op.id)||null);})){toast("Modifié depuis : annule plutôt à la main pour ne rien perdre.");return;}applyUndo(a.undo);a.status="undone";saveTitan();titanRefresh();toast("Action de Titan annulée");};
ACTS["titan-dismiss"]=function(t){var a=findAction(t.getAttribute("data-aid"));if(!a||a.status!=="pending")return;a.status="dismissed";saveTitan();titanRefresh();};
ACTS["titan-go"]=function(t){var a=findAction(t.getAttribute("data-aid"));if(!a||!a.go)return;if(S.titan.open)closeTitan();if(a.go.date)go("agenda",{anchor:a.go.date,agendaMode:"jour"});else if(a.go.view)go(a.go.view);};
ACTS["titan-confirm"]=function(t){var a=findAction(t.getAttribute("data-aid"));if(!a||a.status!=="pending"||!EXEC[a.tool])return;
  a.status="running";titanRefresh();
  Promise.resolve(EXEC[a.tool](a.args||{},true)).then(function(r){
    if(r&&r.ok){a.status="done";if(r.undo)a.undo=stampOps(r.undo);a.label=a.label.replace(/ \?$/,"").replace(/^Supprimer/,"Supprimé :").replace(/^Réserver la leçon/,"Leçon réservée");toast("C'est fait");}
    else{a.status="failed";if(r&&r.erreur)a.detail=r.erreur;}
    saveTitan();titanRefresh();},function(){a.status="failed";saveTitan();titanRefresh();});};
