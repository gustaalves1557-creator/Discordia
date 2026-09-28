// preload seguro — flags e IPC do app desktop
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('discordia', {
  desktop: true,
  // lista telas/janelas com miniatura para o seletor de compartilhamento
  getShareSources: () => ipcRenderer.invoke('get-share-sources'),
});
