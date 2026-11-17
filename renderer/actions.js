"use strict";
/* Mon Carnet : fenêtres, palette de commandes, glisser-déposer, événements. */

function go(view,extra){S.ui.view=view;if(view!=="clients")S.ui.clientId=null;Object.assign(S.ui,extra||{});closeModal(true);closePalette();if(typeof closeNotifPanel==="function")closeNotifPanel();focusHeading=true;render();}

/* ---------- Rendez-vous ---------- */
function dateChips(cur){var out=[],t=new Date();for(var i=0;i<6;i++){var d=addDays(t,i),k=keyOf(d),label=i===0?"Aujourd'hui":i===1?"Demain":cap(fShort.format(d).replace(/\./g,""));
  out.push('<button type="button" class="qchip" data-act="pick-date" data-date="'+k+'" aria-pressed="'+(k===cur)+'">'+esc(label)+'</button>');}return out.join("");}
function drawRdvHelpers(){
  if(!M||M.type!=="rdv")return;var d=document.getElementById("f-date").value,du=Number(document.getElementById("f-duree").value)||60,h=document.getElementById("f-heure").value;
  var dc=document.getElementById("f-datechips");if(dc)dc.innerHTML=dateChips(d);
  var sc=document.getElementById("f-slots");if(sc){var sl=freeSlots(d,du,M.r.id);
    sc.innerHTML=sl.length?sl.map(function(m){var v=fromM(m);return '<button type="button" class="qchip" data-act="pick-time" data-time="'+v+'" aria-pressed="'+(v===h)+'">'+hm(v)+'</button>';}).join(""):'<span class="qchip none">Aucun créneau libre entre 9h et 19h</span>';}
  var el=document.getElementById("f-conflict");if(el){var t=d&&h?conflictText(d,h,du,M.r.id):"";el.hidden=!t;el.textContent=t;}
  var mm=document.getElementById("f-msg");if(mm&&!M.isNew)mm.textContent=confirmMsg(readRdvForm());
}
function openRdv(r,preset){
  preset=preset||{};var isNew=!r;closePalette();
  r=r?Object.assign({},r):{id:uid(),clientId:preset.clientId||null,clientName:"",date:preset.date||todayKey(),heure:"10:00",duree:60,forfait:"express",forfaitNom:"Dépannage express",prix:45,adresse:"",note:"",statut:"prevu",created:Date.now()};
  var c=r.clientId?S.clients.get(r.clientId):null;
  if(c&&!r.adresse&&isNew)r.adresse=c.adresse||"";
  if(isNew){if(preset.heure)r.heure=preset.heure;else{var fs=freeSlots(r.date,r.duree,r.id);if(fs.length)r.heure=fromM(fs[0]);}}
  M={type:"rdv",isNew:isNew,r:r,clientId:r.clientId};
  var pills=FORFAITS.map(function(f){return '<label class="pill"><input type="radio" name="forfait" value="'+f.id+'"'+(r.forfait===f.id?" checked":"")+'><span>'+esc(f.nom)+(f.prix?' <em>'+euro(f.prix)+'</em>':'')+'</span></label>';}).join("");
  var durOpts=[30,45,60,90,120,150,180,240].map(function(m){return '<option value="'+m+'"'+(Number(r.duree)===m?" selected":"")+'>'+dur(m)+'</option>';}).join("");
  var stKeys=r.statut==="paye"?["prevu","fait","paye","annule"]:["prevu","fait","annule"];
  var st=isNew?"":'<div class="field"><span class="flabel">Statut</span><div class="pills">'+stKeys.map(function(k){return '<label class="pill"><input type="radio" name="statut" value="'+k+'"'+(r.statut===k?" checked":"")+'><span>'+STATUTS[k]+'</span></label>';}).join("")+'</div>'+
    (r.statut==="paye"?'<p class="hint">Payé le '+esc(fDMY.format(parseKey(r.payeLe||r.date)))+(r.payMode?' par '+esc(payLabel(r.payMode).toLowerCase()):'')+(r.factureId&&S.factures.get(r.factureId)?', facture '+esc(S.factures.get(r.factureId).numero):'')+'.</p>':'')+'</div>';
  openSheet('<header><h2>'+(isNew?"Nouveau rendez-vous":"Rendez-vous")+'</h2><button class="btn ghost icon" type="button" data-act="close-modal" aria-label="Fermer">'+icon("x")+'</button></header>'+
   '<form id="rdv-form" class="body" autocomplete="off" novalidate>'+
    '<div class="field"><label for="f-client">Client<span class="req" aria-hidden="true">*</span></label><input type="text" id="f-client" placeholder="Tape un nom : client existant ou nouveau" value="'+esc(c?c.nom:r.clientName)+'" required aria-required="true" role="combobox" aria-autocomplete="list" aria-controls="f-sugg" aria-expanded="false"><div class="sugg" id="f-sugg" role="listbox" hidden></div><p class="hint" id="f-mat" hidden></p></div>'+
    '<div class="grid2" id="f-new" hidden><div class="field"><label for="f-tel">Téléphone du nouveau client</label><input type="tel" id="f-tel" placeholder="06 12 34 56 78" inputmode="tel"></div><p class="hint" style="align-self:end">Nouveau client : il sera ajouté à ta liste.</p></div>'+
    '<div class="grid3"><div class="field"><label for="f-date">Date<span class="req" aria-hidden="true">*</span></label><input type="date" id="f-date" value="'+esc(r.date)+'" required aria-required="true"></div><div class="field"><label for="f-heure">Heure<span class="req" aria-hidden="true">*</span></label><input type="time" id="f-heure" step="900" value="'+esc(r.heure)+'" required aria-required="true"></div><div class="field"><label for="f-duree">Durée</label><select id="f-duree">'+durOpts+'</select></div></div>'+
    '<div class="field"><span class="flabel" id="f-dc-l">Dates rapides</span><div class="chiprow" id="f-datechips" role="group" aria-labelledby="f-dc-l"></div></div>'+
    '<div class="field"><span class="flabel" id="f-sl-l">Créneaux libres ce jour-là</span><div class="chiprow" id="f-slots" role="group" aria-labelledby="f-sl-l"></div></div>'+
    (isNew?'':'<div class="field"><span class="flabel" id="f-sh-l">Décaler</span><div class="chiprow" role="group" aria-labelledby="f-sh-l"><button type="button" class="qchip" data-act="shift" data-min="-30">−30 min</button><button type="button" class="qchip" data-act="shift" data-min="30">+30 min</button><button type="button" class="qchip" data-act="shift" data-day="1">Au lendemain</button><button type="button" class="qchip" data-act="shift" data-day="7">Semaine suivante</button></div></div>')+
    '<p class="warnline" id="f-conflict" role="status" hidden></p>'+
    '<div class="field"><span class="flabel">Prestation</span><div class="pills" id="f-forfaits">'+pills+'</div></div>'+
    '<div class="grid2"><div class="field"><label for="f-prix">Prix (€)</label><input type="number" id="f-prix" min="0" step="0.5" inputmode="decimal" value="'+esc(r.prix)+'"></div><div class="field"><label for="f-adresse">Adresse</label><input type="text" id="f-adresse" value="'+esc(r.adresse)+'" placeholder="Rue, ville"></div></div>'+
    '<div class="field"><label for="f-note">Le problème, en quelques mots</label><textarea id="f-note" placeholder="Ex. : imprimante HP qui n\'imprime plus depuis la mise à jour">'+esc(r.note)+'</textarea></div>'+st+
    (isNew?'':'<div class="field"><span class="flabel">Message de confirmation</span><p class="msgbox" id="f-msg">'+esc(confirmMsg(r))+'</p><div class="row"><button class="btn sm" type="button" data-act="copy-msg">'+icon("copy")+'Copier le message</button></div></div>')+
    '<button type="submit" hidden></button></form>'+
   '<footer>'+(isNew?'':'<span id="del-zone"><button class="btn danger" type="button" data-act="del-rdv">'+icon("trash")+'Supprimer</button></span>')+'<span class="spacer"></span><button class="btn ghost" type="button" data-act="close-modal">Annuler</button>'+
   (!isNew&&r.statut==="fait"?'<button class="btn" type="button" data-act="save-then-encaisser">'+icon("euro")+'Encaisser</button>':'')+'<button class="btn primary" type="button" data-act="save-rdv">'+(isNew?"Ajouter":"Enregistrer")+'</button></footer>');
  wireRdv();
  var first=document.getElementById(c?"f-heure":"f-client");if(first)first.focus();
}
function wireRdv(){
  var fc=document.getElementById("f-client"),sg=document.getElementById("f-sugg"),fn=document.getElementById("f-new"),fm=document.getElementById("f-mat"),hi=-1,opts=[];
  function showNew(){fn.hidden=!!M.clientId||!fc.value.trim();var c=M.clientId&&S.clients.get(M.clientId),mats=c&&c.materiel&&c.materiel.length?c.materiel.map(function(m){return m.modele||m.type;}).join(", "):"";fm.hidden=!mats;fm.textContent=mats?"Matériel connu : "+mats:"";}
  function drawSugg(){var q=norm(fc.value.trim());
    opts=q?Array.from(S.clients.values()).filter(function(c){return norm(c.nom).indexOf(q)>=0||String(c.tel||"").replace(/\s/g,"").indexOf(q.replace(/\s/g,""))>=0;}).slice(0,5):[];
    if(M.clientId&&opts.length===1&&opts[0].id===M.clientId&&opts[0].nom===fc.value)opts=[];
    sg.hidden=!opts.length;hi=-1;fc.setAttribute("aria-expanded",opts.length?"true":"false");
    sg.innerHTML=opts.map(function(c){return '<button type="button" role="option" tabindex="-1" data-pick="'+esc(c.id)+'"><span>'+esc(c.nom)+'</span><small>'+esc([c.tel,c.adresse].filter(Boolean).join(", "))+'</small></button>';}).join("");}
  function pick(id){var c=S.clients.get(id);if(!c)return;M.clientId=id;M.dirty=true;fc.value=c.nom;var a=document.getElementById("f-adresse");if(!a.value.trim())a.value=c.adresse||"";sg.hidden=true;fc.setAttribute("aria-expanded","false");setErr("f-client","");showNew();document.getElementById("f-heure").focus();}
  fc.addEventListener("input",function(){var c=M.clientId&&S.clients.get(M.clientId);if(!c||c.nom!==fc.value)M.clientId=null;if(fc.value.trim())setErr("f-client","");drawSugg();showNew();});
  fc.addEventListener("focus",drawSugg);
  fc.addEventListener("blur",function(){setTimeout(function(){sg.hidden=true;fc.setAttribute("aria-expanded","false");},150);});
  fc.addEventListener("keydown",function(e){if(sg.hidden||!opts.length)return;
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();hi=(hi+(e.key==="ArrowDown"?1:-1)+opts.length)%opts.length;Array.prototype.forEach.call(sg.children,function(b,i){b.classList.toggle("on",i===hi);});}
    else if(e.key==="Enter"&&hi>=0){e.preventDefault();pick(opts[hi].id);}});
  sg.addEventListener("mousedown",function(e){var b=e.target.closest("[data-pick]");if(b){e.preventDefault();pick(b.getAttribute("data-pick"));}});
  document.getElementById("f-forfaits").addEventListener("change",function(e){var f=forfait(e.target.value);if(!f)return;document.getElementById("f-prix").value=f.prix;document.getElementById("f-duree").value=String(f.duree);drawRdvHelpers();});
  ["f-date","f-heure","f-duree"].forEach(function(id){var el=document.getElementById(id);el.addEventListener("change",function(){if(el.value)setErr(id,"");drawRdvHelpers();});});
  var tel=document.getElementById("f-tel");if(tel)tel.addEventListener("blur",function(){phoneWarn("f-tel");});
  document.getElementById("rdv-form").addEventListener("submit",function(e){e.preventDefault();saveRdv();});
  showNew();drawRdvHelpers();
}
function readRdvForm(){
  var r=Object.assign({},M.r),fid=(document.querySelector('input[name="forfait"]:checked')||{}).value||"autre",f=forfait(fid);
  r.clientName=document.getElementById("f-client").value.trim();r.clientId=M.clientId||null;
  r.date=document.getElementById("f-date").value;r.heure=document.getElementById("f-heure").value;r.duree=Number(document.getElementById("f-duree").value)||60;
  r.forfait=fid;r.forfaitNom=f?f.nom:"";r.prix=Math.max(0,Number(document.getElementById("f-prix").value)||0);
  r.adresse=document.getElementById("f-adresse").value.trim();r.note=document.getElementById("f-note").value.trim();
  var st=document.querySelector('input[name="statut"]:checked');if(st)r.statut=st.value;
  if(r.statut!=="paye"){delete r.payeLe;delete r.payMode;}
  return r;
}
function saveRdv(){
  if(!M||M.type!=="rdv")return null;
  var r=readRdvForm(),bad=[];
  setErr("f-client",r.clientName?"":"Indique le nom du client, ou choisis-le dans la liste.");if(!r.clientName)bad.push("f-client");
  setErr("f-date",r.date?"":"Choisis une date (ou une date rapide).");if(!r.date)bad.push("f-date");
  setErr("f-heure",r.heure?"":"Choisis une heure (ou un créneau libre).");if(!r.heure)bad.push("f-heure");
  if(bad.length){document.getElementById(bad[0]).focus();return null;}
  if(!r.clientId){var same=null;S.clients.forEach(function(c){if(!same&&norm(c.nom)===norm(r.clientName))same=c;});
    if(same)r.clientId=same.id;
    else{var tel=document.getElementById("f-tel");var nc={id:uid(),nom:r.clientName,tel:tel?tel.value.trim():"",email:"",adresse:r.adresse,note:"",materiel:[],created:Date.now()};S.clients.set(nc.id,nc);r.clientId=nc.id;}}
  r.updated=Date.now();var wasNew=M.isNew;closeModal(true);put("rdv",r);
  if(wasNew)toast("Rendez-vous ajouté : "+relDay(r.date).toLowerCase()+" à "+hm(r.heure),{label:"Copier le SMS",fn:function(){copy(confirmMsg(r),"Message de confirmation copié");}});
  else toast("Rendez-vous enregistré");
  return r;
}

