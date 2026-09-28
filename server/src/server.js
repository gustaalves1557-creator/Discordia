require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { prisma } = require('./prisma');
const { sign, authRequired, SECRET } = require('./auth');

const app = express();
const PORT = process.env.PORT || 4000;
app.use(cors()); // libera web + app desktop (file://)
app.use(express.json());

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email, avatar: u.avatar || null, createdAt: u.createdAt });
const withAuthor = (m) => ({ ...m, author: m.author ? { id: m.author.id, username: m.author.username, avatar: m.author.avatar } : null });

// ---- seed: importa data.json (modo antigo) ou cria servidor Geral ----
async function seed() {
  const count = await prisma.server.count();
  if (count > 0) return;
  const legacyPath = path.join(__dirname, '..', 'data.json');
  if (fs.existsSync(legacyPath)) {
    try {
      const old = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      for (const u of old.users || []) {
        await prisma.user.upsert({
          where: { id: u.id },
          update: {},
          create: { id: u.id, username: u.username, email: u.email, password: u.password || '', avatar: u.avatar || null },
        });
      }
      for (const s of old.servers || []) {
        await prisma.server.upsert({
          where: { id: s.id },
          update: {},
          create: { id: s.id, name: s.name, ownerId: s.ownerId },
        });
      }
      for (const m of old.members || []) {
        await prisma.serverMember.upsert({
          where: { userId_serverId: { userId: m.userId, serverId: m.serverId } },
          update: {},
          create: { userId: m.userId, serverId: m.serverId, role: m.role || 'member' },
        });
      }
      for (const c of old.channels || []) {
        await prisma.channel.upsert({
          where: { id: c.id },
          update: {},
          create: { id: c.id, name: c.name, type: c.type || 'text', serverId: c.serverId },
        });
      }
      for (const m of old.messages || []) {
        await prisma.message.upsert({
          where: { id: m.id },
          update: {},
          create: { id: m.id, content: m.content || '', attachment: m.attachment || null, authorId: m.authorId, channelId: m.channelId },
        });
      }
      for (const d of old.dms || []) {
        const th = await prisma.dMThread.upsert({ where: { id: d.id }, update: {}, create: { id: d.id } });
        for (const pid of d.participants || []) {
          await prisma.dMParticipant.upsert({
            where: { threadId_userId: { threadId: th.id, userId: pid } },
            update: {},
            create: { threadId: th.id, userId: pid },
          });
        }
      }
      for (const m of old.dmMessages || []) {
        await prisma.dMMessage.upsert({
          where: { id: m.id },
          update: {},
          create: { id: m.id, threadId: m.dmId, content: m.content || '', attachment: m.attachment || null, authorId: m.authorId },
        });
      }
      for (const b of old.bans || []) {
        await prisma.ban.upsert({
          where: { serverId_userId: { serverId: b.serverId, userId: b.userId } },
          update: {},
          create: { serverId: b.serverId, userId: b.userId },
        });
      }
      console.log('Dados do data.json importados para o Postgres.');
      return;
    } catch (e) {
      console.log('Falha ao importar data.json, criando seed padrão:', e.message);
    }
  }
  const bot = await prisma.user.create({ data: { username: 'Discordia', email: 'bot@discordia.local', password: '' } });
  const server = await prisma.server.create({ data: { name: 'Geral', ownerId: bot.id } });
  const channel = await prisma.channel.create({ data: { name: 'geral', type: 'text', serverId: server.id } });
  await prisma.message.create({ data: { content: 'Bem-vindo ao Discordia! Crie sua conta para conversar em tempo real.', authorId: bot.id, channelId: channel.id } });
}

// ---- AUTH ----
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'username, email e password sao obrigatorios' });
  await seed();
  if (await prisma.user.findUnique({ where: { email } })) return res.status(400).json({ error: 'Email ja cadastrado' });
  if (await prisma.user.findUnique({ where: { username } })) return res.status(400).json({ error: 'Username ja em uso' });
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { username, email, password: hash } });
  const geral = await prisma.server.findFirst({ where: { name: 'Geral' } });
  if (geral) {
    await prisma.serverMember.upsert({
      where: { userId_serverId: { userId: user.id, serverId: geral.id } },
      update: {},
      create: { userId: user.id, serverId: geral.id, role: 'member' },
    });
  }
  res.json({ user: publicUser(user), token: sign(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  await seed();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) return res.status(400).json({ error: 'Credenciais invalidas' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'Credenciais invalidas' });
  res.json({ user: publicUser(user), token: sign(user) });
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
  res.json(publicUser(user));
});

