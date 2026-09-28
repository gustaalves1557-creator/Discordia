import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hash, LogOut, Plus, Trash2, Users, Volume2, Pencil, DoorOpen, Settings, Paperclip, Shield, Mic, MicOff, Headphones, Smile, SendHorizontal, Download, MessageCircle, MonitorUp, Phone, PhoneCall, Search, X } from 'lucide-react';
import { api, uploadFile, API_URL } from '../api';
import { useAuth } from '../auth';
import { getSocket, closeSocket } from '../socket';
import Voice from './Voice';
import SettingsModal from './Settings';

const EMOJIS = ['😀', '😂', '😍', '👍', '🔥', '🎉', '😮', '😢', '🙏', '👏'];

function colorOf(name = '?') {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 45%, 45%)`;
}

export function Avatar({ name = '?', avatar, size = 'md', online }) {
  const initials = (avatar && avatar.length <= 3 && !avatar.startsWith('http') && !avatar.startsWith('/'))
    ? avatar
    : (name || '?').slice(0, 1).toUpperCase();
  const isImg = avatar && (avatar.startsWith('http') || avatar.startsWith('/') || avatar.startsWith('data:'));
  return (
    <span className={`avatar ${size}`} style={isImg ? undefined : { background: colorOf(name) }}>
      {isImg ? <img src={avatar} alt={name} /> : initials}
      {online !== undefined && <i className={`status-dot ${online ? 'on' : ''}`} />}
    </span>
  );
}

export default function Chat() {
  const { user, logout, setUserDirect } = useAuth();
  const [servers, setServers] = useState([]);
  const [serverId, setServerId] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [online, setOnline] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState('');
  const [newServer, setNewServer] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [joinId, setJoinId] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [voiceChannel, setVoiceChannel] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState({}); // channelId -> [{socketId,userId,username,muted,sharing}]
  const bottomRef = useRef(null);
  const socketRef = useRef(null);
  const fileRef = useRef(null);

  const server = servers.find((s) => s.id === serverId);
  const channel = channels.find((c) => c.id === channelId);
  const myRole = members.find((m) => m.userId === user?.id)?.role;
  const canMod = server && (server.ownerId === user?.id || myRole === 'admin' || myRole === 'moderator');
  const textChannels = channels.filter((c) => c.type !== 'voice');
  const voiceChannels = channels.filter((c) => c.type === 'voice');
  const isOnline = (uid) => online.some((o) => o.userId === uid);

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
    s.on('presence', setOnline);
    s.on('message:new', (m) => setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    s.on('message:update', (m) => setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x))));
    s.on('message:delete', (m) => setMessages((prev) => prev.filter((x) => x.id !== m.id)));
    s.on('typing', (d) => { setTyping(`${d.username} está digitando...`); setTimeout(() => setTyping(''), 2000); });
    s.on('channel:new', (c) => setChannels((prev) => [...prev, c]));
    s.on('channel:delete', (c) => {
      setChannels((prev) => prev.filter((x) => x.id !== c.id));
      setChannelId((cur) => (cur === c.id ? null : cur));
    });
    s.on('voice:members', setVoiceMembers);
    return () => { s.disconnect(); closeSocket(); };
  }, []);

  useEffect(() => {
    if (!serverId) return;
    socketRef.current?.emit('join:server', serverId);
    api(`/api/servers/${serverId}/channels`).then((chs) => {
      setChannels(chs);
      setChannelId((cur) => (chs.find((c) => c.id === cur) ? cur : chs[0]?.id || null));
    });
    api(`/api/servers/${serverId}/members`).then(setMembers).catch(() => setMembers([]));
  }, [serverId]);

  useEffect(() => {
    if (!channelId) { setMessages([]); return; }
    socketRef.current?.emit('join:channel', channelId);
    setLoadingMsgs(true);
    api(`/api/channels/${channelId}/messages`)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [channelId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if ((!text.trim()) || !channelId) return;
    const t = text; setText('');
    await api(`/api/channels/${channelId}/messages`, { method: 'POST', body: { content: t } }).catch(() => {});
  };

  const sendFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !channelId) return;
    try {
      const up = await uploadFile(f);
      await api(`/api/channels/${channelId}/messages`, { method: 'POST', body: { content: text || f.name, attachment: up.url } });
      setText('');
    } catch (err) { alert(err.message); }
    e.target.value = '';
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

  const leaveServer = async () => {
    if (!serverId || !confirm(`Sair de ${server?.name}?`)) return;
    await api(`/api/servers/${serverId}/leave`, { method: 'POST' }).catch(() => {});
    setServerId(null); await loadServers();
  };

  const deleteServer = async () => {
    if (!serverId || !confirm(`Excluir ${server?.name}? Só o dono pode.`)) return;
    try {
      await api(`/api/servers/${serverId}`, { method: 'DELETE' });
      setServerId(null); await loadServers();
    } catch (err) { alert(err.message); }
  };

  const createChannel = async (e) => {
    e.preventDefault();
    if (!newChannel.trim() || !serverId) return;
    await api(`/api/servers/${serverId}/channels`, { method: 'POST', body: { name: newChannel, type: newChannelType } }).catch(() => {});
    setNewChannel('');
  };

  const delMessage = (id) => api(`/api/messages/${id}`, { method: 'DELETE' }).catch(() => {});
  const startEdit = (m) => { setEditingId(m.id); setEditText(m.content); };
  const saveEdit = async (id) => {
    await api(`/api/messages/${id}`, { method: 'PUT', body: { content: editText } }).catch(() => {});
    setEditingId(null);
  };
  const delChannel = (id) => {
    if (!confirm('Excluir canal?')) return;
    api(`/api/channels/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  const kick = async (uid) => {
    if (!confirm('Expulsar usuário?')) return;
    await api(`/api/servers/${serverId}/members/${uid}`, { method: 'DELETE' }).catch((e) => alert(e.message));
    setMembers(await api(`/api/servers/${serverId}/members`).catch(() => []));
  };
  const ban = async (uid) => {
    if (!confirm('Banir usuário?')) return;
    await api(`/api/servers/${serverId}/ban`, { method: 'POST', body: { userId: uid } }).catch((e) => alert(e.message));
    setMembers(await api(`/api/servers/${serverId}/members`).catch(() => []));
  };
  const promote = async (uid, role) => {
    await api(`/api/servers/${serverId}/members/${uid}`, { method: 'PUT', body: { role } }).catch((e) => alert(e.message));
    setMembers(await api(`/api/servers/${serverId}/members`).catch(() => []));
  };

  const openProfile = () => setShowSettings(true);

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

  // mensagens consecutivas do mesmo autor (5 min) ficam compactas
  const isCompact = (m, prev) => {
    if (!prev || prev.authorId !== m.authorId || m.attachment) return false;
    if (new Date(m.createdAt) - new Date(prev.createdAt) > 5 * 60 * 1000) return false;
    return dayLabel(m.createdAt) === dayLabel(prev.createdAt);
  };

  const visibleMessages = search.trim()
    ? messages.filter((m) => (m.content || '').toLowerCase().includes(search.trim().toLowerCase()))
    : messages;

  const renderChannel = (c) => {
    const occupants = voiceMembers[c.id] || [];
    return (
      <div key={c.id}>
        <div className={`ch ${c.id === channelId ? 'active' : ''}`} onClick={() => { setChannelId(c.id); if (c.type === 'voice') setVoiceChannel(c); }}>
          {c.type === 'voice' ? <Volume2 size={16} /> : <Hash size={16} />} {c.name}
          {occupants.length > 0 && <span className="ch-count">{occupants.length}</span>}
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); delChannel(c.id); }} title="Excluir canal"><Trash2 size={13} /></button>
        </div>
        {occupants.map((o) => (
          <div key={o.socketId} className="voice-user" title={o.muted ? 'Mutado' : 'Na call'}>
            <Avatar name={o.username} size="sm" />
            <span>{o.username}</span>
            {o.sharing
              ? <MonitorUp size={12} className="in-call" />
              : o.muted
                ? <MicOff size={12} className="muted-ic" />
                : <Phone size={12} className="in-call" />}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`app ${showMembers ? '' : 'no-members'}`}>
      <aside className="servers">
        {servers.map((s) => (
          <div key={s.id} className={`srv-item ${s.id === serverId ? 'active' : ''}`}>
            <span className="srv-pill" />
            <button className="srv-btn" title={`${s.name}`} onClick={() => setServerId(s.id)}>
              {s.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        ))}
        <div className="srv-sep" />
        <div className="srv-item">
          <span className="srv-pill" />
          <form onSubmit={createServer} className="mini-form" title="Criar servidor (nome + Enter)">
            <input className="srv-btn action" value={newServer} onChange={(e) => setNewServer(e.target.value)} placeholder="+" />
          </form>
        </div>
        <div className="srv-item">
          <span className="srv-pill" />
          <form onSubmit={joinServer} className="mini-form" title="Entrar com ID do servidor">
            <input className="srv-btn action" style={{ fontSize: 12 }} value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="ID" />
          </form>
        </div>
        <div className="srv-sep" />
        <Link to="/dms" className="nav-circle" title="Mensagens diretas"><MessageCircle size={20} /></Link>
        <Link to="/download" className="nav-circle" title="Baixar para desktop"><Download size={20} /></Link>
      </aside>

      <aside className="channels">
        <div className="srv-header">{server?.name || 'Discordia'}</div>
        {server && <div className="srv-sub">ID para convite: {server.id}</div>}
        <div className="srv-actions">
          <button onClick={leaveServer} title="Sair do servidor"><DoorOpen size={13} /> Sair</button>
          {server?.ownerId === user?.id && <button onClick={deleteServer} title="Excluir servidor"><Trash2 size={13} /> Excluir</button>}
        </div>
        <div className="ch-scroll">
          <div className="ch-cat">Canais de texto</div>
          {textChannels.map(renderChannel)}
          <div className="ch-cat">Canais de voz <button onClick={() => setNewChannelType('voice')} title="Novo canal de voz"><Plus size={14} /></button></div>
          {voiceChannels.map(renderChannel)}
        </div>
        <form onSubmit={createChannel} className="ch-add">
          <input value={newChannel} onChange={(e) => setNewChannel(e.target.value)} placeholder="Novo canal" />
          <select value={newChannelType} onChange={(e) => setNewChannelType(e.target.value)}>
            <option value="text">#</option>
            <option value="voice">🔊</option>
          </select>
          <button title="Criar canal"><Plus size={15} /></button>
        </form>
        <div className="me">
          <Avatar name={user?.username} avatar={user?.avatar} size="sm" online />
          <div className="who"><b>{user?.username}</b><small>online</small></div>
          <button title="Microfone"><Mic size={16} /></button>
          <button title="Fone"><Headphones size={16} /></button>
          <button onClick={openProfile} title="Perfil"><Settings size={16} /></button>
          <button onClick={logout} title="Sair"><LogOut size={16} /></button>
        </div>
      </aside>

      <main className="chat">
        <header className="chat-header">
          {channel?.type === 'voice' ? <Volume2 size={18} /> : <Hash size={20} />}
          {channel?.name || 'selecione um canal'}
          {channel && <span className="topic">{server?.name} • {members.length} membros</span>}
          {voiceChannel && <span className="call-badge" title="Você está na call"><Phone size={13} /> na call</span>}
          <div className="header-actions">
            {channel?.type === 'voice' && !voiceChannel && (
              <button className="header-btn" title="Entrar na call" onClick={() => setVoiceChannel(channel)}>
                <PhoneCall size={17} />
              </button>
            )}
            <button className={`header-btn ${showSearch ? 'active' : ''}`} title="Pesquisar mensagens" onClick={() => setShowSearch((v) => !v)}>
              <Search size={17} />
            </button>
            <button className={`header-btn ${showMembers ? 'active' : ''}`} title="Mostrar/ocultar membros" onClick={() => setShowMembers((v) => !v)}>
              <Users size={17} />
            </button>
          </div>
        </header>
        {showSearch && channel && (
          <div className="search-box" style={{ margin: '8px 16px 0', padding: '7px 10px' }}>
            <Search size={14} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Pesquisar em #${channel.name}...`}
              style={{ width: '100%' }}
            />
            {search && <button className="icon-btn" style={{ margin: 0 }} onClick={() => setSearch('')} title="Limpar"><X size={14} /></button>}
          </div>
        )}
        {voiceChannel && socketRef.current && (
          <Voice channelId={voiceChannel.id} channelName={voiceChannel.name} socket={socketRef.current} onLeave={() => setVoiceChannel(null)} />
        )}
        <div className="msgs">
          {loadingMsgs && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="loading-row">
                  <span className="avatar md skeleton" />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: '30%', height: 12, marginBottom: 6 }} />
                    <div className="skeleton" style={{ width: '80%', height: 12 }} />
                  </div>
                </div>
              ))}
            </>
          )}
          {!loadingMsgs && !channel && (
            <div className="empty-state">
              <div className="big-ic"><Hash size={30} /></div>
              <b>Nenhum canal selecionado</b>
              <p>Escolha um canal na lista ou crie um novo para começar a conversar.</p>
            </div>
          )}
          {!loadingMsgs && channel && visibleMessages.length === 0 && (
            <div className="empty-state">
              <div className="big-ic"><MessageCircle size={30} /></div>
              <b>{search.trim() ? 'Nada encontrado' : `Bem-vindo à #${channel.name}!`}</b>
              <p>{search.trim() ? 'Tente outro termo para a pesquisa.' : 'Este é o começo do canal. Diga oi!'}</p>
            </div>
          )}
          {!loadingMsgs && visibleMessages.map((m, i) => {
            const prev = visibleMessages[i - 1];
            const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
            const compact = isCompact(m, prev);
            const edited = m.updatedAt && new Date(m.updatedAt) - new Date(m.createdAt) > 1000;
            return (
              <div key={m.id}>
                {showDay && <div className="day-divider">{dayLabel(m.createdAt)}</div>}
                <div className={`msg ${compact ? 'compact' : ''}`}>
                  {compact ? (
                    <span className="compact-time">{new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  ) : (
                    <Avatar name={m.author?.username} avatar={m.author?.avatar} size="md" />
                  )}
                  <div className="body">
                    {!compact && (
                      <div className="msg-head">
                        <b>{m.author?.username || '?'}</b>
                        <time>{new Date(m.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>
                        {edited && <span className="edited">(editado)</span>}
                      </div>
                    )}
                    {editingId === m.id ? (
                      <span className="edit-row">
                        <input value={editText} onChange={(e) => setEditText(e.target.value)} />
                        <button onClick={() => saveEdit(m.id)}>Salvar</button>
                        <button onClick={() => setEditingId(null)}>Cancelar</button>
                      </span>
                    ) : (
                      <p>{highlight(m.content)}</p>
                    )}
                {m.attachment && (
                  m.attachment.match(/\.(png|jpg|jpeg|gif|webp)$/i)
                    ? <img className="attachment" src={`${API_URL()}${m.attachment}`} alt="anexo" />
                    : <a href={`${API_URL()}${m.attachment}`} target="_blank" rel="noreferrer">📎 baixar anexo</a>
                )}
                  </div>
                  {m.authorId === user?.id && editingId !== m.id && (
                    <span className="msg-actions">
                      <button className="icon-btn" onClick={() => startEdit(m)} title="Editar"><Pencil size={14} /></button>
                      <button className="icon-btn" onClick={() => delMessage(m.id)} title="Excluir"><Trash2 size={14} /></button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="typing">{typing}</div>
        <div className="chat-input-zone">
          {showEmoji && (
            <div className="emoji-bar">
              {EMOJIS.map((e) => <button key={e} onClick={() => setText((t) => t + e)}>{e}</button>)}
            </div>
          )}
          <form onSubmit={send} className="send">
            <button type="button" className="tool-btn" onClick={() => fileRef.current?.click()} title="Anexar arquivo"><Paperclip size={18} /></button>
            <input
              value={text}
              onChange={(e) => { setText(e.target.value); socketRef.current?.emit('typing', { channelId }); }}
              placeholder={channel ? `Conversar em #${channel.name}` : 'Selecione um canal...'}
            />
            <button type="button" className="tool-btn" onClick={() => setShowEmoji((v) => !v)} title="Emoji"><Smile size={18} /></button>
            <button className="send-btn" title="Enviar"><SendHorizontal size={15} /></button>
          </form>
        </div>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={sendFile} />
      </main>

      <aside className="members">
        <h4><Users size={13} /> Membros — {members.length} {canMod && <Shield size={12} />}</h4>
        {members.filter((m) => isOnline(m.userId)).map((m) => (
          <div key={m.userId} className="member">
            <Avatar name={m.username} avatar={m.avatar} size="sm" online={isOnline(m.userId)} />
            <span className="nm">{m.username}</span>
            {m.role !== 'member' && <small>{m.role}</small>}
            {canMod && m.userId !== user?.id && (
              <span className="mod-btns">
                <button onClick={() => promote(m.userId, 'moderator')} title="Mod">M</button>
                <button onClick={() => promote(m.userId, 'admin')} title="Admin">A</button>
                <button onClick={() => kick(m.userId)} title="Expulsar">K</button>
                <button onClick={() => ban(m.userId)} title="Banir">B</button>
              </span>
            )}
          </div>
        ))}
        <h4>Offline — {members.filter((m) => !isOnline(m.userId)).length}</h4>
        {members.filter((m) => !isOnline(m.userId)).map((m) => (
          <div key={m.userId} className="member off">
            <Avatar name={m.username} avatar={m.avatar} size="sm" online={false} />
            <span className="nm">{m.username}</span>
            {m.role !== 'member' && <small>{m.role}</small>}
          </div>
        ))}
      </aside>

      {showSettings && (
        <SettingsModal user={user} onUserChange={(u) => { setUserDirect(u); }} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
