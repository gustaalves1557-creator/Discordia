// Entrada de desenvolvimento: usa server.js (mesmo módulo embutido no app desktop).
const { start } = require('./server');

start().catch((e) => {
  console.error('Falha ao iniciar:', e.message);
  process.exit(1);
});
