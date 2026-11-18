"use strict";
/* Mon Carnet : constantes, outils, état, stockage, emploi du temps, fenêtres, rappels, factures. */

var ICAL_DEFAULT="";
var FORFAITS=[
  {id:"express",nom:"Dépannage express",duree:60,prix:45},
  {id:"appareil",nom:"Nouvel appareil prêt à l'emploi",duree:120,prix:80},
  {id:"securite",nom:"Check-up sécurité",duree:90,prix:60},
  {id:"cours",nom:"Cours à domicile",duree:60,prix:40},
  {id:"carnet",nom:"Carnet de 5 cours",duree:60,prix:180},
  {id:"diag",nom:"Diagnostic seul",duree:30,prix:20},
  {id:"demi",nom:"Demi-heure en plus",duree:30,prix:20},
  {id:"autre",nom:"Autre",duree:60,prix:0}
];
var STATUTS={prevu:"Prévu",fait:"À encaisser",paye:"Payé",annule:"Annulé"};
var PAY_MODES=[["cb","Carte bancaire"],["especes","Espèces"],["cheque","Chèque"],["virement","Virement"],["cesu","CESU préfinancé"]];
var MAT_TYPES=["Ordinateur fixe","Ordinateur portable","Tablette","Smartphone","Imprimante","Box internet","Télévision","Autre"];
var CAF_PLAFOND=1144, START_KEY="2000-01-01", GH=28, FIRST_A="", FIRST_B="", FIRST_DUE=null, LAUNCH_TASKS=[];
/* Début d'activité (Réglages) : la 1re déclaration Urssaf regroupe les 3 premiers mois */
function ymOf(y,m){var d=new Date(y,m,1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function setStart(k){START_KEY=k||"2000-01-01";FIRST_A=FIRST_B="";FIRST_DUE=null;var dl=function(n){return "";};
  if(/^\d{4}-\d{2}-\d{2}$/.test(k||"")){var y=+k.slice(0,4),m=+k.slice(5,7)-1;FIRST_A=ymOf(y,m);FIRST_B=ymOf(y,m+2);FIRST_DUE=new Date(y,m+4,0);
    dl=function(n){var d=new Date(y,m,+k.slice(8,10)+n);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};}
  LAUNCH_TASKS=[["Recevoir le SIRET (e-mail de l'INSEE)",""],["Créer mon espace sur autoentrepreneur.urssaf.fr",""],
    ["Créer mon espace professionnel sur impots.gouv.fr",""],["Ouvrir le compte bancaire dédié",""],
    ["Faire la déclaration NOVA (services à la personne, si concerné)",""],["Souscrire l'assurance RC pro",dl(-1)],
    ["Renseigner mon SIRET dans Réglages (factures)",""],["Demander l'ACRE",dl(45)],
    ["Première déclaration de chiffre d'affaires Urssaf",FIRST_DUE?FIRST_DUE.getFullYear()+"-"+String(FIRST_DUE.getMonth()+1).padStart(2,"0")+"-"+String(FIRST_DUE.getDate()).padStart(2,"0"):""],
    ["Déclaration initiale de CFE (n° 1447 C)",k?k.slice(0,4)+"-12-31":""]];}
setStart("");
function startLabel(){return START_KEY>"2000-01-01"?"le "+new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric"}).format(new Date(START_KEY+"T12:00:00")).replace(/^1 /,"1er "):"";}
var DEFAULT_SETTINGS={prenom:"",ecole:"",autoEcole:"",modEcole:true,modConduite:true,modPro:true,onboarded:false,acre:true,nova:false,taux:50,theme:"dark",icalUrl:ICAL_DEFAULT,rappel:30,
  proNom:"",proAdresse:"",siret:"",proTel:"",proEmail:"",
  sapNumero:"",sapDate:"",mentionTva:"TVA non applicable, art. 293 B du CGI",mentionPlus:"",saroolOn:false,
  /* Conduite automatique */
  autoOn:false,autoMode:"auto",moniteurPref:"",autreMoniteur:true,heuresSemaine:4,heuresAvant:0,titanMemo:[],titanPerso:"",titanStyle:"bref",maxJour:1,marge:30,plageDebut:"08:00",plageFin:"20:00",jours:[1,2,3,4,5,6],delaiH:12,horizonSem:3,allDayBloque:true,saroolShow:false,
  /* Notifications */
  notifCours:true,notifPermis:true,notifMail:true,
  /* Mails de l'école */
  mailUser:"",mailSenders:"",mailDomains:"",mailDays:180,
  /* Appli */
  background:true,autostart:false,effets:"complet",fxAuto:false,
  /* Voix et brief du matin */
  voixLecture:"vocal",voixNat:true,voixNom:"Kore",voixAuto:true,briefOn:true,briefHeure:"07:30"};
var ACTS={}; /* actions des modules (data-act) */

/* Icônes (traits façon Lucide) */
var IC={
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  checks:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  wallet:'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>',
  left:'<path d="m15 18-6-6 6-6"/>', right:'<path d="m9 18 6-6-6-6"/>',
  copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  message:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  file:'<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  laptop:'<path d="M4 16V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10M2 20h20l-2-4H4z"/>',
  phoneDev:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  printer:'<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  wifi:'<path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 20 0M12 20h.01"/>',
  tv:'<rect x="2" y="7" width="20" height="15" rx="2"/><path d="m17 2-5 5-5-5"/>',
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  trash:'<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  refresh:'<path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M3 21v-5h5"/>',
  euro:'<path d="M4 10h12M4 14h9M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/>',
  external:'<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  folder:'<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
  school:'<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  arrowUp:'<path d="m18 15-6-6-6 6"/>',
  sparkle:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  car:'<path d="M5 17h14M6 17v2M18 17v2M3 13l2-6a2 2 0 0 1 2-1.4h10A2 2 0 0 1 19 7l2 6v4H3z"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  star:'<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  reply:'<path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  send:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  zap:'<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  arrowRight:'<path d="M5 12h14M12 5l7 7-7 7"/>',
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  power:'<path d="M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10"/>',
  clip:'<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  move:'<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  minus:'<path d="M5 12h14"/>',
  dot:'<circle cx="12" cy="12" r="4"/>',
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
  volumeX:'<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  volume:'<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  flag:'<path d="M4 22V4a1 1 0 0 1 .6-.9C6 2.4 7.4 2 9 2c3 0 4 2 7 2 1.3 0 2.5-.3 3.4-.7a.4.4 0 0 1 .6.4V14a1 1 0 0 1-.6.9C18.5 15.6 17 16 16 16c-3 0-4-2-7-2-1.9 0-3.6.6-5 1.4"/>',
  sunrise:'<path d="M12 2v8M4.9 10.9l1.4 1.4M2 18h2M20 18h2M17.7 12.3l1.4-1.4M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>'
};
function icon(n,cls){return '<svg class="ico'+(cls?" "+cls:"")+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(IC[n]||"")+'</svg>';}
function matIcon(t){t=String(t||"");if(/portable/i.test(t))return "laptop";if(/fixe|ordinateur/i.test(t))return "monitor";if(/tablette|smartphone/i.test(t))return "phoneDev";if(/imprim/i.test(t))return "printer";if(/box/i.test(t))return "wifi";if(/télé/i.test(t))return "tv";return "box";}

/* Outils */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function uid(){try{if(crypto&&crypto.randomUUID)return crypto.randomUUID();}catch(e){}return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);}
function pad(n){return String(n).padStart(2,"0");}
function keyOf(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function parseKey(k){var p=String(k).split("-").map(Number);return new Date(p[0],p[1]-1,p[2]||1);}
function todayKey(){return keyOf(new Date());}
function addDays(d,n){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;}
function startOfWeek(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
function monthKey(d){return d.getFullYear()+"-"+pad(d.getMonth()+1);}
var fDay=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"});
var fDayY=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
var fShort=new Intl.DateTimeFormat("fr-FR",{weekday:"short",day:"numeric",month:"short"});
var fDM=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long"});
var fDMY=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric"});
var fNum=new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"});
var fMonth=new Intl.DateTimeFormat("fr-FR",{month:"long"});
var fMonthY=new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"});
var fMonthS=new Intl.DateTimeFormat("fr-FR",{month:"short"});
var fWd=new Intl.DateTimeFormat("fr-FR",{weekday:"short"});
function cap(s){s=String(s);return s.charAt(0).toUpperCase()+s.slice(1);}
function relDay(k){var t=todayKey();if(k===t)return "Aujourd'hui";if(k===keyOf(addDays(new Date(),1)))return "Demain";if(k===keyOf(addDays(new Date(),-1)))return "Hier";return cap(fShort.format(parseKey(k)).replace(/\./g,""));}
function euro(n){n=Number(n)||0;return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:n%1?2:0,maximumFractionDigits:2}).format(n);}
function euro2(n){return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);}
function toMin(h){var p=String(h||"0:0").split(":").map(Number);return (p[0]||0)*60+(p[1]||0);}
function fromM(m){m=Math.max(0,Math.min(24*60-1,m));return pad(Math.floor(m/60))+":"+pad(m%60);}
function hm(h){var m=toMin(h);return pad(Math.floor(m/60))+"h"+pad(m%60);}
function dur(m){m=Number(m)||0;var h=Math.floor(m/60),r=m%60;if(!h)return r+" min";return h+" h"+(r?" "+pad(r):"");}
function initials(n){var p=String(n||"?").replace(/^(M\.|Mme|Mlle|Mr)\s+/i,"").trim().split(/\s+/);return ((p[0]||"?")[0]+(p.length>1?p[p.length-1][0]:"")).toUpperCase();}
function hue(n){var h=0;n=String(n||"");for(var i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))%360;return h;}
function avatar(n,cls){return '<span class="avatar'+(cls?" "+cls:"")+'" style="--h:'+hue(n)+'" aria-hidden="true">'+esc(initials(n))+'</span>';}
function norm(s){return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();}
function forfait(id){for(var i=0;i<FORFAITS.length;i++)if(FORFAITS[i].id===id)return FORFAITS[i];return null;}
function payLabel(k){for(var i=0;i<PAY_MODES.length;i++)if(PAY_MODES[i][0]===k)return PAY_MODES[i][1];return "";}
function rdvList(){return Array.from(S.rdv.values()).sort(function(a,b){return (a.date+a.heure).localeCompare(b.date+b.heure);});}
function clientOf(r){return r&&r.clientId?S.clients.get(r.clientId):null;}
function rdvName(r){var c=clientOf(r);return c?c.nom:(r.clientName||"Client");}
function rdvAddr(r){var c=clientOf(r);return r.adresse||(c&&c.adresse)||"";}
function rdvStart(r){var d=parseKey(r.date),m=toMin(r.heure);d.setHours(Math.floor(m/60),m%60,0,0);return d;}
function taskSort(a,b){var ea=a.echeance||"9999",eb=b.echeance||"9999";return ea===eb?(a.created||0)-(b.created||0):ea.localeCompare(eb);}
function rate(){return (S.settings.acre?0.159:0.212)+0.008;}
function pct(n){return String((n*100).toFixed(1)).replace(".",",")+" %";}

