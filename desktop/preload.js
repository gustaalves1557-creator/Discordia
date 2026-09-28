// preload seguro — flags e IPC do app desktop
const { contextBridge, ipcRenderer } = require('electron');

try {
  const sendErr = (msg) => { try { ipcRenderer.send('renderer-error', msg); } catch {} };
  window.addEventListener('error', (e) => sendErr('error: ' + (e.message || e.error)));
  window.addEventListener('unhandledrejection', (e) => sendErr('rejection: ' + (e.reason?.message || e.reason)));
} catch {}

contextBridge.exposeInMainWorld('discordia', {
  desktop: true,
  // lista telas/janelas com miniatura para o seletor de compartilhamento
  getShareSources: () => ipcRenderer.invoke('get-share-sources'),
});
