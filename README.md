# 🛡️ Twitch Ad Solutions (VAFT Enhanced)

<p align="center">
  <img src="https://img.shields.io/badge/version-2.9.3-blue.svg?style=for-the-badge" alt="Version 2.9.3" />
  <img src="https://img.shields.io/badge/Twitch-AdBlock-9146FF?style=for-the-badge&logo=twitch&logoColor=white" alt="Twitch" />
  <img src="https://img.shields.io/badge/uBlock_Origin-Compatible-800000?style=for-the-badge&logo=ublockorigin&logoColor=white" alt="uBlock Origin" />
  <img src="https://img.shields.io/badge/Tampermonkey-Compatible-00485B?style=for-the-badge&logo=tampermonkey&logoColor=white" alt="Tampermonkey" />
</p>

Bypass fluide et intelligent des publicités Twitch (**pre-roll & mid-roll**) sans interruption de flux, sans écran noir de rechargement et sans boucles infinies de buffering.

---

## ✨ Fonctionnalités & Avantages

- ⚡ **Zéro freeze / écran noir** : Contournement transparent des segments publicitaires sans recharger le lecteur.
- 🎯 **Indicateur discret intégré au lecteur** : Un point lumineux cyan apparaît en haut à gauche de la vidéo pendant le blocage d'une publicité (compatible mode standard, cinéma et plein écran).
- 🔄 **Compatibilité totale** : Fonctionne via **uBlock Origin** (recommandé) ou via un gestionnaire de **Userscripts** (**Tampermonkey**, **Violentmonkey**).
- 🛠️ **Outils de test intégrés** : Commande console pour simuler et vérifier l'efficacité du blocage à tout moment.

---

## 📦 Guide d'installation

### 🚀 Méthode 1 : Avec uBlock Origin (Recommandé)

> [!TIP]
> Cette méthode est la plus performante car elle s'intègre directement au moteur de filtrage de uBlock Origin.

1. Ouvrez le **Tableau de bord de uBlock Origin** (icône d'extension > ⚙️ Paramètres).
2. Dans l'onglet **Paramètres**, cochez **« Je suis un utilisateur expérimenté »** puis cliquez sur l'icône d'engrenage (⚙️) qui apparaît à droite.
3. Repérez la ligne `userResourcesLocation` et remplacez sa valeur par :
   ```text
   https://raw.githubusercontent.com/hydre-lapin/twitch-adblock/main/vaft-ublock-origin.js
   ```
4. Cliquez sur **« Appliquer les modifications »** en haut à droite, puis fermez cet onglet.
5. Dans l'onglet **« Mes filtres »** de uBlock Origin, ajoutez la règle suivante :
   ```text
   twitch.tv##+js(twitch-videoad.js)
   ```
6. Cliquez sur **« Appliquer les modifications »** et rafraîchissez votre page Twitch.

---

### 🐒 Méthode 2 : Avec une extension Userscript (Tampermonkey / Violentmonkey)

1. Installez **[Tampermonkey](https://www.tampermonkey.net/)** ou **[Violentmonkey](https://violentmonkey.github.io/)** sur votre navigateur.
2. Cliquez sur le lien direct suivant pour installer automatiquement le script :
   👉 **[Installer vaft.user.js](https://raw.githubusercontent.com/hydre-lapin/twitch-adblock/main/vaft.user.js)**
3. Cliquez sur **« Installer »** / **« Confirmer l'installation »**.
4. Actualisez votre page Twitch (`F5`).

---

## 🧪 Tester le fonctionnement

Vous pouvez vérifier que le contournement et l'indicateur visuel fonctionnent directement depuis la console de développement de votre navigateur (`F12` > onglet **Console**) :

- **Simuler une pub pendant 10 secondes :**
  ```js
  simulateAds(1, 10);
  ```
- **Arrêter la simulation :**
  ```js
  simulateAds(0);
  ```

---

## ❓ FAQ & Dépannage

<details>
<summary><b>Le point lumineux apparaît-il en plein écran ?</b></summary>
<br>
Oui ! L'indicateur est dynamiquement attaché au conteneur du lecteur vidéo et s'adapte automatiquement au mode fenêtré, mode cinéma et plein écran natif.
</details>

<details>
<summary><b>Les publicités apparaissent toujours après mise à jour ?</b></summary>
<br>
1. Videz le cache de votre navigateur ou forcez le rechargement de la page (<code>Ctrl + F5</code>).<br>
2. Assurez-vous qu'aucun autre script ou extension de blocage Twitch obsolète n'entre en conflit.<br>
3. Vérifiez dans Tampermonkey que le script est bien activé et à la version la plus récente.
</details>

---

## ⚖️ Licence

Ce projet est distribué sous licence open-source. À utiliser à des fins personnelles et éducatives.
