// Armazenamento local (data.json) para testar sem PostgreSQL.
// Mesmos modelos do prisma/schema.prisma: User, Server, ServerMember, Channel, Message.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data.json');

function blank() {
  return { users: [], servers: [], members: [], channels: [], messages: [] };
}

function load() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const b = blank();
      fs.writeFileSync(DB_PATH, JSON.stringify(b, null, 2));
      return b;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return blank();
  }
}

function save(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { load, save, uid };
