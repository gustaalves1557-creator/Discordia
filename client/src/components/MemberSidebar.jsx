import { Users, Shield } from 'lucide-react';
import Avatar from './Avatar';

// Sidebar direita de membros (online/offline + menu contextual)
export default function MemberSidebar({ members, online, canMod, user, onContextMenu }) {
  const isOnline = (uid) => online.some((o) => o.userId === uid);
  const on = members.filter((m) => isOnline(m.userId));
  const off = members.filter((m) => !isOnline(m.userId));

  const row = (m, dim) => (
    <div
      key={m.userId}
      className={`member${dim ? ' off' : ''}`}
      onContextMenu={(e) => onContextMenu(e, m)}
      title={m.username}
    >
      <Avatar name={m.username} avatar={m.avatar} size="sm" online={isOnline(m.userId)} />
      <span className="nm">{m.username}</span>
      {m.role !== 'member' && <small>{m.role}</small>}
    </div>
  );

  return (
    <aside className="members">
      <h4><Users size={13} /> Membros — {members.length} {canMod && <Shield size={12} />}</h4>
      {on.map((m) => row(m, false))}
      <h4>Offline — {off.length}</h4>
      {off.map((m) => row(m, true))}
    </aside>
  );
}
