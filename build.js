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
