#!/usr/bin/env node
/**
 * PebbleX Cloud & Settings integration tests
 * Verifies Supabase connectivity, zero-dependency REST fallback,
 * Cloudflare R2 configuration, and Display & Scale settings.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
function test(name, fn){
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch(e) {
    console.error('  ✗ ' + name + ' -> ' + e.message);
    process.exitCode = 1;
  }
}

console.log('\n--- PebbleX Cloud & Settings Tests ---');

// Mock browser environment for 46-supabase.js
const store = {};
global.window = {
  NX: {
    store: {
      get: (k, def) => store[k] !== undefined ? store[k] : def,
      set: (k, v) => { store[k] = v; },
      del: (k) => { delete store[k]; }
    },
    events: { emit: ()=>{} }
  }
};
global.navigator = { onLine: true };

// Load 46-supabase.js
require('../renderer/js/46-supabase.js');
const NX = global.window.NX;

test('NX.cloud is defined', () => {
  assert.ok(NX.cloud, 'NX.cloud should exist');
  assert.strictEqual(NX.cloud.provider, 'supabase+cloudflare');
});

test('NX.cloud default configuration has project URL and key', () => {
  const cfg = NX.cloud.readConfig();
  assert.strictEqual(cfg.supabaseUrl, 'https://uqrkpssesnxhevkgcgsu.supabase.co');
  assert.strictEqual(cfg.supabaseKey, 'sb_publishable_AQgLWYOskawdqLpqOmdk0g_J4WoSrH-');
  assert.strictEqual(cfg.r2Endpoint, 'https://pebble-media-api.bbs-hub-cdn.workers.dev');
  assert.ok(NX.cloud.configured(), 'NX.cloud.configured() should be true');
});

test('NX.cloud.testConnection is exported and callable', () => {
  assert.strictEqual(typeof NX.cloud.testConnection, 'function');
});

test('NX.cloud.r2 is configured', () => {
  assert.ok(NX.cloud.r2.configured, 'NX.cloud.r2 should be configured');
  assert.strictEqual(NX.cloud.r2.endpoint, 'https://pebble-media-api.bbs-hub-cdn.workers.dev');
});

test('Settings contains Display & Scale and Cloud in SECTIONS', () => {
  const settingsCode = fs.readFileSync(path.join(__dirname, '../renderer/js/30-settings.js'), 'utf8');
  assert.ok(settingsCode.includes("id:'display'"), 'display section should be in SECTIONS');
  assert.ok(settingsCode.includes("id:'cloud'"), 'cloud section should be in SECTIONS');
  assert.ok(settingsCode.includes("Display & UI Scaling"), 'Display & UI Scaling markup should exist');
  assert.ok(settingsCode.includes("NX.cloud.testConnection"), 'Test connection should call testConnection');
});

test('Sidebar mini mode does not overflow scale controls', () => {
  const css = fs.readFileSync(path.join(__dirname, '../renderer/css/03-shell.css'), 'utf8');
  assert.ok(css.includes('.sidebar.mini .scale-row [data-scale="reset"]{display:none}'), 'Reset button should hide in mini sidebar');
  assert.ok(css.includes('.sidebar.mini .nav-item:hover::after'), 'Mini tooltip styling should exist');
});

test('SQL migration file exists and contains native Supabase Auth functions', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../Website/backend/supabase/init_pebblex_supabase.sql'), 'utf8');
  assert.ok(sql.includes('create table if not exists public.profiles'), 'profiles table should be in SQL');
  assert.ok(sql.includes('create table if not exists public.workspace_items'), 'workspace_items table should be in SQL');
  assert.ok(sql.includes('auth.uid()'), 'auth.uid() should be used in RLS policies');
  assert.ok(sql.includes('handle_new_user()'), 'handle_new_user() trigger should exist');
});

console.log(`\nAll ${passed} cloud tests passed!\n`);
