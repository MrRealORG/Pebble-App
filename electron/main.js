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
let authWin = null;
function createAuthWindow(onDone) {
  authWin = new BrowserWindow({
    width: 400, height: 520, frame: false, resizable: false, center: true,
    backgroundColor: '#f4f2ee', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  authWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query: 'auth=1' });
  authWin.once('ready-to-show', () => authWin.show());
  authWin.on('closed', () => { authWin = null; });
  authWin.__onDone = onDone;
}
ipcMain.handle('auth:ok', (e, name) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && w.__onDone) w.__onDone(name || '');
  if (w) w.close();
  return true;
});

/* ---------- TimeLens native app detection ---------- */
function foregroundInfo() {
  const { execFile } = require('child_process');
  return new Promise(async resolve => {
    if (process.platform === 'win32') {
      try {
        const sc = await scGet('/foreground');
        if (sc && (sc.exe || sc.title)) return resolve({ app: sc.exe || sc.title, url: sc.title || '' });
      } catch (e) {}
      const ps = `Add-Type @"
using System;using System.Runtime.InteropServices;using System.Text;
public class FW{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
[DllImport("kernel32.dll")]public static extern IntPtr OpenProcess(uint a,bool b,uint c);
[DllImport("psapi.dll")]public static extern uint GetModuleBaseName(IntPtr h,IntPtr m,StringBuilder s,int n);}
"@
$h=[FW]::GetForegroundWindow();$pid2=0;[FW]::GetWindowThreadProcessId($h,[ref]$pid2)|Out-Null
$pr=[FW]::OpenProcess(0x0410,$false,$pid2);$sb=New-Object Text.StringBuilder 260
[FW]::GetModuleBaseName($pr,[IntPtr]::Zero,$sb,260)|Out-Null
$sb.ToString()`;
      execFile('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: 8000 }, (err, out) => resolve(err ? null : { app: String(out || '').trim() || null }));
    } else if (process.platform === 'darwin') {
      execFile('osascript', ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'], { timeout: 6000 }, (err, out) => resolve(err ? null : { app: String(out || '').trim() || null }));
    } else {
      execFile('bash', ['-c', "xdotool getactivewindow getwindowname 2>/dev/null || echo"], { timeout: 6000 }, (err, out) => {
        const t = String(out || '').trim();
        resolve(t ? { app: t.split(' — ').pop().trim() || t } : null);
      });
    }
  });
}
let tlTimer = null;
ipcMain.handle('timelens:start', () => {
  if (tlTimer) return { on: true };
  tlTimer = setInterval(async () => {
    const info = await foregroundInfo();
    if (info && info.app && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('timelens:active', info);
  }, 15000);
  return { on: true };
});
ipcMain.handle('timelens:now', async () => await foregroundInfo());

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

  try {
    const saveBounds = () => {
      try { const f = settingsFile(); const j = readJSON(f, {}); j.window = mainWindow.getBounds(); writeJSON(f, j); } catch (e) {}
    };
    let bsT = null;
    const saveBoundsSoon = () => { if (bsT) clearTimeout(bsT); bsT = setTimeout(saveBounds, 600); };
    mainWindow.on('resize', saveBoundsSoon);
    mainWindow.on('moved', saveBoundsSoon);
    mainWindow.on('close', saveBounds);
  } catch (e) {}

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
let petWin = null;
function createPetWindow() {
  const prefs = readJSON(settingsFile(), {});
  if (prefs.petWindow !== true) return;
  const wa = require('electron').screen.getPrimaryDisplay().workArea;
  petWin = new BrowserWindow({
    width: 260, height: 150, x: Math.round(wa.width / 2 - 130), y: wa.height - 150,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
    skipTaskbar: true, hasShadow: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  petWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query: 'pet=1' });
  petWin.setVisibleOnAllWorkspaces && petWin.setVisibleOnAllWorkspaces(true);
  petWin.on('closed', () => { petWin = null; });
}
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
ipcMain.handle('pet:toggle', (e, on) => {
  if (on) { if (!petWin) createPetWindowForce(); return { on: true }; }
  if (petWin) { petWin.destroy(); petWin = null; }
  return { on: false };
});
function createPetWindowForce() {
  const wa = require('electron').screen.getPrimaryDisplay().workArea;
  petWin = new BrowserWindow({
    width: 260, height: 150, x: Math.round(wa.width / 2 - 130), y: wa.height - 150,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
    skipTaskbar: true, hasShadow: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  petWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { query: 'pet=1' });
  petWin.on('closed', () => { petWin = null; });
}
ipcMain.handle('shot:window', async () => {
  if (!mainWindow) return null;
  try {
    const img = await mainWindow.capturePage();
    return { data: img.toPNG().toString('base64') };
  } catch (e) { return null; }
});
ipcMain.handle('widget:toggle', () => {
  if (widgetWin) { widgetWin.destroy(); widgetWin = null; return { on: false }; }
  createWidgetIsland(); return { on: true };
});
ipcMain.handle('tray:setBadge', (_e, n) => { rebuildTrayMenu(n || undefined); return true; });


/* ------------------------------------------------------------------ *
 *  v10 — Rust sidecar (pebble-core) + Windows-native shell integration
 * ------------------------------------------------------------------ */
const http = require('http');
const SC_PORTS = [47319, 8790];
let sidecarProc = null;

function sidecarBin() {
  const exe = process.platform === 'win32' ? 'pebble-core.exe' : 'pebble-core';
  const candidates = [
    path.join(process.resourcesPath || '', 'sidecar', exe),
    path.join(__dirname, 'sidecar', exe),
    path.join(__dirname, '..', 'rust', 'pebble-core', 'target', 'release', exe)
  ];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}
function startSidecar() {
  if (sidecarProc) return;
  const bin = sidecarBin();
  if (!bin) return;
  try {
    sidecarProc = require('child_process').spawn(bin, ['--port', '47319'], { stdio: 'ignore', detached: false });
    sidecarProc.on('exit', () => { sidecarProc = null; });
  } catch (e) {}
}
function scGetOne(port, p) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: 1200 }, res => {
      let b = ''; res.on('data', c => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}
async function scGet(p) {
  for (const port of SC_PORTS) {
    const j = await scGetOne(port, p);
    if (j) return j;
  }
  return null;
}
ipcMain.handle('sidecar:health', async () => await scGet('/health'));
ipcMain.handle('sidecar:foreground', async () => await scGet('/foreground'));
ipcMain.handle('sidecar:usage', async () => await scGet('/usage'));

ipcMain.handle('win:loginItem', (_e, on) => {
  try { app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath }); return true; } catch (e) { return false; }
});
ipcMain.handle('win:taskbar', (_e, pct) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try { mainWindow.setProgressBar(pct == null || pct < 0 ? -1 : Math.min(1, pct / 100)); return true; } catch (e) { return false; }
});
ipcMain.handle('print:pdf', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  try {
    const data = await mainWindow.webContents.printToPDF({ printBackground: true });
    const { dialog } = require('electron');
    const r = await dialog.showSaveDialog(mainWindow, { defaultPath: path.join(app.getPath('documents'), 'pebble-view.pdf') });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, data);
    return r.filePath;
  } catch (e) { return null; }
});
ipcMain.handle('fs:openPath', async (_e, p) => {
  const target = p === 'userData' ? app.getPath('userData') : String(p || '');
  if (!target) return false;
  try { await require('electron').shell.openPath(target); return true; } catch (e) { return false; }
});
ipcMain.handle('fs:trash', async (_e, p) => {
  try { await require('electron').shell.trashItem(String(p)); return true; } catch (e) { return false; }
});
ipcMain.handle('notify:actions', (_e, o) => {
  try {
    const { Notification } = require('electron');
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title: o.title, body: o.body || '', silent: !!o.silent,
      actions: (o.actions || []).map(a => ({ type: 'button', text: a }))
    });
    n.on('action', (_ev, idx) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('notif:action', { label: (o.actions || [])[idx], payload: o.payload || '' });
    });
    n.on('click', () => { showWindow(); if (o.route && mainWindow) mainWindow.webContents.send('navigate', '#/' + o.route); });
    n.show();
    return true;
  } catch (e) { return false; }
});
let clipTimer = null, clipLast = '';
ipcMain.handle('clip:watch', (_e, on) => {
  if (clipTimer) { clearInterval(clipTimer); clipTimer = null; }
  if (!on) return false;
  const { clipboard } = require('electron');
  clipTimer = setInterval(() => {
    try {
      const t = clipboard.readText();
      if (t && t !== clipLast) {
        clipLast = t;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('clip:new', t.slice(0, 20000));
      }
    } catch (e) {}
  }, 2500);
  return true;
});

