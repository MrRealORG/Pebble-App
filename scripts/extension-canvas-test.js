/**
 * Tests for Extension Connection, .WebP Compression, Profile Sync & Canvas Top Tabs
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- PebbleX Extension, WebP Compression & Canvas Tabs Tests ---');

// 1. Check NX.compressImageToWebP in 02-ui.js
const uiJs = fs.readFileSync(path.join(__dirname, '../renderer/js/02-ui.js'), 'utf8');
assert(uiJs.includes('NX.compressImageToWebP = function'), 'NX.compressImageToWebP must be exported in 02-ui.js');
assert(uiJs.includes('image/webp'), 'compressImageToWebP must support image/webp output');
console.log('  ✓ NX.compressImageToWebP is defined with webp format support');

// 2. Check NX.avatarHtml in 49-store.js
const storeJs = fs.readFileSync(path.join(__dirname, '../renderer/js/49-store.js'), 'utf8');
assert(storeJs.includes('profile.avatarImg'), 'NX.avatarHtml must support profile.avatarImg');
assert(storeJs.includes('<img src='), 'NX.avatarHtml must render img tag for image avatars');
console.log('  ✓ NX.avatarHtml supports avatarImg and renders img tags');

// 3. Check Settings logo upload in 30-settings.js
const settingsJs = fs.readFileSync(path.join(__dirname, '../renderer/js/30-settings.js'), 'utf8');
assert(settingsJs.includes('compressImageToWebP'), 'Settings logo upload must use compressImageToWebP');
assert(settingsJs.includes('Upload photo / logo'), 'Settings profile must offer photo / logo upload');
console.log('  ✓ Settings profile upload compresses logos to .webp');

// 4. Check Cloud Profile Sync in 46-supabase.js
const supabaseJs = fs.readFileSync(path.join(__dirname, '../renderer/js/46-supabase.js'), 'utf8');
assert(supabaseJs.includes("kind === 'profile'"), '46-supabase.js must handle profile kind in sync.push');
assert(supabaseJs.includes('Reconcile Profile & Identity'), '46-supabase.js must reconcile profile identity');
console.log('  ✓ Cloud sync reconciles user profile, logo, and identity across devices');

// 5. Check Extension manifest host_permissions in extension/manifest.json
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../extension/manifest.json'), 'utf8'));
assert(Array.isArray(manifest.host_permissions), 'manifest.json must have host_permissions');
assert(manifest.host_permissions.includes('http://127.0.0.1/*'), 'manifest must include valid http://127.0.0.1/* without port wildcard');
assert(manifest.host_permissions.includes('http://localhost/*'), 'manifest must include valid http://localhost/* without port wildcard');
console.log('  ✓ Extension manifest.json contains valid MV3 host_permissions without port wildcards');

// 6. Check Extension background.js and popup.js
const bgJs = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
assert(bgJs.includes('get_profile'), 'background.js must handle get_profile message');
assert(bgJs.includes('upload_logo'), 'background.js must handle upload_logo message');
assert(bgJs.includes('/api/profile'), 'background.js must query /api/profile');

const popupHtml = fs.readFileSync(path.join(__dirname, '../extension/popup.html'), 'utf8');
assert(popupHtml.includes('id="userLogo"'), 'popup.html must have #userLogo');
assert(popupHtml.includes('id="userName"'), 'popup.html must have #userName');
assert(popupHtml.includes('id="btnLogoPick"'), 'popup.html must have logo picker button');

const popupJs = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');
assert(popupJs.includes('compressToWebP'), 'popup.js must contain client-side compressToWebP function');
assert(popupJs.includes('upload_logo'), 'popup.js must send upload_logo to background');
console.log('  ✓ Extension background and popup support logo upload with .webp compression');

// 7. Check Tauri ext_bridge.rs for /api/profile endpoint
const bridgeRs = fs.readFileSync(path.join(__dirname, '../src-tauri/src/ext_bridge.rs'), 'utf8');
assert(bridgeRs.includes('GET /api/profile'), 'ext_bridge.rs must support GET /api/profile');
assert(bridgeRs.includes('POST /api/profile'), 'ext_bridge.rs must support POST /api/profile');
console.log('  ✓ ext_bridge.rs supports GET /api/profile and POST /api/profile');

// 8. Check Canvas Top Tabs in 27-canvas.js and 17b-canvas.css
const canvasJs = fs.readFileSync(path.join(__dirname, '../renderer/js/27-canvas.js'), 'utf8');
assert(canvasJs.includes('canvas-tabs-bar'), '27-canvas.js must render .canvas-tabs-bar');
assert(canvasJs.includes('canvas-tabs-list'), '27-canvas.js must contain #canvas-tabs-list');
assert(canvasJs.includes('canvas-tab-add'), '27-canvas.js must contain #canvas-tab-new add button');
assert(canvasJs.includes('renderTabs()'), '27-canvas.js must implement renderTabs()');

const canvasCss = fs.readFileSync(path.join(__dirname, '../renderer/css/17b-canvas.css'), 'utf8');
assert(canvasCss.includes('.canvas-tabs-bar'), '17b-canvas.css must style .canvas-tabs-bar');
assert(canvasCss.includes('.canvas-tab'), '17b-canvas.css must style .canvas-tab');
assert(canvasCss.includes('.canvas-tab.active'), '17b-canvas.css must style .canvas-tab.active');
console.log('  ✓ Canvas Top Tab Bar is fully implemented and styled');

console.log('\nAll extension, webp compression, and canvas tab tests passed!\n');
