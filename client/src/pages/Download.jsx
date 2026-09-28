import { Link } from 'react-router-dom';

export default function Download() {
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ width: 480 }}>
        <div className="auth-brand">
          <img src="/icon.png" alt="Discordia" />
          <h1>Discordia para Desktop</h1>
        </div>
        <p className="auth-sub">Instalador único: app + banco de dados embutido. Sem instalar nada além dele.</p>
        <h3 style={{ color: '#fff' }}>Instalador completo</h3>
        <p>O arquivo <code>Discordia Setup 1.0.0.exe</code> está em <code>Downloads/Discordia/desktop/dist</code>. Execute, instale e abra — o banco e o servidor sobem sozinhos.</p>
        <Link to="/">← Voltar ao app</Link>
      </div>
    </div>
  );
}
