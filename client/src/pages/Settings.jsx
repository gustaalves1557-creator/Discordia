import { useEffect, useRef, useState } from 'react';
import { X, User, Mic, Camera, Globe } from 'lucide-react';
import { api, uploadFile, getApiUrl, setApiUrl } from '../api';
import { closeSocket } from '../socket';
import { Avatar } from './Chat';
import { getVoiceSettings, setVoiceSettings, micMeter } from '../voiceStore';

// Configurações do usuário (estilo Discord): Minha Conta | Voz e Vídeo
export default function Settings({ user, onUserChange, onClose, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'conta');
  const [cfg, setCfg] = useState(getVoiceSettings());
  const [devices, setDevices] = useState([]);
  const [name, setName] = useState(user?.username || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [saving, setSaving] = useState(false);
  const [level, setLevel] = useState(0);
  const [serverUrl, setServerUrl] = useState(getApiUrl());
  const [connStatus, setConnStatus] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices?.enumerateDevices?.()
      .then((ds) => { if (alive) setDevices(ds); })
      .catch(() => {});
    const id = setInterval(() => setLevel(micMeter.level || 0), 150);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const patch = (p) => {
    const next = { ...cfg, ...p };
    setCfg(next);
    setVoiceSettings(p);
  };

  const audioIns = devices.filter((d) => d.kind === 'audioinput');
  const audioOuts = devices.filter((d) => d.kind === 'audiooutput');

  const saveAccount = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const u = await api('/api/auth/profile', { method: 'PUT', body: { username: name, avatar } });
      onUserChange(u);
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  const uploadPhoto = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const up = await uploadFile(f);
      const url = `${getApiUrl()}${up.url}`;
      setAvatar(url);
      const u = await api('/api/auth/profile', { method: 'PUT', body: { username: name || user.username, avatar: url } });
      onUserChange(u);
    } catch (err) { alert(err.message); }
    e.target.value = '';
  };

  const Toggle = ({ on, onClick }) => (
    <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="knob" />
    </button>
  );

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <aside className="settings-side">
          <span className="settings-title">Configurações</span>
          <button className={tab === 'conta' ? 'active' : ''} onClick={() => setTab('conta')}><User size={15} /> Minha conta</button>
          <button className={tab === 'voz' ? 'active' : ''} onClick={() => setTab('voz')}><Mic size={15} /> Voz e vídeo</button>
          <button className={tab === 'conexao' ? 'active' : ''} onClick={() => setTab('conexao')}><Globe size={15} /> Conexão</button>
        </aside>
        <main className="settings-main">
          <button className="settings-close" onClick={onClose} title="Fechar"><X size={18} /></button>

          {tab === 'conta' && (
            <form onSubmit={saveAccount}>
              <h2>Minha conta</h2>
              <div className="profile-card">
                <Avatar name={name || user?.username} avatar={avatar} size="md" />
                <div>
                  <b>{name || user?.username}</b>
                  <small>{user?.email}</small>
                </div>
                <button type="button" onClick={() => fileRef.current?.click()}><Camera size={14} /> Trocar foto</button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadPhoto} />
              </div>
              <label className="set-label">Nome de usuário
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="set-label">Avatar (emoji ou URL)
                <input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="😀 ou http..." />
              </label>
              <div className="emoji-pick">
                {['😀', '😎', '🤖', '🐱', '🦊', '👾', '🎮', '⚡'].map((e) => (
                  <button type="button" key={e} onClick={() => setAvatar(e)}>{e}</button>
                ))}
                <button type="button" onClick={() => setAvatar('')}>sem foto</button>
              </div>
              <button className="primary-btn" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
            </form>
          )}

          {tab === 'voz' && (
            <div>
              <h2>Voz e vídeo</h2>

              <label className="set-label">Dispositivo de entrada (microfone)
                <select value={cfg.inputDeviceId} onChange={(e) => patch({ inputDeviceId: e.target.value })}>
                  <option value="">Padrão do sistema</option>
                  {audioIns.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microfone ${i + 1}`}</option>
                  ))}
                </select>
              </label>
              {audioIns.length === 0 && <small className="hint">Entre numa call para listar os microfones.</small>}

              <label className="set-label">Dispositivo de saída (fone/caixas)
                <select value={cfg.outputDeviceId} onChange={(e) => patch({ outputDeviceId: e.target.value })}>
                  <option value="">Padrão do sistema</option>
                  {audioOuts.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Saída ${i + 1}`}</option>
                  ))}
                </select>
              </label>

              <div className="set-row">
                <div>
                  <b>Sensibilidade do microfone</b>
                  <small>Fale para testar. Abaixo do limite, o mic fecha sozinho.</small>
                </div>
                <Toggle on={cfg.autoSens} onClick={() => patch({ autoSens: !cfg.autoSens })} />
              </div>
              <div className="meter">
                <div className="meter-fill" style={{ width: `${Math.min(100, level)}%` }} />
                <div className="meter-gate" style={{ left: `${cfg.sensThreshold}%` }} />
              </div>
              <input
                type="range" min="0" max="100" value={cfg.sensThreshold}
                disabled={!cfg.autoSens}
                onChange={(e) => patch({ sensThreshold: Number(e.target.value) })}
                className="slider"
              />

              <div className="set-row">
                <div>
                  <b>Redução de ruído</b>
                  <small>Filtra barulho de fundo (teclado, ventilador).</small>
                </div>
                <Toggle on={cfg.noiseSuppression} onClick={() => patch({ noiseSuppression: !cfg.noiseSuppression })} />
              </div>
              <div className="set-row">
                <div>
                  <b>Cancelamento de eco</b>
                  <small>Evita que sua caixa de som realimente o mic.</small>
                </div>
                <Toggle on={cfg.echoCancellation} onClick={() => patch({ echoCancellation: !cfg.echoCancellation })} />
              </div>
              <div className="set-row">
                <div>
                  <b>Ganho automático</b>
                  <small>Ajusta seu volume sozinho.</small>
                </div>
                <Toggle on={cfg.autoGain} onClick={() => patch({ autoGain: !cfg.autoGain })} />
              </div>
              <div className="set-row">
                <div>
                  <b>Aceleração de hardware (H.264)</b>
                  <small>Usa a GPU para codificar a tela: 1080p60 sem quedas. Desligar usa perfil econômico.</small>
                </div>
                <Toggle on={cfg.hwAccel} onClick={() => patch({ hwAccel: !cfg.hwAccel })} />
              </div>
              <small className="hint">Trocas de microfone e filtros aplicam na hora, sem sair da call.</small>
            </div>
          )}

          {tab === 'conexao' && (
            <div>
              <h2>Conexão</h2>
              <p style={{ color: 'var(--txt-dim)', fontSize: 13.5, margin: '0 0 6px' }}>
                Endereço do servidor do Discordia. Use o servidor na nuvem para conversar com amigos de qualquer lugar.
              </p>
              <label className="set-label">Servidor
                <input
                  value={serverUrl}
                  onChange={(e) => { setServerUrl(e.target.value); setConnStatus(''); }}
                  placeholder="https://seu-servidor.onrender.com"
                />
              </label>
              {connStatus && <p style={{ fontSize: 13, color: connStatus.startsWith('OK') ? 'var(--green)' : 'var(--red)' }}>{connStatus}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  className="primary-btn"
                  style={{ marginTop: 0 }}
                  onClick={async () => {
                    setConnStatus('Testando...');
                    try {
                      const clean = serverUrl.trim().replace(/\/$/, '');
                      const r = await fetch(`${clean}/api/health`);
                      if (!r.ok) throw new Error('sem resposta');
                      setConnStatus('OK! Servidor respondendo.');
                    } catch {
                      setConnStatus('Falha: confira o endereço (precisa começar com http:// ou https://).');
                    }
                  }}
                >
                  Testar
                </button>
                <button
                  className="primary-btn"
                  style={{ marginTop: 0 }}
                  onClick={() => {
                    setApiUrl(serverUrl);
                    closeSocket();
                    window.location.reload();
                  }}
                >
                  Salvar e reconectar
                </button>
              </div>
              <small className="hint">Atual: {getApiUrl()}. Trocar de servidor exige login de novo (cada servidor tem suas contas).</small>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
