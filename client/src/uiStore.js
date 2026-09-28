// Preferências de interface (Aparência, Notificações, Privacidade)
const KEY = 'discordia_ui_settings';

export const uiDefaults = {
  __v: 1,
  density: 'comfortable', // comfortable | compact
  accent: 'discordia',    // discordia | blurple | green
  notifSound: true,
  showTyping: true,       // exibir "digitando..."
  sendTyping: true,       // enviar meu "digitando..."
};

function load() {
  try {
    return { ...uiDefaults, ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
  } catch {
    return { ...uiDefaults };
  }
}

let current = load();
const listeners = new Set();

export function getUiSettings() {
  return { ...current };
}
export function setUiSettings(patch) {
  const prev = { ...current };
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch {}
  applyUiSettings();
  for (const fn of listeners) {
    try { fn({ ...current }, prev); } catch {}
  }
}
export function subscribeUiSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const ACCENTS = {
  discordia: null, // usa o gradiente padrão do CSS
  blurple: { brand: '#5865f2', hover: '#4752c4', grad: 'linear-gradient(135deg,#5865f2,#7289da)' },
  green: { brand: '#23a55a', hover: '#1c8a4a', grad: 'linear-gradient(135deg,#23a55a,#4ade80)' },
};

export function applyUiSettings() {
  try {
    document.body.dataset.density = current.density || 'comfortable';
    const a = ACCENTS[current.accent];
    const root = document.documentElement.style;
    if (a) {
      root.setProperty('--brand', a.brand);
      root.setProperty('--brand-hover', a.hover);
      root.setProperty('--grad', a.grad);
    } else {
      root.removeProperty('--brand');
      root.removeProperty('--brand-hover');
      root.removeProperty('--grad');
    }
  } catch {}
}

// bip discreto de notificação (WebAudio, sem arquivos)
let audioCtx = null;
export function playNotif() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const t = audioCtx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.18);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.2);
    });
  } catch {}
}
