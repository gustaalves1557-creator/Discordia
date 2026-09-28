import { useRef, useState } from 'react';
import { Paperclip, Smile, SendHorizontal, X, FileText } from 'lucide-react';

// Campo de mensagem: anexo, emoji, enviar, drag-and-drop + preview, reply
const EMOJIS = ['😀', '😂', '😍', '👍', '🔥', '🎉', '😮', '😢', '🙏', '👏'];

export default function MessageInput({
  channel, text, setText, onSend, onFiles, onTyping,
  showEmoji, setShowEmoji, replyTo, onCancelReply,
}) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState([]); // File[]

  const addFiles = (files) => {
    setPending((p) => [...p, ...files].slice(0, 5));
  };

  const submit = (e) => {
    e.preventDefault();
    if (pending.length) onFiles(pending, text);
    else onSend(text);
    setPending([]);
  };

  return (
    <div className="chat-input-zone">
      {replyTo && (
        <div className="reply-bar">
          <span>Respondendo a <b>{replyTo.author?.username}</b>: {replyTo.content?.slice(0, 80) || '(anexo)'}</span>
          <button className="icon-btn" style={{ margin: 0 }} onClick={onCancelReply} title="Cancelar resposta"><X size={14} /></button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="file-preview">
          {pending.map((f, i) => (
            <div key={i} className="file-chip" title={f.name}>
              {f.type.startsWith('image/') ? (
                <img src={URL.createObjectURL(f)} alt={f.name} />
              ) : (
                <span className="file-ic"><FileText size={18} /></span>
              )}
              <small>{f.name.length > 18 ? f.name.slice(0, 18) + '…' : f.name}</small>
              <button onClick={() => setPending((p) => p.filter((_, j) => j !== i))} title="Remover"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
      {showEmoji && (
        <div className="emoji-bar">
          {EMOJIS.map((e) => <button key={e} type="button" onClick={() => setText((t) => t + e)}>{e}</button>)}
        </div>
      )}
      <form
        onSubmit={submit}
        className={`send${dragOver ? ' drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles([...e.dataTransfer.files]); }}
      >
        <button type="button" className="tool-btn" onClick={() => fileRef.current?.click()} title="Anexar arquivo"><Paperclip size={18} /></button>
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); onTyping(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { /* submit nativo */ }
          }}
          placeholder={channel ? `Conversar em #${channel.name}` : 'Selecione um canal...'}
        />
        <button type="button" className="tool-btn" onClick={() => setShowEmoji((v) => !v)} title="Emoji"><Smile size={18} /></button>
        <button className="send-btn" title="Enviar"><SendHorizontal size={15} /></button>
      </form>
      <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) addFiles([...e.target.files]); e.target.value = ''; }} />
    </div>
  );
}
