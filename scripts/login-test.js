#!/usr/bin/env node
/**
 * PebbleX — login flow tests
 *
 * The login window used to fail in three silent ways:
 *
 *   1. The PIN was checked AFTER `session` was written. A wrong PIN still
 *      created a signed-in session, so the app thought it was already in
 *      and the user could never unlock it.
 *   2. The main window force-wrote `session = {authed:true}` at boot, which
 *      made the PIN screen decorative on desktop.
 *   3. The 150ms close delay was too short on a cold start, so the
 *      profile sometimes arrived as "You" instead of the real name.
 *
 * Plus: `finish()` is now async and awaited, so a slow store flush cannot
 * race the handoff.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  \x1b[32mok\x1b[0m   ' + n); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + n + (d ? '  (' + d + ')' : '')); }
};

const login = R('renderer/js/10-login.js');
const boot = R('renderer/js/99-boot.js');
const rust = R('src-tauri/src/lib.rs');
const shell = R('renderer/css/03-shell.css');

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

console.log('\n\x1b[1mLogin — PIN ordering (bug 1)\x1b[0m');
/* slice to the end of finish(), not to the click handler: the handler sits
   OUTSIDE the function, so slicing to it truncated the body. */
const fStart = login.indexOf('async function finish(');
const fin = login.slice(fStart, login.indexOf('\n  }', fStart));
ok('finish is async', /async function finish/.test(fin));
ok('the whole finish body was captured', fin.includes('loginDone') && fin.includes('location.hash'),
   'captured ' + fin.length + ' chars');