app.put('/api/auth/profile', authRequired, async (req, res) => {
  const { username, avatar } = req.body || {};
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { ...(username ? { username } : {}), ...(avatar !== undefined ? { avatar } : {}) },
    });
    res.json(publicUser(user));
  } catch {
    return res.status(400).json({ error: 'Username ja em uso' });
  }
});

app.get('/api/users', authRequired, async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users.map(publicUser));
});

// ---- SERVERS ----
async function myServerIds(userId) {
  const owned = await prisma.server.findMany({ where: { ownerId: userId }, select: { id: true } });
  const joined = await prisma.serverMember.findMany({ where: { userId }, select: { serverId: true } });
  return [...new Set([...owned.map((s) => s.id), ...joined.map((m) => m.serverId)])];
}

app.get('/api/servers', authRequired, async (req, res) => {
  await seed();
  const ids = await myServerIds(req.user.id);
  res.json(await prisma.server.findMany({ where: { id: { in: ids } } }));
});

app.post('/api/servers', authRequired, async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });
  const server = await prisma.server.create({ data: { name, ownerId: req.user.id } });
  await prisma.serverMember.create({ data: { userId: req.user.id, serverId: server.id, role: 'owner' } });
  await prisma.channel.create({ data: { name: 'geral', type: 'text', serverId: server.id } });
  res.json(server);
});

app.post('/api/servers/:id/join', authRequired, async (req, res) => {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } });
  if (!server) return res.status(404).json({ error: 'Servidor nao encontrado' });
  if (await prisma.ban.findUnique({ where: { serverId_userId: { serverId: server.id, userId: req.user.id } } })) {
    return res.status(403).json({ error: 'Voce foi banido deste servidor' });
  }
  await prisma.serverMember.upsert({
    where: { userId_serverId: { userId: req.user.id, serverId: server.id } },
    update: {},
    create: { userId: req.user.id, serverId: server.id, role: 'member' },
  });
  res.json(server);
});

app.post('/api/servers/:id/leave', authRequired, async (req, res) => {
  await prisma.serverMember.deleteMany({ where: { userId: req.user.id, serverId: req.params.id } });
  res.json({ ok: true });
});

app.delete('/api/servers/:id', authRequired, async (req, res) => {
  const server = await prisma.server.findUnique({ where: { id: req.params.id } });
  if (!server) return res.status(404).json({ error: 'Servidor nao encontrado' });
  if (server.ownerId !== req.user.id) return res.status(403).json({ error: 'So o dono pode excluir' });
  await prisma.server.delete({ where: { id: server.id } });
  res.json({ ok: true });
});

app.get('/api/servers/:id/members', authRequired, async (req, res) => {
  const members = await prisma.serverMember.findMany({ where: { serverId: req.params.id }, include: { user: true } });
  res.json(members.map((m) => ({ userId: m.userId, serverId: m.serverId, role: m.role, username: m.user.username, avatar: m.user.avatar })));
});

// ---- CHANNELS ----
app.get('/api/servers/:id/channels', authRequired, async (req, res) => {
  res.json(await prisma.channel.findMany({ where: { serverId: req.params.id } }));
});

app.post('/api/servers/:id/channels', authRequired, async (req, res) => {
  const { name, type } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });
  const ch = await prisma.channel.create({ data: { name, type: type === 'voice' ? 'voice' : 'text', serverId: req.params.id } });
  io.to(`server:${req.params.id}`).emit('channel:new', ch);
  res.json(ch);
});

app.delete('/api/channels/:id', authRequired, async (req, res) => {
  const ch = await prisma.channel.findUnique({ where: { id: req.params.id } });
  if (!ch) return res.status(404).json({ error: 'Canal nao encontrado' });
  await prisma.channel.delete({ where: { id: ch.id } });
  io.to(`server:${ch.serverId}`).emit('channel:delete', ch);
  res.json({ ok: true });
});