/* ---------- Encaissement ---------- */
function openEncaisser(r){
  if(!r)return;closePalette();
  var lastPay="cb";try{lastPay=localStorage.getItem("carnet-lastpay")||"cb";}catch(e){}
  var before=todayKey()<START_KEY;
  M={type:"enc",r:r};
  openSheet('<header><h2>Encaisser</h2><button class="btn ghost icon" type="button" data-act="close-modal" aria-label="Fermer">'+icon("x")+'</button></header>'+
   '<form id="enc-form" class="body" autocomplete="off" novalidate><p class="hint">'+esc(rdvName(r)+", "+(r.forfaitNom||"intervention")+", "+relDay(r.date).toLowerCase()+" à "+hm(r.heure))+'</p>'+
   (before?'<p class="warnline">Ton activité démarre '+esc(startLabel())+' : n\'encaisse rien avant cette date.</p>':'')+
   '<div class="grid2"><div class="field"><label for="e-montant">Montant reçu (€)</label><input type="number" id="e-montant" class="amount-in" value="'+esc(r.prix)+'" step="0.5" min="0" inputmode="decimal"></div><div class="field"><label for="e-date">Date d\'encaissement</label><input type="date" id="e-date" value="'+todayKey()+'"></div></div>'+
   '<div class="field"><span class="flabel">Mode de paiement</span><div class="pills">'+PAY_MODES.map(function(p){return '<label class="pill"><input type="radio" name="paymode" value="'+p[0]+'"'+(p[0]===lastPay?" checked":"")+'><span>'+p[1]+'</span></label>';}).join("")+'</div></div>'+
   '<div class="toggle"><div><b>Créer la facture</b><small>'+(proReady()?"PDF numéroté, enregistré dans Documents, Mon_Carnet, Factures.":"Ton SIRET n'est pas encore renseigné (Réglages) : la facture sera incomplète.")+'</small></div><input type="checkbox" class="switch" id="e-facture"'+(proReady()?" checked":"")+' aria-label="Créer la facture"></div>'+
   '<button type="submit" hidden></button></form><footer><span class="spacer"></span><button class="btn ghost" type="button" data-act="close-modal">Annuler</button><button class="btn primary" type="button" data-act="enc-confirm">'+icon("check")+'Encaisser '+esc(euro(r.prix))+'</button></footer>',"sm");
  var mi=document.getElementById("e-montant");mi.focus();mi.select();
  mi.addEventListener("input",function(){var b=mroot.querySelector('[data-act="enc-confirm"]');if(b)b.innerHTML=icon("check")+"Encaisser "+esc(euro(Number(mi.value)||0));});
  document.getElementById("enc-form").addEventListener("submit",function(e){e.preventDefault();confirmEncaisser();});
}
function confirmEncaisser(){
  if(!M||M.type!=="enc")return;
  var x=Object.assign({},M.r),pm=(document.querySelector('input[name="paymode"]:checked')||{}).value||"cb",d=document.getElementById("e-date").value||todayKey(),withInv=document.getElementById("e-facture").checked;
  x.prix=Math.max(0,Number(document.getElementById("e-montant").value)||0);x.statut="paye";x.payMode=pm;x.payeLe=d;x.updated=Date.now();
  try{localStorage.setItem("carnet-lastpay",pm);}catch(e){}
  var f=null;if(withInv&&!x.factureId){f=createInvoice(x);x.factureId=f.id;S.factures.set(f.id,f);}
  S.rdv.set(x.id,x);closeModal(true);render();persist();
  if(f)generatePdf(f,true,true).then(function(p){toast("Encaissé : "+euro(x.prix)+", facture "+f.numero,p?{label:"Ouvrir la facture",fn:function(){fileApi.openPath(p);}}:null);});
  else toast("Encaissé : "+euro(x.prix));
}

