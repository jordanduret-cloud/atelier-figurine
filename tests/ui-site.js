// Test de l'appli installable : sert site/ en local, verifie manifeste, service worker, export jeu en telechargement direct
const {chromium}=require('playwright');const http=require('http');const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'../site');const types={'.html':'text/html','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let f=path.join(root,q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);}).listen(8791);
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({acceptDownloads:true});const p=await ctx.newPage();const errs=[];
p.on('pageerror',e=>errs.push(String(e)));
await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
await p.goto('http://localhost:8791/');await p.waitForTimeout(2500);
console.log('three charge',await p.evaluate('typeof THREE'),'| manifest',await p.evaluate('fetch("manifest.json").then(r=>r.status)'),'| sw',await p.evaluate('navigator.serviceWorker.getRegistration().then(r=>!!r)'));
const [dl]=await Promise.all([p.waitForEvent('download',{timeout:90000}),p.click('#gameDl')]);
console.log('telechargement',dl.suggestedFilename(),fs.statSync(await dl.path()).size);
console.log('erreurs page',errs);await b.close();srv.close();})();
