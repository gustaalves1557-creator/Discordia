import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try { await register(username, email, password); nav('/'); }
    catch (e2) { setErr(e2.message); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <img src="/icon.png" alt="Discordia" />
          <h1>Discordia</h1>
        </div>
        <p className="auth-sub">Criar uma conta</p>
        {err && <div className="error">{err}</div>}
        <label>Nome de usuário<input value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
        <label>E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button type="submit">Continuar</button>
        <span className="auth-foot"><Link to="/login">Já tem uma conta?</Link></span>
      </form>
    </div>
  );
}
