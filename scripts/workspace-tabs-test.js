/* ============================================================
   PebbleX — workspace-tabs-test.js
   Test suite for Workspace Tabs, Real Website Logo Favicons,
   Omnibar search, and Notes Tab integration.
   ============================================================ */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n--- Workspace Tabs & Website Logo Favicon Tests ---');

// Mock browser DOM environment
global.window = global;
global.document = {
  documentElement: {
    setAttribute: () => {},
    style: { setProperty: () => {}, removeProperty: () => {} }
  },
  body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    className: '',
    style: {},
    dataset: {},
    setAttribute: () => {},
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  }),
  addEventListener: () => {},
  removeEventListener: () => {}
};

const storeData = {};
global.NX = {
  util: {
    esc: s => String(s || ''),
    uid: prefix => (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 7),
    colorFor: s => '#10b981',
    initials: s => 'P'
  },
  store: {
    get: (k, d) => (k in storeData ? storeData[k] : d),
    set: (k, v) => { storeData[k] = v; },
    remove: (k) => { delete storeData[k]; }
  },
  router: {
    routes: {},
    register: (name, config) => { global.NX.router.routes[name] = config; },
    go: (name) => { global.NX.router.current = name; }
  },
  events: { on: () => {}, emit: () => {} },
  toastOk: () => {},
  toastInfo: () => {},
  toastErr: () => {},
  sfx: { play: () => {} },
  icon: (ic) => `<svg data-icon="${ic}"></svg>`,
  q: () => null,
  qa: () => [],
  NAV: [
    { group: 'Workspace', items: [
      { r: 'notes', n: 'Notes', ic: 'notes' },
      { r: 'canvas', n: 'Canvas', ic: 'brush' },
      { r: 'todo', n: 'Tasks', ic: 'todo' }
    ]}
  ],
  unreadNotifs: () => 0,
  brandMark: () => '<svg></svg>',
  renderSidebar: () => {}
};

// Load 02-ui.js
require('../renderer/js/02-ui.js');

// 1. Test NX.cleanHost
assert.strictEqual(NX.cleanHost('https://github.com/torvalds/linux'), 'github.com');
assert.strictEqual(NX.cleanHost('http://www.notion.so/workspace'), 'notion.so');
assert.strictEqual(NX.cleanHost('youtube.com/watch?v=123'), 'youtube.com');
assert.strictEqual(NX.cleanHost('https://sub.domain.co.uk:8080/path'), 'sub.domain.co.uk');
console.log('  ✓ NX.cleanHost correctly parses and normalizes domain URLs');

// 2. Test NX.getWebsiteFaviconUrl
const favUrl = NX.getWebsiteFaviconUrl('github.com', 64);
assert.ok(favUrl.includes('google.com/s2/favicons?domain=github.com&sz=64'));
console.log('  ✓ NX.getWebsiteFaviconUrl returns high-resolution favicon endpoint');

// 3. Test NX.getWebsiteFaviconHtml
const favHtml = NX.getWebsiteFaviconHtml('https://youtube.com', { size: 20 });
assert.ok(favHtml.includes('site-favicon-wrap'));
assert.ok(favHtml.includes('youtube.com'));
assert.ok(favHtml.includes('duckduckgo.com/ip3/youtube.com.png'));
console.log('  ✓ NX.getWebsiteFaviconHtml generates complete favicon with DuckDuckGo fallback');

// Load 11-shell.js
require('../renderer/js/11-shell.js');

// 4. Test NX.tabs module
assert.ok(NX.tabs, 'NX.tabs should be defined');
assert.strictEqual(typeof NX.tabs.list, 'function');
assert.strictEqual(typeof NX.tabs.open, 'function');
assert.strictEqual(typeof NX.tabs.switch, 'function');
assert.strictEqual(typeof NX.tabs.close, 'function');

const initialTabs = NX.tabs.list();
assert.ok(Array.isArray(initialTabs));
assert.ok(initialTabs.length >= 3, 'Should have default workspace tabs');
console.log(`  ✓ NX.tabs initialized with ${initialTabs.length} workspace tabs`);

// 5. Test opening a new tab
const newTab = NX.tabs.open({
  route: 'notes',
  title: 'Project Roadmap',
  icon: 'notes',
  params: { noteId: 'nt_123' }
});
assert.strictEqual(newTab.title, 'Project Roadmap');
assert.strictEqual(NX.tabs.activeId(), newTab.id);
assert.strictEqual(NX.router.current, 'notes');
console.log('  ✓ NX.tabs.open adds new tab, sets it active and navigates');

// 6. Test opening a website tab
const webTab = NX.tabs.open({
  route: 'web',
  title: 'GitHub',
  url: 'https://github.com',
  isWeb: true
});
assert.strictEqual(webTab.isWeb, true);
assert.strictEqual(webTab.url, 'https://github.com');
assert.strictEqual(NX.tabs.activeId(), webTab.id);
console.log('  ✓ NX.tabs.open supports dedicated web tabs with live website URLs');

// 7. Test closing a tab
const countBefore = NX.tabs.list().length;
NX.tabs.close(webTab.id);
const countAfter = NX.tabs.list().length;
assert.strictEqual(countAfter, countBefore - 1);
assert.notStrictEqual(NX.tabs.activeId(), webTab.id);
console.log('  ✓ NX.tabs.close cleanly removes tab and switches to adjacent tab');

// 8. Verify Notes and Spotlight integrations in files
const notesCode = fs.readFileSync(path.join(__dirname, '../renderer/js/22-notes.js'), 'utf8');
assert.ok(notesCode.includes('Open in New Tab'), '22-notes.js should have Open in New Tab option');
assert.ok(notesCode.includes('NX.getWebsiteFaviconHtml'), '22-notes.js should render website favicons for links');
console.log('  ✓ 22-notes.js has Open in New Tab and live link favicons');

const spotlightCode = fs.readFileSync(path.join(__dirname, '../renderer/js/33-spotlight.js'), 'utf8');
assert.ok(spotlightCode.includes('isUrlPattern'), '33-spotlight.js should detect URLs');
assert.ok(spotlightCode.includes('Switch to Tab:'), '33-spotlight.js should search open tabs');
console.log('  ✓ 33-spotlight.js detects website URLs and searches open tabs');

const shellCss = fs.readFileSync(path.join(__dirname, '../renderer/css/03-shell.css'), 'utf8');
assert.ok(shellCss.includes('.workspace-tabs-strip'), '03-shell.css has workspace-tabs-strip');
assert.ok(shellCss.includes('.omni-search-box'), '03-shell.css has omni-search-box');
console.log('  ✓ 03-shell.css styles Workspace Tabs and Omnibar');

console.log('\nAll Workspace Tabs & Website Logo Favicon tests passed!\n');
process.exit(0);
