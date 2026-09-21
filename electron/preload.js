/**
 * Pebble — preload bridge (contextIsolation: true)
 * Exposes a minimal, promise-based API to the renderer as `window.nex`.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nex', {
  isDesktop: true,

  // --- persistence -------------------------------------------------
  loadData:      ()      => ipcRenderer.invoke('data:load'),
  saveData:      (d)     => ipcRenderer.invoke('data:save', d),
  loadSettings:  ()      => ipcRenderer.invoke('settings:load'),
  saveSettings:  (s)     => ipcRenderer.invoke('settings:save', s),

  // --- notifications ------------------------------------------------
  notify: (title, body, silent) => ipcRenderer.invoke('notify', { title, body, silent }),

  // --- dialogs & files ---------------------------------------------
  saveDialog: (opts) => ipcRenderer.invoke('dialog:save', opts),
  openDialog: (opts) => ipcRenderer.invoke('dialog:open', opts),
  readText:   (p)    => ipcRenderer.invoke('fs:readText', p),

  // --- shell --------------------------------------------------------
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showItem:     (p)   => ipcRenderer.invoke('shell:showItem', p),

  // --- window controls ---------------------------------------------
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close:    () => ipcRenderer.invoke('window:close'),
  setBadge: (n) => ipcRenderer.invoke('tray:setBadge', n),

  // --- info ---------------------------------------------------------
  paths: () => ipcRenderer.invoke('app:paths'),

  // --- desktop widget island -------------------------------------
  widgetAction: (hash) => ipcRenderer.invoke('widget:action', hash),
  widgetToggle: () => ipcRenderer.invoke('widget:toggle'),

  // --- native speech recognition (Windows) -------------------------
  asr: (timeoutMs) => ipcRenderer.invoke('asr:record', timeoutMs),

  // --- staged updates ----------------------------------------------
  stageUpdate: (files) => ipcRenderer.invoke('update:stage', files),
  clearUpdate: () => ipcRenderer.invoke('update:clear'),
  restartForUpdate: () => ipcRenderer.invoke('update:restart'),

  // --- main -> renderer events -------------------------------------
  onNavigate:      (cb) => ipcRenderer.on('navigate', (_e, h) => cb(h)),
  onReminderFired: (cb) => ipcRenderer.on('reminder-fired', (_e, r) => cb(r)),

  platform: process.platform
});