/* État */
var S={mode:"pending",ready:false,error:null,
  clients:new Map(),rdv:new Map(),taches:new Map(),factures:new Map(),events:new Map(),
  settings:Object.assign({},DEFAULT_SETTINGS),
  cours:[],coursAt:null,coursErr:null,coursBusy:false,notifs:[],permisLog:[],
  ui:{showDispo:true,notifOpen:false,view:"jour",agendaMode:"semaine",anchor:todayKey(),clientId:null,clientTab:"infos",q:"",taskDraft:"",taskDate:"",showDone:false,finMonth:null,finYear:null,restoreAsk:null}};

/* Stockage : fichier sur le PC (Electron) ou navigateur en secours */
var LS_KEY="mon-carnet-v1",fileApi=window.carnet||null,saveTimer=null,dirty=false;
function snapshotData(){return {version:3,clients:Array.from(S.clients.values()),rdv:Array.from(S.rdv.values()),taches:Array.from(S.taches.values()),factures:Array.from(S.factures.values()),events:Array.from(S.events.values()),settings:S.settings,notifs:S.notifs.slice(0,150),permisLog:S.permisLog.slice(0,120)};}
function applyData(j){if(!j)return;["clients","rdv","taches","factures","events"].forEach(function(k){S[k]=new Map((j[k]||[]).map(function(o){return [o.id,o];}));});S.settings=Object.assign({},DEFAULT_SETTINGS,j.settings||{});if(j.settings&&j.settings.onboarded===undefined){S.settings.onboarded=true;if(S.settings.modPro!==false&&!S.settings.proDebut&&(j.rdv||[]).length+(j.clients||[]).length>0)S.settings.proDebut="2027-01-01";}
  S.notifs=Array.isArray(j.notifs)?j.notifs:[];S.permisLog=Array.isArray(j.permisLog)?j.permisLog:[];}
