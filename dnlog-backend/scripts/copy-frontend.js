// Copia o app (dnlog-app.html, dentro de dnlog-backend/) para dnlog-backend/public/index.html.
// O HTML fonte fica DENTRO do rootDir (dnlog-backend) de propósito: assim o
// auto-deploy do Render dispara também quando só a tela muda (o Render, com
// rootDir setado, só observa mudanças dentro dele).
// Roda no `postbuild` — assim tanto no dev quanto no Render o backend serve
// sempre a versão mais recente do frontend, sem precisar commitar o public/.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'dnlog-app.html');
const dstDir = path.join(__dirname, '..', 'public');
const dst = path.join(dstDir, 'index.html');

try {
  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`[copy-frontend] ${src} -> ${dst}`);
} catch (e) {
  console.error('[copy-frontend] FALHOU:', e.message);
  process.exit(1);
}
