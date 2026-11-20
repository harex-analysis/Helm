const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  bootstrap: () => ipcRenderer.invoke('workspace:bootstrap'),
  refresh: () => ipcRenderer.invoke('engine:startup-refresh'),
  save: state => ipcRenderer.invoke('workspace:save', state),
  openText: () => ipcRenderer.invoke('file:open'),
  saveText: (name, text) => ipcRenderer.invoke('file:save', { name, text }),
  source: url => ipcRenderer.invoke('source:open', url),
  run: (operation, payload) => ipcRenderer.invoke('engine:run', { operation, payload }),
  onProgress: callback => {
    const listener = (_, message) => callback(message);
    ipcRenderer.on('engine:progress', listener);
    return () => { ipcRenderer.removeListener('engine:progress', listener); };
  }
});