const pinAt = fin.search(/U\.verifyPin/);
const sessAt = fin.search(/'session', \{ authed:true/);
ok('the PIN is verified', pinAt !== -1);
ok('the session is written', sessAt !== -1);
ok('the PIN is checked BEFORE the session is written', pinAt !== -1 && sessAt !== -1 && pinAt < sessAt,
   'verifyPin at ' + pinAt + ', session at ' + sessAt);
ok('a failed PIN returns before setting the session', /if\(!U\.verifyPin[\s\S]*?return false;/.test(fin));
ok('the button is not disabled until the PIN passes',
   fin.indexOf('btn.disabled = true') > pinAt);
ok('a short PIN explains how to skip next time', /leave it empty to skip next time/i.test(fin));
/* `settling` is declared just above finish(), so assert on the whole file */
ok('the re-entrancy flag is declared', /let settling = false/.test(login));
ok('the guard is the first thing finish() does', /async function finish\(name\)\{\s*if\s*\(\s*settling\s*\)\s*return;/.test(fin));
ok('the flag is set only after validation passes', /settling = true/.test(fin) && fin.indexOf('settling = true') > pinAt);

console.log('\n\x1b[1mLogin — store flush before handoff\x1b[0m');
ok('the workspace is flushed to disk first', /await NX\.store\.flush\(\)/.test(fin));
ok('the flush happens before loginDone', fin.indexOf('flush') < fin.indexOf('loginDone'));
ok('click handlers await finish', /onclick\s*=\s*async[\s\S]{0,160}await finish\(/.test(login));
ok('the resume button is wired', /rbtn\.onclick\s*=/.test(login));

console.log('\n\x1b[1mLogin — no double navigation (bug 3)\x1b[0m');
/* After loginDone() the function must RETURN, not fall through to a route.
   Assert on ordering instead of a brittle regex. */
const ldAt = fin.indexOf('loginDone(name)');
const retAt = fin.indexOf('return true', ldAt);
const routeAt = fin.indexOf('location.hash', ldAt);
ok('it hands off to native before routing', ldAt !== -1);
ok('the native handoff returns early', ldAt !== -1 && retAt !== -1 && retAt > ldAt);
ok('the local route only happens after the early return',
   routeAt !== -1 && retAt < routeAt,
   'return at ' + retAt + ', route at ' + routeAt);
ok('it does not route on the success path',
   !fin.slice(ldAt, fin.indexOf('catch(e){', ldAt)).includes('router.go'),
   'success path leaked a route');
ok('the router fallback survives for the web build',
   /catch\(e\)\{[\s\S]*NX\.router\.go\('dashboard'\)/.test(fin));

console.log('\n\x1b[1mBoot — main window must not self-authenticate (bug 2)\x1b[0m');
const mainBlock = boot.slice(boot.indexOf('if(MAIN_WINDOW &&'), boot.indexOf('WEB / fallback'));
ok('the main-window branch exists', mainBlock.length > 0);
ok('it does NOT force-write a session', !/set\('session', \{ authed:true/.test(code(mainBlock)),
   'main window is still signing the user in for them');
ok('it still starts the engines', /startEngines\(\)/.test(mainBlock));

console.log('\n\x1b[1mBoot — profile handoff is reliable\x1b[0m');
const pr = boot.slice(boot.indexOf("'profile-ready'"), boot.indexOf('} catch(e){}', boot.indexOf("'profile-ready'")) + 20);
ok('the listener exists', pr.length > 0);
ok('it restores the workspace from disk', /restoreBackend\(\)/.test(pr));
ok('it writes the session the login window created', /set\('session', \{ authed:true/.test(pr));
ok('it refreshes the sidebar name', /refreshSidebarUser/.test(pr));
ok('it refreshes the sidebar badges', /refreshBadges/.test(pr));
ok('it does not force-navigate over the current route', /if\(!cur \|\| cur === 'login'/.test(pr));

console.log('\n\x1b[1mRemember me ("easy login")\x1b[0m');
ok('the choice is persisted', /ui:skipLogin/.test(login));
ok('it is written with the name for the greeting', /ui:skipLogin', \{ on:true, name \}|on:true, name/.test(login));
ok('the unlock screen offers it', /id="lg-skip"/.test(login));
ok('an explicit checkbox wins', /const remember = skipBox \? skipBox\.checked/.test(fin));
ok('with no PIN we default to remembering', /skipNextTime/.test(login));
ok('the PIN field hints you can leave it empty', /Leave empty to skip next time/.test(login));

console.log('\n\x1b[1mRust — login window is skipped safely\x1b[0m');
ok('workspace_bool exists', /fn workspace_bool\(/.test(rust));
ok('it reads ui:skipLogin', /workspace_bool\("ui:skipLogin"\)/.test(rust));
ok('it handles the {on, name} object shape', /serde_json::Value::Object/.test(rust));
ok('a PIN always wins over remember-me', /workspace_bool\("ui:skipLogin"\) && !has_pin/.test(rust));
ok('the PIN detection looks at pinHash', /pinHash/.test(rust));
ok('skipping reveals the main window', /AUTHED\.store\(true/.test(rust));

console.log('\n\x1b[1mLogin window close timing (bug 3)\x1b[0m');
const ld = rust.slice(rust.indexOf('async fn login_done'), rust.indexOf('fn show_main'));
ok('the close delay was raised past 150ms', /sleep\(Duration::from_millis\((\d+)\)\)/.test(ld) && Number(ld.match(/from_millis\((\d+)\)/)[1]) >= 300,
   ld.match(/from_millis\((\d+)\)/) ? ld.match(/from_millis\((\d+)\)/)[1] + 'ms' : 'none');
ok('AUTHED is set before the close, so X-ing out does not quit the app',
   ld.indexOf('AUTHED.store(true') < ld.indexOf('login.close()'));
ok('profile-ready is emitted', /emit\("profile-ready"/.test(ld));

console.log('\n\x1b[1mStyling\x1b[0m');
ok('.lg-remember is styled', /\.lg-remember\{/.test(shell));
ok('the checkbox is visible and clickable', /\.lg-remember input\{[^}]*accent-color/.test(shell));

console.log('\n' + '─'.repeat(52));
if (fail) { console.log('\x1b[31m' + fail + ' failed\x1b[0m, ' + pass + ' passed'); process.exitCode = 1; }
else console.log('\x1b[32mAll ' + pass + ' login tests passed\x1b[0m');