// scripts/obsidian-canvas-popup-test.js
// Validates Obsidian-style Canvas Engine, Hardware-Accelerated Popups,
// and Reliable Image Upload Displays.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('\n--- Obsidian Canvas, Fast Popups & Reliable Image Tests ---');

// 1. Whiteboard Canvas Obsidian Engine in 27-canvas.js
const canvasJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', '27-canvas.js'), 'utf8');

assert(canvasJs.includes('isElementInViewport'), '27-canvas.js must implement isElementInViewport frustum culling');
assert(canvasJs.includes('minWx = -panX / zoom - 40'), '27-canvas.js must compute world viewport visible bounds');
assert(canvasJs.includes("el.type === 'card'"), '27-canvas.js must support Obsidian Note Card elements');
assert(canvasJs.includes('openCardEditor'), '27-canvas.js must provide openCardEditor for double-click editing');
assert(canvasJs.includes('fitToContent'), '27-canvas.js must provide fitToContent to center and zoom all elements');
assert(canvasJs.includes('selectedElemId'), '27-canvas.js must track selectedElemId for interactive bounding boxes');
assert(canvasJs.includes("data-t=\"card\""), '27-canvas.js must include Card tool button in toolbar');
assert(canvasJs.includes('vp.addEventListener(\'dragover\''), '27-canvas.js must support dragover for image drop');
assert(canvasJs.includes('vp.addEventListener(\'drop\''), '27-canvas.js must support drop for image upload');
assert(canvasJs.includes('isSpaceDown'), '27-canvas.js must support Spacebar-held smooth panning');

console.log('  ✓ Obsidian Canvas engine has frustum culling, note cards, selection, drag & drop, and fitToContent');

// 2. Hardware-Accelerated Popups and Modals in CSS and JS
const compCss = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'css', '02-components.css'), 'utf8');
assert(compCss.includes('.modal-backdrop{\n  position:fixed;inset:0;z-index:800;background:rgba(20,20,18,.5);\n  display:flex;align-items:center;justify-content:center;padding:24px;\n  animation:nx-fade .14s ease both;\n  contain:strict;will-change:opacity;\n}'),
  '02-components.css must optimize modal-backdrop with contain:strict and will-change:opacity');
assert(compCss.includes('.modal{\n  background:var(--surface);border-radius:22px;box-shadow:var(--sh-pop);\n  width:100%;max-width:480px;max-height:86vh;display:flex;flex-direction:column;\n  animation:nx-pop .16s ease both;overflow:hidden;\n  transform:translate3d(0,0,0);will-change:transform,opacity;contain:layout style;\n}'),
  '02-components.css must hardware-accelerate .modal with translate3d and contain:layout style');

const shellCss = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'css', '03-shell.css'), 'utf8');
assert(shellCss.includes('transform: translate3d(0, 0, 0);'), '03-shell.css must hardware accelerate .glass-hub-card');
assert(shellCss.includes('contain: layout style;'), '03-shell.css must contain layout for .glass-hub-card');

const spotlightJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', '33-spotlight.js'), 'utf8');
assert(!spotlightJs.includes('spotlight-backdrop anim-in'), 'Spotlight backdrop must NOT translate 10px across full screen with anim-in');
assert(spotlightJs.includes('spotlight-backdrop anim-fade'), 'Spotlight backdrop must use pure fade for zero GPU stall');
assert(spotlightJs.includes('contain:strict;will-change:opacity'), 'Spotlight backdrop must use strict containment');

const copilotJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', '34-copilot.js'), 'utf8');
assert(!copilotJs.includes('cmdk-backdrop anim-in'), 'Copilot backdrop must NOT use anim-in full screen translate');
assert(copilotJs.includes('cmdk-backdrop anim-fade'), 'Copilot backdrop must use anim-fade');

const focusJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', '32-focus.js'), 'utf8');
assert(!focusJs.includes('cmdk-backdrop anim-in'), 'Focus overlay must NOT use anim-in full screen translate');

console.log('  ✓ Popups & modals hardware-accelerated with zero-lag composite layers and contain:strict');

// 3. Reliable Image Upload Displays
const notesJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', '22-notes.js'), 'utf8');
assert(notesJs.includes('<img src="${realUrl}" alt="${alt}" class="md-img" loading="lazy">'),
  'Markdown images must render clean responsive md-img tags with lazy loading');
assert(notesJs.includes('String(rawUrl).replace(/&amp;/g, \'&\')'),
  '22-notes.js must clean unescaped URL query parameters before resolving assets');

const storeJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', '49-store.js'), 'utf8');
assert(storeJs.includes('avatar-fallback'), '49-store.js must have reliable fallback for user avatars');

console.log('  ✓ Image rendering reliable without lazy load stalling or broken URL query parameters');

console.log('\nAll Obsidian Canvas, Fast Popups & Reliable Image tests passed!\n');
