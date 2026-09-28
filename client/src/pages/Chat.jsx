import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadFile } from '../api';
import { useAuth } from '../auth';
import { getSocket, closeSocket } from '../socket';
import { getUiSettings, subscribeUiSettings, applyUiSettings, playNotif } from '../uiStore';
import Voice from './Voice';
import SettingsModal from './Settings';
import Avatar from '../components/Avatar';
import ServerBar from '../components/ServerBar';
import ServerSidebar from '../components/ServerSidebar';
import UserPanel from '../components/UserPanel';
import MainHeader, { SearchBar } from '../components/MainHeader';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import MemberSidebar from '../components/MemberSidebar';
import ContextMenu from '../components/ContextMenu';
import ConfirmModal from '../components/ConfirmModal';

export { Avatar };

const UNREAD_KEY = 'discordia_unread';
const loadUnread = () => {
  try { return JSON.parse(localStorage.getItem(UNREAD_KEY)) || {}; } catch { return {}; }
};

export default function Chat() {
  const { user, logout, setUserDirect } = useAuth();
  const nav = useNavigate();
  const [servers, setServers] = useState([]);
  const [serverId, setServerId] = useState(null);
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [channelId, setChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [mutes, setMutes] = useState([]);
  const [online, setOnline] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState('');
  const [newServer, setNewServer] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [newChannelCat, setNewChannelCat] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [joinId, setJoinId] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reactRowId, setReactRowId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceChannel, setVoiceChannel] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState({});
  const [conn, setConn] = useState('on');
  const [unread, setUnread] = useState(loadUnread());
  const [memberCtx, setMemberCtx] = useState(null); // {x, y, member}
  const [confirm, setConfirm] = useState(null); // {title, message, confirmLabel, danger, action}
  const [uiPrefs, setUiPrefs] = useState(getUiSettings());
  const bottomRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimer = useRef(null);
  const channelIdRef = useRef(null);
  const userRef = useRef(null);
  const [sock, setSock] = useState(null);

  const server = servers.find((s) => s.id === serverId);
  const channel = channels.find((c) => c.id === channelId);
  const myRole = members.find((m) => m.userId === user?.id)?.role;
  const canMod = server && (server.ownerId === user?.id || myRole === 'admin' || myRole === 'moderator');
  const isOwner = server && user && server.ownerId === user.id;
  const isOnline = (uid) => online.some((o) => o.userId === uid);
  const isMuted = (uid) => mutes.some((x) => x.userId === uid);

  channelIdRef.current = channelId;
  userRef.current = user;

  useEffect(() => {
    applyUiSettings();
    return subscribeUiSettings((next) => setUiPrefs({ ...next }));
  }, []);

  const saveUnread = (u) => {
    setUnread(u);
    try { localStorage.setItem(UNREAD_KEY, JSON.stringify(u)); } catch {}
  };
  const markRead = (cid) => {
    if (!cid) return;
    saveUnread(((u) => { const n = { ...u }; delete n[cid]; return n; })(unread));
  };
  const unreadServers = new Set(
    Object.keys(unread).map((cid) => channels.find((c) => c.id === cid)?.serverId).filter(Boolean)
  );

  const loadServers = async () => {
    const list = await api('/api/servers');
    setServers(list);
    if (!serverId && list.length) setServerId(list[0].id);
    if (serverId && !list.find((s) => s.id === serverId)) setServerId(list[0]?.id || null);
  };
  useEffect(() => { loadServers(); }, []);

  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;
    setSock(s);
    s.on('presence', setOnline);
    s.on('message:new', (m) => {
      if (m.channelId === channelIdRef.current) {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      } else {
        const u = loadUnread();
        u[m.channelId] = (u[m.channelId] || 0) + 1;
        saveUnread(u);
      }
      const prefs = getUiSettings();
      if (prefs.notifSound && m.authorId !== userRef.current?.id && !m.system) playNotif();
    });
    s.on('message:update', (m) => setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x))));
    s.on('message:delete', (m) => setMessages((prev) => prev.filter((x) => x.id !== m.id)));
    s.on('typing', (d) => {
      if (!getUiSettings().showTyping) return;
      setTyping(`${d.username} está digitando...`);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(''), 2000);
    });
    s.on('channel:new', (c) => setChannels((prev) => [...prev, c]));
    s.on('channel:delete', (c) => {
      setChannels((prev) => prev.filter((x) => x.id !== c.id));
      setChannelId((cur) => (cur === c.id ? null : cur));
    });
    s.on('category:new', (c) => setCategories((prev) => [...prev, c]));
    s.on('category:delete', (c) => setCategories((prev) => prev.filter((x) => x.id !== c.id)));
    s.on('voice:members', setVoiceMembers);
    s.on('connect', () => setConn('on'));
    s.on('disconnect', () => setConn('off'));
    s.on('connect_error', () => setConn('trying'));
    return () => { if (typingTimer.current) clearTimeout(typingTimer.current); s.disconnect(); closeSocket(); };
  }, []);

  const refreshMembers = async () => {
    if (!serverId) return;
    setMembers(await api(`/api/servers/${serverId}/members`).catch(() => []));
    setMutes(await api(`/api/servers/${serverId}/mutes`).catch(() => []));
  };

  useEffect(() => {
    if (!serverId) return;
    socketRef.current?.emit('join:server', serverId);
    api(`/api/servers/${serverId}/channels`).then((chs) => {
      setChannels(chs);
      setChannelId((cur) => (chs.find((c) => c.id === cur) ? cur : chs[0]?.id || null));
    });
    api(`/api/servers/${serverId}/categories`).then(setCategories).catch(() => setCategories([]));
    refreshMembers();
  }, [serverId]);

  useEffect(() => {
    if (!channelId) { setMessages([]); return; }
    socketRef.current?.emit('join:channel', channelId);
    markRead(channelId);
    setLoadingMsgs(true);
    api(`/api/channels/${channelId}/messages`)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [channelId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Alt+↑/↓ troca de canal, Esc fecha busca/emoji
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowSearch(false);
        setShowEmoji(false);
        setReactRowId(null);
        return;
      }
      if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      const texts = channels.filter((c) => c.type !== 'voice');
      if (!texts.length) return;
      const i = texts.findIndex((c) => c.id === channelId);
      const n = e.key === 'ArrowDown' ? (i + 1) % texts.length : (i - 1 + texts.length) % texts.length;
      selectChannel(texts[n]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channels, channelId]);

  const selectChannel = (c) => {
    setChannelId(c.id);
    markRead(c.id);
    if (c.type === 'voice') setVoiceChannel(c);
  };

  const onTyping = () => {
    if (getUiSettings().sendTyping) socketRef.current?.emit('typing', { channelId });
  };

  const send = async (txt, replyId) => {
    const t = (txt ?? text).trim();
    if (!t || !channelId) return;
    setText('');
    setReplyTo(null);
    await api(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: { content: t, ...(replyId ? { replyToId: replyId } : {}) },
    }).catch(() => {});
  };

  const sendFiles = async (files, caption) => {
    if (!channelId || !files.length) return;
    try {
      for (let i = 0; i < files.length; i++) {
        const up = await uploadFile(files[i]);
        await api(`/api/channels/${channelId}/messages`, {
          method: 'POST',
          body: { content: i === 0 ? caption || files[i].name : files[i].name, attachment: up.url },
        });
      }
      setText('');
    } catch (err) { alert(err.message); }
  };

  const react = async (id, emoji) => {
    await api(`/api/messages/${id}/reactions`, { method: 'POST', body: { emoji } }).catch(() => {});
  };

  const createServer = async (e) => {
    e.preventDefault();
    if (!newServer.trim()) return;
    const s = await api('/api/servers', { method: 'POST', body: { name: newServer } });
    setNewServer('');
    await loadServers(); setServerId(s.id);
  };

  const joinServer = async (e) => {
    e.preventDefault();
    if (!joinId.trim()) return;
    try {
      const s = await api(`/api/servers/${joinId.trim()}/join`, { method: 'POST' });
      setJoinId('');
      await loadServers(); setServerId(s.id);
    } catch (err) { alert(err.message); }
  };

  const leaveServer = () => {
    if (!serverId) return;
    setConfirm({
      title: `Sair de ${server?.name}?`,
      message: 'Você poderá entrar de novo com o ID do servidor.',
      confirmLabel: 'Sair', danger: true,
      action: async () => {
        await api(`/api/servers/${serverId}/leave`, { method: 'POST' }).catch(() => {});
        setServerId(null); setVoiceChannel(null); await loadServers();
      },
    });
  };

  const deleteServer = () => {
    if (!serverId) return;
    setConfirm({
      title: `Excluir ${server?.name}?`,
      message: 'Todos os canais e mensagens serão apagados. Só o dono pode fazer isso.',
      confirmLabel: 'Excluir', danger: true,
      action: async () => {
        try {
          await api(`/api/servers/${serverId}`, { method: 'DELETE' });
          setServerId(null); setVoiceChannel(null); await loadServers();
        } catch (err) { alert(err.message); }
      },
    });
  };

  const renameServer = () => {
    if (!serverId) return;
    const name = window.prompt('Novo nome do servidor:', server?.name || '');
    if (!name?.trim() || name.trim() === server?.name) return;
    api(`/api/servers/${serverId}`, { method: 'PUT', body: { name: name.trim() } })
      .then((s) => setServers((prev) => prev.map((x) => (x.id === s.id ? s : x))))
      .catch((err) => alert(err.message));
  };

  const copyServerId = () => {
    if (serverId) navigator.clipboard?.writeText(serverId).catch(() => {});
  };

  const createChannel = async (e) => {
    e.preventDefault();
    if (!newChannel.trim() || !serverId) return;
    await api(`/api/servers/${serverId}/channels`, {
      method: 'POST',
      body: { name: newChannel, type: newChannelType, ...(newChannelCat ? { categoryId: newChannelCat } : {}) },
    }).catch((err) => alert(err.message));
    setNewChannel('');
  };

  const createCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.trim() || !serverId) return;
    await api(`/api/servers/${serverId}/categories`, { method: 'POST', body: { name: newCategory } })
      .catch((err) => alert(err.message));
    setNewCategory('');
  };

  const deleteCategory = (id) => {
    const cat = categories.find((c) => c.id === id);
    setConfirm({
      title: `Excluir categoria ${cat?.name}?`,
      message: 'Os canais dela passam para a área geral.',
      confirmLabel: 'Excluir', danger: true,
      action: async () => {
        await api(`/api/categories/${id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
      },
    });
  };

  const delChannel = (id) => {
    const c = channels.find((x) => x.id === id);
    setConfirm({
      title: `Excluir #${c?.name}?`,
      message: 'Todas as mensagens do canal serão apagadas.',
      confirmLabel: 'Excluir', danger: true,
      action: async () => { await api(`/api/channels/${id}`, { method: 'DELETE' }).catch(() => {}); },
    });
  };

  const delMessage = (id) => api(`/api/messages/${id}`, { method: 'DELETE' }).catch(() => {});
  const startEdit = (m) => { setEditingId(m.id); setEditText(m.content); };
  const saveEdit = async (id) => {
    await api(`/api/messages/${id}`, { method: 'PUT', body: { content: editText } }).catch(() => {});
    setEditingId(null);
  };

  const reloadMembers = () => refreshMembers();

  const kick = (m) => setConfirm({
    title: `Expulsar ${m.username}?`, message: 'A pessoa poderá entrar de novo com o ID.',
    confirmLabel: 'Expulsar', danger: true,
    action: async () => {
      await api(`/api/servers/${serverId}/members/${m.userId}`, { method: 'DELETE' }).catch((e) => alert(e.message));
      reloadMembers();
    },
  });
  const ban = (m) => setConfirm({
    title: `Banir ${m.username}?`, message: 'A pessoa não conseguirá mais entrar.',
    confirmLabel: 'Banir', danger: true,
    action: async () => {
      await api(`/api/servers/${serverId}/ban`, { method: 'POST', body: { userId: m.userId } }).catch((e) => alert(e.message));
      reloadMembers();
    },
  });
  const promote = async (m, role) => {
    await api(`/api/servers/${serverId}/members/${m.userId}`, { method: 'PUT', body: { role } }).catch((e) => alert(e.message));
    reloadMembers();
  };
  const muteMember = async (m, minutes) => {
    await api(`/api/servers/${serverId}/mute`, { method: 'POST', body: { userId: m.userId, minutes } }).catch((e) => alert(e.message));
    reloadMembers();
  };
  const unmuteMember = async (m) => {
    await api(`/api/servers/${serverId}/mute/${m.userId}`, { method: 'DELETE' }).catch((e) => alert(e.message));
    reloadMembers();
  };
  const openDM = async (m) => {
    try {
      const dm = await api('/api/dms', { method: 'POST', body: { userId: m.userId } });
      try { localStorage.setItem('discordia_open_dm', dm.id); } catch {}
      nav('/dms');
    } catch (e) { alert(e.message); }
  };

  const memberMenu = (e, m) => {
    e.preventDefault();
    const items = [
      { label: `Conversar com ${m.username}`, onClick: () => openDM(m) },
    ];
    if (canMod && m.userId !== user?.id && m.userId !== server?.ownerId) {
      items.push(
        { label: 'Tornar moderador', onClick: () => promote(m, 'moderator') },
        { label: 'Tornar admin', onClick: () => promote(m, 'admin') },
        { label: 'Voltar a membro', onClick: () => promote(m, 'member') },
        isMuted(m.userId)
          ? { label: 'Remover silêncio', onClick: () => unmuteMember(m) }
          : { label: 'Silenciar 5 min', onClick: () => muteMember(m, 5) },
        { label: 'Expulsar', danger: true, onClick: () => kick(m) },
        { label: 'Banir', danger: true, onClick: () => ban(m) },
      );
    }
    setMemberCtx({
      x: Math.min(e.clientX, window.innerWidth - 230),
      y: Math.min(e.clientY, window.innerHeight - items.length * 40 - 20),
      items,
    });
  };

  const dayLabel = (iso) => {
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date();
    yest.setDate(today.getDate() - 1);
    const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (same(d, today)) return 'Hoje';
    if (same(d, yest)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const highlight = (content) => {
    const q = search.trim();
    if (!q || !content) return content;
    const i = content.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return content;
    return (<>{content.slice(0, i)}<mark>{content.slice(i, i + q.length)}</mark>{content.slice(i + q.length)}</>);
  };

  const isCompact = (m, prev) => {
    if (!prev || prev.authorId !== m.authorId || m.attachment || m.system) return false;
    if (new Date(m.createdAt) - new Date(prev.createdAt) > 5 * 60 * 1000) return false;
    return dayLabel(m.createdAt) === dayLabel(prev.createdAt);
  };

  const visibleMessages = search.trim()
    ? messages.filter((m) => (m.content || '').toLowerCase().includes(search.trim().toLowerCase()))
    : messages;

  return (
    <div className={`app ${showMembers ? '' : 'no-members'}`}>
      <ServerBar
        servers={servers}
        serverId={serverId}
        onSelect={setServerId}
        newServer={newServer}
        setNewServer={setNewServer}
        onCreateServer={createServer}
        joinId={joinId}
        setJoinId={setJoinId}
        onJoinServer={joinServer}
        unreadServers={unreadServers}
      />

      <div className="side-col">
        <ServerSidebar
          server={server}
          isOwner={isOwner}
          categories={categories}
          channels={channels}
          channelId={channelId}
          onSelectChannel={selectChannel}
          voiceMembers={voiceMembers}
          onDeleteChannel={delChannel}
          newChannel={newChannel}
          setNewChannel={setNewChannel}
          newChannelType={newChannelType}
          setNewChannelType={setNewChannelType}
          newChannelCat={newChannelCat}
          setNewChannelCat={setNewChannelCat}
          onCreateChannel={createChannel}
          newCategory={newCategory}
          setNewCategory={setNewCategory}
          onCreateCategory={createCategory}
          onDeleteCategory={deleteCategory}
          onCopyServerId={copyServerId}
          onRenameServer={renameServer}
          onLeaveServer={leaveServer}
          onDeleteServer={deleteServer}
        />
        <UserPanel user={user} onOpenSettings={() => setShowSettings(true)} onLogout={logout} />
      </div>

      <main className="chat">
        <MainHeader
          channel={channel}
          serverName={server?.name}
          memberCount={members.length}
          voiceActive={!!voiceChannel}
          onJoinVoice={() => channel?.type === 'voice' && setVoiceChannel(channel)}
          showSearch={showSearch}
          setShowSearch={setShowSearch}
          search={search}
          setSearch={setSearch}
          showMembers={showMembers}
          setShowMembers={setShowMembers}
        />
        {showSearch && channel && <SearchBar channelName={channel.name} search={search} setSearch={setSearch} />}
        {conn !== 'on' && (
          <div className={`conn-banner ${conn}`}>
            {conn === 'trying' ? 'Reconectando ao servidor...' : 'Desconectado do servidor. Verifique a conexão.'}
          </div>
        )}
        {voiceChannel && sock && (
          <Voice channelId={voiceChannel.id} channelName={voiceChannel.name} socket={sock} onLeave={() => setVoiceChannel(null)} />
        )}
        <MessageList
          messages={visibleMessages}
          loadingMsgs={loadingMsgs}
          channel={channel}
          search={search}
          user={user}
          dayLabel={dayLabel}
          highlight={highlight}
          isCompact={isCompact}
          bottomRef={bottomRef}
          editingId={editingId}
          editText={editText}
          setEditText={setEditText}
          onSaveEdit={saveEdit}
          onCancelEdit={() => setEditingId(null)}
          onStartEdit={startEdit}
          onDelete={delMessage}
          onReply={(m) => setReplyTo({ id: m.id, author: m.author, content: m.content })}
          onReact={react}
          reactRowId={reactRowId}
          onToggleReactRow={(id) => setReactRowId((cur) => (cur === id ? null : id))}
        />
        <div className="typing">{uiPrefs.showTyping ? typing : ''}</div>
        <MessageInput
          channel={channel}
          text={text}
          setText={setText}
          onSend={(t) => send(t, replyTo?.id)}
          onFiles={sendFiles}
          onTyping={onTyping}
          showEmoji={showEmoji}
          setShowEmoji={setShowEmoji}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </main>

      {showMembers && (
        <MemberSidebar
          members={members}
          online={online}
          canMod={canMod}
          user={user}
          onContextMenu={memberMenu}
        />
      )}

      {memberCtx && (
        <ContextMenu x={memberCtx.x} y={memberCtx.y} items={memberCtx.items} onClose={() => setMemberCtx(null)} />
      )}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.action}
          onClose={() => setConfirm(null)}
        />
      )}
      {showSettings && (
        <SettingsModal user={user} onUserChange={(u) => { setUserDirect(u); }} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
