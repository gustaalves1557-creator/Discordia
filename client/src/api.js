// Endereço do servidor: configurável (nuvem) ou local.
// Prioridade: escolha salva no app > variável de build > localhost.
const DEFAULT_API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
const KEY = 'discordia_server_url';

export function getApiUrl() {
  const saved = (localStorage.getItem(KEY) || '').trim().replace(/\/$/, '');
  return saved || DEFAULT_API;
}
export function setApiUrl(url) {
  const clean = (url || '').trim().replace(/\/$/, '');
  if (clean) localStorage.setItem(KEY, clean);
  else localStorage.removeItem(KEY);
}
// compat: importações antigas de API_URL passam a usar a função
export function API_URL() {
  return getApiUrl();
}

export function getToken() {
  return localStorage.getItem('discordia_token');
}
export function setToken(t) {
  if (t) localStorage.setItem('discordia_token', t);
  else localStorage.removeItem('discordia_token');
}

export async function api(path, opts = {}) {
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na API');
  return data;
}

export async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${getApiUrl()}/api/upload`, {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro no upload');
  return data;
}
