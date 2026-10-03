#!/usr/bin/env node
/** Verifies the Google brand marks are well-formed SVG and colour-locked. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', '00-core.js'), 'utf8');
const win = { console };
win.window = win; win.self = win;
const ctx = vm.createContext(win);
vm.runInContext(src, ctx, { filename: '00-core.js' });

const NX = ctx.NX;
let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  \x1b[32mok\x1b[0m   ' + n); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + n + (d ? '  (' + d + ')' : '')); }
};

console.log('\n\x1b[1mGoogle brand marks\x1b[0m');

ok('NX.glogo exists', typeof NX.glogo === 'function');
const names = ['g', 'tasks', 'drive', 'keep'];
for (const n of names) {
  const svg = NX.glogo(n);
  ok(`${n}: renders svg`, svg.startsWith('<svg') && svg.endsWith('</svg>'));
ok(`${n}: has a 24x24 viewBox`, /viewBox="0 0 24 24"/.test(svg));
  ok(`${n}: is filled, not stroked`, !/stroke="currentColor"/.test(svg), 'brand marks must not be theme-tinted');
  ok(`${n}: has an official brand colour`, /fill="(#[0-9A-Fa-f]{6})"/.test(svg), svg.slice(0, 130));
  ok(`${n}: tags balance`, (svg.match(/<g[ >]/g) || []).length === (svg.match(/<\/g>/g) || []).length);
}

const sized = NX.glogo('tasks', 20);
ok('size is applied', /width:20px/.test(sized) && /height:20px/.test(sized));
ok('size does not distort the viewBox', /viewBox="0 0 24 24"/.test(sized));
ok('every mark has an accessible name', names.every(n => NX.glogoTitle(n).length > 3));
ok('marks are labelled for screen readers', names.every(n => /aria-label="/.test(NX.glogo(n))));
ok('unknown name falls back to the G', NX.glogo('nope').includes('#4285F4'));
ok('GOOGLE_LOGOS lists every mark', NX.GOOGLE_LOGOS.length === names.length);

/* the exact colours Google publishes, so a palette slip is caught */
const EXPECTED = { g:'#4285F4', tasks:'#2684FC', drive:'#4285F4', keep:'#FFBB00' };
for (const n of names) {
  ok(`${n}: exact published colour ${EXPECTED[n]}`, NX.glogo(n).includes(`fill="${EXPECTED[n]}"`));
}

console.log('\n' + '─'.repeat(52));
if (fail) { console.log('\x1b[31m' + fail + ' failed\x1b[0m, ' + pass + ' passed'); process.exitCode = 1; }
else console.log('\x1b[32mAll ' + pass + ' brand-mark tests passed\x1b[0m');