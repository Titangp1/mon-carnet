/* Mon Carnet (téléphone) : réglages d'affichage propres au téléphone, chargés après l'interface. */
(function(){
  if(window.innerWidth<760&&S.ui&&(!S.ui.agendaMode||S.ui.agendaMode==="semaine"))S.ui.agendaMode="jour";
  /* bouton retour Android : revient à la page Aujourd'hui avant de quitter */
  document.addEventListener("backbutton",function(e){if(S.ui.view!=="jour"){e.preventDefault();go("jour");}},false);
})();
