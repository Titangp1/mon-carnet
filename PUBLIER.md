# Publier une version
1. Monter "version" dans package.json.
2. `npm ci` puis `python tools/pack.py <dossier avec node_modules> app.asar`.
3. Release GitHub `vX.Y.Z` avec : `app-update.bin` (= app.asar), `app-update.sha256`, et le zip Windows complet.
Le carnet installe tout seul la nouvelle version au lancement.
