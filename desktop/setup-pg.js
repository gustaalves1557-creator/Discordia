// Copia os binários do PostgreSQL instalado para dentro do app desktop.
// Roda uma vez (o resultado fica em desktop/pg-bin e vai no instalador).
const fs = require('fs');
const path = require('path');

const PG = 'C:\\Program Files\\PostgreSQL\\17';
const DEST = path.join(__dirname, 'pg-bin');
const EXES = ['initdb.exe', 'postgres.exe', 'pg_ctl.exe', 'pg_isready.exe', 'psql.exe'];
// DLLs de runtime (ficam em bin/ na instalação EDB; wx* é GUI e não precisa)
const DLLS = fs.readdirSync(path.join(PG, 'bin'))
  .filter((f) => f.endsWith('.dll') && !f.startsWith('wx') && f !== 'testplug.dll');

for (const exe of EXES) {
  const from = path.join(PG, 'bin', exe);
  if (!fs.existsSync(from)) {
    console.error('Não achei ' + from);
    process.exit(1);
  }
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(path.join(DEST, 'bin'), { recursive: true });
for (const exe of EXES) {
  fs.copyFileSync(path.join(PG, 'bin', exe), path.join(DEST, 'bin', exe));
}
for (const dll of DLLS) {
  fs.copyFileSync(path.join(PG, 'bin', dll), path.join(DEST, 'bin', dll));
}
fs.cpSync(path.join(PG, 'lib'), path.join(DEST, 'lib'), { recursive: true });
fs.cpSync(path.join(PG, 'share'), path.join(DEST, 'share'), { recursive: true });

let total = 0;
for (const f of fs.readdirSync(DEST, { recursive: true, withFileTypes: true })) {
  if (f.isFile()) total += fs.statSync(path.join(f.parentPath || f.path, f.name)).size;
}
console.log('pg-bin pronto em ' + DEST + ' (' + (total / 1048576).toFixed(1) + ' MB)');
