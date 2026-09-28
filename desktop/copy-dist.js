// Copia o build do frontend (client/dist) para dentro do app desktop.
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'client', 'dist');
const to = path.join(__dirname, 'app-dist');

if (!fs.existsSync(from)) {
  console.error('client/dist não encontrado. Rode "npm run build" dentro de client primeiro.');
  process.exit(1);
}
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log('Frontend copiado para desktop/app-dist');
