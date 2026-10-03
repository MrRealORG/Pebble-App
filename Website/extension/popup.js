import { loadSettings } from './lib/pebblex.js';

const $ = (id) => document.getElementById(id);
const send = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
let kind = 'task';

function show(error) {
  $('error').hidden = !error;
  $('error').textContent = error || '';
}

function render(settings) {
  const signedIn = Boolean(settings.uid);
  $('signed-in').hidden = !signedIn;
  $('signed-out').hidden = signedIn;
  $('status').textContent = !settings.uid
    ? 'Not connected'
    : settings.status === 'live'
      ? `Connected / ${settings.displayName || 'your workspace'}`
      : settings.status === 'offline'
        ? 'Offline / changes are queued'
        : 'Connecting...';
  $('device').textContent = signedIn ? 'PebbleX / extension 0.1.0' : '';
  $('consent').classList.toggle('is-on', Boolean(settings.usageConsent));
  $('consent').setAttribute('aria-checked', String(Boolean(settings.usageConsent)));
  const hosts = Object.entries(settings.hostSeconds || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  $('today').textContent = settings.usageConsent
    ? hosts.length
      ? `Today: ${hosts.map(([h, s]) => `${h} ${Math.round(s / 60)}m`).join(' · ')}`
      : 'Nothing tracked yet today.'
    : 'Sharing is off. Your browsing stays in this browser.';
}

async function refresh() {
  const response = await send({ type: 'state' });
  if (!response?.ok) return show(response?.error);
  show('');
  render(response.settings);
}

async function init() {
  const settings = await loadSettings();
  if (!settings.supabaseUrl || !settings.firebaseApiKey) {
    $('signed-out').hidden = false;
    $('status').textContent = 'Connect your workspace first';
    $('signin').textContent = 'Open connection settings';
    $('signin').onclick = () => chrome.runtime.openOptionsPage();
    return;
  }
  await refresh();
}

$('signin').onclick = async () => {
  $('signin').disabled = true;
  show('');
  try {
    const response = await send({ type: 'connect' });
    if (!response?.ok) throw new Error(response?.error);
    render(response.settings);
    await refresh();
  } catch (error) {
    show(error.message);
  } finally {
    $('signin').disabled = false; await refresh();
  }
};

$('save').onclick = async () => {
  const title = $('title').value.trim();
  if (!title) return show('Give your capture a short name.');
  $('save').disabled = true;
  try {
    const response = await send({ type: 'capture', title, body: $('body').value.trim(), kind });
    if (!response?.ok) throw new Error(response?.error);
    $('title').value = ''; $('body').value = '';
    show('');
    $('status').textContent = response.settings.status === 'offline' ? 'Saved offline / will sync' : 'Saved to your workspace';
  } catch (error) {
    show(error.message);
  } finally {
    $('save').disabled = false; await refresh();
  }
};

$('title').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('save').click(); }
});

document.querySelectorAll('.segment button').forEach((button) => {
  button.addEventListener('click', () => {
    kind = button.dataset.kind;
    document.querySelectorAll('.segment button').forEach((b) => b.classList.toggle('is-on', b === button));
  });
});

$('consent').onclick = async () => {
  const response = await send({ type: 'consent', value: !$('consent').classList.contains('is-on') });
  if (!response?.ok) return show(response?.error);
  show('');
  render(response.settings);
};

$('options').onclick = () => chrome.runtime.openOptionsPage();
$('configure').onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
$('open').onclick = (e) => {
  e.preventDefault();
  loadSettings().then((s) => chrome.tabs.create({ url: s.workspaceUrl || 'https://pebblex.example/app' }));
};

void init();
