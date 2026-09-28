import { useState } from 'react';
import { Hash, Volume2, Plus, Trash2, ChevronDown, Copy, Pencil, DoorOpen, FolderPlus } from 'lucide-react';
import Avatar from './Avatar';
import ContextMenu from './ContextMenu';

// Sidebar do servidor: menu, categorias, canais, voz
export default function ServerSidebar({
  server, isOwner, categories, channels, channelId, onSelectChannel,
  voiceMembers, onDeleteChannel, onChannelMuteInfo,
  newChannel, setNewChannel, newChannelType, setNewChannelType,
  newChannelCat, setNewChannelCat,
  onCreateChannel,
  newCategory, setNewCategory, onCreateCategory, onDeleteCategory,
  onCopyServerId, onRenameServer, onLeaveServer, onDeleteServer,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [ctx, setCtx] = useState(null); // {x, y, channel}

  const byCat = {};
  const loose = [];
  for (const c of channels) {
    if (c.categoryId && categories.some((k) => k.id === c.categoryId)) {
      (byCat[c.categoryId] = byCat[c.categoryId] || []).push(c);
    } else loose.push(c);
  }
  const texts = (list) => list.filter((c) => c.type !== 'voice');
  const voices = (list) => list.filter((c) => c.type === 'voice');

  const openCtx = (e, channel) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 200), channel });
  };

  const renderChannel = (c) => {
    const occupants = voiceMembers[c.id] || [];
    return (
      <div key={c.id}>
        <div
          className={`ch ${c.id === channelId ? 'active' : ''}`}
          onClick={() => onSelectChannel(c)}
          onContextMenu={(e) => openCtx(e, c)}
          title={`#${c.name}`}
        >
          {c.type === 'voice' ? <Volume2 size={16} /> : <Hash size={16} />} {c.name}
          {occupants.length > 0 && <span className="ch-count">{occupants.length}</span>}
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onDeleteChannel(c.id); }} title="Excluir canal"><Trash2 size={13} /></button>
        </div>
        {occupants.map((o) => (
          <div key={o.socketId} className="voice-user" title={o.muted ? 'Mutado' : 'Na call'}>
            <Avatar name={o.username} size="sm" />
            <span>{o.username}</span>
            {o.sharing
              ? <span className="live-mini">AO VIVO</span>
              : o.muted
                ? <span className="muted-ic">🔇</span>
                : <span className="in-call">🔊</span>}
          </div>
        ))}
      </div>
    );
  };

  const renderGroup = (title, list, onAdd) => (
    list.length > 0 && (
      <>
        <div className="ch-cat">{title}
          <button onClick={onAdd} title={`Novo canal de ${title === 'Texto' ? 'texto' : 'voz'}`}><Plus size={14} /></button>
        </div>
        {list.map(renderChannel)}
      </>
    )
  );

  return (
    <aside className="channels">
      <button className="srv-header srv-menu-btn" onClick={() => setMenuOpen((v) => !v)} title="Menu do servidor">
        <span>{server?.name || 'Discordia'}</span>
        <ChevronDown size={16} />
      </button>
      {menuOpen && (
        <>
          <div className="ctx-overlay" onClick={() => setMenuOpen(false)} />
          <div className="srv-menu">
            <button onClick={() => { setMenuOpen(false); onCopyServerId(); }}><Copy size={14} /> Copiar ID do servidor</button>
            {isOwner && <button onClick={() => { setMenuOpen(false); onRenameServer(); }}><Pencil size={14} /> Renomear servidor</button>}
            <button onClick={() => { setMenuOpen(false); onLeaveServer(); }} className="danger"><DoorOpen size={14} /> Sair do servidor</button>
            {isOwner && <button onClick={() => { setMenuOpen(false); onDeleteServer(); }} className="danger"><Trash2 size={14} /> Excluir servidor</button>}
          </div>
        </>
      )}
      {server && <div className="srv-sub">ID para convite: {server.id}</div>}

      <div className="ch-scroll">
        {categories.map((cat) => (
          <div key={cat.id}>
            <div className="ch-cat">{cat.name}
              <button onClick={() => onDeleteCategory(cat.id)} title="Excluir categoria"><Trash2 size={12} /></button>
            </div>
            {texts(byCat[cat.id] || []).map(renderChannel)}
            {voices(byCat[cat.id] || []).map(renderChannel)}
            {(byCat[cat.id] || []).length === 0 && <div className="ch-empty">Nenhum canal</div>}
          </div>
        ))}
        {renderGroup('Texto', texts(loose))}
        {renderGroup('Voz', voices(loose))}
        {channels.length === 0 && <div className="ch-empty">Nenhum canal ainda. Crie o primeiro abaixo.</div>}
      </div>

      <form onSubmit={onCreateChannel} className="ch-add">
        <input value={newChannel} onChange={(e) => setNewChannel(e.target.value)} placeholder="Novo canal" aria-label="Novo canal" />
        <select value={newChannelType} onChange={(e) => setNewChannelType(e.target.value)} title="Tipo">
          <option value="text">#</option>
          <option value="voice">🔊</option>
        </select>
        <select value={newChannelCat} onChange={(e) => setNewChannelCat(e.target.value)} title="Categoria">
          <option value="">Geral</option>
          {categories.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <button title="Criar canal"><Plus size={15} /></button>
      </form>
      <form
        onSubmit={onCreateCategory}
        className="ch-add"
        title="Criar categoria (ex: JOGOS, ESTUDOS)"
      >
        <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nova categoria" aria-label="Nova categoria" />
        <button title="Criar categoria"><FolderPlus size={15} /></button>
      </form>
      {ctx?.channel && (
        <ContextMenu
          x={ctx.x} y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { label: `#${ctx.channel.name}`, onClick: () => onSelectChannel(ctx.channel) },
            {
              label: 'Copiar ID do canal',
              icon: <Copy size={13} />,
              onClick: () => navigator.clipboard?.writeText(ctx.channel.id).catch(() => {}),
            },
            { label: 'Excluir canal', icon: <Trash2 size={13} />, danger: true, onClick: () => onDeleteChannel(ctx.channel.id) },
          ]}
        />
      )}
    </aside>
  );
}