function loadLocal(){try{applyData(JSON.parse(localStorage.getItem(LS_KEY)||"null"));}catch(e){}}
function saveLocal(){try{localStorage.setItem(LS_KEY,JSON.stringify(snapshotData()));}catch(e){}}
function flush(){if(!dirty)return;dirty=false;clearTimeout(saveTimer);
  fileApi.save(JSON.stringify(snapshotData())).then(function(ok){if(!ok){S.error={code:"disk"};render();toast("Enregistrement impossible sur le disque.");}else if(S.error&&S.error.code==="disk"){S.error=null;render();}},
  function(){S.error={code:"disk"};render();toast("Enregistrement impossible sur le disque.");});}
function persist(){if(S.mode==="file"){dirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(flush,250);}else saveLocal();}
var rsRaf=0;function renderSoon(){if(rsRaf)return;rsRaf=requestAnimationFrame(function(){rsRaf=0;render();});}
function put(col,obj){S[col].set(obj.id,obj);render();persist();}
function putMany(col,objs){objs.forEach(function(o){S[col].set(o.id,o);});render();persist();}
function del(col,id){S[col].delete(id);render();persist();}
function putSettings(patch){Object.assign(S.settings,patch);applyTheme();render();persist();}
window.addEventListener("beforeunload",function(){if(S.mode==="file"&&dirty){dirty=false;try{fileApi.saveSync(JSON.stringify(snapshotData()));}catch(e){}}});
function goLocal(){if(S.mode==="local")return;S.mode="local";loadLocal();S.ready=true;applyTheme();render();
  splashSet("data","ok","Mode navigateur");["edt","sarool","mail","titan","maj"].forEach(function(k){splashSet(k,"off","Seulement dans l'application");});
  if(typeof initModules==="function")initModules();}
function init(){
  render();
  if(!fileApi){goLocal();return;}
  fileApi.load().then(function(txt){
    if(txt){try{applyData(JSON.parse(txt));}catch(e){S.error={code:"corrupt"};}}
    S.mode="file";S.ready=true;applyTheme();render();
    splashSet("data",S.error?"err":"ok",S.error?"Fichier illisible : copie de secours disponible":(S.rdv.size+S.events.size)+" éléments d'agenda, "+S.clients.size+" clients");
    initCours();if(typeof initModules==="function")initModules();
  },function(){goLocal();});
}
function applyStart(){setStart(S.settings.proDebut||"");}
function applyTheme(){applyStart();var t=S.settings.theme||"dark",el=document.documentElement;if(t==="auto")el.removeAttribute("data-theme");else el.setAttribute("data-theme",t);
  var fx=S.settings.effets||"complet";el.setAttribute("data-fx",fx);}

/* Écran de chargement : état de chaque service pendant la première synchronisation */
var SPL={start:Date.now(),done:false,keys:{}},SPL_KEYS=["data","edt","sarool","mail","titan","maj"];
function splashSet(k,state,text){
  if(SPL.done&&state==="run")return;SPL.keys[k]=state;
  var row=document.querySelector('#splash [data-svc="'+k+'"]');
  if(row){row.className="svc "+state;var t=row.querySelector(".svc-st");if(t)t.textContent=text||"";}
  var n=SPL_KEYS.filter(function(x){return SPL.keys[x]&&SPL.keys[x]!=="run";}).length,bar=document.getElementById("splash-bar");
  if(bar)bar.style.transform="scaleX("+(0.06+0.94*n/SPL_KEYS.length)+")";
  if(n===SPL_KEYS.length)splashClose();
}
function splashClose(){
  if(SPL.done)return;SPL.done=true;
  var wait=Math.max(0,1800-(Date.now()-SPL.start));
  setTimeout(function(){var el=document.getElementById("splash");if(!el)return;document.body.classList.add("app-in");el.classList.add("out");
    setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);document.body.classList.remove("booting");if(typeof afterSplash==="function")afterSplash();},800);},wait+450);
}
setTimeout(function(){SPL_KEYS.forEach(function(k){if(!SPL.keys[k]||SPL.keys[k]==="run")splashSet(k,"slow","Continue en arrière-plan");});splashClose();},14000);
function isDark(){var t=document.documentElement.getAttribute("data-theme");if(t)return t==="dark";return window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;}

