// Exposes a minimal, typed bridge to the shared UI (packages/ui/public/api.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  platform: 'windows',
  async call(method, args) {
    const r = await ipcRenderer.invoke('call', method, args);
    if (!r.ok) throw new Error(r.error);
    return r.result;
  },
  onSnapshot(cb) {
    ipcRenderer.on('snapshot', (_e, snap) => cb(snap));
  },
  onNavigate(cb) {
    ipcRenderer.on('navigate', (_e, page) => cb(page));
  },
});