// ---- MESSAGES ----
app.get('/api/channels/:id/messages', authRequired, async (req, res) => {
  const msgs = await prisma.message.findMany({
    where: { channelId: req.params.id },
    include: { author: true },
    orderBy: { createdAt: 'asc' },
    take: -100,
  });
  res.json(msgs.map(withAuthor));
});

app.post('/api/channels/:id/messages', authRequired, async (req, res) => {
  const { content, attachment } = req.body || {};
  if (!content && !attachment) return res.status(400).json({ error: 'Conteudo obrigatorio' });
  const ch = await prisma.channel.findUnique({ where: { id: req.params.id } });
  if (!ch) return res.status(404).json({ error: 'Canal nao encontrado' });
  const mute = await prisma.mute.findUnique({ where: { serverId_userId: { serverId: ch.serverId, userId: req.user.id } } });
  if (mute && (!mute.until || mute.until > new Date())) return res.status(403).json({ error: 'Voce esta silenciado neste servidor' });
  const msg = await prisma.message.create({
    data: { content: content || '', attachment: attachment || null, authorId: req.user.id, channelId: req.params.id },
    include: { author: true },
  });
  const out = withAuthor(msg);
  io.to(`channel:${req.params.id}`).emit('message:new', out);
  res.json(out);
});

app.put('/api/messages/:id', authRequired, async (req, res) => {
  const msg = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!msg) return res.status(404).json({ error: 'Mensagem nao encontrada' });
  if (msg.authorId !== req.user.id) return res.status(403).json({ error: 'So o autor pode editar' });
  const updated = await prisma.message.update({ where: { id: msg.id }, data: { content: req.body.content || msg.content } });
  io.to(`channel:${msg.channelId}`).emit('message:update', updated);
  res.json(updated);
});

app.delete('/api/messages/:id', authRequired, async (req, res) => {
  const msg = await prisma.message.findUnique({ where: { id: req.params.id } });
  if (!msg) return res.status(404).json({ error: 'Mensagem nao encontrada' });
  if (msg.authorId !== req.user.id) return res.status(403).json({ error: 'So o autor pode excluir' });
  await prisma.message.delete({ where: { id: msg.id } });
  io.to(`channel:${msg.channelId}`).emit('message:delete', msg);
  res.json({ ok: true });
});

// ---- UPLOAD ----
app.post('/api/upload', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo ausente' });
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname, size: req.file.size, mime: req.file.mimetype });
});

// ---- DMS ----
async function findPairThread(a, b) {
  const candidates = await prisma.dMThread.findMany({
    where: { AND: [{ participants: { some: { userId: a } } }, { participants: { some: { userId: b } } }] },
    include: { participants: true },
  });
  return candidates.find((t) => t.participants.length === 2) || null;
}

app.get('/api/dms', authRequired, async (req, res) => {
  const threads = await prisma.dMThread.findMany({
    where: { participants: { some: { userId: req.user.id } } },
    include: { participants: { include: { user: true } } },
  });
  res.json(threads.map((t) => {
    const other = t.participants.map((p) => p.user).find((u) => u.id !== req.user.id);
    return { id: t.id, createdAt: t.createdAt, participants: t.participants.map((p) => p.userId), other: other ? publicUser(other) : null };
  }));
});

app.post('/api/dms', authRequired, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId || userId === req.user.id) return res.status(400).json({ error: 'userId invalido' });
  let dm = await findPairThread(req.user.id, userId);
  if (!dm) {
    dm = await prisma.dMThread.create({ data: {} });
    await prisma.dMParticipant.createMany({ data: [{ threadId: dm.id, userId: req.user.id }, { threadId: dm.id, userId }] });
  }
  res.json({ id: dm.id, createdAt: dm.createdAt });
});