function flagToHash(flag) {
  const map = { '--new-note': '#/quick', '--focus': '#/timelens?tab=focus', '--timelens': '#/timelens', '--inbox': '#/inbox', '--search': '#/search', '--palette': '#/palette' };
  return map[flag] || null;
}
function deepLinkFrom(argv) {
  const link = (argv || []).find(a => String(a).startsWith('pebble://'));
  if (!link) return null;
  return '#' + link.replace(/^pebble:\/\//, '/');
}

/* ------------------------------------------------------------------ *
 *  App lifecycle
 * ------------------------------------------------------------------ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const link = deepLinkFrom(argv);
    const flag = (argv || []).find(a => String(a).startsWith('--'));
    showWindow(link || flagToHash(flag) || undefined);
  });
  app.on('open-url', (e, url) => {
    e.preventDefault();
    showWindow('#' + String(url).replace(/^pebble:\/\//, '/'));
  });

  app.whenReady().then(() => {
    ensureDataDir();
    const prefs = readJSON(settingsFile(), {});
    if (prefs.loginAtStart) {
      createAuthWindow(() => createWindow());
    } else {
      createWindow();
    }
    try { ipcMain.handle('timelens:ensure', () => { return true; }); } catch (e) {}
    startSidecar();
    try {
      const { powerMonitor } = require('electron');
      ['suspend', 'resume', 'lock-screen', 'unlock-screen'].forEach(ev =>
        powerMonitor.on(ev, () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('power:event', ev); }));
    } catch (e) {}
    if (process.platform === 'win32') {
      try { app.setAsDefaultProtocolClient('pebble'); } catch (e) {}
      try {
        app.setUserTasks([
          { program: process.execPath, arguments: '--new-note', iconPath: process.execPath, iconIndex: 0, title: 'New quick note', description: 'Capture a note instantly' },
          { program: process.execPath, arguments: '--focus', iconPath: process.execPath, iconIndex: 0, title: 'Start focus session', description: 'TimeLens focus mode' },
          { program: process.execPath, arguments: '--timelens', iconPath: process.execPath, iconIndex: 0, title: 'Open TimeLens', description: 'Foreground analytics' },
          { program: process.execPath, arguments: '--inbox', iconPath: process.execPath, iconIndex: 0, title: 'Open Inbox', description: 'Unified inbox' }
        ]);
      } catch (e) {}
    }
    createTray();
    createWidgetIsland();
    createPetWindow();
    startReminderScheduler();
    const bootLink = deepLinkFrom(process.argv) || flagToHash((process.argv || []).find(a => String(a).startsWith('--')) || '');
    if (bootLink && mainWindow) setTimeout(() => mainWindow.webContents.send('navigate', bootLink), 900);

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
