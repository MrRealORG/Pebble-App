/**
 * Pebble — Electron main process
 * Window, tray, global shortcuts, reminder scheduling, native notifications,
 * data persistence (JSON in userData), import/export, and IPC bridge.
 */
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification,
        globalShortcut, dialog, shell, session, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let reminderTimer = null;
let quitting = false;

/* ------------------------------------------------------------------ *
 *  Paths & persistence
 * ------------------------------------------------------------------ */
const dataDir = () => path.join(app.getPath('userData'), 'nexadesk-data');
const dataFile = () => path.join(dataDir(), 'workspace.json');
const settingsFile = () => path.join(dataDir(), 'settings.json');

function ensureDataDir() {
  try { fs.mkdirSync(dataDir(), { recursive: true }); } catch (e) { /* ignore */ }
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return fallback; }
}
function writeJSON(file, obj) {
  ensureDataDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/* ------------------------------------------------------------------ *
 *  Window
 * ------------------------------------------------------------------ */
function createWindow() {
  const winState = readJSON(settingsFile(), {}).window || {};
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(winState.width || 1440, sw),
    height: Math.min(winState.height || 900, sh),
    x: winState.x, y: winState.y,
    minWidth: 940,
    minHeight: 600,
    title: 'Pebble',
    icon: path.join(__dirname, '..', 'assets', 'icons', 'icon.png'),
    backgroundColor: '#191919',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true
    }
  });

  // staged updates: if a newer renderer was downloaded into userData/updates, use it
  const staged = path.join(app.getPath('userData'), 'updates', 'index.html');
  const bundled = path.join(__dirname, '..', 'renderer', 'index.html');
  mainWindow.loadFile(fs.existsSync(staged) ? staged : bundled);
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Persist window geometry on close
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    const s = readJSON(settingsFile(), {});
    s.window = b;
    writeJSON(settingsFile(), s);
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // Open external links in the system browser, never inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Close to tray instead of quitting (unless really quitting)
  mainWindow.on('close', (e) => {
    const s = readJSON(settingsFile(), {});
    if (!quitting && s.closeToTray !== false) {
      e.preventDefault();
      mainWindow.hide();
      flashTray('Pebble is still running in the tray.');
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

let lastFlash = 0;
function flashTray(msg) {
  const now = Date.now();
  if (now - lastFlash < 20000) return;      // don't spam
  lastFlash = now;
  if (tray) tray.displayBalloon?.({ title: 'Pebble', content: msg });
}

/* ------------------------------------------------------------------ *
 *  Tray
 * ------------------------------------------------------------------ */
let widgetWin = null;
function createWidgetIsland() {
  const prefs = readJSON(settingsFile(), {});
  if (prefs.desktopIsland === false) return;
  const { width } = require('electron').screen.getPrimaryDisplay().workAreaSize;
  widgetWin = new BrowserWindow({
    width: 480, height: 58, x: Math.round((width - 480) / 2), y: 4,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
    skipTaskbar: true, hasShadow: false, fullscreenable: false, minimizable: false, maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  const bundled = path.join(__dirname, '..', 'renderer', 'index.html');
  widgetWin.loadFile(bundedOrStaged(), { query: 'widget=1' });
  widgetWin.on('closed', () => { widgetWin = null; });
  widgetWin.setVisibleOnAllWorkspaces && widgetWin.setVisibleOnAllWorkspaces(true);
}
function budedOrStaged() { return path.join(__dirname, '..', 'renderer', 'index.html'); }
function bundedOrStaged2() { return budedOrStaged(); }

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icons', 'tray.png');
  let img;
  try {
    img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icons', 'icon.png'));
    if (process.platform === 'darwin' && !img.isEmpty()) {
      img = img.resize({ width: 18, height: 18 });
      img.setTemplateImage(true);
    }
  } catch (e) { img = nativeImage.createEmpty(); }
  if (img.isEmpty()) return;                // no tray if we have no icon

  tray = new Tray(img);
  tray.setToolTip('Pebble');
  rebuildTrayMenu();
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
}

function rebuildTrayMenu(badgeCount) {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: badgeCount ? `Pebble — ${badgeCount} pending reminder${badgeCount === 1 ? '' : 's'}` : 'Pebble', enabled: false },
    { type: 'separator' },
    { label: 'Open Pebble', click: () => showWindow() },
    { label: 'Quick capture…', accelerator: 'CommandOrControl+Shift+N', click: () => showWindow('#/quick') },
    { type: 'separator' },
    { label: 'Today', click: () => showWindow('#/dashboard') },
    { label: 'Tasks', click: () => showWindow('#/tasks') },
    { label: 'Notes', click: () => showWindow('#/notes') },
    { label: 'Calendar', click: () => showWindow('#/calendar') },
    { label: 'Habits', click: () => showWindow('#/habits') },
    { type: 'separator' },
    { label: 'Start focus session', click: () => showWindow('#/pomodoro') },
    { type: 'separator' },
    { label: 'Quit Pebble', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  if (badgeCount) tray.setToolTip(`Pebble — ${badgeCount} pending reminder(s)`);
}

function showWindow(hash) {
  if (!mainWindow || mainWindow.isDestroyed()) { createWindow(); return; }
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  if (hash) mainWindow.webContents.send('navigate', hash);
}

/* ------------------------------------------------------------------ *
 *  Reminder scheduler
 *  The renderer owns the data; here we just poll it and fire native
 *  notifications so reminders work even when the window is hidden.
 * ------------------------------------------------------------------ */
function startReminderScheduler() {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const due = await mainWindow.webContents.executeJavaScript(
        'window.NX && window.NX.reminders ? JSON.stringify(window.NX.reminders.pollDue()) : "[]"'
      );
      const list = JSON.parse(due || '[]');
      for (const r of list) fireReminder(r);
      rebuildTrayMenu(list.length || undefined);
    } catch (e) { /* renderer not ready */ }
  }, 15000);
}

function fireReminder(r) {
  const n = new Notification({
    title: r.title || 'Reminder',
    body: r.body || '',
    icon: path.join(__dirname, '..', 'assets', 'icons', 'icon.png'),
    urgency: r.urgent ? 'critical' : 'normal',
    silent: false
  });
  n.on('click', () => showWindow(r.deepLink || '#/reminders'));
  n.show();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reminder-fired', r);
    if (!mainWindow.isFocused()) mainWindow.flashFrame(true);
  }
}

