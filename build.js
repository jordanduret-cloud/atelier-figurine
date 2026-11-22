// Assemble la page autonome : injecte le moteur dans le gabarit HTML -> dist/atelier-figurine.html
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync(path.join(__dirname, 'src/template.html'), 'utf8');
const eng = fs.readFileSync(path.join(__dirname, 'src/engine.js'), 'utf8');
if (eng.includes('</script')) throw new Error('engine.js contient </script');
const out = tpl.replace('/*__ENGINE__*/', () => eng);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/atelier-figurine.html'), out);
console.log('built', out.length, 'bytes');

// ---- Appli installable (PWA) : dossier site/ pour GitHub Pages ----
const site = path.join(__dirname, 'site');
fs.mkdirSync(site, { recursive: true });
fs.cpSync(path.join(__dirname, 'site-src'), site, { recursive: true });
const version = Date.now().toString(36);
let page = out.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'vendor/three.min.js');
const head = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<meta name="theme-color" content="#0e1512"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="icon-192.png">' +
  '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">' +
  '<style>html{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
const reg = '<script>if("serviceWorker" in navigator&&location.protocol!=="file:")addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){})});</script>';
fs.writeFileSync(path.join(site, 'index.html'), head + page + reg + '</body></html>');
fs.writeFileSync(path.join(site, 'sw.js'), fs.readFileSync(path.join(site, 'sw.js'), 'utf8').replace('__VERSION__', version));
console.log('site/ prêt');