app.get('/api/dms/:id/messages', authRequired, async (req, res) => {
  const part = await prisma.dMParticipant.findUnique({ where: { threadId_userId: { threadId: req.params.id, userId: req.user.id } } });
  if (!part) return res.status(403).json({ error: 'Sem acesso' });
  const msgs = await prisma.dMMessage.findMany({ where: { threadId: req.params.id }, include: { author: true }, orderBy: { createdAt: 'asc' }, take: -100 });
  res.json(msgs.map((m) => ({ ...m, author: { id: m.author.id, username: m.author.username, avatar: m.author.avatar } })));
});

app.post('/api/dms/:id/messages', authRequired, async (req, res) => {
  const { content, attachment } = req.body || {};
  if (!content && !attachment) return res.status(400).json({ error: 'Conteudo obrigatorio' });
  const part = await prisma.dMParticipant.findUnique({ where: { threadId_userId: { threadId: req.params.id, userId: req.user.id } } });
  if (!part) return res.status(403).json({ error: 'Sem acesso' });
  const msg = await prisma.dMMessage.create({
    data: { threadId: req.params.id, content: content || '', attachment: attachment || null, authorId: req.user.id },
    include: { author: true },
  });
  const out = { ...msg, author: { id: msg.author.id, username: msg.author.username, avatar: msg.author.avatar } };
  io.to(`dm:${req.params.id}`).emit('dm:new', out);
  res.json(out);
});

// ---- MODERACAO ----
async function canModerate(serverId, userId) {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) return false;
  if (server.ownerId === userId) return true;
  const m = await prisma.serverMember.findUnique({ where: { userId_serverId: { userId, serverId } } });
  return !!m && (m.role === 'admin' || m.role === 'moderator');
}

app.put('/api/servers/:id/members/:userId', authRequired, async (req, res) => {
  if (!(await canModerate(req.params.id, req.user.id))) return res.status(403).json({ error: 'Sem permissao' });
  const m = await prisma.serverMember.update({
    where: { userId_serverId: { userId: req.params.userId, serverId: req.params.id } },
    data: { role: req.body.role || 'member' },
  }).catch(() => null);
  if (!m) return res.status(404).json({ error: 'Membro nao encontrado' });
  res.json(m);
});

app.delete('/api/servers/:id/members/:userId', authRequired, async (req, res) => {
  if (!(await canModerate(req.params.id, req.user.id))) return res.status(403).json({ error: 'Sem permissao' });
  await prisma.serverMember.deleteMany({ where: { serverId: req.params.id, userId: req.params.userId } });
  res.json({ ok: true });
});

app.post('/api/servers/:id/ban', authRequired, async (req, res) => {
  if (!(await canModerate(req.params.id, req.user.id))) return res.status(403).json({ error: 'Sem permissao' });
  const { userId } = req.body || {};
  await prisma.ban.upsert({
    where: { serverId_userId: { serverId: req.params.id, userId } },
    update: {},
    create: { serverId: req.params.id, userId },
  });
  await prisma.serverMember.deleteMany({ where: { serverId: req.params.id, userId } });
  res.json({ ok: true });
});

app.post('/api/servers/:id/mute', authRequired, async (req, res) => {
  if (!(await canModerate(req.params.id, req.user.id))) return res.status(403).json({ error: 'Sem permissao' });
  const { userId, minutes } = req.body || {};
  const until = minutes ? new Date(Date.now() + minutes * 60000) : null;
  await prisma.mute.upsert({
    where: { serverId_userId: { serverId: req.params.id, userId } },
    update: { until },
    create: { serverId: req.params.id, userId, until },
  });
  res.json({ ok: true });
});

app.delete('/api/servers/:id/mute/:userId', authRequired, async (req, res) => {
  if (!(await canModerate(req.params.id, req.user.id))) return res.status(403).json({ error: 'Sem permissao' });
  await prisma.mute.deleteMany({ where: { serverId: req.params.id, userId: req.params.userId } });
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/db-status', authRequired, async (req, res) => {
  try {
    const [users, servers, channels, messages] = await Promise.all([
      prisma.user.count(), prisma.server.count(), prisma.channel.count(), prisma.message.count(),
    ]);
    res.json({ db: 'postgres', connected: true, users, servers, channels, messages });
  } catch (e) {
    res.status(500).json({ db: 'postgres', connected: false, error: e.message });
  }
});