/* ---------- Clients ---------- */
function openClient(c,prefill){
  var isNew=!c;closePalette();c=c?Object.assign({},c):{id:uid(),nom:prefill||"",tel:"",email:"",adresse:"",note:"",materiel:[],created:Date.now()};
  M={type:"client",isNew:isNew,c:c,dirty:!!prefill};
  openSheet('<header><h2>'+(isNew?"Nouveau client":"Modifier le client")+'</h2><button class="btn ghost icon" type="button" data-act="close-modal" aria-label="Fermer">'+icon("x")+'</button></header>'+
   '<form id="client-form" class="body" autocomplete="off" novalidate>'+
    '<div class="field"><label for="c-nom">Nom<span class="req" aria-hidden="true">*</span></label><input type="text" id="c-nom" value="'+esc(c.nom)+'" placeholder="Ex. : Mme Martin" required aria-required="true"></div>'+
    '<div class="grid2"><div class="field"><label for="c-tel">Téléphone</label><input type="tel" id="c-tel" value="'+esc(c.tel)+'" placeholder="06 12 34 56 78" inputmode="tel"></div><div class="field"><label for="c-email">E-mail</label><input type="email" id="c-email" value="'+esc(c.email)+'"></div></div>'+
    '<div class="field"><label for="c-adresse">Adresse</label><input type="text" id="c-adresse" value="'+esc(c.adresse)+'" placeholder="Rue, code postal, ville"></div>'+
    '<div class="field"><label for="c-note">Notes</label><textarea id="c-note" placeholder="Digicode, étage, qui a recommandé…">'+esc(c.note)+'</textarea></div><button type="submit" hidden></button></form>'+
   '<footer>'+(isNew?'':'<span id="del-zone"><button class="btn danger" type="button" data-act="del-client">'+icon("trash")+'Supprimer</button></span>')+'<span class="spacer"></span><button class="btn ghost" type="button" data-act="close-modal">Annuler</button><button class="btn primary" type="button" data-act="save-client">'+(isNew?"Ajouter":"Enregistrer")+'</button></footer>');
  document.getElementById("client-form").addEventListener("submit",function(e){e.preventDefault();saveClient();});
  document.getElementById("c-tel").addEventListener("blur",function(){phoneWarn("c-tel");});
  document.getElementById("c-nom").addEventListener("input",function(e){if(e.target.value.trim())setErr("c-nom","");});
  document.getElementById("c-nom").focus();
}
function saveClient(){
  if(!M||M.type!=="client")return;var c=Object.assign({},M.c);
  c.nom=document.getElementById("c-nom").value.trim();c.tel=document.getElementById("c-tel").value.trim();c.email=document.getElementById("c-email").value.trim();
  c.adresse=document.getElementById("c-adresse").value.trim();c.note=document.getElementById("c-note").value.trim();
  if(!c.nom){setErr("c-nom","Indique le nom du client : c'est le seul champ obligatoire.");document.getElementById("c-nom").focus();return;}
  var renamed=!M.isNew&&M.c.nom!==c.nom,wasNew=M.isNew;c.updated=Date.now();closeModal(true);
  S.clients.set(c.id,c);if(renamed)S.rdv.forEach(function(r){if(r.clientId===c.id)S.rdv.set(r.id,Object.assign({},r,{clientName:c.nom}));});
  if(wasNew){S.ui.view="clients";S.ui.clientId=c.id;S.ui.clientTab="infos";}
  render();persist();toast(wasNew?"Client ajouté":"Fiche enregistrée");
}
function askDelete(kind){var z=document.getElementById("del-zone");if(!z)return;
  z.innerHTML='<span class="row"><span class="hint">'+(kind==="client"?"Supprimer ce client ? Ses rendez-vous restent.":"Supprimer ce rendez-vous ?")+'</span><button class="btn danger solid sm" type="button" data-act="'+(kind==="client"?"del-client-ok":"del-rdv-ok")+'">Supprimer</button><button class="btn ghost sm" type="button" data-act="del-cancel">Non</button></span>';}

/* ---------- Cours ---------- */
function openCours(uidv){
  var c=null;S.cours.concat(permisList()).forEach(function(x){if(x.uid===uidv)c=x;});if(!c)return;closePalette();M={type:"cours"};var isP=c.kind==="permis";
  openSheet('<header><h2>'+esc(c.titre)+'</h2><button class="btn ghost icon" type="button" data-act="close-modal" aria-label="Fermer">'+icon("x")+'</button></header><div class="body"><dl class="kv">'+
    '<dt>Date</dt><dd>'+esc(cap(fDay.format(parseKey(c.date))))+'</dd>'+(c.allDay?'<dt>Horaire</dt><dd>Toute la journée</dd>':'<dt>Horaire</dt><dd class="num">'+hm(c.heure)+' – '+hm(fromM(toMin(c.heure)+c.duree))+' ('+dur(c.duree)+')</dd>')+
    (isP?(c.moniteur?'<dt>Moniteur</dt><dd>'+esc(c.moniteur)+'</dd>':'')+(c.rdv?'<dt>Rendez-vous</dt><dd>'+esc(c.rdv)+'</dd>':''):(c.lieu?'<dt>Salle</dt><dd>'+esc(c.lieu)+'</dd>':''))+(c.desc?'<dt>Détails</dt><dd style="white-space:pre-wrap">'+esc(c.desc)+'</dd>':'')+
    '</dl><p class="hint">'+(isP?'Leçon réservée sur Sarool. Pour l\'annuler, passe par le site de l\'auto-école.':'Importé de ton emploi du temps d\'école, mis à jour automatiquement.')+'</p></div><footer>'+(isP?'<button class="btn ghost" type="button" data-act="nav" data-view="conduite">'+icon("car")+'Conduite</button>':'')+'<span class="spacer"></span><button class="btn primary" type="button" data-act="close-modal">Fermer</button></footer>',"sm");
  mroot.querySelector('footer [data-act="close-modal"]').focus();
}

