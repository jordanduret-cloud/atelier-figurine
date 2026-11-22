// Test navigateur : clic sur l'export jeu, verifie le GLB produit (hors-ligne : three bloque)
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];
p.on('pageerror',e=>errs.push(String(e)));
await p.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
await p.addInitScript(()=>{window.__saved=null;window.claude={use:async n=>n==='downloads'?{save:async o=>{window.__saved={name:o.filename,size:o.data.size};}}:null};});
await p.goto('file://'+__dirname+'/../dist/atelier-figurine.html');
await p.waitForTimeout(1500);
console.log('gameDl disabled',await p.$eval('#gameDl',e=>e.disabled));
await p.click('#gameDl');
await p.waitForFunction('window.__saved||document.querySelector("#gameNote").className.includes("error")',null,{timeout:90000});
console.log('saved',await p.evaluate('window.__saved'),'|',await p.$eval('#gameNote',e=>e.textContent));
console.log('page errors',errs);await b.close();})();
