const { app, BrowserWindow, dialog, desktopCapturer, session, ipcMain } = require('electron');
const path = require('path');

try {
  const logFile = path.join(app.getPath('userData'), 'boot-error.log');
  const log = (m) => { try { require('fs').appendFileSync(logFile, new Date().toISOString() + ' ' + m + '\n'); } catch {} };
  process.on('uncaughtException', (e) => log('UNCAUGHT ' + (e.stack || e.message || e)));
  process.on('unhandledRejection', (e) => log('UNHANDLED ' + ((e && (e.stack || e.message)) || e)));
} catch {}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let backend = null;
let quitting = false;
let mainWin = null;

// Permissões de mídia (microfone/câmera/tela) para o app local
function setupPermissions() {
  const ses = session.defaultSession;
  try {
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media' || permission === 'display-capture') callback(true);
      else callback(true); // app local de primeira parte
    });
  } catch {}
  // Fontes para o seletor de tela dentro do app (com miniaturas)
  try {
    ipcMain.handle('get-share-sources', async () => {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 200 },
        fetchWindowIcons: true,
      });
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        screen: s.id.startsWith('screen:'),
        thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      }));
    });
  } catch {}
  // Fallback caso algo chame getDisplayMedia direto: usa a tela principal
  try {
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        if (!sources.length) return callback({});
        callback({ video: sources[0] });
      } catch {
        try { callback({}); } catch {}
      }
    });
  } catch {}
}

function splash() {
  const w = new BrowserWindow({
    width: 360, height: 180, resizable: false, minimizable: false,
    maximizable: false, autoHideMenuBar: true, title: 'Discordia',
    icon: path.join(__dirname, 'build', 'icon.png'),
  });
  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#1e1f22;color:#dbdee1;font-family:sans-serif">
      <div style="text-align:center">
        <div style="font-size:18px;font-weight:bold;margin-bottom:8px">Discordia</div>
        <div id="s" style="font-size:13px;color:#949ba4">Iniciando...</div>
      </div>
    </body>`));
  return w;
}

const UI_PORT = 5174;

// Serve a interface embutida por HTTP local (caminhos absolutos + rotas funcionam,
// e o login persiste porque a porta é fixa). Só escuta em localhost.
function startUiServer() {
  const express = require('express');
  const fs = require('fs');
  const dist = path.join(__dirname, 'app-dist');
  const ui = express();
  ui.use(express.static(dist, { index: false }));
  ui.get(/.*/, (req, res, next) => {
    if (req.path.includes('.')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
  ui.use((req, res) => {
    const f = path.join(dist, req.path);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return res.sendFile(f);
    res.sendFile(path.join(dist, 'index.html'));
  });
  return new Promise((resolve, reject) => {
    const srv = ui.listen(UI_PORT, '127.0.0.1', () => resolve(srv));
    srv.on('error', reject);
  });
}

function mainWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, autoHideMenuBar: true, title: 'Discordia',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  if (process.env.DISCORDIA_URL) win.loadURL(process.env.DISCORDIA_URL);
  else win.loadURL(`http://127.0.0.1:${UI_PORT}`);
  return win;
}

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

app.whenReady().then(async () => {
  setupPermissions();
  const sp = splash();
  const setStatus = (m) => {    sp.webContents.executeJavaScript(
      `document.getElementById('s').textContent = ${JSON.stringify(m)}`
    ).catch(() => {});
  };
  try {
    const { boot } = require('./boot');
    backend = await boot(app.getPath('userData'), setStatus);
    setStatus('Carregando interface...');
    await startUiServer();
    const win = mainWindow();
    mainWin = win;
    sp.close();
    win.on('closed', () => { if (process.platform !== 'darwin') app.quit(); });
  } catch (e) {
    sp.close();
    try {
      require('fs').appendFileSync(
        require('path').join(app.getPath('userData'), 'boot-error.log'),
        new Date().toISOString() + ' ' + (e.stack || e.message || e) + '\n'
      );
    } catch {}
    dialog.showErrorBox('Discordia', 'Não foi possível iniciar:\n\n' + (e.message || e));
    app.quit();
  }
});

app.on('before-quit', (e) => {
  if (quitting || !backend) return;
  quitting = true;
  e.preventDefault();
  backend.stop().finally(() => app.quit());
  setTimeout(() => app.quit(), 8000).unref();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
