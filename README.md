# Twitch Ad Solutions (VAFT Enhanced)

Scriptlet et Userscript pour bloquer les publicités Twitch sans coupures de flux ni rechargements intempestifs.

## Utilisation avec uBlock Origin

1. Ouvrez les **Paramètres de uBlock Origin**.
2. Cochez **« Je suis un utilisateur expérimenté »** et cliquez sur la roue dentée ⚙️.
3. Définissez `userResourcesLocation` avec l'URL brute du script :
   ```text
   https://raw.githubusercontent.com/hydre-lapin/twitch-adblock/main/vaft-ublock-origin.js
   ```
4. Dans l'onglet **« Mes filtres »**, ajoutez :
   ```text
   twitch.tv##+js(twitch-videoad.js)
   ```
5. Cliquez sur **Appliquer les modifications**.
