function colorOf(name = '?') {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 45%, 45%)`;
}

export default function Avatar({ name = '?', avatar, size = 'md', online, speaking }) {
  const initials = (avatar && avatar.length <= 3 && !avatar.startsWith('http') && !avatar.startsWith('/'))
    ? avatar
    : (name || '?').slice(0, 1).toUpperCase();
  const isImg = avatar && (avatar.startsWith('http') || avatar.startsWith('/') || avatar.startsWith('data:'));
  return (
    <span className={`avatar ${size}${speaking ? ' speaking' : ''}`} style={isImg ? undefined : { background: colorOf(name) }}>
      {isImg ? <img src={avatar} alt={name} /> : initials}
      {online !== undefined && <i className={`status-dot ${online ? 'on' : ''}`} />}
    </span>
  );
}
