// Configurações de voz/vídeo persistidas (estilo Discord: Voz e Vídeo)
const KEY = 'discordia_voice_settings';

export const voiceDefaults = {
  inputDeviceId: '',      // '' = padrão
  outputDeviceId: '',     // '' = padrão
  noiseSuppression: true, // redução de ruído
  echoCancellation: true, // cancelamento de eco
  autoGain: true,          // ganho automático
  hwAccel: true,           // H.264 + alto desempenho na tela
  autoSens: true,          // sensibilidade automática (gate)
  sensThreshold: 30,       // 0..100, abaixo disso o mic fecha
};

function load() {
  try {
    return { ...voiceDefaults, ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
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
