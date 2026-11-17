"use strict";
/* Mon Carnet : événements perso (révisions, sport, rendez-vous perso, examens…).
   Modifiables à la main ou par Titan AI, glissables dans l'agenda, répétables chaque semaine. */

function normTime(v){var m=/^(\d{1,2})(?:\s*[:hH.]\s*(\d{2})?)?\s*$/.exec(String(v==null?"":v).trim());if(!m)return null;var h=+m[1],mi=+(m[2]||0);if(h>23||mi>59)return null;return pad(h)+":"+pad(mi);}
function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(String(d||""))&&!isNaN(parseKey(d).getTime())&&keyOf(parseKey(d))===d;}
function evWhen(e){return cap(fShort.format(parseKey(e.date)).replace(/\./g,""))+(e.allDay?", toute la journée":" "+hm(e.heure)+"–"+hm(evEnd(e)));}
function nextHalfHour(){var n=new Date(),m=n.getHours()*60+n.getMinutes();m=Math.ceil((m+15)/30)*30;return fromM(Math.min(m,22*60));}
/* Ce qui chevauche un événement (cours, conduite, rendez-vous, autres événements) */
function eventConflicts(e){
  if(e.allDay)return [];var a=toMin(e.heure),b=a+(Number(e.duree)||60),out=[];
  busyOn(e.date,e.id).forEach(function(x){if(a<x.b&&x.a<b){
    if(x.c)out.push((x.c.kind==="permis"?"Leçon de conduite ":"Cours « "+x.c.titre+" » ")+hm(x.c.heure)+"–"+hm(fromM(x.b)));
    else if(x.e)out.push("« "+x.e.titre+" » "+hm(x.e.heure)+"–"+hm(fromM(x.b)));
    else if(x.r)out.push("Rendez-vous avec "+rdvName(x.r)+" à "+hm(x.r.heure));}});
  return out;
}
/* Création d'un événement (ou d'une série hebdomadaire) : utilisé par la fenêtre et par Titan */
function buildEvents(o){
  var n=Math.max(0,Math.min(26,Number(o.repeat)||0)),serie=n?uid():null,out=[];
  for(var i=0;i<=n;i++){out.push({id:uid(),titre:String(o.titre||"").trim().slice(0,120),date:keyOf(addDays(parseKey(o.date),7*i)),heure:o.allDay?"":o.heure,duree:o.allDay?0:Math.max(5,Number(o.duree)||60),
    allDay:!!o.allDay,lieu:String(o.lieu||"").trim().slice(0,160),note:String(o.note||"").trim().slice(0,2000),cat:evCat(o.cat)[0],serie:serie,source:o.source||"manuel",created:Date.now()});}
  return out;
}