/* ------------------------------------------------------------------ *
 *  IPC bridge
 * ------------------------------------------------------------------ */
ipcMain.handle('data:load', () => readJSON(dataFile(), null));
ipcMain.handle('data:save', (_e, payload) => {
  try { writeJSON(dataFile(), payload); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});
ipcMain.handle('settings:load', () => readJSON(settingsFile(), {}));
ipcMain.handle('settings:save', (_e, s) => { writeJSON(settingsFile(), s); return { ok: true }; });

ipcMain.handle('notify', (_e, { title, body, silent }) => {
  if (!Notification.isSupported()) return false;
  new Notification({
    title: title || 'Pebble',
    body: body || '',
    icon: path.join(__dirname, '..', 'assets', 'icons', 'icon.png'),
    silent: !!silent
  }).show();
  return true;
});

ipcMain.handle('dialog:save', async (_e, { defaultPath, filters, content, base64 }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'nexadesk-export.json',
    filters: filters || [{ name: 'All files', extensions: ['*'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  const buf = Buffer.isBuffer(content) ? content
    : base64 ? Buffer.from(content, 'base64')
    : Buffer.from(content, 'utf8');
  fs.writeFileSync(filePath, buf);
  return { ok: true, path: filePath };
});

/* ---- native speech recognition (Windows System.Speech), fallback elsewhere ---- */
ipcMain.handle('asr:record', async (_e, timeoutMs) => {
  if (process.platform !== 'win32') throw new Error('native-asr-unavailable');
  const ms = Math.min(Number(timeoutMs) || 15000, 60000);
  const ps = `
Add-Type -AssemblyName System.Speech;
$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine;
$rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar));
$rec.SetInputToDefaultAudioDevice();
$rec.InitialSilenceTimeout = [TimeSpan]::FromMilliseconds(${ms});
$result = $rec.Recognize();
if ($result) { $result.Text } else { '' }
`;
  return await new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: ms + 8000 }, (err, stdout) => {
      if (err) return reject(new Error('asr failed: ' + err.message));
      resolve(String(stdout || '').trim());
    });
  });
});

/* ---- staged update application: prefer an updated bundle in userData ---- */
ipcMain.handle('update:stage', async (_e, files) => {
  const dir = path.join(app.getPath('userData'), 'updates');
  fs.mkdirSync(path.join(dir, 'css'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  for (const f of files || []) {
    const safe = String(f.name).replace(/[^a-zA-Z0-9./_-]/g, '');
    if (safe.includes('..')) continue;
    fs.writeFileSync(path.join(dir, safe), Buffer.from(f.content, 'base64'));
  }
  return { ok: true, dir };
});
ipcMain.handle('update:clear', async () => {
  fs.rmSync(path.join(app.getPath('userData'), 'updates'), { recursive: true, force: true });
  return { ok: true };
});
ipcMain.handle('update:restart', () => { app.relaunch(); app.exit(0); });

ipcMain.handle('dialog:open', async (_e, { filters, multiple }) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: filters || [{ name: 'All files', extensions: ['*'] }]
  });
  if (canceled || !filePaths.length) return { ok: false, canceled: true };
  const files = filePaths.map(p => ({
    path: p,
    name: path.basename(p),
    size: (() => { try { return fs.statSync(p).size; } catch (e) { return 0; } })(),
    data: (() => {
      try { return fs.readFileSync(p).toString('base64'); } catch (e) { return null; }
    })()
  }));
  return { ok: true, files };
});

ipcMain.handle('fs:readText', (_e, p) => {
  try { return { ok: true, text: fs.readFileSync(p, 'utf8') }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

ipcMain.handle('shell:openExternal', (_e, url) => { shell.openExternal(url); return true; });
ipcMain.handle('shell:showItem', (_e, p) => { shell.showItemInFolder(p); return true; });
ipcMain.handle('app:paths', () => ({
  userData: app.getPath('userData'),
  documents: app.getPath('documents'),
  downloads: app.getPath('downloads'),
  dataFile: dataFile(),
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node
}));
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('widget:action', (_e, hash) => { showWindow(String(hash || '#/dashboard')); return true; });
ipcMain.handle('widget:toggle', () => {
  if (widgetWin) { widgetWin.destroy(); widgetWin = null; return { on: false }; }
  createWidgetIsland(); return { on: true };
});
ipcMain.handle('tray:setBadge', (_e, n) => { rebuildTrayMenu(n || undefined); return true; });

/* ------------------------------------------------------------------ *
 *  App lifecycle
 * ------------------------------------------------------------------ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    ensureDataDir();
    createWindow();
    createTray();
    createWidgetIsland();
    startReminderScheduler();

    // Global shortcuts (work even when Pebble is not focused)
    const reg = (accel, fn) => { try { globalShortcut.register(accel, fn); } catch (e) {} };
    reg('CommandOrControl+Shift+N', () => showWindow('#/quick'));
    reg('CommandOrControl+Shift+F', () => showWindow('#/search'));
    reg('CommandOrControl+Shift+Space', () => showWindow('#/palette'));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  app.on('will-quit', () => { globalShortcut.unregisterAll(); });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
