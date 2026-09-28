import { Link } from 'react-router-dom';
import { MessageCircle, Download } from 'lucide-react';

// Trilho de servidores (extrema esquerda)
export default function ServerBar({
  servers, serverId, onSelect,
  newServer, setNewServer, onCreateServer,
  joinId, setJoinId, onJoinServer,
  unreadServers,
}) {
  return (
    <aside className="servers">
      {servers.map((s) => (
        <div key={s.id} className={`srv-item ${s.id === serverId ? 'active' : ''}`}>
          <span className="srv-pill" />
          <button className="srv-btn" title={s.name} onClick={() => onSelect(s.id)}>
            {s.name.slice(0, 2).toUpperCase()}
          </button>
          {unreadServers.has(s.id) && <span className="srv-unread" />}
        </div>
      ))}
      <div className="srv-sep" />
      <div className="srv-item">
        <span className="srv-pill" />
        <form onSubmit={onCreateServer} className="mini-form" title="Criar servidor (nome + Enter)">
          <input className="srv-btn action" value={newServer} onChange={(e) => setNewServer(e.target.value)} placeholder="+" aria-label="Novo servidor" />
        </form>
      </div>
      <div className="srv-item">
        <span className="srv-pill" />
        <form onSubmit={onJoinServer} className="mini-form" title="Entrar com ID do servidor">
          <input className="srv-btn action" style={{ fontSize: 12 }} value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="ID" aria-label="Entrar com ID" />
        </form>
      </div>
      <div className="srv-sep" />
      <Link to="/dms" className="nav-circle" title="Mensagens diretas"><MessageCircle size={20} /></Link>
      <Link to="/download" className="nav-circle" title="Baixar para desktop"><Download size={20} /></Link>
    </aside>
  );
}