function openEvent(ev,preset){
  preset=preset||{};var isNew=!ev;closePalette();
  var e=ev?Object.assign({},ev):{id:uid(),titre:preset.titre||"",date:preset.date||todayKey(),heure:preset.heure||nextHalfHour(),duree:preset.duree||60,allDay:false,lieu:"",note:"",cat:preset.cat||"perso",serie:null};
  M={type:"event",isNew:isNew,e:e};
  var fin=e.allDay?fromM(toMin(nextHalfHour())+60):evEnd(e);
  var cats=EV_CATS.map(function(c){return '<label class="pill cat"><input type="radio" name="ev-cat" value="'+c[0]+'"'+(e.cat===c[0]?" checked":"")+'><span><i style="--evc:'+c[2]+'"></i>'+esc(c[1])+'</span></label>';}).join("");
  openSheet('<header><h2>'+(isNew?"Nouvel événement":"Événement")+'</h2><button class="btn ghost icon" type="button" data-act="close-modal" aria-label="Fermer">'+icon("x")+'</button></header>'+
    '<form id="ev-form" class="body" autocomplete="off" novalidate>'+
    (isNew?'<span class="seg kind-switch" role="group" aria-label="Type"><button type="button" aria-pressed="true">'+icon("calendar")+'Événement perso</button><button type="button" data-act="ev-to-rdv">'+icon("users")+'Rendez-vous client</button></span>':'')+
    '<div class="field"><label for="ev-titre">Titre<span class="req" aria-hidden="true">*</span></label><input type="text" id="ev-titre" class="title-in" value="'+esc(e.titre)+'" placeholder="Révision crypto, sport, dentiste…" required aria-required="true"></div>'+
    '<div class="grid3"><div class="field"><label for="ev-date">Date<span class="req" aria-hidden="true">*</span></label><input type="date" id="ev-date" value="'+esc(e.date)+'"></div>'+
    '<div class="field"><label for="ev-deb">Début</label><input type="time" id="ev-deb" step="300" value="'+esc(e.allDay?nextHalfHour():e.heure)+'"'+(e.allDay?" disabled":"")+'></div>'+
    '<div class="field"><label for="ev-fin">Fin</label><input type="time" id="ev-fin" step="300" value="'+esc(fin)+'"'+(e.allDay?" disabled":"")+'></div></div>'+
    '<label class="pill"><input type="checkbox" id="ev-allday"'+(e.allDay?" checked":"")+'><span>Toute la journée</span></label>'+
    '<div class="field"><span class="flabel">Catégorie</span><div class="pills" id="ev-cats">'+cats+'</div></div>'+
    '<div class="field"><label for="ev-lieu">Lieu</label><input type="text" id="ev-lieu" value="'+esc(e.lieu)+'" placeholder="Bibliothèque, salle de sport…"></div>'+
    '<div class="field"><label for="ev-note">Notes</label><textarea id="ev-note" placeholder="À apporter, chapitres à revoir…">'+esc(e.note)+'</textarea></div>'+
    (isNew?'<div class="field"><label for="ev-rep">Répéter</label><select id="ev-rep"><option value="0">Ne pas répéter</option>'+[1,2,3,4,5,6,7,8,10,12,15].map(function(n){return '<option value="'+n+'">Chaque semaine, '+(n+1)+' fois au total</option>';}).join("")+'</select></div>':(e.serie?'<p class="hint">'+icon("refresh")+'Fait partie d\'une série hebdomadaire.</p>':''))+
    '<p class="warnline" id="ev-conflict" role="status" hidden></p><button type="submit" hidden></button></form>'+
    '<footer>'+(isNew?'':'<span id="del-zone"><button class="btn danger" type="button" data-act="ev-del">'+icon("trash")+'Supprimer</button></span>')+'<span class="spacer"></span><button class="btn ghost" type="button" data-act="close-modal">Annuler</button><button class="btn primary" type="button" data-act="ev-save">'+(isNew?"Ajouter":"Enregistrer")+'</button></footer>');
  var g=function(id){return document.getElementById(id);};
  var dur0=e.allDay?60:(Number(e.duree)||60);
  g("ev-deb").addEventListener("change",function(){var d=normTime(g("ev-deb").value);if(d)g("ev-fin").value=fromM(Math.min(toMin(d)+dur0,23*60+55));drawEvConflict();});
  g("ev-fin").addEventListener("change",function(){var a=toMin(g("ev-deb").value),b=toMin(g("ev-fin").value);if(b>a)dur0=b-a;drawEvConflict();});
  g("ev-date").addEventListener("change",drawEvConflict);
  g("ev-allday").addEventListener("change",function(){g("ev-deb").disabled=g("ev-fin").disabled=g("ev-allday").checked;drawEvConflict();});
  g("ev-titre").addEventListener("input",function(){if(g("ev-titre").value.trim())setErr("ev-titre","");});
  g("ev-form").addEventListener("submit",function(x){x.preventDefault();saveEvent();});
  drawEvConflict();(isNew?g("ev-titre"):g("ev-titre")).focus();
}
function readEventForm(){
  var g=function(id){return document.getElementById(id);},e=Object.assign({},M.e);
  e.titre=g("ev-titre").value.trim();e.date=g("ev-date").value;e.allDay=g("ev-allday").checked;
  var a=normTime(g("ev-deb").value),b=normTime(g("ev-fin").value);
  e.heure=e.allDay?"":(a||"09:00");e.duree=e.allDay?0:(a&&b&&toMin(b)>toMin(a)?toMin(b)-toMin(a):0);
  e.lieu=g("ev-lieu").value.trim();e.note=g("ev-note").value.trim();e.cat=(document.querySelector('input[name="ev-cat"]:checked')||{}).value||"perso";
  return e;
}
function drawEvConflict(){if(!M||M.type!=="event")return;var el=document.getElementById("ev-conflict");if(!el)return;var e=readEventForm();if(!e.duree&&!e.allDay){el.hidden=true;return;}
  var c=validDate(e.date)?eventConflicts(e):[];el.hidden=!c.length;el.textContent=c.length?"Attention, ça chevauche : "+c.join(" · ")+".":"";}
