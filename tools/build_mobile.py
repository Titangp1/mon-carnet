"""Construit la version téléphone (dossier www/) à partir de l'interface du PC.
Usage : python tools/build_mobile.py   (depuis la racine du dépôt)"""
import os, re, shutil, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'www')
shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(os.path.join(ROOT, 'renderer'), OUT)
for f in ('shim.js', 'mobile.css', 'post.js'):
    shutil.copy(os.path.join(ROOT, 'mobile', f), os.path.join(OUT, f))
mods = []
for name in ('ai', 'tts'):
    src = open(os.path.join(ROOT, 'main', name + '.js'), encoding='utf-8').read()
    mods.append('%s:function(module,exports,require){\n%s\n}' % (name, src))
ver = json.load(open(os.path.join(ROOT, 'package.json'), encoding='utf-8'))['version']
open(os.path.join(OUT, 'mc-modules.js'), 'w', encoding='utf-8').write('window.MC_VERSION=%s;\nwindow.__MC_MODULES={%s};\n' % (json.dumps(ver), ',\n'.join(mods)))
idx = os.path.join(OUT, 'index.html')
h = open(idx, encoding='utf-8').read()
h = h.replace("connect-src 'none'", "connect-src https: http://localhost https://localhost capacitor:")
h = h.replace('<script src="core.js"></script>', '<script src="mc-modules.js"></script>\n<script src="shim.js"></script>\n<script src="core.js"></script>', 1)
h = h.replace('<script src="actions.js"></script>', '<script src="actions.js"></script>'+chr(10)+'<script src="post.js"></script>', 1)
h = h.replace('</head>', '<link rel="stylesheet" href="mobile.css">\n</head>', 1)
if 'name="viewport"' not in h:
    h = h.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">', 1)
open(idx, 'w', encoding='utf-8').write(h)
print('www prêt, version', ver)
