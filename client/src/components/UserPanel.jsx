import { LogOut, Mic, Headphones, Settings } from 'lucide-react';
import Avatar from './Avatar';

// Painel do usuário (canto inferior esquerdo)
export default function UserPanel({ user, onOpenSettings, onLogout }) {
  return (
    <div className="me">
      <Avatar name={user?.username} avatar={user?.avatar} size="sm" online />
      <div className="who"><b>{user?.username}</b><small>online</small></div>
      <button title="Microfone (configurações de voz)"><Mic size={16} /></button>
      <button title="Fone (configurações de voz)"><Headphones size={16} /></button>
      <button onClick={onOpenSettings} title="Configurações"><Settings size={16} /></button>
      <button onClick={onLogout} title="Sair"><LogOut size={16} /></button>
    </div>
  );
}