/* ---------- Palette de commandes (Ctrl K) ---------- */
var P=null;
function closePalette(){if(!P)return;P=null;document.getElementById("palette-root").innerHTML="";if(lastFocusP&&document.contains(lastFocusP))lastFocusP.focus();}
var lastFocusP=null;
function paletteItems(q){
  var toks=norm(q).trim().split(/\s+/).filter(Boolean);
  function match(t){if(!toks.length)return true;t=norm(t);return toks.every(function(x){return t.indexOf(x)>=0;});}
  var out=[],dark=isDark();
  [
    {g:"Actions",label:"Nouvel événement",ic:"plus",kbd:"Ctrl N",kw:"ajouter creer agenda revision sport perso",run:function(){openEvent(null);}},
    {g:"Actions",label:"Nouveau rendez-vous client",ic:"users",kbd:"Ctrl Maj N",kw:"rdv client ajouter creer",run:function(){openRdv(null);}},
    {g:"Actions",label:"Nouveau client",ic:"users",kw:"ajouter fiche",run:function(){openClient(null);}},
    {g:"Actions",label:"Nouvelle tâche",ic:"checks",kw:"todo ajouter",run:function(){go("taches");setTimeout(function(){var i=document.getElementById("task-input");if(i)i.focus();},0);}},
    {g:"Actions",label:"Exporter le livre des recettes",ic:"download",kw:"csv comptabilite urssaf",run:function(){exportRecettes();}},
    {g:"Actions",label:"Ouvrir le dossier des factures",ic:"folder",kw:"pdf",run:function(){if(fileApi&&fileApi.openInvoices)fileApi.openInvoices();}},
    {g:"Actions",label:"Synchroniser l'emploi du temps",ic:"refresh",kw:"cours ecole ical",run:function(){syncCours(true);}},
    {g:"Actions",label:"Demander à Titan AI",ic:"sparkle",kbd:"Ctrl J",kw:"ia assistant question chat",run:function(){openTitan(null);}},
    {g:"Actions",label:"Parler à Titan (message vocal)",ic:"mic",kbd:"Ctrl Alt V",kw:"voix vocal micro dicter",run:function(){openTitan();setTimeout(function(){voiceStart("drawer");},200);}},
    {g:"Actions",label:"Exporter mon agenda (.ics)",ic:"calendar",kw:"google agenda telephone ical export",run:function(){exportIcs();}},
    {g:"Actions",label:"Vérifier les créneaux de conduite",ic:"car",kw:"permis sarool lecon reserver auto",run:function(){go("conduite");permisCycle(true);}},
    {g:"Actions",label:"Synchroniser les mails de cours",ic:"mail",kw:"gmail ecole profs",run:function(){go("cours");syncMail(true);}},
    {g:"Actions",label:"Notifications",ic:"bell",kw:"changements alertes",run:function(){toggleNotifPanel();}},
    {g:"Actions",label:"Règles de réservation de conduite",ic:"sliders",kw:"permis moniteur",run:function(){openRules();}},
    {g:"Actions",label:dark?"Passer en thème clair":"Passer en thème sombre",ic:dark?"sun":"moon",kw:"theme apparence couleur",run:function(){putSettings({theme:dark?"light":"dark"});}},
    {g:"Aller à",label:"Aujourd'hui",ic:"sun",run:function(){go("jour");}},{g:"Aller à",label:"Agenda",ic:"calendar",kw:"semaine mois planning",run:function(){go("agenda");}},
    {g:"Aller à",label:"Conduite",ic:"car",kw:"permis sarool lecons",run:function(){go("conduite");}},{g:"Aller à",label:"Cours (mails de l'école)",ic:"school",kw:"mails gmail profs ecole",run:function(){go("cours");}},
    {g:"Aller à",label:"Titan AI",ic:"sparkle",kw:"ia assistant",run:function(){go("titan");}},
    {g:"Aller à",label:"Clients",ic:"users",run:function(){go("clients");}},{g:"Aller à",label:"Tâches",ic:"checks",run:function(){go("taches");}},
    {g:"Aller à",label:"Finances",ic:"wallet",kw:"urssaf factures recettes argent",run:function(){go("finances");}},{g:"Aller à",label:"Réglages",ic:"sliders",kw:"siret profil",run:function(){go("reglages");}}
  ].forEach(function(a){if(match(a.label+" "+(a.kw||"")))out.push(a);});
  var n=0;Array.from(S.clients.values()).sort(function(a,b){return String(a.nom).localeCompare(String(b.nom),"fr");}).forEach(function(c){
    if(n>=6||!toks.length)return;if(match([c.nom,c.tel,c.adresse,c.email].join(" "))){n++;out.push({g:"Clients",label:c.nom,sub:c.tel||c.adresse||"",av:c.nom,run:function(){go("clients",{clientId:c.id,clientTab:"infos"});}});}});
  n=0;var tk=todayKey();rdvList().filter(function(r){return r.date>=keyOf(addDays(new Date(),-30));}).forEach(function(r){
    if(n>=6)return;if(!toks.length&&(r.date<tk||r.statut!=="prevu"||n>=3))return;
    if(match([rdvName(r),r.forfaitNom,relDay(r.date),fDM.format(parseKey(r.date))].join(" "))){n++;out.push({g:"Rendez-vous",label:rdvName(r),sub:relDay(r.date)+" à "+hm(r.heure)+", "+(r.forfaitNom||""),ic:"calendar",run:function(){openRdv(S.rdv.get(r.id));}});}});
  if(toks.length){n=0;eventList().forEach(function(e){if(n>=5||e.date<keyOf(addDays(new Date(),-7)))return;if(match(e.titre+" "+(e.lieu||"")+" "+evCat(e.cat)[1])){n++;out.push({g:"Événements",label:e.titre,sub:evWhen(e)+(e.lieu?", "+e.lieu:""),ic:"calendar",run:function(){openEvent(S.events.get(e.id));}});}});}
  if(toks.length&&S.mail&&S.mail.list&&S.mail.list.length){mailSearch({texte:q}).list.slice(0,5).forEach(function(r){var m=r.m;out.push({g:"Mails de cours",label:m.subject,sub:senderName(m.from)+", "+mailDateLabel(m.date)+((m.att||[]).length?" · "+m.att.map(function(a){return a.name;}).join(", "):""),ic:"mail",run:function(){go("cours",{mailSel:m.id});markMailRead(m.id);}});});}
  if(toks.length){n=0;S.cours.forEach(function(c){if(n>=4||c.date<tk)return;if(match(c.titre+" "+c.lieu+" cours")){n++;out.push({g:"Cours",label:c.titre,sub:relDay(c.date)+(c.heure?" à "+hm(c.heure):""),ic:"school",run:function(){openCours(c.uid);}});}});
    n=0;S.taches.forEach(function(t){if(n>=4)return;if(match(t.titre)){n++;out.push({g:"Tâches",label:t.titre,sub:t.fait?"Terminée":(t.echeance?"Pour le "+fDM.format(parseKey(t.echeance)):"Sans date"),ic:"checks",run:function(){go("taches");}});}});}
  return out;
}
function openPalette(){
  if(M)return;lastFocusP=document.activeElement;P={q:"",active:0,items:[]};
  document.getElementById("palette-root").innerHTML='<div class="pal-overlay" data-act="pal-overlay"><div class="palette" role="dialog" aria-modal="true" aria-label="Rechercher ou lancer une action">'+
    '<div class="pal-input">'+icon("search")+'<input type="text" id="pal-q" placeholder="Rechercher un client, un rendez-vous, une action…" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" autocomplete="off" spellcheck="false"><kbd>Échap</kbd></div>'+
    '<div class="pal-list" id="pal-list" role="listbox"></div><div class="pal-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> pour choisir</span><span><kbd>Entrée</kbd> pour ouvrir</span></div></div></div>';
  var inp=document.getElementById("pal-q");
  inp.addEventListener("input",function(){P.q=inp.value;P.active=0;drawPalette();});
  inp.addEventListener("keydown",function(e){
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();if(!P.items.length)return;P.active=(P.active+(e.key==="ArrowDown"?1:-1)+P.items.length)%P.items.length;drawPalette(true);}
    else if(e.key==="Enter"){e.preventDefault();runPalette(P.active);}
    else if(e.key==="Escape"){e.preventDefault();closePalette();}
    else if(e.key==="Tab"){e.preventDefault();}
  });
  drawPalette();inp.focus();
}
function drawPalette(keepScroll){
  if(!P)return;P.items=paletteItems(P.q);var list=document.getElementById("pal-list"),inp=document.getElementById("pal-q");
  if(!P.items.length){list.innerHTML='<div class="pal-empty">Rien ne correspond à « '+esc(P.q)+' ». Essaie un nom de client, un jour (« demain ») ou une action (« facture »).</div>';inp.removeAttribute("aria-activedescendant");return;}
  var h="",g=null;P.items.forEach(function(it,i){if(it.g!==g){g=it.g;h+='<div class="pal-group" role="presentation">'+esc(g)+'</div>';}
    h+='<button type="button" class="pal-item" role="option" id="pal-o'+i+'" data-pal="'+i+'" aria-selected="'+(i===P.active)+'" tabindex="-1">'+(it.av?avatar(it.av):'<span class="ico-box">'+icon(it.ic)+'</span>')+'<span class="grow"><b>'+esc(it.label)+'</b>'+(it.sub?'<small>'+esc(it.sub)+'</small>':'')+'</span>'+(it.kbd?'<kbd>'+esc(it.kbd)+'</kbd>':'')+'</button>';});
  list.innerHTML=h;inp.setAttribute("aria-activedescendant","pal-o"+P.active);
  var act=document.getElementById("pal-o"+P.active);if(act&&keepScroll)act.scrollIntoView({block:"nearest"});
}
function runPalette(i){if(!P)return;var it=P.items[i];if(!it)return;P=null;document.getElementById("palette-root").innerHTML="";it.run();}
document.getElementById("palette-root").addEventListener("click",function(e){
  var b=e.target.closest("[data-pal]");if(b){runPalette(Number(b.getAttribute("data-pal")));return;}
  if(e.target.getAttribute("data-act")==="pal-overlay")closePalette();});
document.getElementById("palette-root").addEventListener("mousemove",function(e){var b=e.target.closest("[data-pal]");if(b&&P){var i=Number(b.getAttribute("data-pal"));if(i!==P.active){P.active=i;Array.prototype.forEach.call(document.querySelectorAll(".pal-item"),function(x){x.setAttribute("aria-selected",x===b?"true":"false");});document.getElementById("pal-q").setAttribute("aria-activedescendant","pal-o"+i);}}});

/* ---------- Déplacer un rendez-vous ---------- */
function moveRdv(r,date,heure,silent){
  if(!r||(r.date===date&&r.heure===heure))return;var old=Object.assign({},r),x=Object.assign({},r,{date:date,heure:heure,updated:Date.now()});
  put("rdv",x);if(silent)return;var w=conflictText(x.date,x.heure,x.duree,x.id);
  toast((w?w+" ":"")+"Déplacé : "+relDay(x.date).toLowerCase()+" à "+hm(x.heure),{label:"Annuler",fn:function(){put("rdv",old);}});
}
var drag=null,suppressClick=false;
main.addEventListener("pointerdown",function(e){
  if(e.button!==0)return;var el=e.target.closest(".tg-ev[data-id],.tg-ev[data-eid]");if(!el)return;
  var r=el.hasAttribute("data-eid")?S.events.get(el.getAttribute("data-eid")):S.rdv.get(el.getAttribute("data-id"));if(!r)return;
  var rect=el.getBoundingClientRect();drag={el:el,r:r,isEv:el.hasAttribute("data-eid"),x0:e.clientX,y0:e.clientY,offY:e.clientY-rect.top,started:false,target:null};
});
function colAt(x){var cols=main.querySelectorAll(".tg-col");for(var i=0;i<cols.length;i++){var b=cols[i].getBoundingClientRect();if(x>=b.left&&x<b.right)return cols[i];}return null;}
document.addEventListener("pointermove",function(e){
  if(!drag)return;
  if(!drag.started){if(Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<6)return;drag.started=true;drag.el.classList.add("dragging");document.body.classList.add("is-dragging");}
  var col=colAt(e.clientX);if(!col||col.classList.contains("past"))return;
  var lo=Number(col.getAttribute("data-lo")),hiM=Number(col.getAttribute("data-hi")),rect=col.getBoundingClientRect(),d=Number(drag.r.duree)||60;
  var m=lo+Math.round((e.clientY-rect.top-drag.offY)/(GH/2))*15;m=Math.max(lo,Math.min(hiM-d,m));
  if(drag.el.parentNode!==col)col.appendChild(drag.el);
  drag.el.style.top=((m-lo)/30*GH+1)+"px";drag.el.style.left="3px";drag.el.style.width="calc(100% - 6px)";
  var tEl=drag.el.querySelector(".ev-time");if(tEl)tEl.textContent=hm(fromM(m));
  drag.target={date:col.getAttribute("data-date"),heure:fromM(m)};
});
document.addEventListener("pointerup",function(){
  if(!drag)return;var d=drag;drag=null;document.body.classList.remove("is-dragging");
  if(!d.started)return;suppressClick=true;setTimeout(function(){suppressClick=false;},250);
  if(d.target){if(d.isEv)moveEvent(d.r,d.target.date,d.target.heure);else moveRdv(d.r,d.target.date,d.target.heure);}else render();
});
var ghostRaf=0;
main.addEventListener("mousemove",function(e){if(drag&&drag.started)return;var col=e.target.closest&&e.target.closest(".tg-col");if(ghostRaf)cancelAnimationFrame(ghostRaf);
  ghostRaf=requestAnimationFrame(function(){Array.prototype.forEach.call(main.querySelectorAll(".tg-ghost"),function(g){if(!col||g.parentNode!==col)g.hidden=true;});
    if(!col||col.classList.contains("past")||e.target.closest(".tg-ev"))return;var g=col.querySelector(".tg-ghost"),sl=slotFromEvent(col,e);g.hidden=false;g.style.top=(sl.top+1)+"px";g.textContent="+ "+hm(fromM(sl.m));});});
