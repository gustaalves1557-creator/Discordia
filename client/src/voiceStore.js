// Configurações de voz/vídeo persistidas (estilo Discord: Voz e Vídeo)
const KEY = 'discordia_voice_settings';

export const voiceDefaults = {
  __v: 2,                 // versão das configs (migra sozinho)
  inputDeviceId: '',      // '' = padrão
  outputDeviceId: '',     // '' = padrão
  noiseSuppression: true, // redução de ruído
  echoCancellation: true, // cancelamento de eco
  autoGain: false,        // ganho automático do navegador (desligado: evita a voz abaixando sozinha)
  hwAccel: true,           // H.264 + alto desempenho na tela
  autoSens: true,          // sensibilidade automática (gate)
  sensThreshold: 20,       // 0..100, abaixo disso o mic fecha
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    const base = { ...voiceDefaults, ...saved };
    if (saved.__v !== 2) {
      // migração: mantém dispositivos/HW, corrige o que causava voz oscilando
      base.autoGain = false;
      base.sensThreshold = 20;
      base.__v = 2;
      try { localStorage.setItem(KEY, JSON.stringify(base)); } catch {}
    }
    return base;
  } catch {
    return { ...voiceDefaults };
  }
}

let current = load();
const listeners = new Set();

export function getVoiceSettings() {
  return { ...current };
}

export function setVoiceSettings(patch) {
  const prev = { ...current };
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch {}
  for (const fn of listeners) {
    try { fn({ ...current }, prev); } catch {}
  }
}

export function subscribeVoiceSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// nível atual do mic (0..100), atualizado pela sala de voz p/ a barrinha de teste
export const micMeter = { level: 0 };
