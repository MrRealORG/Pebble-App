#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('--- Attachment & Error Fix Tests ---');

// Setup mock browser environment
const domWindow = {
  innerWidth: 1024,
  innerHeight: 768,
  addEventListener: () => {},
  removeEventListener: () => {},
  document: {
    addEventListener: () => {},
    removeEventListener: () => {},
    body: {
      appendChild: () => {},
      removeChild: () => {}
    },
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      style: {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      appendChild: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      setAttribute: () => {},
      getAttribute: () => null,
      getBoundingClientRect: () => ({ left: 100, top: 100, right: 200, bottom: 150, width: 100, height: 50 })
    })
  },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  Event: class { constructor(type) { this.type = type; } },
  CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts ? opts.detail : null; } }
};

const sandbox = {
  window: domWindow,
  document: domWindow.document,
  innerWidth: 1024,
  innerHeight: 768,
  console,
  setTimeout,
  clearTimeout,
  NX: {
    ICON_PATHS: {},
    icon: (name) => `<svg class="ic-${name}"></svg>`,
    util: {
      esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      uid: (p) => (p || 'u') + '_' + Math.random().toString(36).slice(2, 8),
      relTime: () => 'just now',
      clamp: (v, min, max) => Math.max(min, Math.min(max, v))
    },
    store: {
      get: (k, d) => d,
      set: () => {}
    },
    routeInShell: () => {},
    events: { on: () => {}, emit: () => {} }
  }
};
sandbox.NX.h = (html) => {
  const el = domWindow.document.createElement('div');
  el.innerHTML = html;
  el.firstElementChild = el;
  return el;
};
sandbox.NX.q = () => null;
sandbox.NX.qa = () => [];
domWindow.NX = sandbox.NX;

vm.createContext(sandbox);

// 1. Test 02-ui.js NX.menu with mouse event
const uiJs = fs.readFileSync(path.join(__dirname, '../renderer/js/02-ui.js'), 'utf8');
vm.runInContext(uiJs, sandbox);

assert(typeof sandbox.NX.menu === 'function', 'NX.menu is defined');

// Passing a mouse event object that DOES NOT have getBoundingClientRect
const mockMouseEvent = { clientX: 250, clientY: 180 };
assert.doesNotThrow(() => {
  sandbox.NX.menu(mockMouseEvent, [{ label: 'Item 1' }]);
}, 'NX.menu handles event coordinate anchors without throwing TypeError');
console.log('  ✓ NX.menu handles event coordinate anchors without throwing getBoundingClientRect error');

// 2. Test 22-notes.js markdown rendering for attachments
const notesJs = fs.readFileSync(path.join(__dirname, '../renderer/js/22-notes.js'), 'utf8');
vm.runInContext(notesJs, sandbox);

assert(typeof sandbox.NX.mdRender === 'function', 'NX.mdRender is defined');

// Test PDF attachment
const pdfMd = '[📎 Quarterly_Report.pdf (2.4 MB)](data:application/pdf;base64,JVBERi0xLjQK...)';
const pdfHtml = sandbox.NX.mdRender(pdfMd);
assert(pdfHtml.includes('md-file-card'), 'Rendered md-file-card for PDF');
assert(pdfHtml.includes('Quarterly_Report.pdf'), 'Contained PDF filename');
assert(pdfHtml.includes('md-file-view'), 'Included PDF preview button');
assert(pdfHtml.includes('Download'), 'Included Download button');
console.log('  ✓ NX.mdRender renders Notion-style file card for PDFs with preview & download buttons');

// Test Excel spreadsheet attachment
const xlsxMd = '[📎 Finances_2026.xlsx (540 KB)](data:application/vnd.ms-excel;base64,UEsDBB...)';
const xlsxHtml = sandbox.NX.mdRender(xlsxMd);
assert(xlsxHtml.includes('md-file-card'), 'Rendered md-file-card for XLSX');
assert(xlsxHtml.includes('Finances_2026.xlsx'), 'Contained XLSX filename');
assert(xlsxHtml.includes('540 KB'), 'Contained file size');
console.log('  ✓ NX.mdRender renders Notion-style file card for Excel spreadsheets (.xlsx)');

// Test Word document attachment
const docxMd = '[📎 Meeting_Summary.docx (120 KB)](data:application/docx;base64,UEsDBB...)';
const docxHtml = sandbox.NX.mdRender(docxMd);
assert(docxHtml.includes('md-file-card'), 'Rendered md-file-card for DOCX');
assert(docxHtml.includes('Meeting_Summary.docx'), 'Contained DOCX filename');
console.log('  ✓ NX.mdRender renders Notion-style file card for Word documents (.docx)');

// Test image markdown
const imgMd = '![Diagram](data:image/png;base64,iVBORw0KGgo...)';
const imgHtml = sandbox.NX.mdRender(imgMd);
assert(imgHtml.includes('<img src="data:image/png;base64,iVBORw0KGgo..." alt="Diagram" class="md-img" loading="lazy">'), 'Rendered image tag');
console.log('  ✓ NX.mdRender renders responsive markdown images');

console.log('\nAll attachment & error fix tests passed!\n');