main.addEventListener("mouseleave",function(){Array.prototype.forEach.call(main.querySelectorAll(".tg-ghost"),function(g){g.hidden=true;});});
function slotFromEvent(col,e){var rect=col.getBoundingClientRect(),lo=Number(col.getAttribute("data-lo")),m=lo+Math.floor(Math.max(0,e.clientY-rect.top)/GH)*30;return {m:m,top:(m-lo)/30*GH};}

/* ---------- Clics ---------- */
document.addEventListener("click",function(e){
  var t=e.target.closest("[data-act]");if(!t)return;
  if(suppressClick&&t.closest(".tg-ev,.tg-col")){suppressClick=false;return;}
  var a=t.getAttribute("data-act"),id=t.getAttribute("data-id"),r;
  if(a==="overlay"){if(e.target===t)closeModal();return;}
  switch(a){
    case "nav":go(t.getAttribute("data-view"));break;
    case "palette":openPalette();break;
    case "theme-toggle":putSettings({theme:isDark()?"light":"dark"});break;
    case "new-rdv":openRdv(null,{date:t.getAttribute("data-date")||null,heure:t.getAttribute("data-heure")||null,clientId:t.getAttribute("data-client")||null});break;
    case "edit-rdv":r=S.rdv.get(id);if(r)openRdv(r);break;
    case "set-fait":r=S.rdv.get(id);if(r){var x=Object.assign({},r,{statut:"fait",updated:Date.now()});put("rdv",x);toast("Marqué fait, reste à encaisser",{label:"Encaisser",fn:function(){openEncaisser(S.rdv.get(x.id));}});}break;
    case "encaisser":r=S.rdv.get(id);if(r)openEncaisser(r);break;
    case "save-then-encaisser":var saved=saveRdv();if(saved){var fr=S.rdv.get(saved.id);if(fr&&fr.statut==="fait")openEncaisser(fr);}break;
    case "enc-confirm":confirmEncaisser();break;
    case "copy-sms":r=S.rdv.get(id);if(r)copy(confirmMsg(r),"Message de confirmation copié");break;
    case "copy":copy(t.getAttribute("data-copy"));break;
    case "new-client":openClient(null,t.getAttribute("data-name")||"");break;
    case "edit-client":var c=S.clients.get(id);if(c)openClient(c);break;
    case "open-client":S.ui.clientId=id;S.ui.clientTab="infos";render();break;
    case "back-clients":S.ui.clientId=null;render();break;
    case "client-tab":S.ui.clientTab=t.getAttribute("data-tab");render();var tb=main.querySelector('[data-tab="'+S.ui.clientTab+'"]');if(tb)tb.focus();break;
    case "del-mat":var cm=S.clients.get(id);if(cm){var mid=t.getAttribute("data-mat"),gone=(cm.materiel||[]).filter(function(m){return m.id===mid;})[0];
      put("clients",Object.assign({},cm,{materiel:(cm.materiel||[]).filter(function(m){return m.id!==mid;})}));if(gone)toast("Appareil retiré",{label:"Annuler",fn:function(){var c2=S.clients.get(id);put("clients",Object.assign({},c2,{materiel:(c2.materiel||[]).concat([gone])}));}});}break;
    case "toggle-task":var tk=S.taches.get(id);if(tk)put("taches",Object.assign({},tk,{fait:!tk.fait,doneAt:tk.fait?null:Date.now()}));break;
    case "del-task":var td=S.taches.get(id);if(td){del("taches",id);toast("Tâche supprimée",{label:"Annuler",fn:function(){put("taches",td);}});}break;
    case "import-tasks":putMany("taches",LAUNCH_TASKS.map(function(p,i){return {id:uid(),titre:p[0],echeance:p[1],fait:false,created:Date.now()+i};}));toast(LAUNCH_TASKS.length+" étapes ajoutées");break;
    case "toggle-done":S.ui.showDone=!S.ui.showDone;render();break;
    case "goto-agenda":go("agenda",{anchor:t.getAttribute("data-date")||todayKey(),agendaMode:t.getAttribute("data-mode")||"semaine"});break;
    case "agenda-mode":S.ui.agendaMode=t.getAttribute("data-mode");render();break;
    case "agenda-nav":var dir=Number(t.getAttribute("data-dir")),an=parseKey(S.ui.anchor),md=S.ui.agendaMode;
      if(!dir)S.ui.anchor=todayKey();else if(md==="mois")S.ui.anchor=keyOf(new Date(an.getFullYear(),an.getMonth()+dir,1));else S.ui.anchor=keyOf(addDays(an,dir*(md==="jour"?1:7)));render();break;
    case "month-day":S.ui.anchor=t.getAttribute("data-date");S.ui.agendaMode="jour";render();break;
    case "grid-slot":if(t.classList.contains("past"))break;var sl=slotFromEvent(t,e);openEvent(null,{date:t.getAttribute("data-date"),heure:fromM(sl.m)});break;
    case "set-fx":putSettings({effets:t.getAttribute("data-fx")});break;
    case "show-cours":openCours(t.getAttribute("data-uid"));break;
    case "fin-month":var dir2=Number(t.getAttribute("data-dir")),cur=S.ui.finMonth,nx;
      nx=monthKey(new Date(+cur.slice(0,4),+cur.slice(5,7)-1+(dir2>0?(FIRST_A&&cur===FIRST_A?3:1):-1),1));
      if(FIRST_A&&nx>FIRST_A&&nx<=FIRST_B)nx=FIRST_A;S.ui.finMonth=nx;render();break;
    case "fin-year":S.ui.finYear=Number(t.getAttribute("data-year"));render();break;
    case "export-recettes":exportRecettes(S.ui.finYear);break;
    case "open-invoices":if(fileApi&&fileApi.openInvoices)fileApi.openInvoices();else toast("Disponible dans l'application.");break;
    case "open-invoice":var fi=S.factures.get(id);if(fi)generatePdf(fi,true).then(function(p){if(p)fileApi.openPath(p);});break;
    case "make-invoice":r=S.rdv.get(id);if(r&&!r.factureId){var nf=createInvoice(r);S.factures.set(nf.id,nf);S.rdv.set(r.id,Object.assign({},r,{factureId:nf.id}));render();persist();
      generatePdf(nf,true,true).then(function(p){toast("Facture "+nf.numero+" créée",p?{label:"Ouvrir",fn:function(){fileApi.openPath(p);}}:null);});}break;
    default:if(ACTS[a])ACTS[a](t,e);break;
    case "sync-cours":syncCours(true);break;
    case "sarool-login":if(fileApi&&fileApi.saroolLogin)fileApi.saroolLogin().then(function(ok){if(ok){putSettings({saroolOn:true});S.sarool.err=null;S.sarool.loginWarned=false;syncPermis(true);setTimeout(function(){permisCycle(true);},1500);}else toast("Connexion à Sarool non terminée.");});else toast("Disponible dans l'application.");break;
    case "sarool-sync":syncPermis(true);break;
    case "sarool-logout":fileApi.saroolLogout().then(function(){permis=[];S.permisAt=null;S.sarool.weeks=[];S.sarool.at=null;S.sarool.proposals=[];saveSaroolCache();try{localStorage.removeItem("carnet-permis");}catch(e){}putSettings({saroolOn:false,autoOn:false});toast("Déconnecté de Sarool");});break;
    case "set-theme":putSettings({theme:t.getAttribute("data-theme")});break;
    case "export-backup":if(fileApi){flush();fileApi.exportBackup(JSON.stringify(snapshotData(),null,2)).then(function(p){if(p)toast("Sauvegarde exportée");});}break;
    case "import-backup":if(fileApi)fileApi.importBackup().then(function(txt){if(!txt)return;var j;try{j=JSON.parse(txt);}catch(err){toast("Ce fichier n'est pas une sauvegarde du carnet.");return;}
      if(!j||!Array.isArray(j.rdv)){toast("Ce fichier n'est pas une sauvegarde du carnet.");return;}
      S.ui.restoreAsk={data:j,info:(j.clients||[]).length+" clients, "+(j.rdv||[]).length+" rendez-vous, "+(j.taches||[]).length+" tâches, "+(j.factures||[]).length+" factures."};render();});break;
    case "restore-ok":if(S.ui.restoreAsk){applyData(S.ui.restoreAsk.data);S.error=null;S.ui.restoreAsk=null;S.ui.clientId=null;applyTheme();render();persist();toast("Sauvegarde restaurée");}break;
    case "restore-cancel":S.ui.restoreAsk=null;render();break;
    case "open-folder":if(fileApi)fileApi.openFolder();break;
    case "copy-backup":copy(JSON.stringify(snapshotData(),null,2),"Sauvegarde copiée : colle-la dans un fichier texte.");break;
    case "close-modal":closeModal();break;
    case "discard-ok":closeModal(true);break;
    case "discard-cancel":restoreFooter();break;
    case "save-rdv":saveRdv();break;
    case "save-client":saveClient();break;
    case "copy-msg":if(M&&M.type==="rdv")copy(confirmMsg(readRdvForm()),"Message copié");break;
    case "pick-date":document.getElementById("f-date").value=t.getAttribute("data-date");M.dirty=true;setErr("f-date","");drawRdvHelpers();break;
    case "pick-time":document.getElementById("f-heure").value=t.getAttribute("data-time");M.dirty=true;setErr("f-heure","");drawRdvHelpers();break;
    case "shift":var fd=document.getElementById("f-date"),fh=document.getElementById("f-heure");
      if(t.getAttribute("data-day"))fd.value=keyOf(addDays(parseKey(fd.value||todayKey()),Number(t.getAttribute("data-day"))));
      if(t.getAttribute("data-min"))fh.value=fromM(toMin(fh.value||"10:00")+Number(t.getAttribute("data-min")));M.dirty=true;drawRdvHelpers();break;
    case "del-rdv":askDelete("rdv");break;
    case "del-client":askDelete("client");break;
    case "del-cancel":var z=document.getElementById("del-zone");if(z)z.innerHTML='<button class="btn danger" type="button" data-act="'+(M&&M.type==="client"?"del-client":"del-rdv")+'">'+icon("trash")+'Supprimer</button>';break;
    case "del-rdv-ok":if(M&&M.type==="rdv"){var gr=S.rdv.get(M.r.id);closeModal(true);if(gr){del("rdv",gr.id);toast("Rendez-vous supprimé",{label:"Annuler",fn:function(){put("rdv",gr);}});}}break;
    case "notif-test":pushNotif({cat:"cours",type:"modifie",title:"Notification de test",body:"Les alertes du carnet fonctionnent.",force:true});break;
    case "groq-save":var gk=document.getElementById("set-groq");if(gk&&gk.value.trim()&&fileApi&&fileApi.aiSetKey){var kv=gk.value.trim();if(!/^(gsk_|AIza|AQ.|csk-)/.test(kv)){toast("Clé non reconnue : Groq commence par gsk_, Gemini par AIza ou AQ., Cerebras par csk-.");break;}fileApi.aiSetKey(kv).then(function(ok){toast(ok?"Clé "+provOf(kv)+" enregistrée":"Impossible d'enregistrer la clé.");gk.value="";loadKeyInfo();});}else toast("Colle d'abord une clé.");break;
    case "ai-key-del":var pid=t.getAttribute("data-pid");if(fileApi&&fileApi.aiSetKey)fileApi.aiSetKey("",pid).then(function(){toast("Clé supprimée");loadKeyInfo();});break;
    case "groq-reset":if(fileApi&&fileApi.aiSetKey)fileApi.aiSetKey("").then(function(){toast("Clé supprimée : Titan et les messages vocaux sont désactivés");loadKeyInfo();});break;
    case "goto-mail":go("cours",{mailSel:id});markMailRead(id);renderChrome();break;
    case "del-client-ok":if(M&&M.type==="client"){var gc=S.clients.get(M.c.id);closeModal(true);if(gc){if(S.ui.clientId===gc.id)S.ui.clientId=null;del("clients",gc.id);toast("Client supprimé",{label:"Annuler",fn:function(){put("clients",gc);}});}}break;
  }
});

