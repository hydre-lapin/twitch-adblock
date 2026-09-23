# Twitch Ad Solutions (VAFT Enhanced)

Bypass des publicités Twitch sans coupures de flux, sans écrans noirs et sans boucles de mise en mémoire tampon.

---

## 🚀 Méthode 1 : Avec uBlock Origin (Recommandé)

1. Ouvrez les **Paramètres de uBlock Origin** (tableau de bord).
2. Dans l'onglet **Paramètres**, cochez **« Je suis un utilisateur expérimenté »** puis cliquez sur la roue dentée ⚙️.
3. À la ligne `userResourcesLocation`, collez l'URL brute du script :
   ```text
   https://raw.githubusercontent.com/hydre-lapin/twitch-adblock/main/vaft-ublock-origin.js
   ```
4. Cliquez sur **« Appliquer les modifications »**.
5. Dans l'onglet **« Mes filtres »**, ajoutez la règle :
   ```text
   twitch.tv##+js(twitch-videoad.js)
   ```
6. Cliquez sur **« Appliquer les modifications »**, puis actualisez votre page Twitch.

---

## 🐒 Méthode 2 : Avec une extension Userscript (Violentmonkey / Tampermonkey)

1. Installez **Violentmonkey** ou **Tampermonkey** sur votre navigateur.
2. Créez un nouveau script ou ouvrez l'URL brute suivante :
   ```text
   https://raw.githubusercontent.com/hydre-lapin/twitch-adblock/main/vaft.user.js
   ```
3. Sauvegardez et activez le script.
4. Actualisez Twitch.
