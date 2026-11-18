/* Mon Carnet : accueil au premier lancement et profil de l'utilisateur.
   L'appli peut servir à n'importe qui : au départ, on demande le prénom et ce que la personne veut suivre. */
function onbField(id,label,val,opt){opt=opt||{};return '<div class="field"><label for="'+id+'">'+esc(label)+(opt.req?'<span class="req" aria-hidden="true">*</span>':'')+'</label><input type="'+(opt.type||"text")+'" id="'+id+'" value="'+esc(val||"")+'" placeholder="'+esc(opt.ph||"")+'" autocomplete="off" spellcheck="false"'+(opt.req?' required aria-required="true"':'')+'>'+(opt.hint?'<p class="hint">'+opt.hint+'</p>':'')+'</div>';}
function onbCheck(id,label,sub,on){return '<label class="onb-mod"><input type="checkbox" id="'+id+'"'+(on?" checked":"")+'><span><b>'+esc(label)+'</b><small>'+esc(sub)+'</small></span></label>';}
function openOnboarding(){
  if(document.getElementById("onb"))return;var st=S.settings;
  var el=document.createElement("div");el.id="onb";el.className="onb";el.setAttribute("role","dialog");el.setAttribute("aria-modal","true");el.setAttribute("aria-labelledby","onb-h");
  el.innerHTML='<form class="onb-card glass" id="onb-form" novalidate autocomplete="off">'+
    '<div class="onb-head"><svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true"><use href="#logo-app"/></svg><div><h1 id="onb-h">Bienvenue dans Mon Carnet</h1><p>Quelques infos pour préparer ton carnet. '+(fileApi&&fileApi.mobile?"Tout reste sur ce téléphone.":"Tout reste sur ce PC, dans Documents\\Mon_Carnet.")+' Tu pourras tout modifier dans Réglages.</p></div></div>'+
    '<div class="grid2">'+onbField("onb-prenom","Ton prénom",st.prenom,{req:true,ph:"Camille"})+onbField("onb-nom","Nom (facultatif)",st.proNom,{ph:"Camille Martin"})+'</div>'+
    '<p class="onb-q">Qu\'est-ce que tu veux suivre ?</p><div class="onb-mods">'+
      onbCheck("onb-ecole","École et cours","Emploi du temps, mails des profs, examens.",st.modEcole!==false)+
      onbCheck("onb-permis","Permis de conduire","Leçons, heures faites, réservation automatique (Sarool).",st.modConduite!==false)+
      onbCheck("onb-pro","Activité d'indépendant","Clients, rendez-vous, factures, Urssaf.",st.modPro!==false)+'</div>'+
    '<div class="onb-sub" data-for="onb-ecole">'+onbField("onb-ecole-nom","Nom de ton école",st.ecole,{ph:"Lycée, université, école…"})+onbField("onb-ical","Lien de ton emploi du temps (facultatif)",st.icalUrl,{ph:"https://…/calendrier.ics",hint:"Le lien iCal / ICS donné par ton école. Tu peux l'ajouter plus tard dans Réglages."})+'</div>'+
    '<div class="onb-sub" data-for="onb-permis"><div class="grid2">'+onbField("onb-ae","Auto-école",st.autoEcole,{ph:"Nom de l'auto-école"})+onbField("onb-avant","Heures de conduite déjà faites",st.heuresAvant||"",{type:"number",ph:"0"})+'</div></div>'+
    '<div class="onb-sub" data-for="onb-pro">'+onbField("onb-debut","Début de ton activité (facultatif)",st.proDebut,{type:"date",hint:"Sert aux échéances Urssaf et aux rappels de lancement."})+'</div>'+
    '<div class="field"><label for="onb-key">Clé d\'IA pour Titan (facultatif)</label><input type="password" id="onb-key" placeholder="AQ.… ou AIza… (Gemini), gsk_… (Groq)" autocomplete="off" spellcheck="false"><p class="hint">Gratuite sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Sans clé, tout marche sauf l\'assistant Titan.</p></div>'+
    '<p class="field-error" id="onb-err" role="alert" hidden></p>'+
    '<div class="onb-foot"><button class="btn primary lg" type="submit">C\'est parti</button></div></form>';
  document.body.appendChild(el);
  function syncSubs(){Array.prototype.forEach.call(el.querySelectorAll(".onb-sub"),function(s){s.hidden=!document.getElementById(s.getAttribute("data-for")).checked;});}
  el.addEventListener("change",syncSubs);syncSubs();
  setTimeout(function(){var i=document.getElementById("onb-prenom");if(i)i.focus();},50);
  document.getElementById("onb-form").addEventListener("submit",function(e){e.preventDefault();saveOnboarding();});
}
function saveOnboarding(){
  var g=function(id){var x=document.getElementById(id);return x?(x.type==="checkbox"?x.checked:x.value.trim()):"";};
  var err=document.getElementById("onb-err"),prenom=g("onb-prenom");
  if(!prenom){err.textContent="Indique au moins ton prénom.";err.hidden=false;document.getElementById("onb-prenom").focus();return;}
  var key=g("onb-key");
  if(key&&!/^(gsk_|AIza|AQ\.|csk-)/.test(key)){err.textContent="Clé d'IA non reconnue : laisse vide si tu n'en as pas.";err.hidden=false;return;}
  var ical=g("onb-ical");
  if(ical&&!/^(https?|webcal):\/\//i.test(ical)){err.textContent="Le lien de l'emploi du temps doit commencer par https://";err.hidden=false;return;}
  var p={prenom:prenom,proNom:g("onb-nom")||S.settings.proNom||"",modEcole:g("onb-ecole"),modConduite:g("onb-permis"),modPro:g("onb-pro"),
    ecole:g("onb-ecole-nom"),icalUrl:ical.replace(/^webcal:/i,"https:"),autoEcole:g("onb-ae"),proDebut:g("onb-debut"),setupHidden:false,heuresAvant:Math.max(0,Number(g("onb-avant"))||0),onboarded:true};
  var el=document.getElementById("onb");if(el){el.classList.add("out");setTimeout(function(){el.remove();},300);}
  putSettings(p);
  if(p.icalUrl&&typeof syncCours==="function")syncCours(false);
  if(key&&fileApi&&fileApi.aiSetKey)fileApi.aiSetKey(key).then(function(){if(typeof loadKeyInfo==="function")loadKeyInfo();});
  go("jour");
  toast("Bienvenue "+prenom+" ! Termine la connexion de tes services avec « Premiers pas ».");
}
/* Ouvre l'accueil une fois l'écran de chargement terminé */
function maybeOnboard(){
  if(S.settings.onboarded)return;
  var tries=0;(function wait(){var sp=document.getElementById("splash");if((sp&&!sp.classList.contains("out")&&tries<40)){tries++;setTimeout(wait,500);return;}if(!S.settings.onboarded)openOnboarding();})();
}
ACTS["onboarding"]=function(){openOnboarding();};

/* Réglages : profil */
function profileSection(){
  var s=S.settings;
  return '<section class="set-section" aria-labelledby="s-moi"><h2 class="sec" id="s-moi">Ton profil</h2>'+
    '<div class="grid2"><div class="field"><label for="set-prenom2">Prénom</label><input type="text" id="set-prenom2" data-set="prenom" data-type="str" value="'+esc(s.prenom||"")+'"></div>'+
    '<div class="field"><label for="set-ecole">École</label><input type="text" id="set-ecole" data-set="ecole" data-type="str" value="'+esc(s.ecole||"")+'"></div>'+
    '<div class="field"><label for="set-ae">Auto-école</label><input type="text" id="set-ae" data-set="autoEcole" data-type="str" value="'+esc(s.autoEcole||"")+'"></div>'+
    '<div class="field"><label for="set-debut">Début de l’activité d’indépendant</label><input type="date" id="set-debut" data-set="proDebut" data-type="str" value="'+esc(s.proDebut||"")+'"></div></div>'+
    setToggle("modEcole","École et cours","Affiche la page Cours (emploi du temps et mails).")+
    setToggle("modConduite","Permis de conduire","Affiche la page Conduite.")+
    setToggle("modPro","Activité d'indépendant","Affiche Clients et Finances.")+
    '<div class="row"><button class="btn ghost sm" type="button" data-act="onboarding">Refaire l\'accueil</button><button class="btn ghost sm" type="button" data-act="open-data-folder">'+icon("file")+'Ouvrir Documents\\Mon_Carnet</button></div></section>';
}
ACTS["open-data-folder"]=function(){if(fileApi&&fileApi.openFolder)fileApi.openFolder();};

/* « Premiers pas » sur la page Aujourd'hui : les connexions à faire (emploi du temps, mails, Sarool, IA) */
function setupSteps(){
  var st=S.settings,out=[];
  if(st.modEcole!==false){
    out.push({k:"edt",t:"Emploi du temps de l'école",d:"Colle le lien iCal / ICS donné par ton école.",ok:!!(st.icalUrl||"").trim(),act:"setup-edt",b:"Ajouter le lien"});
    out.push({k:"mail",t:"Mails de l'école",d:"Relie ta boîte (Gmail ou Google Workspace de l'école) pour voir les mails des profs.",ok:!!(S.mail&&S.mail.account),act:"mail-connect",pcOnly:!(fileApi&&fileApi.mailStatus),b:"Relier la boîte"});}
  if(st.modConduite!==false)out.push({k:"sarool",t:"Auto-école (Sarool)",d:"Connecte ton compte Sarool pour voir tes leçons et réserver automatiquement.",ok:!!st.saroolOn,act:"sarool-login",pcOnly:!(fileApi&&fileApi.saroolLogin),b:"Se connecter"});
  out.push({k:"ia",t:"Assistant Titan",d:"Ajoute une clé d'IA gratuite (Gemini conseillé, Groq pour les messages vocaux).",ok:!!(S.titanKey&&S.titanKey.custom),act:"setup-ia",b:"Ajouter une clé"});
  if(st.modPro!==false)out.push({k:"pro",t:"Profil professionnel",d:"SIRET, adresse et début d'activité pour tes factures.",ok:!!(st.siret&&st.proAdresse),act:"setup-pro",b:"Compléter"});
  return out.filter(function(x){return !x.pcOnly;});
}
function setupCard(){
  if(S.settings.setupHidden||!S.settings.onboarded)return "";
  var steps=setupSteps(),done=steps.filter(function(x){return x.ok;}).length;
  if(done===steps.length)return "";
  return '<section class="card setup-card" aria-labelledby="setup-h"><div class="sec-head"><h2 class="sec" id="setup-h">'+icon("sparkle")+'Premiers pas <span class="muted num">'+done+'/'+steps.length+'</span></h2><button class="linklike" type="button" data-act="setup-hide">Masquer</button></div>'+
    '<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="'+steps.length+'" aria-valuenow="'+done+'" aria-label="Connexions faites"><i style="width:'+Math.round(done/steps.length*100)+'%"></i></div><ul class="setup-list">'+
    steps.map(function(x){return '<li class="'+(x.ok?"ok":"")+'"><span class="setup-dot">'+(x.ok?icon("check"):"")+'</span><div class="grow"><b>'+esc(x.t)+'</b><small>'+esc(x.d)+'</small></div>'+(x.ok?'<span class="hint">Fait</span>':'<button class="btn sm" type="button" data-act="'+x.act+'">'+esc(x.b)+'</button>')+'</li>';}).join("")+'</ul></section>';
}
function goSetting(id){go("reglages");setTimeout(function(){var el=document.getElementById(id);if(el){el.scrollIntoView({behavior:"smooth",block:"start"});var i=el.parentElement.querySelector("input,textarea");if(i)i.focus();}},120);}
ACTS["setup-hide"]=function(){putSettings({setupHidden:true});toast("« Premiers pas » masqué : tout reste faisable dans Réglages.");};
ACTS["setup-edt"]=function(){goSetting("s-edt");};
ACTS["setup-ia"]=function(){goSetting("s-titan");};
ACTS["setup-pro"]=function(){goSetting("s-pro");};
