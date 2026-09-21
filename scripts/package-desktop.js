#!/usr/bin/env node
/**
 * NexaDesk — desktop packaging
 *
 *   node scripts/package-desktop.js            build app.asar into dist/desktop/
 *   node scripts/package-desktop.js --with-runtime <electronDir>
 *                                              also assemble a ready-to-run app
 *
 * Produces:
 *   dist/desktop/app.asar                      the packaged application
 *   dist/desktop/NexaDesk-linux-x64/           runnable Linux app (if --with-runtime)
 *   dist/desktop/build-windows.bat             one-click Windows build
 *   dist/desktop/build-mac.sh                  one-click macOS build
 *   dist/desktop/build-linux.sh                one-click Linux build
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
let asar;
try { asar = require('@electron/asar'); }
catch (e) { console.error('Missing @electron/asar. Run:  npm i -D @electron/asar'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'desktop');
const withRuntimeIdx = process.argv.indexOf('--with-runtime');
const runtimeDir = withRuntimeIdx > -1 ? process.argv[withRuntimeIdx + 1] : null;

function ensure(d) { fs.mkdirSync(d, { recursive: true }); }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function kb(n) { return (n / 1024).toFixed(1) + ' KB'; }
function mb(n) { return (n / 1048576).toFixed(1) + ' MB'; }

console.log('\n  NexaDesk — desktop packaging\n');

/* ---------- 1. make sure the renderer bundle is current ---------- */
execSync('node scripts/build.js', { cwd: ROOT, stdio: 'inherit' });

/* ---------- 2. stage the app payload ---------- */
const stage = path.join(OUT, '_stage');
rmrf(stage);
ensure(stage);
for (const dir of ['electron', 'assets']) copyDir(path.join(ROOT, dir), path.join(stage, dir));
ensure(path.join(stage, 'renderer'));
fs.copyFileSync(path.join(ROOT, 'renderer', 'index.html'), path.join(stage, 'renderer', 'index.html'));
ensure(path.join(stage, 'renderer', 'css'));
ensure(path.join(stage, 'renderer', 'js'));
fs.copyFileSync(path.join(ROOT, 'renderer', 'css', 'bundle.css'), path.join(stage, 'renderer', 'css', 'bundle.css'));
fs.copyFileSync(path.join(ROOT, 'renderer', 'js', 'bundle.js'), path.join(stage, 'renderer', 'js', 'bundle.js'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
delete pkg.devDependencies; delete pkg.scripts;
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));

function copyDir(src, dst) {
  ensure(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

/* ---------- 3. build app.asar ---------- */
const asarPath = path.join(OUT, 'app.asar');
asar.createPackageWithOptions(stage, asarPath, { unpack: '**/assets/icons/*.png' })
  .then(() => {
    const size = fs.statSync(asarPath).size;
    console.log('  app.asar ................ ' + mb(size));
    const list = asar.listPackage(asarPath);
    console.log('  files inside ............ ' + list.length);

    /* ---------- 4. optional ready-to-run runtime ---------- */
    if (runtimeDir && fs.existsSync(runtimeDir)) {
      const appDir = path.join(OUT, 'NexaDesk-linux-x64');
      rmrf(appDir);
      console.log('  copying Electron runtime  ' + mb(dirSize(runtimeDir)) + ' …');
      copyDir(runtimeDir, appDir);
      ensure(path.join(appDir, 'resources'));
      fs.copyFileSync(asarPath, path.join(appDir, 'resources', 'app.asar'));
      try { fs.chmodSync(path.join(appDir, 'electron'), 0o755); } catch (e) {}
      try { fs.chmodSync(path.join(appDir, 'chrome-sandbox'), 0o4755); } catch (e) {}
      fs.writeFileSync(path.join(appDir, 'run.sh'),
        '#!/usr/bin/env bash\n# Launch NexaDesk. If it fails to start, install the GUI libraries listed in README.\n' +
        'cd "$(dirname "$0")"\nexec ./electron --no-sandbox "$@"\n');
      try { fs.chmodSync(path.join(appDir, 'run.sh'), 0o755); } catch (e) {}
      console.log('  NexaDesk-linux-x64/ ..... ' + mb(dirSize(appDir)) + '  (run ./run.sh)');
    } else if (runtimeDir) {
      console.log('  ! runtime dir not found: ' + runtimeDir);
    }

    /* ---------- 5. one-click build scripts ---------- */
    fs.writeFileSync(path.join(OUT, 'build-windows.bat'), `@echo off
REM ============================================================
REM  NexaDesk - build the Windows installer + portable exe
REM  Requires: Node.js 18+  (https://nodejs.org)
REM ============================================================
echo.
echo   Building NexaDesk for Windows...
echo.
cd /d "%~dp0..\\.."
call npm install
if errorlevel 1 goto :err
call npm run dist:win
if errorlevel 1 goto :err
echo.
echo   Done. Installers are in:  release\\
echo     NexaDesk Setup x.x.x.exe   (installer)
echo     NexaDesk x.x.x.exe         (portable)
echo.
pause
exit /b 0
:err
echo.
echo   BUILD FAILED - see the output above.
pause
exit /b 1
`);

    fs.writeFileSync(path.join(OUT, 'build-mac.sh'), `#!/usr/bin/env bash
# ============================================================
#  NexaDesk - build the macOS .dmg (Intel + Apple Silicon)
#  Requires: Node.js 18+   Run this ON a Mac.
# ============================================================
set -e
cd "$(dirname "$0")/../.."
echo
echo "  Building NexaDesk for macOS..."
echo
npm install
npm run dist:mac
echo
echo "  Done. The .dmg is in:  release/"
echo "  Note: the app is unsigned, so on first launch right-click it"
echo "  and choose Open, or allow it in System Settings > Privacy."
echo
`);

    fs.writeFileSync(path.join(OUT, 'build-linux.sh'), `#!/usr/bin/env bash
# ============================================================
#  NexaDesk - build the Linux AppImage + .deb
#  Requires: Node.js 18+
# ============================================================
set -e
cd "$(dirname "$0")/../.."
echo
echo "  Building NexaDesk for Linux..."
echo
npm install
npm run dist:linux
echo
echo "  Done. Artifacts are in:  release/"
echo "    NexaDesk-x.x.x.AppImage   (chmod +x, then run)"
echo "    nexadesk_x.x.x_amd64.deb  (sudo apt install ./that.deb)"
echo
`);
    try { fs.chmodSync(path.join(OUT, 'build-mac.sh'), 0o755); fs.chmodSync(path.join(OUT, 'build-linux.sh'), 0o755); } catch (e) {}
    console.log('  build scripts ........... build-windows.bat, build-mac.sh, build-linux.sh');

    rmrf(stage);
    console.log('\n  Output -> dist/desktop/\n');
  })
  .catch(e => { console.error('  FAILED:', e); process.exit(1); });

function dirSize(d) {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}
