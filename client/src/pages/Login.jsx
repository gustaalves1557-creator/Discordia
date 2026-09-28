import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try { await login(email, password); nav('/'); }
    catch (e2) { setErr(e2.message); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <img src="/icon.png" alt="Discordia" />
          <h1>Discordia</h1>
        </div>
        <p className="auth-sub">Boas-vindas de volta!</p>
        {err && <div className="error">{err}</div>}
        <label>E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button type="submit">Entrar</button>
        <span className="auth-foot">Precisando de uma conta? <Link to="/register">Registre-se</Link></span>
      </form>
    </div>
  );
}