function saveEvent(){
  if(!M||M.type!=="event")return;var e=readEventForm(),bad=null;
  setErr("ev-titre",e.titre?"":"Donne un titre à l'événement.");if(!e.titre)bad=bad||"ev-titre";
  setErr("ev-date",validDate(e.date)?"":"Choisis une date.");if(!validDate(e.date))bad=bad||"ev-date";
  setErr("ev-fin",e.allDay||e.duree?"":"La fin doit être après le début.");if(!e.allDay&&!e.duree)bad=bad||"ev-fin";
  if(bad){document.getElementById(bad).focus();return;}
  var wasNew=M.isNew,rep=wasNew?Number((document.getElementById("ev-rep")||{}).value)||0:0;closeModal(true);
  if(wasNew){var list=buildEvents({titre:e.titre,date:e.date,heure:e.heure,duree:e.duree,allDay:e.allDay,lieu:e.lieu,note:e.note,cat:e.cat,repeat:rep});
    putMany("events",list);toast(list.length>1?list.length+" événements ajoutés (chaque semaine)":"Ajouté : "+evWhen(list[0]),{label:"Annuler",fn:function(){list.forEach(function(x){S.events.delete(x.id);});render();persist();}});}
  else{var old=S.events.get(e.id);e.updated=Date.now();put("events",e);toast("Événement enregistré",old?{label:"Annuler",fn:function(){put("events",old);}}:null);}
}
function moveEvent(e,date,heure){
  if(!e||(e.date===date&&e.heure===heure))return;var old=Object.assign({},e),x=Object.assign({},e,{date:date,heure:heure,updated:Date.now()});
  put("events",x);var c=eventConflicts(x);
  toast((c.length?"Chevauche "+c[0]+". ":"")+"Déplacé : "+evWhen(x),{label:"Annuler",fn:function(){put("events",old);}});
}
ACTS["new-event"]=function(t){openEvent(null,{date:t.getAttribute("data-date")||null,heure:t.getAttribute("data-heure")||null});};
ACTS["edit-event"]=function(t){var e=S.events.get(t.getAttribute("data-eid"));if(e)openEvent(e);};
ACTS["ev-save"]=function(){saveEvent();};
ACTS["ev-to-rdv"]=function(){var d=document.getElementById("ev-date"),h=document.getElementById("ev-deb");var p={date:d?d.value:null,heure:h&&!h.disabled?h.value:null};M=null;openRdv(null,p);};
ACTS["ev-del"]=function(){var z=document.getElementById("del-zone");if(!z||!M)return;var serie=M.e.serie&&Array.from(S.events.values()).filter(function(x){return x.serie===M.e.serie;}).length>1;
  z.innerHTML='<span class="row"><span class="hint">Supprimer ?</span><button class="btn danger solid sm" type="button" data-act="ev-del-ok">Celui-ci</button>'+(serie?'<button class="btn danger sm" type="button" data-act="ev-del-serie">Toute la série</button>':'')+'<button class="btn ghost sm" type="button" data-act="ev-del-no">Non</button></span>';};
ACTS["ev-del-no"]=function(){var z=document.getElementById("del-zone");if(z)z.innerHTML='<button class="btn danger" type="button" data-act="ev-del">'+icon("trash")+'Supprimer</button>';};
ACTS["ev-del-ok"]=function(){if(!M||M.type!=="event")return;var g=S.events.get(M.e.id);closeModal(true);if(g){del("events",g.id);toast("Événement supprimé",{label:"Annuler",fn:function(){put("events",g);}});}};
ACTS["ev-del-serie"]=function(){if(!M||M.type!=="event")return;var sid=M.e.serie,gone=Array.from(S.events.values()).filter(function(x){return x.serie===sid;});closeModal(true);
  gone.forEach(function(x){S.events.delete(x.id);});render();persist();toast(gone.length+" événements supprimés",{label:"Annuler",fn:function(){putMany("events",gone);}});};
