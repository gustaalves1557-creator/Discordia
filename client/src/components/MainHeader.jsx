import { Hash, Volume2, PhoneCall, Search, Users, X, Phone } from 'lucide-react';

// Cabeçalho fixo da área principal
export default function MainHeader({
  channel, serverName, memberCount, voiceActive,
  onJoinVoice, showSearch, setShowSearch, search, setSearch,
  showMembers, setShowMembers,
}) {
  return (
    <header className="chat-header">
      {channel?.type === 'voice' ? <Volume2 size={18} /> : <Hash size={20} />}
      {channel?.name || 'selecione um canal'}
      {channel && <span className="topic">{serverName} • {memberCount} membros</span>}
      {voiceActive && <span className="call-badge" title="Você está na call"><Phone size={13} /> na call</span>}
      <div className="header-actions">
        {channel?.type === 'voice' && !voiceActive && (
          <button className="header-btn" title="Entrar na call" onClick={onJoinVoice}>
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
  );
}

export function SearchBar({ channelName, search, setSearch }) {
  return (
    <div className="search-box" style={{ margin: '8px 16px 0', padding: '7px 10px' }}>
      <Search size={14} />
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Pesquisar em #${channelName}...`}
        style={{ width: '100%' }}
      />
      {search && <button className="icon-btn" style={{ margin: 0 }} onClick={() => setSearch('')} title="Limpar"><X size={14} /></button>}
    </div>
  );
}
