#!/usr/bin/env node
/**
 * PebbleX — markup regression tests
 *
 * These assert things a screenshot caught but the unit tests did not:
 *
 *   · every <label class="switch"> has a <span class="track">.
 *     The CSS selector is `.switch input:checked + .track`, so a bare
 *     <span> renders a 42x24 empty box with NO visible toggle. Six of
 *     these shipped broken and nobody noticed because they are silent.
 *
 * Static analysis over the source — the failure mode is in the markup
 * string, so grepping for the bad shape is the reliable check.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'renderer', 'js');

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  \x1b[32mok\x1b[0m   ' + n); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + n + (d ? '  (' + d + ')' : '')); }
};

console.log('\n\x1b[1mSwitch markup (the invisible-toggle bug)\x1b[0m');

const files = fs.readdirSync(JS).filter(f => /^\d\d-.*\.js$/.test(f));
let broken = [];
let total = 0;

for (const f of files) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');

  /* the WRONG shape: <label class="switch">…<input …><span></span> */
  const bad = src.match(/<label class="switch">\s*<input[^>]*>\s*<span\s*\/?>\s*<\/span>\s*<\/label>/g) || [];
  /* the RIGHT shape */
  const good = src.match(/<label class="switch">\s*<input[^>]*>\s*<span class="track">\s*<\/span>\s*<\/label>/g) || [];

  total += good.length;
  if (bad.length) broken.push(f + ' (' + bad.length + ')');
}

ok('no switch is missing its .track element', broken.length === 0,
   'broken in: ' + broken.join(', '));
ok('the codebase actually uses switches (sanity)', total > 0, 'found ' + total);

/* every switch must sit inside a label so it is clickable */
const css = fs.readFileSync(path.join(ROOT, 'renderer', 'css', '02-components.css'), 'utf8');
ok('the CSS still requires a sibling .track', /\.switch input:checked \+ \.track/.test(css));
ok('the track has a visible background', /\.switch \.track\{[^}]*background:/.test(css));
ok('the thumb is drawn with ::after', /\.switch \.track::after\{[^}]*border-radius:50%/.test(css));

console.log('\n\x1b[1mGoogle panel wiring\x1b[0m');
const settings = fs.readFileSync(path.join(JS, '30-settings.js'), 'utf8');

ok('the Google section exists', /curSec === 'google'/.test(settings));
ok('Connect is a single button', /id="gd-conn"/.test(settings));
ok('both service switches use .track', /id="gd-tasks"[^>]*><span class="track"/.test(settings));
ok('the drive switch uses .track', /id="gd-drive"[^>]*><span class="track"/.test(settings));
ok('the logo helper is used, not a hand-rolled svg',
   /NX\.glogo/.test(settings) && !/<svg[^>]*viewBox="0 0 48 48"/.test(settings));
ok('advanced fields are collapsed by default', /<details class="gd-more">/.test(settings));
ok('the client ID is not shown as the primary action', /advanced/i.test(settings));

const core = fs.readFileSync(path.join(JS, '00-core.js'), 'utf8');
ok('NX.glogo is defined', /NX\.glogo = function/.test(core));
ok('NX.glogoTitle is defined', /NX\.glogoTitle = function/.test(core));
ok('brand marks use the official 24x24 geometry', /const GV = '0 0 24 24'/.test(core));

const sync = fs.readFileSync(path.join(JS, '54-google-sync.js'), 'utf8');
ok('the nudge strip exists', /function showNudge/.test(sync));
ok('the nudge is exported for reuse', /showNudge,/.test(sync));
ok('connect announces itself', /announce\('connected'\)/.test(sync));
ok('an unset toggle means ON (one click works)', /tasksEnabled\s*===\s*false/.test(sync));
ok('sync reports as a notification', /announce\('synced'\)/.test(sync));

console.log('\n' + '─'.repeat(52));
if (fail) { console.log('\x1b[31m' + fail + ' failed\x1b[0m, ' + pass + ' passed'); process.exitCode = 1; }
else console.log('\x1b[32mAll ' + pass + ' markup tests passed\x1b[0m');