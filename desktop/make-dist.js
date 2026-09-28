// Prepara tudo que vai dentro do instalador:
// - frontend (client/dist -> app-dist)
// - backend (server/src -> srv/src, migrations -> srv/migrations)
// - Prisma Client gerado (server/node_modules/@prisma* -> node_modules)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const clientDist = path.join(root, 'client', 'dist');
const serverDir = path.join(root, 'server');

if (!fs.existsSync(clientDist)) {
  console.error('client/dist não encontrado. Rode "npm run build" dentro de client primeiro.');
  process.exit(1);
}

// 1) frontend
const appDist = path.join(__dirname, 'app-dist');
fs.rmSync(appDist, { recursive: true, force: true });
fs.cpSync(clientDist, appDist, { recursive: true });
console.log('OK app-dist');

// 2) backend (mesma árvore do server/ p/ os requires relativos funcionarem)
const srv = path.join(__dirname, 'srv');
fs.rmSync(srv, { recursive: true, force: true });
fs.mkdirSync(srv, { recursive: true });
fs.cpSync(path.join(serverDir, 'src'), path.join(srv, 'src'), { recursive: true });
fs.cpSync(path.join(serverDir, 'prisma', 'migrations'), path.join(srv, 'migrations'), { recursive: true });
console.log('OK srv (src + migrations)');

// 3) Prisma Client gerado — dentro de srv/ (src/prisma.js usa ../prisma-client)
{
  const from = path.join(serverDir, 'prisma-client');
  const to = path.join(srv, 'prisma-client');
  if (!fs.existsSync(from)) {
    console.error('Não achei ' + from + '. Rode "npx prisma generate" dentro de server primeiro.');
    process.exit(1);
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log('OK srv/prisma-client');
}
console.log('Pacote desktop pronto.');