/* ---------- Clavier ---------- */
document.addEventListener("keydown",function(e){
  if(P)return;
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&/^j$/i.test(e.key)&&!M){e.preventDefault();if(S.ui.view==="titan"){var ti=document.getElementById("titan-in");if(ti)ti.focus();}else if(S.titan.open)closeTitan();else openTitan();return;}
  if(!M&&e.key==="Escape"){if(S.ui.notifOpen){e.preventDefault();closeNotifPanel();return;}if(S.titan.open){e.preventDefault();closeTitan();return;}}
  if(M){
    if(e.key==="Escape"){e.preventDefault();if(M.footerHTML)restoreFooter();else closeModal();}
    else if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();if(M.type==="rdv")saveRdv();else if(M.type==="client")saveClient();else if(M.type==="enc")confirmEncaisser();else if(M.type==="event")saveEvent();else if(M.type==="rules")saveRules();else if(M.type==="mail-acc")connectMail();else closeModal();}
    else if(e.key==="Tab"){var sh=mroot.querySelector(".sheet");if(sh){var f=Array.prototype.filter.call(sh.querySelectorAll('button:not([disabled]),input:not([disabled]),select,textarea,a[href],[tabindex]:not([tabindex="-1"])'),function(x){return x.offsetParent!==null&&!(x.type==="radio"&&!x.checked&&x.name&&sh.querySelector('input[name="'+x.name+'"]:checked'));});
      if(f.length){var first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}else if(!sh.contains(document.activeElement)){e.preventDefault();first.focus();}}}}
    return;
  }
  var tg=e.target,typing=tg&&(tg.tagName==="INPUT"||tg.tagName==="TEXTAREA"||tg.tagName==="SELECT"||tg.isContentEditable);
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&/^(k|f)$/i.test(e.key)){e.preventDefault();openPalette();return;}
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&/^n$/i.test(e.key)){e.preventDefault();if(e.shiftKey)openRdv(null);else openEvent(null);return;}
  if(e.altKey&&tg&&tg.classList&&tg.classList.contains("tg-ev")&&tg.getAttribute("data-eid")&&/^Arrow/.test(e.key)){
    e.preventDefault();var ev=S.events.get(tg.getAttribute("data-eid"));if(!ev)return;var d0=ev.date,h0=ev.heure;
    if(e.key==="ArrowUp")h0=fromM(toMin(h0)-15);if(e.key==="ArrowDown")h0=fromM(toMin(h0)+15);if(e.key==="ArrowLeft")d0=keyOf(addDays(parseKey(d0),-1));if(e.key==="ArrowRight")d0=keyOf(addDays(parseKey(d0),1));
    moveEvent(ev,d0,h0);var ag=main.querySelector('.tg-ev[data-eid="'+ev.id+'"]');if(ag)ag.focus();return;}
  if(e.altKey&&tg&&tg.classList&&tg.classList.contains("tg-ev")&&tg.getAttribute("data-id")&&/^Arrow/.test(e.key)){
    e.preventDefault();var r=S.rdv.get(tg.getAttribute("data-id"));if(!r)return;var d=r.date,h=r.heure;
    if(e.key==="ArrowUp")h=fromM(toMin(h)-15);if(e.key==="ArrowDown")h=fromM(toMin(h)+15);if(e.key==="ArrowLeft")d=keyOf(addDays(parseKey(d),-1));if(e.key==="ArrowRight")d=keyOf(addDays(parseKey(d),1));
    moveRdv(r,d,h);var again=main.querySelector('.tg-ev[data-id="'+r.id+'"]');if(again)again.focus();return;}
  if(!typing&&(e.key==="Enter"||e.key===" ")&&tg&&tg.getAttribute&&tg.getAttribute("role")==="button"&&tg.hasAttribute("data-act")){e.preventDefault();tg.click();}
});

/* ---------- Formulaires ---------- */
document.addEventListener("submit",function(e){
  if(e.target.id==="quick-titan-form"){e.preventDefault();ACTS["titan-quick"]();return;}
  if(e.target.id==="task-form"){e.preventDefault();var v=S.ui.taskDraft.trim();if(!v){var ti=document.getElementById("task-input");if(ti)ti.focus();return;}
    put("taches",{id:uid(),titre:v,echeance:S.ui.taskDate||"",fait:false,created:Date.now()});S.ui.taskDraft="";S.ui.taskDate="";render();var i=document.getElementById("task-input");if(i)i.focus();}
  else if(e.target.id==="mat-form"){e.preventDefault();var c=S.clients.get(e.target.getAttribute("data-id"));if(!c)return;
    var type=document.getElementById("mat-type").value,mod=document.getElementById("mat-modele").value.trim(),note=document.getElementById("mat-note").value.trim();
    if(!mod&&type==="Autre"){document.getElementById("mat-modele").focus();return;}
    put("clients",Object.assign({},c,{materiel:(c.materiel||[]).concat([{id:uid(),type:type,modele:mod,note:note}])}));toast("Appareil ajouté");var mm=document.getElementById("mat-modele");if(mm)mm.focus();}
});
document.addEventListener("input",function(e){
  var id=e.target.id;
  if(id==="client-search"){S.ui.q=e.target.value;render();}
  else if(id==="mail-search"){S.mail.q=e.target.value;render();}
  else if(id==="task-input")S.ui.taskDraft=e.target.value;
  else if(id==="task-date")S.ui.taskDate=e.target.value;
});
var SETTING_FIELDS={"set-proNom":"proNom","set-siret":"siret","set-proAdresse":"proAdresse","set-proTel":"proTel","set-proEmail":"proEmail","set-sapNumero":"sapNumero","set-sapDate":"sapDate","set-mentionTva":"mentionTva","set-mentionPlus":"mentionPlus","set-prenom":"prenom"};
var mailResyncT=null;
function afterSetting(k,v){
  if(k==="autoOn"){if(v){toast(S.settings.saroolOn?"Réservation automatique activée : vérification des créneaux…":"Connecte d'abord ton compte Sarool.");if(S.settings.saroolOn)permisCycle(false);}else{S.sarool.proposals=[];toast("Réservation automatique désactivée");}}
  else if(k==="background"||k==="autostart")applyPrefs();
  else if(/^mail(Senders|Domains|Days)$/.test(k)&&S.mail.account){clearTimeout(mailResyncT);mailResyncT=setTimeout(function(){syncMail(true);},600);}
}
function applyPrefs(){if(fileApi&&fileApi.setPrefs)fileApi.setPrefs({background:!!S.settings.background,autostart:!!S.settings.autostart});}
function provOf(k){return /^(AIza|AQ.)/.test(k)?"Gemini":/^csk-/.test(k)?"Cerebras":"Groq";}
function loadKeyInfo(){if(fileApi&&fileApi.aiKeyInfo)fileApi.aiKeyInfo().then(function(k){S.titanKey=k;if(S.ui.view==="reglages")render();});}
document.addEventListener("change",function(e){
  var dsk=e.target.getAttribute&&e.target.getAttribute("data-set");
  if(dsk){var ty=e.target.getAttribute("data-type")||"str",val=ty==="bool"?!!e.target.checked:ty==="num"?Number(e.target.value):ty==="lines"?listOf(e.target.value).join(String.fromCharCode(10)):String(e.target.value).trim();
    var pp={};pp[dsk]=val;putSettings(pp);afterSetting(dsk,val);return;}
  var id=e.target.id,p={};
  if(SETTING_FIELDS[id]){p[SETTING_FIELDS[id]]=e.target.value.trim();putSettings(p);if(id==="set-siret"&&e.target.value.replace(/\s/g,"").length&&e.target.value.replace(/\s/g,"").length!==14)toast("Un SIRET compte 14 chiffres : vérifie le numéro.");}
  else if(id==="set-rappel"){putSettings({rappel:Number(e.target.value)});if(Number(e.target.value)&&typeof Notification!=="undefined"&&Notification.permission==="default")Notification.requestPermission();}
  else if(id==="set-acre")putSettings({acre:e.target.checked});
  else if(id==="set-nova")putSettings({nova:e.target.checked});
  else if(id==="set-taux")putSettings({taux:Number(e.target.value)});
  else if(id==="set-ical"){putSettings({icalUrl:e.target.value.trim()});syncCours(true);}
  else if(id==="task-date")S.ui.taskDate=e.target.value;
  else if(M&&M.type==="rdv"&&(e.target.name==="statut"||e.target.name==="forfait"||/^f-/.test(id)))drawRdvHelpers();
});

