import { contextBridge, ipcRenderer } from 'electron';

const args = process.argv.filter((a) => a.startsWith('--br-arg')).map((a) => a.slice('--br-arg'.length));

contextBridge.exposeInMainWorld('backroomsNative', {
  isElectron: true,
  args,
  storage: {
    get: (key: string): string | null => ipcRenderer.sendSync('storage:get', key),
    set: (key: string, value: string): void => {
      ipcRenderer.sendSync('storage:set', key, value);
    },
  },
  setFullscreen: (on: boolean) => ipcRenderer.send('window:fullscreen', on),
  quit: () => ipcRenderer.send('app:quit'),
});
