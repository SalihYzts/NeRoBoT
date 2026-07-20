// Preload for the screen-share source picker window (see main.js's
// showScreenPicker) — a tiny, separate surface from the main app's
// window.nerobot, sandboxed, so CommonJS like the other preload.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenPicker', {
    onSources: (cb) => ipcRenderer.on('screenpicker:sources', (_e, sources) => cb(sources)),
    choose: (sourceId) => ipcRenderer.send('screenpicker:choice', sourceId),
    cancel: () => ipcRenderer.send('screenpicker:choice', null),
});