// ---- SOCKET.IO ----
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const online = new Map();
const voiceMembers = new Map(); // channelId -> Map(socketId -> {userId, username, muted, sharing})

function broadcastVoiceMembers() {
  const snap = {};
  for (const [ch, m] of voiceMembers) {
    if (m.size) snap[ch] = [...m.entries()].map(([socketId, v]) => ({ socketId, ...v }));
  }
  io.emit('voice:members', snap);
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('sem token'));
    socket.user = jwt.verify(token, SECRET);
    next();
  } catch {
    next(new Error('token invalido'));
  }
});

io.on('connection', (socket) => {
  const { id, username } = socket.user;
  online.set(id, username);
  io.emit('presence', [...online.entries()].map(([userId, name]) => ({ userId, username: name })));

  socket.on('join:server', (serverId) => socket.join(`server:${serverId}`));
  socket.on('join:channel', (channelId) => socket.join(`channel:${channelId}`));
  socket.on('join:dm', (dmId) => socket.join(`dm:${dmId}`));
  socket.on('typing', (d) => socket.to(`channel:${d.channelId}`).emit('typing', { ...d, username }));
  socket.on('typing:dm', (d) => socket.to(`dm:${d.dmId}`).emit('typing:dm', { ...d, username }));

  socket.on('voice:join', ({ channelId, muted }) => {
    socket.join(`voice:${channelId}`);
    if (!voiceMembers.has(channelId)) voiceMembers.set(channelId, new Map());
    voiceMembers.get(channelId).set(socket.id, { userId: id, username, muted: !!muted, sharing: false });
    socket.to(`voice:${channelId}`).emit('voice:peer-join', { userId: id, username, socketId: socket.id });
    const peers = [];
    for (const [sid, s] of io.of('/').sockets) {
      if (sid !== socket.id && s.rooms.has(`voice:${channelId}`)) {
        peers.push({ userId: s.user?.id, username: s.user?.username, socketId: sid });
      }
    }
    socket.emit('voice:peers', peers);
    broadcastVoiceMembers();
  });
  socket.on('voice:leave', ({ channelId }) => {
    socket.leave(`voice:${channelId}`);
    voiceMembers.get(channelId)?.delete(socket.id);
    socket.to(`voice:${channelId}`).emit('voice:peer-leave', { socketId: socket.id, userId: id });
    broadcastVoiceMembers();
  });
  socket.on('voice:mute', ({ channelId, muted }) => {
    voiceMembers.get(channelId)?.set(socket.id, { ...(voiceMembers.get(channelId)?.get(socket.id) || { userId: id, username }), muted: !!muted });
    socket.to(`voice:${channelId}`).emit('voice:peer-mute', { socketId: socket.id, userId: id, muted: !!muted });
    broadcastVoiceMembers();
  });
  socket.on('voice:sharing', ({ channelId, sharing }) => {
    const m = voiceMembers.get(channelId)?.get(socket.id);
    if (m) m.sharing = !!sharing;
    socket.to(`voice:${channelId}`).emit('voice:peer-sharing', { socketId: socket.id, userId: id, sharing: !!sharing });
    broadcastVoiceMembers();
  });
  socket.on('voice:signal', ({ to, data }) => {
    io.to(to).emit('voice:signal', { from: socket.id, userId: id, username, data });
  });
  socket.on('disconnect', () => {
    online.delete(id);
    io.emit('presence', [...online.entries()].map(([userId, name]) => ({ userId, username: name })));
    socket.broadcast.emit('voice:peer-leave', { socketId: socket.id, userId: id });
    for (const [ch, m] of voiceMembers) {
      if (m.delete(socket.id) && m.size === 0) voiceMembers.delete(ch);
    }
    broadcastVoiceMembers();
  });
});

function start(port) {
  const p = port || PORT;
  return seed().then(() => new Promise((resolve, reject) => {
    const srv = httpServer.listen(p, () => {
      console.log(`Discordia server (Postgres) em http://localhost:${p}`);
      resolve(srv);
    });
    srv.on('error', reject);
  }));
}

if (require.main === module) {
  start();
}

module.exports = { app, io, prisma, seed, start };
