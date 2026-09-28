import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hash, SendHorizontal, MessageCircle } from 'lucide-react';
import { api, API_URL } from '../api';
import { useAuth } from '../auth';
import { getSocket } from '../socket';
import { Avatar } from './Chat';

export default function DMs() {
  const { user } = useAuth();
  const [threads, setThreads] = useState([]);
  const [users, setUsers] = useState([]);
  const [dmId, setDmId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  const load = async () => {
    setThreads(await api('/api/dms'));
    setUsers(await api('/api/users'));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;
    const onDm = (m) => {
      if (m.threadId === dmId) setMsgs((p) => [...p, m]);
      load();
    };
    s.on('dm:new', onDm);
    return () => { s.off('dm:new', onDm); };
  }, [dmId]);

  useEffect(() => {
    if (!dmId) return;
    socketRef.current?.emit('join:dm', dmId);
    api(`/api/dms/${dmId}/messages`).then(setMsgs).catch(() => setMsgs([]));
  }, [dmId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const start = async (userId) => {
    const dm = await api('/api/dms', { method: 'POST', body: { userId } });
    await load(); setDmId(dm.id);
  };
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !dmId) return;
    const t = text; setText('');
    await api(`/api/dms/${dmId}/messages`, { method: 'POST', body: { content: t } }).catch(() => {});
  };

  const active = threads.find((t) => t.id === dmId);

  return (
    <div className="app" style={{ gridTemplateColumns: '72px 240px 1fr' }}>
      <aside className="servers">
        <Link to="/" className="nav-circle" title="Voltar aos servidores">🏠</Link>
      </aside>
      <aside className="channels">
        <div className="srv-header">Mensagens diretas</div>
        <div className="ch-scroll">
          <div className="ch-cat">Conversas</div>
          {threads.length === 0 && (
            <p style={{ color: 'var(--txt-mute)', fontSize: 12.5, padding: '2px 10px' }}>
              Nenhuma conversa. Escolha um usuário abaixo e clique em DM.
            </p>
          )}
          {threads.map((t) => (
            <div key={t.id} className={`ch ${t.id === dmId ? 'active' : ''}`} onClick={() => setDmId(t.id)}>
              <Avatar name={t.other?.username} avatar={t.other?.avatar} size="sm" /> {t.other?.username}
            </div>
          ))}
          <div className="ch-cat">Usuários</div>
          {users.filter((u) => u.id !== user?.id && u.email !== 'bot@discordia.local').map((u) => (
            <div key={u.id} className="member">
              <Avatar name={u.username} avatar={u.avatar} size="sm" />
              <span className="nm">{u.username}</span>
              <span className="mod-btns" style={{ display: 'inline-flex' }}>
                <button onClick={() => start(u.id)}>DM</button>
              </span>
            </div>
          ))}
        </div>
        <div className="me">
          <Avatar name={user?.username} avatar={user?.avatar} size="sm" online />
          <div className="who"><b>{user?.username}</b><small>online</small></div>
        </div>
      </aside>
      <main className="chat">
        <header className="chat-header">
          <Hash size={20} /> {active?.other?.username || 'Mensagens diretas'}
          {!dmId && <span className="topic">escolha ou inicie uma conversa</span>}
        </header>
        <div className="msgs">
          {!dmId && (
            <div className="empty-state">
              <div className="big-ic"><MessageCircle size={30} /></div>
              <b>Suas mensagens diretas</b>
              <p>Selecione uma conversa ou inicie uma nova com qualquer usuário da lista.</p>
            </div>
          )}
          {dmId && msgs.length === 0 && (
            <div className="empty-state">
              <div className="big-ic"><MessageCircle size={30} /></div>
              <b>Comece a conversa</b>
              <p>Nenhuma mensagem ainda. Diga oi!</p>
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className="msg">
              <Avatar name={m.author?.username} avatar={m.author?.avatar} size="md" />
              <div className="body">
                <div className="msg-head">
                  <b>{m.author?.username}</b>
                  <time>{new Date(m.createdAt).toLocaleString()}</time>
                </div>
                <p>{m.content}</p>
                {m.attachment && <a href={`${API_URL()}${m.attachment}`} target="_blank" rel="noreferrer">📎 anexo</a>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input-zone">
          <form onSubmit={send} className="send">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem privada..." />
            <button className="send-btn" title="Enviar"><SendHorizontal size={15} /></button>
          </form>
        </div>
      </main>
    </div>
  );
}
