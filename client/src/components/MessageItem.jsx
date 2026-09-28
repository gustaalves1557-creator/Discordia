import { Pencil, Trash2, Reply, Smile } from 'lucide-react';
import Avatar from './Avatar';
import { API_URL } from '../api';

// Uma mensagem (avatar, nome, hora, reply, conteúdo, anexo, reactions, ações)
export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageItem({
  m, compact, time, edited, user, highlight,
  editingId, editText, setEditText, onSaveEdit, onCancelEdit,
  onStartEdit, onDelete, onReply, onReact, showReactRow, onToggleReactRow,
}) {
  if (m.system) {
    return (
      <div className="msg system-msg" title={new Date(m.createdAt).toLocaleString('pt-BR')}>
        <span>{m.content}</span>
      </div>
    );
  }
  const mine = user?.id;
  return (
    <div className={`msg ${compact ? 'compact' : ''}`}>
      {compact ? (
        <span className="compact-time">{time}</span>
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
        {m.reply && (
          <div className="reply-quote">
            <b>{m.reply.author?.username}</b>
            <span>{m.reply.content?.slice(0, 120) || '(anexo)'}</span>
          </div>
        )}
        {editingId === m.id ? (
          <span className="edit-row">
            <input value={editText} onChange={(e) => setEditText(e.target.value)} />
            <button onClick={() => onSaveEdit(m.id)}>Salvar</button>
            <button onClick={onCancelEdit}>Cancelar</button>
          </span>
        ) : (
          <p>{highlight(m.content)}</p>
        )}
        {m.attachment && (
          m.attachment.match(/\.(png|jpg|jpeg|gif|webp)$/i)
            ? <img className="attachment" src={`${API_URL()}${m.attachment}`} alt="anexo" />
            : <a href={`${API_URL()}${m.attachment}`} target="_blank" rel="noreferrer">📎 baixar anexo</a>
        )}
        {(m.reactions || []).length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => {
              const voted = (r.users || []).some((u) => u.id === user?.id);
              return (
                <button
                  key={r.emoji}
                  className={`reaction${voted ? ' mine' : ''}`}
                  title={(r.users || []).map((u) => u.username).join(', ')}
                  onClick={() => onReact(m.id, r.emoji)}
                >
                  {r.emoji} <b>{r.count}</b>
                </button>
              );
            })}
          </div>
        )}
        {showReactRow && (
          <div className="react-row">
            {QUICK_EMOJIS.map((e) => (
              <button key={e} onClick={() => { onReact(m.id, e); onToggleReactRow(); }}>{e}</button>
            ))}
          </div>
        )}
      </div>
      {editingId !== m.id && (
        <span className="msg-actions">
          <button className="icon-btn" onClick={() => onToggleReactRow(m.id)} title="Reagir"><Smile size={14} /></button>
          <button className="icon-btn" onClick={() => onReply(m)} title="Responder"><Reply size={14} /></button>
          {m.authorId === user?.id && (
            <>
              <button className="icon-btn" onClick={() => onStartEdit(m)} title="Editar"><Pencil size={14} /></button>
              <button className="icon-btn" onClick={() => onDelete(m.id)} title="Excluir"><Trash2 size={14} /></button>
            </>
          )}
        </span>
      )}
    </div>
  );
}