/* ---------- Horloge : compte à rebours, rappels, changement de jour ---------- */
var dayStamp=todayKey();
setInterval(function(){
  if(todayKey()!==dayStamp){dayStamp=todayKey();if(!M&&!P)render();}
  Array.prototype.forEach.call(document.querySelectorAll("[data-cd-start]"),function(el){var cd=evCountdown(Number(el.getAttribute("data-cd-start")),Number(el.getAttribute("data-cd-end")));el.textContent=cd.text;el.classList.toggle("live",!!cd.live);});
  Array.prototype.forEach.call(document.querySelectorAll("[data-countdown]"),function(el){var r=S.rdv.get(el.getAttribute("data-countdown"));if(!r)return;var cd=countdown(r);el.textContent=cd.text;el.classList.toggle("live",!!cd.live);});
  checkReminders();checkBrief();
},30000);
var modulesStarted=false;
function initModules(){
  if(modulesStarted)return;modulesStarted=true;
  applyPrefs();loadKeyInfo();loadInvoiceFiles();
  if(typeof initConduite==="function")initConduite();
  if(typeof initMail==="function")initMail();
  if(!S.settings.saroolOn)splashSet("sarool","off","Non connecté");
  else syncPermis(false).then(function(r){if(r&&r.ok)splashSet("sarool","ok",permisList().filter(function(p){return p.date>=todayKey();}).length+" leçons à venir");else if(r&&r.error==="login")splashSet("sarool","warn","Reconnexion nécessaire");else splashSet("sarool",permis.length?"warn":"err",permis.length?"Hors ligne : dernière version affichée":"Injoignable");});
  if(fileApi&&fileApi.aiPing)fileApi.aiPing().then(function(r){splashSet("titan",r&&r.ok?"ok":"err",r&&r.ok?"Prêt":r&&r.error==="key"?"Clé refusée":"Hors ligne");},function(){splashSet("titan","err","Hors ligne");});
  else splashSet("titan","off","Indisponible");
  initUpdates();
  maybeOnboard();
  initGlass();
  if(fileApi&&fileApi.onCommand)fileApi.onCommand(function(c){if(c==="permis-check")permisCycle(true);else if(c==="mail-sync")syncMail(true);else if(c==="titan-open")openTitan();else if(c==="titan-voice"){openTitan();setTimeout(function(){voiceStart(S.ui.view==="titan"?"page":"drawer");},250);}});
}
/* Verre liquide : reflet qui suit la souris sur les surfaces vitrées */
/* Reflet de verre : la tache lumineuse suit la souris par transform (aucun repeint) */
function initGlass(){
  var raf=0,last=null,lit=null,SEL=".card,.side-col>section,.hero-empty,.mail-read,.t-card";
  document.addEventListener("pointermove",function(e){last=e;if(raf)return;raf=requestAnimationFrame(function(){raf=0;
    if(document.documentElement.getAttribute("data-fx")!=="complet"||!last){if(lit){lit.classList.remove("lit");lit=null;}return;}
    var el=last.target&&last.target.closest?last.target.closest(SEL):null;
    if(el!==lit){if(lit)lit.classList.remove("lit");lit=el;if(el)el.classList.add("lit");}
    if(!el)return;var r=el.getBoundingClientRect();el.style.setProperty("--sx",Math.round(last.clientX-r.left)+"px");el.style.setProperty("--sy",Math.round(last.clientY-r.top)+"px");});},{passive:true});
  document.addEventListener("pointerleave",function(){if(lit){lit.classList.remove("lit");lit=null;}});
  document.addEventListener("visibilitychange",function(){document.body.classList.toggle("paused",document.hidden);});
}
/* Après l'écran de chargement : si l'ordinateur peine (moins de 40 images/s), on allège les effets une fois pour toutes */
function afterSplash(){
  setTimeout(checkBrief,2500);
  if(S.settings.fxAuto||S.settings.effets!=="complet")return;
  setTimeout(function(){if(document.hidden)return;var n=0,t0=performance.now();
    (function f(t){n++;if(t-t0<1500)requestAnimationFrame(f);else{var fps=n*1000/(t-t0);putSettings({fxAuto:true});
      if(fps<40){putSettings({effets:"leger"});toast("Effets visuels allégés pour garder l'appli fluide sur ce PC",{label:"Garder complet",fn:function(){putSettings({effets:"complet"});}});}}})(t0);},1800);
}
/* Brief du matin : un résumé de la journée à l'heure choisie */
function briefLines(k){
  var it=coursOn(k).slice().sort(function(a,b){return toMin(a.heure)-toMin(b.heure);}),c=it.filter(function(x){return x.kind!=="permis";}),p=it.filter(function(x){return x.kind==="permis";}),ev=eventsOn(k),out=[];
  if(c.length)out.push(["school",c.length+" cours, de "+hm(c[0].heure)+" à "+hm(fromM(toMin(c[c.length-1].heure)+c[c.length-1].duree))+" ("+c.map(function(x){return x.titre;}).filter(function(v,i,a){return a.indexOf(v)===i;}).slice(0,3).join(", ")+")"]);
  p.forEach(function(x){out.push(["car","Conduite à "+hm(x.heure)+(x.moniteur?" avec "+x.moniteur:"")+(x.rdv?", RDV "+x.rdv:"")]);});
  ev.forEach(function(e){out.push(["calendar",(e.allDay?"Toute la journée":hm(e.heure))+" : "+e.titre+(e.lieu?" ("+e.lieu+")":"")]);});
  S.rdv.forEach(function(r){if(r.date===k&&r.statut!=="annule")out.push(["users",hm(r.heure)+" : rendez-vous avec "+rdvName(r)]);});
  var due=Array.from(S.taches.values()).filter(function(t){return !t.fait&&t.echeance&&t.echeance<=k;});
  if(due.length)out.push(["checks",due.length+" tâche"+(due.length>1?"s":"")+" à rendre : "+due.slice(0,3).map(function(t){return t.titre;}).join(", ")]);
  var mu=typeof mailUnreadCount==="function"?mailUnreadCount():0;if(mu)out.push(["mail",mu+" mail"+(mu>1?"s":"")+" de l'école non lu"+(mu>1?"s":"")]);
  return out;
}
function checkBrief(){
  if(!S.ready||!S.settings.briefOn||typeof Notification==="undefined")return;
  var now=new Date(),k=todayKey(),at=toMin(S.settings.briefHeure||"07:30"),cur=now.getHours()*60+now.getMinutes(),done="";
  try{done=localStorage.getItem("carnet-brief")||"";}catch(e){}
  if(done===k||cur<at||cur>at+180)return;
  try{localStorage.setItem("carnet-brief",k);}catch(e){}
  var l=briefLines(k);
  try{var n=new Notification(l.length?"Ta journée : "+l.length+" chose"+(l.length>1?"s":"")+" à retenir":"Journée libre aujourd'hui",{body:l.length?l.slice(0,4).map(function(x){return x[1];}).join("\n"):"Rien de prévu : profites-en."});n.onclick=function(){if(fileApi&&fileApi.focus)fileApi.focus();go("jour");};}catch(e){}
}
/* Export de l'agenda en .ics (Google Agenda, téléphone…) */
function icsEsc(v){return String(v||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");}
function icsDT(k,h){return k.replace(/-/g,"")+(h?"T"+h.replace(":","")+"00":"");}
function exportIcs(){
  var L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Mon Carnet//FR","CALSCALE:GREGORIAN","X-WR-CALNAME:Mon Carnet"],stamp=new Date().toISOString().replace(/[-:]/g,"").slice(0,15)+"Z",from=keyOf(addDays(new Date(),-30));
  function add(uidv,k,h,d,titre,lieu,desc,allDay){if(k<from)return;L.push("BEGIN:VEVENT","UID:"+uidv+"@mon-carnet","DTSTAMP:"+stamp);
    if(allDay)L.push("DTSTART;VALUE=DATE:"+icsDT(k),"DTEND;VALUE=DATE:"+icsDT(keyOf(addDays(parseKey(k),1))));else L.push("DTSTART:"+icsDT(k,h),"DTEND:"+icsDT(k,fromM(Math.min(toMin(h)+d,23*60+59))));
    L.push("SUMMARY:"+icsEsc(titre));if(lieu)L.push("LOCATION:"+icsEsc(lieu));if(desc)L.push("DESCRIPTION:"+icsEsc(desc));L.push("END:VEVENT");}
  S.events.forEach(function(e){add("ev-"+e.id,e.date,e.heure,Number(e.duree)||60,e.titre,e.lieu,e.note,e.allDay);});
  S.cours.forEach(function(c){if(!c.allDay)add("cours-"+c.uid,c.date,c.heure,c.duree,c.titre,c.lieu,c.desc,false);});
  permisAll().forEach(function(p){add("permis-"+p.date+p.heure,p.date,p.heure,p.duree,"Leçon de conduite"+(p.moniteur?" ("+p.moniteur+")":""),p.rdv,"",false);});
  S.rdv.forEach(function(r){if(r.statut!=="annule")add("rdv-"+r.id,r.date,r.heure,Number(r.duree)||60,"RDV "+rdvName(r)+" · "+(r.forfaitNom||""),rdvAddr(r),r.note,false);});
  L.push("END:VCALENDAR");var txt=L.join("\r\n");
  if(fileApi&&fileApi.saveText)fileApi.saveText("carnet-agenda.ics",txt).then(function(p){if(p)toast("Agenda exporté : importe le fichier dans Google Agenda ou sur ton téléphone");});else copy(txt,"Agenda copié");
}
ACTS["export-ics"]=function(){exportIcs();};
ACTS["voice-quick"]=function(){openTitan();setTimeout(function(){voiceStart("drawer");},200);};
ACTS["brief-test"]=function(){try{localStorage.removeItem("carnet-brief");}catch(e){}var h=S.settings.briefHeure;S.settings.briefHeure=fromM(Math.max(0,new Date().getHours()*60+new Date().getMinutes()-1));checkBrief();S.settings.briefHeure=h;};document.getElementById("skip").addEventListener("click",function(e){e.preventDefault();var h=main.querySelector("h1")||main;h.focus();});
init();
setTimeout(checkReminders,4000);

/* Mises à jour : état affiché au chargement, dans les réglages, avec progression et journal */
var UPD={state:"idle"},UPDJ={lines:null,at:0};
function updPct(u){return Math.round((Number(u.progress)||0)*100);}
function updText(u){u=u||UPD;switch(u.state){
  case "checking":return "Recherche d'une nouvelle version…";
  case "uptodate":return "À jour (version "+u.current+")";
  case "downloading":return "Version "+u.latest+" trouvée : téléchargement "+updPct(u)+" %"+(u.size?" de "+Math.round(u.size/1048576)+" Mo":"");
  case "ready":return "Version "+u.latest+" téléchargée et vérifiée : redémarre le carnet pour l'installer (pas l'ordinateur)";
  case "installing":return "Installation de la version "+u.latest+" : le carnet se ferme et se rouvre tout seul…";
  case "error":return "Problème : "+(u.error||"impossible de vérifier (hors ligne ?)");
  case "dev":return "Version de développement";
  default:return "Pas encore vérifié";}}
function updSplash(u){var m={checking:"run",uptodate:"ok",downloading:"run",ready:"ok",installing:"ok",error:"warn",dev:"off"};
  if(!m[u.state])return;if(u.state==="downloading"&&u.progress<1)m.downloading="ok";
  splashSet("maj",m[u.state],u.state==="uptodate"?"À jour, version "+u.current:u.state==="downloading"?"Version "+u.latest+" : téléchargement en arrière-plan":u.state==="ready"?"Version "+u.latest+" prête":updText(u));}
function updRestartBtn(){return {label:"Redémarrer le carnet",fn:function(){ACTS["upd-apply"]();}};}
function onUpd(u){var was=UPD.state;UPD=u||UPD;updSplash(UPD);
  if(UPD.justUpdated&&!UPD.shown){UPD.shown=true;var ju=UPD.justUpdated;setTimeout(function(){toast("Carnet mis à jour : "+ju.from+" → "+ju.to+" ✓");},1500);}
  if(UPD.state==="ready"&&was!=="ready")toast("Version "+UPD.latest+" prête à installer.",updRestartBtn());
  if(S.ui&&S.ui.view==="reglages"){
    /* pendant le téléchargement : on met juste la barre à jour, sans tout redessiner */
    var bar=document.getElementById("upd-bar"),st=document.getElementById("upd-st");
    if(UPD.state==="downloading"&&was==="downloading"&&bar&&st){bar.style.width=updPct(UPD)+"%";st.textContent=updText();return;}
    UPDJ.at=0;render();}}
function initUpdates(){
  if(!fileApi||!fileApi.updateCheck){splashSet("maj","off","Indisponible");return;}
  if(fileApi.onUpdate)fileApi.onUpdate(onUpd);
  (fileApi.updateState?fileApi.updateState():Promise.resolve(null)).then(function(s){if(s&&s.justUpdated)onUpd(Object.assign({},UPD,{justUpdated:s.justUpdated}));});
  fileApi.updateCheck().then(onUpd,function(){onUpd({state:"error"});});}
function loadJournal(){if(!fileApi||!fileApi.updateJournal||Date.now()-UPDJ.at<5000)return;UPDJ.at=Date.now();
  fileApi.updateJournal().then(function(l){var ch=JSON.stringify(l)!==JSON.stringify(UPDJ.lines);UPDJ.lines=l||[];if(ch&&S.ui.view==="reglages")render();});}
function updSection(){
  if(!fileApi||!fileApi.updateCheck)return "";var busy=UPD.state==="checking"||UPD.state==="downloading"||UPD.state==="installing";
  loadJournal();
  var steps=[["Recherche",["checking","downloading","ready","installing"]],["Téléchargement",["downloading","ready","installing"]],["Vérification",["ready","installing"]],["Installation",["installing"]]];
  var h='<section class="set-section" aria-labelledby="s-maj"><h2 class="sec" id="s-maj">Mises à jour</h2><p class="hint">Version installée : <b>'+esc(UPD.current||"?")+'</b>. Le carnet cherche une nouvelle version à chaque lancement et toutes les 6 heures. Pour installer, seul le carnet redémarre, pas l\'ordinateur.</p>';
  if(UPD.state!=="idle"&&UPD.state!=="uptodate"&&UPD.state!=="dev")h+='<ol class="upd-steps">'+steps.map(function(s){var on=s[1].indexOf(UPD.state)>=0,cur=(s[0]==="Recherche"&&UPD.state==="checking")||(s[0]==="Téléchargement"&&UPD.state==="downloading")||(s[0]==="Installation"&&UPD.state==="installing");return '<li class="'+(cur?"cur":on?"done":"")+'">'+(on&&!cur?icon("check"):'')+esc(s[0])+'</li>';}).join("")+'</ol>';
  if(UPD.state==="downloading")h+='<div class="meter upd-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+updPct(UPD)+'" aria-label="Téléchargement"><i id="upd-bar" style="width:'+updPct(UPD)+'%"></i></div>';
  h+='<div class="row"><button class="btn'+(UPD.state==="ready"?"":" primary")+'" type="button" data-act="upd-check"'+(busy?" disabled":"")+'>'+(busy?'<span class="spin"></span>':icon("refresh"))+'Vérifier les mises à jour</button>'+
    (UPD.state==="ready"?'<button class="btn primary" type="button" data-act="upd-apply">'+icon("refresh")+'Redémarrer le carnet et installer</button>':'')+
    '<span id="upd-st" class="'+(UPD.state==="error"?"field-error":"hint")+'" role="status">'+esc(updText())+'</span></div>';
  var L=UPDJ.lines||[];
  h+='<details class="upd-log"'+(UPD.state==="error"?" open":"")+'><summary>Journal des mises à jour ('+L.length+')</summary>'+(L.length?'<ul>'+L.slice(0,15).map(function(l){var m=/^(\d{4})-(\d\d)-(\d\d) (\d\d:\d\d):\d\d (.*)$/.exec(l);return '<li'+(/Échec|Impossible|pas abouti/.test(l)?' class="bad"':/réussie|démarré en version/.test(l)?' class="good"':'')+'>'+(m?'<time>'+m[3]+'/'+m[2]+' '+m[4]+'</time>'+esc(m[5]):esc(l))+'</li>';}).join("")+'</ul>':'<p class="hint">Rien pour l\'instant.</p>')+'</details></section>';
  return h;}
ACTS["upd-check"]=function(){UPD.state="checking";render();fileApi.updateCheck().then(function(u){onUpd(u);if(u.state==="uptodate")toast("Le carnet est à jour (version "+u.current+")");},function(){onUpd({state:"error"});});};
ACTS["upd-apply"]=function(){if(!fileApi||!fileApi.updateApply)return;UPD.state="installing";if(S.ui.view==="reglages")render();toast("Installation : le carnet va se fermer et se rouvrir tout seul…");
  setTimeout(function(){fileApi.updateApply().then(function(ok){if(ok===false){UPD.state="error";UPD.error="fichier de mise à jour introuvable, relance la vérification";render();}});},700);};