/* Emploi du temps (iCal) */
function icsUnesc(v){return String(v).replace(/\\n/gi,"\n").replace(/\\([,;\\])/g,"$1");}
function icsDate(v){var m=String(v).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);if(!m)return null;
  if(!m[4]){var d=new Date(+m[1],+m[2]-1,+m[3]);d.allDay=true;return d;}
  if(m[7])return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)));
  return new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));}
function parseICS(text){
  var lines=String(text).replace(/\r?\n[ \t]/g,"").split(/\r?\n/),out=[],ev=null;
  lines.forEach(function(l){
    if(l==="BEGIN:VEVENT"){ev={};return;}
    if(l==="END:VEVENT"){if(ev&&ev.start)out.push(ev);ev=null;return;}
    if(!ev)return;var i=l.indexOf(":");if(i<0)return;
    var name=l.slice(0,i).split(";")[0].toUpperCase(),val=l.slice(i+1);
    if(name==="DTSTART")ev.start=icsDate(val);else if(name==="DTEND")ev.end=icsDate(val);
    else if(name==="SUMMARY")ev.titre=icsUnesc(val);else if(name==="LOCATION")ev.lieu=icsUnesc(val);
    else if(name==="DESCRIPTION")ev.desc=icsUnesc(val);else if(name==="UID")ev.uid=val;else if(name==="STATUS")ev.status=val.toUpperCase();
  });
  var res=[];res.cancelled=[];
  out.forEach(function(e,idx){if(e.start&&e.status==="CANCELLED"){res.cancelled.push(String(e.uid||idx));return;}if(!e.start)return;
    var allDay=!!e.start.allDay,end=e.end||new Date(e.start.getTime()+(allDay?86400000:3600000));
    if(allDay){for(var d=new Date(e.start);d<end;d=addDays(d,1))res.push({uid:(e.uid||idx)+"@"+keyOf(d),titre:e.titre||"Événement",lieu:e.lieu||"",desc:e.desc||"",date:keyOf(d),allDay:true});return;}
    res.push({uid:String(e.uid||idx),titre:e.titre||"Cours",lieu:e.lieu||"",desc:e.desc||"",date:keyOf(e.start),heure:pad(e.start.getHours())+":"+pad(e.start.getMinutes()),duree:Math.max(15,Math.round((end-e.start)/60000)),allDay:false});});
  var cancelled=res.cancelled;res=res.sort(function(a,b){return (a.date+(a.heure||"")).localeCompare(b.date+(b.heure||""));});res.cancelled=cancelled;return res;
}
function sarDur(s){s=String(s||"");var a=/(\d{1,2})\s*h\s*(\d{2})?/i.exec(s);if(a)return (+a[1])*60+(+(a[2]||0));var b=/(\d{1,3})\s*(min|mn)/i.exec(s);if(b)return +b[1];var c=parseInt(s,10);return c>0?(c<=8?c*60:c):0;}
function parseSarool(rows){var out=[];(rows||[]).forEach(function(r){r=(r||[]).map(function(x){return String(x||"").trim();});var all=r.join(" | ");
  var m=/(\d{2})\/(\d{2})\/(\d{2,4})/.exec(r[0]||"")||/(\d{2})\/(\d{2})\/(\d{2,4})/.exec(all);
  var h=/(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(r[1]||"")||/\b(\d{1,2})\s*[h:]\s*(\d{2})\b/i.exec(all.replace(m?m[0]:"",""));if(!m||!h)return;var y=+m[3];if(y<100)y+=2000;
  var simu=/simul/i.test(all),titre=(r[4]||"").trim()||(simu?"Leçon sur simulateur":"Leçon de conduite");if(simu&&!/simul/i.test(titre))titre+=" (simulateur)";
  var dur=sarDur(r[2])||((all.match(/\b\d{1,2}\s*h\s*\d{0,2}\b|\b\d{2,3}\s*min/gi)||[]).slice(1).map(sarDur).filter(Boolean)[0])||60;
  out.push({uid:"permis-"+y+m[2]+m[1]+"-"+h[1]+(h[2]||"00"),kind:"permis",simu:simu,titre:titre,lieu:r[3]?"Moniteur : "+r[3]:"",desc:"Auto-école (Sarool)"+(simu?" · simulateur":""),date:y+"-"+m[2]+"-"+m[1],heure:pad(+h[1])+":"+(h[2]||"00"),duree:Math.max(15,dur),allDay:false});});return out;}
var permis=[];try{permis=JSON.parse(localStorage.getItem("carnet-permis")||"[]");}catch(e){}
S.permisAt=null;S.permisErr=null;S.permisBusy=false;try{S.permisAt=Number(localStorage.getItem("carnet-permis-at"))||null;}catch(e){}
function syncPermis(manual){if(!fileApi||!fileApi.saroolFetch||!S.settings.saroolOn)return Promise.resolve({ok:false,error:"off"});S.permisBusy=true;renderSoon();
  return fileApi.saroolFetch().then(function(r){S.permisBusy=false;if(r&&r.ok){permis=parseSarool(r.rows);S.permisAt=r.at;S.permisErr=null;try{localStorage.setItem("carnet-permis",JSON.stringify(permis));localStorage.setItem("carnet-permis-at",String(r.at));}catch(e){}if(manual)toast(permis.length+" heures de conduite synchronisées");if(typeof checkChanges==="function")checkChanges("permis");}
    else{S.permisErr=(r&&r.error)||"network";if(manual)toast(S.permisErr==="login"?"Reconnecte-toi à Sarool dans Réglages.":"Sarool injoignable pour l'instant.");}renderSoon();return r||{ok:false,error:"network"};},function(){S.permisBusy=false;S.permisErr="network";renderSoon();return {ok:false,error:"network"};});}
function kindLabel(c){return c.kind==="permis"?"Conduite":"Cours";}
function permisList(){return typeof permisAll==="function"?permisAll():permis;}
function coursOn(k,withAllDay){return S.cours.concat(permisList()).filter(function(c){return c.date===k&&(withAllDay||!c.allDay);});}
function syncCours(manual){
  if(!fileApi||!fileApi.icalFetch)return Promise.resolve({ok:false,error:"off"});var url=(S.settings.icalUrl||"").trim();
  if(!url){S.cours=[];S.coursAt=null;S.coursErr=null;render();return Promise.resolve({ok:false,error:"nourl"});}
  S.coursBusy=true;renderSoon();
  return fileApi.icalFetch(url).then(function(r){S.coursBusy=false;
    if(r&&r.ok){S.cours=parseICS(r.text);S.coursAt=r.at;S.coursErr=null;if(typeof checkChanges==="function")checkChanges("cours");if(manual)toast(S.cours.filter(function(c){return !c.allDay;}).length+" cours synchronisés");}
    else{S.coursErr=r||{error:"network"};if(manual)toast(coursErrText());}
    renderSoon();return r||{ok:false};},function(){S.coursBusy=false;S.coursErr={error:"network"};renderSoon();return {ok:false,error:"network"};});
}
function coursErrText(){var e=S.coursErr||{};
  if(e.error==="url")return "L'adresse doit commencer par https://.";
  if(e.error==="format")return "Ce lien ne renvoie pas un calendrier iCal. Recopie le lien iCal depuis ton espace école.";
  if(e.error==="http")return "Le serveur de l'école a refusé le lien (code "+(e.status||"?")+"). Il a peut-être expiré : génère un nouveau lien iCal.";
  return "Pas de connexion pour l'instant : la dernière version enregistrée reste affichée.";}
function initCours(){
  if(!fileApi||!fileApi.icalCached){splashSet("edt","off","Indisponible");return;}
  function first(){return syncCours(false).then(function(r){
    if(r&&r.ok)splashSet("edt","ok",S.cours.filter(function(c){return !c.allDay&&c.date>=todayKey();}).length+" cours à venir");
    else if(r&&r.error==="nourl")splashSet("edt","off","Aucun lien iCal");
    else splashSet("edt",S.cours.length?"warn":"err",S.cours.length?"Hors ligne : dernière version affichée":"Injoignable");});}
  fileApi.icalCached().then(function(c){if(c&&c.text){S.cours=parseICS(c.text);S.coursAt=c.at;if(typeof checkChanges==="function")checkChanges("cours");render();}first();},first);
  setInterval(function(){syncCours(false);syncPermis(false);},5*60*1000);
}

/* Occupation d'une journée (rendez-vous + cours) */
function busyOn(k,ignoreId){
  var b=[];S.rdv.forEach(function(r){if(r.id!==ignoreId&&r.date===k&&r.statut!=="annule"){var a=toMin(r.heure);b.push({a:a,b:a+(Number(r.duree)||60),r:r});}});
  coursOn(k).forEach(function(c){var a=toMin(c.heure);b.push({a:a,b:a+c.duree,c:c});});
  eventsOn(k).forEach(function(e){if(e.allDay||e.id===ignoreId)return;var a=toMin(e.heure);b.push({a:a,b:a+(Number(e.duree)||60),e:e});});
  return b.sort(function(x,y){return x.a-y.a;});
}
/* Événements perso (révisions, sport, rendez-vous…) */
var EV_CATS=[["perso","Perso","#2dd4bf"],["revision","Révisions","#818cf8"],["ecole","École","#c084fc"],["sport","Sport","#84cc16"],["sante","Santé","#f472b6"],["sortie","Sortie","#fb923c"],["travail","Travail","#38bdf8"],["autre","Autre","#94a3b8"]];
function evCat(id){for(var i=0;i<EV_CATS.length;i++)if(EV_CATS[i][0]===id)return EV_CATS[i];return EV_CATS[0];}
function eventsOn(k){return Array.from(S.events.values()).filter(function(e){return e.date===k;}).sort(function(a,b){return (a.allDay?"":a.heure||"").localeCompare(b.allDay?"":b.heure||"");});}
function eventList(){return Array.from(S.events.values()).sort(function(a,b){return (a.date+(a.heure||"")).localeCompare(b.date+(b.heure||""));});}
function evEnd(e){return fromM(toMin(e.heure)+(Number(e.duree)||60));}
function freeSlots(date,duree,ignoreId){
  if(!date)return [];var out=[],now=new Date(),isToday=date===todayKey(),nowMin=now.getHours()*60+now.getMinutes(),busy=busyOn(date,ignoreId);
  for(var m=9*60;m+duree<=19*60;m+=30){if(isToday&&m<=nowMin+30)continue;var ok=busy.every(function(x){return m+duree<=x.a||m>=x.b;});if(ok)out.push(m);if(out.length>=6)break;}
  return out;}
function conflictText(date,heure,duree,ignoreId){
  var s=toMin(heure),e=s+(Number(duree)||60),hit=null;
  busyOn(date,ignoreId).forEach(function(x){if(!hit&&s<x.b&&x.a<e)hit=x;});
  if(!hit)return "";
  if(hit.c)return (hit.c.kind==="permis"?"Tu as une leçon de conduite à ce moment-là (":"Tu as cours à ce moment-là : "+hit.c.titre+" (")+hm(hit.c.heure)+"–"+hm(fromM(hit.b))+").";
  if(hit.e)return "Ça chevauche « "+hit.e.titre+" » ("+hm(hit.e.heure)+"–"+hm(fromM(hit.b))+").";
  return "Ça chevauche ton rendez-vous de "+hm(hit.r.heure)+" avec "+rdvName(hit.r)+".";
}
function nextRdv(){var now=Date.now();return rdvList().filter(function(r){return r.statut==="prevu"&&rdvStart(r).getTime()+(Number(r.duree)||60)*60000>now;})[0]||null;}
function countdown(r){
  var start=rdvStart(r).getTime(),end=start+(Number(r.duree)||60)*60000,now=Date.now();
  if(now>=start&&now<end)return {live:true,text:"En cours, fin à "+hm(fromM(toMin(r.heure)+(Number(r.duree)||60)))};
  var mins=Math.round((start-now)/60000);
  if(mins<1)return {live:true,text:"Maintenant"};
  if(mins<60)return {text:"Dans "+mins+" min"};
  if(mins<24*60){var h=Math.floor(mins/60),m=mins%60;return {text:"Dans "+h+" h"+(m?" "+pad(m):"")};}
  var days=Math.round((parseKey(r.date)-parseKey(todayKey()))/86400000);
  return {text:days===1?"Demain":"Dans "+days+" jours"};
}

/* Messages */
var toastTimer=null;
function toast(msg,action){var root=document.getElementById("toast-root");clearTimeout(toastTimer);
  root.innerHTML='<div class="toast"><span>'+esc(msg)+'</span>'+(action?'<button type="button" id="toast-act">'+esc(action.label)+'</button>':'')+'</div>';
  if(action)document.getElementById("toast-act").onclick=function(){action.fn();root.innerHTML="";};
  toastTimer=setTimeout(function(){var t=root.querySelector(".toast");if(!t){return;}t.classList.add("out");setTimeout(function(){if(t.parentNode===root)root.innerHTML="";},220);},action?6000:3200);}
function copy(text,label){
  function fallback(){var ta=document.createElement("textarea");ta.value=text;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();var ok=false;try{ok=document.execCommand("copy");}catch(e){}document.body.removeChild(ta);toast(ok?(label||"Copié"):"Copie bloquée : sélectionne le texte à la main.");}
  try{navigator.clipboard.writeText(text).then(function(){toast(label||"Copié");},fallback);}catch(e){fallback();}
}
function confirmMsg(r){
  var s=S.settings,nom=rdvName(r),adr=rdvAddr(r),apres="";
  if(s.nova&&Number(r.prix)>0){var t=Number(s.taux)===40?0.4:0.5;apres=" (soit "+euro(Math.round(r.prix*(1-t)*100)/100)+" après le crédit d'impôt de "+(t*100)+" %)";}
  return "Bonjour "+nom+",\nJe vous confirme notre rendez-vous "+fDay.format(parseKey(r.date))+" à "+hm(r.heure)+(adr?", au "+adr:"")+".\nPrestation : "+(r.forfaitNom||"intervention")+", "+euro(r.prix)+apres+".\nÀ bientôt,\n"+(s.prenom||"");
}

/* Fenêtres (structure commune) */
var mroot=document.getElementById("modal-root"),M=null,lastFocus=null;
var sheetGen=0;
function openSheet(html,size){lastFocus=document.activeElement;sheetGen++;
  mroot.innerHTML='<div class="overlay" data-act="overlay"><div class="sheet'+(size?" "+size:"")+'" role="dialog" aria-modal="true" aria-labelledby="sheet-title">'+html.replace('<header><h2>','<header><h2 id="sheet-title">')+'</div></div>';
  var sh=mroot.querySelector(".sheet");
  sh.addEventListener("input",function(e){if(M&&e.target.closest("form"))M.dirty=true;});
  sh.addEventListener("change",function(e){if(M&&e.target.closest("form"))M.dirty=true;});}
function closeModal(force){if(!M)return;if(M.dirty&&!force){askDiscard();return;}M=null;
  var ov=mroot.querySelector(".overlay"),g=sheetGen;
  if(ov&&document.documentElement.getAttribute("data-fx")!=="aucun"){ov.classList.add("closing");ov.removeAttribute("data-act");setTimeout(function(){if(g===sheetGen&&!M)mroot.innerHTML="";},170);}else mroot.innerHTML="";
  if(lastFocus&&document.contains(lastFocus))lastFocus.focus();}
function askDiscard(){var f=mroot.querySelector(".sheet>footer");if(!f)return;if(!M.footerHTML)M.footerHTML=f.innerHTML;
  f.innerHTML='<div class="discard" role="alert"><b>Abandonner les modifications ?</b><button class="btn sm" type="button" data-act="discard-cancel">Continuer la saisie</button><button class="btn danger solid sm" type="button" data-act="discard-ok">Abandonner</button></div>';
  f.querySelector('[data-act="discard-cancel"]').focus();}
function restoreFooter(){var f=mroot.querySelector(".sheet>footer");if(f&&M&&M.footerHTML){f.innerHTML=M.footerHTML;M.footerHTML=null;}}
function setErr(id,msg){var el=document.getElementById(id);if(!el)return;var field=el.closest(".field"),eid=id+"-err",old=document.getElementById(eid);if(old)old.remove();
  if(msg){var p=document.createElement("p");p.className="field-error";p.id=eid;p.textContent=msg;field.appendChild(p);el.setAttribute("aria-invalid","true");el.setAttribute("aria-describedby",eid);}
  else{el.removeAttribute("aria-invalid");el.removeAttribute("aria-describedby");}}
function phoneWarn(id){var el=document.getElementById(id);if(!el)return;var wid=id+"-warn",old=document.getElementById(wid);if(old)old.remove();
  var digits=el.value.replace(/\D/g,"");
  if(el.value.trim()&&!(digits.length===10||(digits.length===11&&digits.indexOf("33")===0))){var p=document.createElement("p");p.className="field-warn";p.id=wid;p.textContent="Numéro incomplet : 10 chiffres attendus, par exemple 06 12 34 56 78.";el.closest(".field").appendChild(p);}}

/* Rappels Windows avant chaque rendez-vous */
var notified=new Set();
try{notified=new Set(JSON.parse(localStorage.getItem("carnet-notified")||"[]"));}catch(e){}
function checkReminders(){
  var lead=Number(S.settings.rappel)||0;if(!lead||!S.ready||typeof Notification==="undefined")return;var now=Date.now(),changed=false;
  S.rdv.forEach(function(r){if(r.statut!=="prevu")return;var diff=(rdvStart(r).getTime()-now)/60000,key=r.id+"@"+r.date+"T"+r.heure;
    if(diff>0&&diff<=lead&&!notified.has(key)){notified.add(key);changed=true;
      try{var n=new Notification("Rendez-vous à "+hm(r.heure)+" : "+rdvName(r),{body:[r.forfaitNom,rdvAddr(r)].filter(Boolean).join("\n")});
        n.onclick=function(){if(fileApi&&fileApi.focus)fileApi.focus();var x=S.rdv.get(r.id);if(x)openRdv(x);};}catch(e){}}});
  permisList().forEach(function(p){if(p.allDay)return;var st=parseKey(p.date),m=toMin(p.heure);st.setHours(Math.floor(m/60),m%60,0,0);var diff=(st.getTime()-now)/60000,key="permis@"+p.date+"T"+p.heure;
    if(diff>0&&diff<=lead&&!notified.has(key)){notified.add(key);changed=true;
      try{var n=new Notification("Leçon de conduite à "+hm(p.heure),{body:[p.lieu,p.rdv?"RDV : "+p.rdv:""].filter(Boolean).join(" · ")});n.onclick=function(){if(fileApi&&fileApi.focus)fileApi.focus();};}catch(e){}}});
  S.events.forEach(function(e){if(e.allDay)return;var st=parseKey(e.date),m=toMin(e.heure);st.setHours(Math.floor(m/60),m%60,0,0);var diff=(st.getTime()-now)/60000,key="ev@"+e.id+"@"+e.date+"T"+e.heure;
    if(diff>0&&diff<=lead&&!notified.has(key)){notified.add(key);changed=true;
      try{var n=new Notification(e.titre+" à "+hm(e.heure),{body:[e.lieu,e.note].filter(Boolean).join(" · ")});n.onclick=function(){if(fileApi&&fileApi.focus)fileApi.focus();var x=S.events.get(e.id);if(x&&typeof openEvent==="function")openEvent(x);};}catch(err){}}});
  if(changed){try{localStorage.setItem("carnet-notified",JSON.stringify(Array.from(notified).slice(-300)));}catch(e){}}
}

/* Factures */
function proReady(){return !!(S.settings.siret&&S.settings.proNom&&S.settings.proAdresse);}
var invoiceFiles=[];
function loadInvoiceFiles(){if(fileApi&&fileApi.invoiceFiles)fileApi.invoiceFiles().then(function(l){invoiceFiles=Array.isArray(l)?l:[];});}
function nextInvoiceNumber(dateKey){var y=String(dateKey).slice(0,4),max=0;
  invoiceFiles.forEach(function(f){var m=/^F-(\d{4})-(\d+)\.pdf$/i.exec(f);if(m&&m[1]===y)max=Math.max(max,parseInt(m[2],10));});
  S.factures.forEach(function(f){var m=/^F-(\d{4})-(\d+)$/.exec(f.numero||"");if(m&&m[1]===y)max=Math.max(max,parseInt(m[2],10));});
  return "F-"+y+"-"+String(max+1).padStart(4,"0");}
function createInvoice(r){
  var c=clientOf(r)||{},s=S.settings,date=r.payeLe||todayKey();
  var issue=todayKey();
  var f={id:uid(),numero:nextInvoiceNumber(issue),date:issue,rdvId:r.id,clientId:r.clientId||null,clientNom:c.nom||r.clientName||"",clientAdresse:rdvAddr(r),
    prestationDate:r.date,heure:r.heure,duree:Number(r.duree)||60,designation:r.forfaitNom||"Intervention",detail:r.note||"",prix:Number(r.prix)||0,payeLe:date,payMode:r.payMode||"",created:Date.now(),
    pro:{nom:s.proNom,adresse:s.proAdresse,siret:s.siret,tel:s.proTel,email:s.proEmail,sapNumero:s.sapNumero,sapDate:s.sapDate,nova:!!s.nova,mentionTva:s.mentionTva,mentionPlus:s.mentionPlus}};
  return f;
}
function invoiceHTML(f){
  var p=f.pro||{},e=esc;
  var sap=p.nova&&p.sapNumero?'<p>Organisme de services à la personne déclaré sous le n° '+e(p.sapNumero)+(p.sapDate?' le '+e(fDMY.format(parseKey(p.sapDate))):'')+'. Prestation ouvrant droit au crédit d\'impôt prévu à l\'article 199 sexdecies du CGI, dans les conditions en vigueur.</p>':'';
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture '+e(f.numero)+'</title><style>'+
  '*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Arial,sans-serif;color:#101828;font-size:10.5pt;line-height:1.45}'+
  '.page{padding:16mm 16mm 14mm}.top{display:flex;justify-content:space-between;gap:12mm;align-items:flex-start;padding-bottom:7mm;border-bottom:2.5pt solid #1f5bd8}'+
  '.who b{font-size:13.5pt}.who p,.meta p{margin:1.2mm 0 0}h1{margin:0;font-size:24pt;letter-spacing:-.5pt;color:#1f5bd8;text-align:right}'+
  '.meta{text-align:right}.meta b{font-size:11.5pt}.parties{display:flex;gap:8mm;margin:8mm 0 6mm}.box{flex:1;border:.8pt solid #d5dce6;border-radius:3mm;padding:4mm 5mm}'+
  '.box small{display:block;color:#5b677d;font-size:8.5pt;margin-bottom:1mm}table{width:100%;border-collapse:collapse}th{font-size:8.5pt;color:#5b677d;text-align:left;font-weight:600;padding:2.5mm 3mm;border-bottom:1pt solid #101828}'+
  'td{padding:3mm;border-bottom:.6pt solid #e4e9f0;vertical-align:top}.r{text-align:right;white-space:nowrap}td small{color:#5b677d}'+
  '.total{display:flex;justify-content:flex-end;margin-top:5mm}.total div{min-width:70mm;border-top:1.5pt solid #101828;padding-top:3mm;display:flex;justify-content:space-between;font-size:13pt;font-weight:700}'+
  '.paid{margin-top:6mm;padding:3.5mm 5mm;border-radius:3mm;background:#e0f3e9;color:#0b5c37;font-weight:600}.mentions{margin-top:9mm;font-size:8.8pt;color:#344054}.mentions p{margin:0 0 1.6mm}'+
  '</style></head><body><div class="page">'+
  '<div class="top"><div class="who"><b>'+e(p.nom||"")+' EI</b><p>Entrepreneur individuel</p><p>'+e(p.adresse||"")+'</p>'+(p.siret?'<p>SIRET : '+e(p.siret)+'</p>':'')+(p.tel?'<p>Tél. '+e(p.tel)+'</p>':'')+(p.email?'<p>'+e(p.email)+'</p>':'')+'</div>'+
  '<div class="meta"><h1>Facture</h1><p>N° <b>'+e(f.numero)+'</b></p><p>Date : '+e(fDMY.format(parseKey(f.date)))+'</p></div></div>'+
  '<div class="parties"><div class="box"><small>Client</small><b>'+e(f.clientNom)+'</b><br>'+e(f.clientAdresse||"")+'</div>'+
  '<div class="box"><small>Intervention</small>Le '+e(fDMY.format(parseKey(f.prestationDate)))+' à '+e(hm(f.heure))+'<br>Au domicile du client<br>Temps passé : '+e(dur(f.duree))+'</div></div>'+
  '<table><thead><tr><th>Désignation</th><th>Temps passé</th><th class="r">Prix forfaitaire</th></tr></thead><tbody>'+
  '<tr><td><b>'+e(f.designation)+'</b>'+(f.detail?'<br><small>'+e(f.detail)+'</small>':'')+'</td><td>'+e(dur(f.duree))+'</td><td class="r">'+euro2(f.prix)+'</td></tr>'+
  '<tr><td>Frais de déplacement</td><td></td><td class="r">Inclus</td></tr></tbody></table>'+
  '<div class="total"><div><span>Total</span><span>'+euro2(f.prix)+'</span></div></div>'+
  '<div class="paid">Facture acquittée le '+e(fDMY.format(parseKey(f.payeLe)))+(f.payMode?' par '+e(payLabel(f.payMode).toLowerCase()):'')+'. Somme effectivement payée : '+euro2(f.prix)+'.</div>'+
  '<div class="mentions"><p>'+e(p.mentionTva||"TVA non applicable, art. 293 B du CGI")+'.</p><p>Catégorie de l\'opération : prestation de services.</p>'+sap+(p.mentionPlus?'<p>'+e(p.mentionPlus)+'</p>':'')+'</div>'+
  '</div></body></html>';
}
function generatePdf(f,silent,isNew){
  if(!fileApi||!fileApi.invoicePdf){toast("La création de PDF n'est possible que dans l'application.");return Promise.resolve(null);}
  return fileApi.invoicePdf(invoiceHTML(f),f.numero+".pdf",!!isNew).then(function(p){
    if(p&&p.exists){toast("Une facture "+f.numero+" existe déjà dans le dossier : elle n'a pas été écrasée.");return null;}
    if(p&&invoiceFiles.indexOf(f.numero+".pdf")<0)invoiceFiles.push(f.numero+".pdf");
    if(!p){toast("Le PDF n'a pas pu être créé. Vérifie que le dossier Documents est accessible.");return null;}
    var g=S.factures.get(f.id);if(g&&g.pdf!==p){g=Object.assign({},g,{pdf:p});put("factures",g);}
    if(!silent)toast("Facture "+f.numero+" enregistrée",{label:"Ouvrir",fn:function(){fileApi.openPath(p);}});
    return p;});
}

/* Recettes (livre des recettes, Urssaf) */
function recettes(filterFn){return rdvList().filter(function(r){return r.statut==="paye"&&r.payeLe&&(!filterFn||filterFn(r));}).sort(function(a,b){return (a.payeLe+a.heure).localeCompare(b.payeLe+b.heure);});}
function sumOf(list){return list.reduce(function(s,r){return s+(Number(r.prix)||0);},0);}
function csvCell(v){v=String(v==null?"":v);return /[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
function exportRecettes(year){
  year=year||S.ui.finYear||new Date().getFullYear();
  var list=recettes(function(r){return r.payeLe.slice(0,4)===String(year);});
  var rows=[["Date d'encaissement","Client","Prestation","Montant (EUR)","Mode de règlement","N° de facture"]];
  list.forEach(function(r){var f=r.factureId?S.factures.get(r.factureId):null;rows.push([fNum.format(parseKey(r.payeLe)),rdvName(r),r.forfaitNom||"",String((Number(r.prix)||0).toFixed(2)).replace(".",","),payLabel(r.payMode),f?f.numero:""]);});
  rows.push(["","","Total",String(sumOf(list).toFixed(2)).replace(".",","),"",""]);
  var csv=rows.map(function(r){return r.map(csvCell).join(";");}).join("\r\n");
  if(fileApi&&fileApi.saveText)fileApi.saveText("livre-des-recettes-"+year+".csv",csv).then(function(p){if(p)toast("Livre des recettes "+year+" exporté");});
  else copy(csv,"Livre des recettes copié");
}
