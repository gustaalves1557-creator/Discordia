// Boot do app desktop: PostgreSQL embutido + migrations + backend.
// Tudo local, sem instalar nada: dados em %APPDATA%/Discordia.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { Client } = require('pg');

const PG_PORT = 5433;
const BACKEND_PORT = 4000;

function run(cmd, args, opts = {}) {
  const { timeout = 120000, ...spawnOpts } = opts;
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { timeout, ...spawnOpts }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error(`${cmd} ${args.join(' ')}: ${stderr || err.message}`), { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
    // segurança: nunca travar o boot para sempre
    const t = setTimeout(() => { try { child.kill(); } catch {} }, timeout + 5000);
    child.on('exit', () => clearTimeout(t));
  });
}

function pgBinDir() {
  // empacotado: asarUnpack -> app.asar.unpacked ; dev: pasta local
  const unpacked = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'pg-bin', 'bin');
  if (fs.existsSync(path.join(unpacked, 'pg_ctl.exe'))) return unpacked;
  return path.join(__dirname, 'pg-bin', 'bin');
}

function srvDir() {
  return path.join(__dirname, 'srv');
}

async function isReady(bin) {
  try {
    await run(path.join(bin, 'pg_isready.exe'), ['-h', 'localhost', '-p', String(PG_PORT)]);
    return true;
  } catch {
    return false;
  }
}

async function runMigrations(client, dir) {
  await client.query(`CREATE TABLE IF NOT EXISTS discordia_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
  const { rows } = await client.query('SELECT name FROM discordia_migrations');
  const done = new Set(rows.map((r) => r.name));
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const name of entries) {
    if (done.has(name)) continue;
    const sqlFile = path.join(dir, name, 'migration.sql');
    if (!fs.existsSync(sqlFile)) continue;
    const sql = fs.readFileSync(sqlFile, 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO discordia_migrations(name) VALUES($1)', [name]);
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    }
  }
}

async function boot(userData, onStatus) {
  const logFile = path.join(userData, 'boot.log');
  const say = (m) => {
    try {
      fs.appendFileSync(logFile, new Date().toISOString() + ' ' + m + '\n');
      onStatus(m);
    } catch {}
    console.log('[boot]', m);
  };
  const bin = pgBinDir();
  for (const exe of ['initdb.exe', 'postgres.exe', 'pg_ctl.exe', 'pg_isready.exe']) {
    if (!fs.existsSync(path.join(bin, exe))) {
      throw new Error(`PostgreSQL embutido não encontrado (${exe}). Reinstale o Discordia.`);
    }
  }

  const pgdata = path.join(userData, 'pgdata');
  const uploads = path.join(userData, 'uploads');
  fs.mkdirSync(pgdata, { recursive: true });
  fs.mkdirSync(uploads, { recursive: true });

  // segredo JWT por máquina
  const secretFile = path.join(userData, 'jwt-secret');
  let secret;
  if (fs.existsSync(secretFile)) secret = fs.readFileSync(secretFile, 'utf8').trim();
  else {
    secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, secret);
  }

  // 1) initdb na primeira vez (auth trust: só localhost, sem senha)
  if (!fs.existsSync(path.join(pgdata, 'PG_VERSION'))) {
    say('Preparando banco de dados (primeira vez)...');
    await run(path.join(bin, 'initdb.exe'), ['-D', pgdata, '-U', 'postgres', '--auth=trust', '-E', 'UTF8']);
  }
  // garante a porta dedicada (5433) mesmo em banco já inicializado
  try {
    const conf = path.join(pgdata, 'postgresql.auto.conf');
    const cur = fs.existsSync(conf) ? fs.readFileSync(conf, 'utf8') : '';
    if (!/^\s*port\s*=/m.test(cur)) {
      fs.appendFileSync(conf, `\nport = '${PG_PORT}'\nlisten_addresses = 'localhost'\n`);
    }
  } catch {}

  // 2) sobe o postgres: dispara desanexado e confirma via polling.
  // (aguardar o exit do pg_ctl trava às vezes no Windows)
  const pgLog = path.join(userData, 'pg.log');
  function firePgCtl() {
    return new Promise((resolve) => {
      try {
        const child = spawn(
          path.join(bin, 'pg_ctl.exe'),
          ['-D', pgdata, '-l', pgLog, '-o', `-p ${PG_PORT}`, 'start'],
          { stdio: 'ignore' }
        );
        child.on('error', () => resolve());
        child.on('exit', () => resolve());
        setTimeout(resolve, 8000);
      } catch {
        resolve();
      }
    });
  }
  function pgLogTail() {
    try {
      const lines = fs.readFileSync(pgLog, 'utf8').trim().split('\n');
      return lines.slice(-5).join('\n');
    } catch { return ''; }
  }
  if (!(await isReady(bin))) {
    say('Iniciando banco de dados...');
    await firePgCtl();
    for (let i = 0; i < 90; i++) {
      if (await isReady(bin)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!(await isReady(bin))) {
      throw new Error('Banco de dados não respondeu.\n' + pgLogTail());
    }
  }

  const base = { host: 'localhost', port: PG_PORT, user: 'postgres', database: 'postgres' };

  // 3) cria o database
  {
    const c = new Client(base);
    await c.connect();
    try {
      await c.query('CREATE DATABASE discordia');
    } catch (e) {
      if (e.code !== '42P04') throw e; // já existe
    }
    await c.end();
  }

  // 4) migrations
  say('Atualizando banco de dados...');
  {
    const c = new Client({ ...base, database: 'discordia' });
    await c.connect();
    try {
      await runMigrations(c, path.join(srvDir(), 'migrations'));
    } finally {
      await c.end();
    }
  }

  // 5) backend
  say('Iniciando Discordia...');
  process.env.DATABASE_URL = `postgresql://postgres@localhost:${PG_PORT}/discordia?schema=public`;
  process.env.UPLOAD_DIR = uploads;
  process.env.JWT_SECRET = secret;
  process.env.PORT = String(BACKEND_PORT);
  say('Carregando servidor...');
  const server = require(path.join(srvDir(), 'src', 'server.js'));
  say('Seed + listen...');
  await server.start(BACKEND_PORT);
  say('Backend OK');

  return {
    backendPort: BACKEND_PORT,
    async stop() {
      try {
        await run(path.join(bin, 'pg_ctl.exe'), ['-D', pgdata, '-m', 'fast', 'stop'], { timeout: 15000 });
      } catch {}
    },
  };
}

module.exports = { boot };
