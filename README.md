# Mon Carnet

Application Windows d'organisation personnelle : agenda, emploi du temps de l'école, mails des profs, permis de conduire, tâches, activité d'indépendant (clients, factures, Urssaf) et **Titan**, un assistant IA qui connaît tout le carnet.

## Installation

1. Télécharge `Mon-Carnet-Windows-x.y.z.zip` dans la [dernière version](../../releases/latest).
2. Clic droit sur le zip > **Extraire tout…**, puis lance **Mon Carnet.exe**.
3. Au premier lancement, indique ton prénom et ce que tu veux suivre. La carte **Premiers pas** de la page Aujourd'hui t'aide ensuite à relier tes services.

Les mises à jour s'installent ensuite toutes seules (Réglages > Mises à jour).

## Fonctionnalités

| | |
|---|---|
| **Agenda** | Événements perso, cours, leçons de conduite et rendez-vous clients au même endroit. |
| **École** | Emploi du temps importé depuis un lien iCal, mails des profs (Gmail / Google Workspace, lecture seule). |
| **Conduite** | Leçons Sarool, heures faites, réservation automatique sur tes temps libres. |
| **Activité** | Clients, rendez-vous, encaissements, factures PDF, montant à déclarer à l'Urssaf. |
| **Titan** | Assistant IA (Gemini, Groq ou Cerebras, gratuits) : répond, ajoute ou déplace des éléments, mémorise tes préférences. |

Chaque personne ne voit que les pages qu'elle a choisies (Réglages > Ton profil).

## Tes données

Tout reste sur ton PC, dans **Documents\Mon_Carnet** :

- `carnet.json` : ce que tu saisis ;
- `sauvegardes\` : une copie par jour (30 jours) ;
- `Factures\`, `Pièces jointes\`.

Les clés d'IA et mots de passe sont chiffrés par Windows et ne quittent jamais le PC.

## Publier une version

Voir [PUBLIER.md](PUBLIER.md).
