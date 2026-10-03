/**
 * PebbleX extension runtime.
 *
 * Firebase Authentication signs the user in; Supabase Postgres stores the
 * shared workspace using the same tables as the web and desktop apps.
 * No AI provider key, service-role key, or Firebase Admin credential is
 * bundled here. Only public Firebase web configuration and the Supabase
 * publishable key are used.
 */

export const DEFAULTS = {
  supabaseUrl: '',
  supabasePublishableKey: '',
  firebaseApiKey: '',
  deviceId: '',
  usageConsent: false,
  accountEnabled: false,
  displayName: '',
  uid: '',
  status: 'signed-out',
  pendingWrites: [],
};

export async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(patch) {
  await chrome.storage.local.set(patch);
  return loadSettings();
}

export function isoDay(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function baseUrl(settings) {
  return `${settings.supabaseUrl.replace(/\/$/, '')}/rest/v1`;
}

/** Supabase REST with the short-lived Firebase ID token as the bearer. */
export async function api(settings, path, { method = 'GET', body, prefer, token } = {}) {
  if (!settings.supabaseUrl || !settings.supabasePublishableKey) throw new Error('Connect the extension in Options first.');
  const response = await fetch(`${baseUrl(settings)}${path}`, {
    method,
    headers: {
      apikey: settings.supabasePublishableKey,
      Authorization: `Bearer ${token || (await firebaseIdToken(settings))}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`PebbleX sync failed (${response.status}). ${text.slice(0, 140)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/** Exchange a Google access token for Firebase credentials. */
export async function googleSignIn(settings) {
  const accessToken = await new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!token) reject(new Error('Google sign-in was cancelled.'));
      else resolve(token);
    });
  });
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${settings.firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestUri: window.location.origin,
      returnSecureToken: true,
      postBody: `access_token=${encodeURIComponent(accessToken)}&providerId=google.com`,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message === 'ADMIN_ONLY_OPERATION' ? 'This Google account is not allowed yet.' : payload?.error?.message || 'Sign-in failed.');
  return persistSession(settings, payload);
}

async function persistSession(settings, payload) {
  const next = await saveSettings({
    uid: payload.localId,
    idToken: payload.idToken,
    refreshToken: payload.refreshToken,
    expiresAt: Date.now() + Number(payload.expiresIn || 3600) * 1000,
    displayName: payload.displayName || (payload.email || '').split('@')[0],
    status: 'connecting',
    accountEnabled: true,
    deviceId: settings.deviceId || crypto.randomUUID(),
  });
  await saveSettings({ deviceId: next.deviceId });
  return next;
}

export async function signOut() {
  await saveSettings({ uid: '', idToken: '', refreshToken: '', status: 'signed-out', displayName: '', accountEnabled: false });
}

/** Refresh the Firebase token when it is within two minutes of expiry. */
export async function firebaseIdToken(settings) {
  if (settings.idToken && settings.expiresAt && Date.now() < settings.expiresAt - 120000) return settings.idToken;
  if (!settings.refreshToken) throw new Error('Please sign in again.');
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${settings.firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(settings.refreshToken)}`,
  });
  const payload = await response.json();
  if (!response.ok) {
    await saveSettings({ status: 'signed-out', idToken: '', refreshToken: '' });
    throw new Error(payload?.error?.message || 'The session expired. Please sign in again.');
  }
  const next = await saveSettings({
    idToken: payload.id_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  });
  return next.idToken;
}

/** Creates the profile if needed and refreshes this device's heartbeat. */
export async function connectWorkspace(settings) {
  const token = await firebaseIdToken(settings);
  await api(settings, '/rpc/ensure_extension_account', {
    method: 'POST',
    body: {},
    token,
  }).catch(async () => {
    // The RPC is optional; the profile is normally provisioned by the web app.
  });
  await api(settings, `/devices?id=eq.${settings.deviceId}`, {
    method: 'POST',
    body: [{
      id: settings.deviceId,
      owner_id: settings.uid,
      name: navigator.userAgent.includes('Edg') ? 'Edge / PebbleX Capture' : 'Chrome / PebbleX Capture',
      platform: navigator.userAgentData?.brands?.find((b) => b.brand !== 'Not A Brand')?.brand || 'Browser',
      kind: 'extension',
      app_version: chrome.runtime.getManifest().version,
    }],
    prefer: 'resolution=merge-duplicates,return=minimal',
    token,
  });
  return saveSettings({ status: 'live' });
}

/**
 * Records one aggregate row per domain per day. Hostnames only:
 * never full URLs, page titles, input values, or browsing sequences.
 */
export async function reportUsage(settings, entries) {
  if (!settings.usageConsent) return { shared: false };
  const token = await firebaseIdToken(settings);
  const rows = Object.entries(entries).map(([host, seconds]) => ({
    owner_id: settings.uid,
    device_id: settings.deviceId,
    app_name: host.slice(0, 120),
    category: 'Browsing',
    minutes: Math.round((seconds / 60) * 10) / 10,
    day: isoDay(),
    color: '#7eaf6a',
  }));
  if (!rows.length) return { shared: true, rows: 0 };
  await api(settings, '/app_usage?on_conflict=owner_id,device_id,app_name,day', {
    method: 'POST',
    body: rows,
    prefer: 'resolution=merge-duplicates,return=minimal',
    token,
  });
  return { shared: true, rows: rows.length };
}

/** Writes queued quick-capture items to the same workspace_items table. */
export async function flushPending(settings) {
  const queued = settings.pendingWrites || [];
  if (!queued.length || !settings.uid) return settings;
  const token = await firebaseIdToken(settings);
  const failed = [];
  for (const item of queued) {
    try {
      await api(settings, '/workspace_items?on_conflict=id', {
        method: 'POST',
        body: [{ ...item, owner_id: settings.uid, origin: 'extension' }],
        prefer: 'resolution=merge-duplicates,return=minimal',
        token,
      });
    } catch {
      failed.push(item);
    }
  }
  return saveSettings({ pendingWrites: failed, status: failed.length ? 'offline' : 'live' });
}

export async function capture(settings, { title, body = '', kind = 'task' }) {
  const item = {
    id: crypto.randomUUID(),
    kind,
    title: title.slice(0, 180),
    body: body.slice(0, 10000),
    status: 'todo',
    priority: 'medium',
    project: 'Inbox',
    due_date: null,
    pinned: false,
    extra: {},
  };
  const next = await saveSettings({ pendingWrites: [...(settings.pendingWrites || []), item] });
  return flushPending(next);
}
