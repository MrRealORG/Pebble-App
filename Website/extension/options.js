import { loadSettings } from './lib/pebblex.js';

const $ = (id) => document.getElementById(id);
const send = (message) => new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));

function show(message) {
  $('error').hidden = !message;
  $('error').textContent = message || '';
}

async function init() {
  const settings = await loadSettings();
  $('url').value = settings.supabaseUrl || '';
  $('key').value = settings.supabasePublishableKey || '';
  $('api').value = settings.firebaseApiKey || '';
  $('workspace').value = settings.workspaceUrl || '';
  $('consent').classList.toggle('is-on', Boolean(settings.usageConsent));
  $('consent').setAttribute('aria-checked', String(Boolean(settings.usageConsent)));
}

$('save').onclick = async () => {
  show('');
  $('saved').hidden = true;
  const response = await send({
    type: 'connect',
    supabaseUrl: $('url').value.trim(),
    supabasePublishableKey: $('key').value.trim(),
    firebaseApiKey: $('api').value.trim(),
    workspaceUrl: $('workspace').value.trim(),
  });
  if (!response?.ok) return show(response?.error);
  $('saved').hidden = false;
};

$('consent').onclick = async () => {
  const next = !$('consent').classList.contains('is-on');
  const response = await send({ type: 'consent', value: next });
  if (!response?.ok) return show(response?.error);
  $('consent').classList.toggle('is-on', next);
  $('consent').setAttribute('aria-checked', String(next));
};

$('signout').onclick = async () => {
  await send({ type: 'signout' });
  await init();
};

void init();
