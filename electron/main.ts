import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

const userData = () => app.getPath('userData');

function fileFor(key: string): string {
  // settings -> settings.json, save:1 -> saves/save_1.json
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (key.startsWith('save')) {
    const dir = path.join(userData(), 'saves');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, safe + '.json');
  }
  return path.join(userData(), safe + '.json');
}

ipcMain.on('storage:get', (e, key: string) => {
  try {
    e.returnValue = fs.readFileSync(fileFor(key), 'utf8');
  } catch {
    e.returnValue = null;
  }
});
ipcMain.on('storage:set', (e, key: string, value: string) => {
  try {
    const f = fileFor(key);
    fs.writeFileSync(f + '.tmp', value, 'utf8');
    fs.renameSync(f + '.tmp', f);
    e.returnValue = true;
  } catch {
    e.returnValue = false;
  }
});
ipcMain.on('window:fullscreen', (e, on: boolean) => {
  BrowserWindow.fromWebContents(e.sender)?.setFullScreen(on);
});
ipcMain.on('app:quit', () => app.quit());

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    title: 'Backrooms Endless',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: process.argv.filter((a) => a.startsWith('--level=') || a.startsWith('--seed=') || a === '--dev').map((a) => '--br-arg' + a),
    },
  });
  win.setMenu(null);
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
  void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => app.quit());
