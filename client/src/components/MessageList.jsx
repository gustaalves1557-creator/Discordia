import { Hash, MessageCircle } from 'lucide-react';
import MessageItem from './MessageItem';

// Lista de mensagens: divisores de data, agrupadas, loading/empty states
export default function MessageList({
  messages, loadingMsgs, channel, search, user,
  dayLabel, highlight, isCompact, bottomRef,
  editingId, editText, setEditText, onSaveEdit, onCancelEdit,
  onStartEdit, onDelete, onReply, onReact, reactRowId, onToggleReactRow,
}) {
  return (
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
      {!loadingMsgs && channel && messages.length === 0 && (
        <div className="empty-state">
          <div className="big-ic"><MessageCircle size={30} /></div>
          <b>{search.trim() ? 'Nada encontrado' : `Bem-vindo à #${channel.name}!`}</b>
          <p>{search.trim() ? 'Tente outro termo para a pesquisa.' : 'Este é o começo do canal. Diga oi!'}</p>
        </div>
      )}
      {!loadingMsgs && messages.map((m, i) => {
        const prev = messages[i - 1];
        const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
        const compact = isCompact(m, prev);
        const edited = m.updatedAt && new Date(m.updatedAt) - new Date(m.createdAt) > 1000;
        return (
          <div key={m.id}>
            {showDay && <div className="day-divider">{dayLabel(m.createdAt)}</div>}
            <MessageItem
              m={m}
              compact={compact}
              time={new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              edited={edited}
              user={user}
              highlight={highlight}
              editingId={editingId}
              editText={editText}
              setEditText={setEditText}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onStartEdit={onStartEdit}
              onDelete={onDelete}
              onReply={onReply}
              onReact={onReact}
              showReactRow={reactRowId === m.id}
              onToggleReactRow={() => onToggleReactRow(m.id)}
            />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
