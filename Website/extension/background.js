/**
 * PebbleX Capture service worker.
 *
 * Tracks only per-host time totals, queues quick captures while offline,
 * and writes to the same Supabase tables used by the desktop app and the web.
 */
import { capture, connectWorkspace, flushPending, firebaseIdToken, googleSignIn, loadSettings, reportUsage, saveSettings, signOut } from './lib/pebblex.js';

const TICK_SECONDS = 20;
let current = null;

function hostnameOf(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    // Internal browser pages and the user's own extensions are never tracked.
    return host && !host.includes('://') && !/^(chrome|edge|about|moz-extension)/.test(host) ? host.slice(0, 120) : '';
  } catch {
    return '';
  }
}

async function tally(seconds) {
  if (!current?.host || seconds <= 0) return;
  const settings = await loadSettings();
  const day = settings.usageDay !== new Date().toDateString() ? {} : (settings.hostSeconds || {});
  if (settings.usageDay !== new Date().toDateString()) await saveSettings({ usageDay: new Date().toDateString() });
  const merged = { ...day, [current.host]: (day[current.host] || 0) + seconds };
  await saveSettings({ hostSeconds: merged, usageDay: new Date().toDateString() });
}

async function focusTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const host = tab?.id === current?.tabId ? current?.host : hostnameOf(tab?.url || '');
  current = { tabId: tab?.id || null, host, seenAt: Date.now() };
}

async function sync() {
  const settings = await loadSettings();
  if (!settings.uid) return;
  try {
    await connectWorkspace(settings);
    await flushPending(settings);
    if (settings.usageConsent && settings.hostSeconds && Object.keys(settings.hostSeconds).length) {
      // Sends the full day total so the unique row stays cumulative.
      await reportUsage(settings, settings.hostSeconds);
      await saveSettings({ status: 'live' });
    } else if (!settings.usageConsent && Object.keys(settings.hostSeconds || {}).length) {
      await saveSettings({ hostSeconds: {} });
    }
  } catch (error) {
    await saveSettings({ status: 'offline', lastError: String(error.message || error).slice(0, 180) });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('pebblex-tick', { periodInMinutes: TICK_SECONDS / 60 });
  chrome.alarms.create('pebblex-sync', { periodInMinutes: 1 });
  void focusTab();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pebblex-tick') void tally(TICK_SECONDS);
  if (alarm.name === 'pebblex-sync') void sync();
});

chrome.tabs.onActivated.addListener(() => { void tally(2); void focusTab(); });
chrome.windows.onFocusChanged.addListener(() => { void tally(2); void focusTab(); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) { void tally(2); void focusTab(); }
});
chrome.tabs.onRemoved.addListener(() => { void tally(2); current = null; });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    const settings = await loadSettings();
    try {
      if (message.type === 'state') {
        sendResponse({ ok: true, settings: { ...settings, hostSeconds: undefined } });
      } else if (message.type === 'connect') {
        await saveSettings({
          supabaseUrl: message.supabaseUrl || settings.supabaseUrl,
          supabasePublishableKey: message.supabasePublishableKey || settings.supabasePublishableKey,
          firebaseApiKey: message.firebaseApiKey || settings.firebaseApiKey,
          workspaceUrl: message.workspaceUrl || settings.workspaceUrl,
          deviceId: settings.deviceId || crypto.randomUUID(),
        });
        let session = await loadSettings();
        // No usable session: obtain a Firebase credential from Google first.
        if (!session.uid || !session.refreshToken) session = await googleSignIn(session);
        const next = await connectWorkspace(session);
        sendResponse({ ok: true, settings: { ...next, hostSeconds: undefined } });
      } else if (message.type === 'capture') {
        const next = await capture(settings, message);
        sendResponse({ ok: true, settings: { ...next, hostSeconds: undefined } });
      } else if (message.type === 'consent') {
        await saveSettings({ usageConsent: Boolean(message.value) });
        if (!message.value) await saveSettings({ hostSeconds: {} });
        sendResponse({ ok: true, settings: { ...(await loadSettings()), hostSeconds: undefined } });
      } else if (message.type === 'signout') {
        await signOut();
        sendResponse({ ok: true });
      } else if (message.type === 'token') {
        sendResponse({ ok: true, token: await firebaseIdToken(settings) });
      } else {
        sendResponse({ ok: false, error: 'Unknown request.' });
      }
    } catch (error) {
      sendResponse({ ok: false, error: String(error.message || error) });
    }
  })();
  return true;
});

chrome.runtime.onStartup?.addListener(() => { void focusTab(); void sync(); });
