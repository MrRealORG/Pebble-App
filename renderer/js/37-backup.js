/* ============================================================
   PebbleX 3.0 — 37-backup.js
   End-to-End Encrypted Vault Backup & Restore:
   - Full workspace backup: Notes, Tasks, Prompts, Day Planner, Focus, Settings
   - Optional AES-GCM 256-bit encryption with PBKDF2 key derivation
   - Merge vs Clean Restore options with pre-restore inspection
   - Rolling local daily snapshots (auto 7-day safety retention)
   - 1-click portable export & restore
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

/* ---------------- Web Crypto AES-GCM Helpers ---------------- */
async function deriveKey(password, saltUint8){
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltUint8,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufToHex(buffer){
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hexString){
  const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
  return bytes.buffer;
}

async function encryptData(plainText, password){
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plainText)
  );
  return {
    pebbleEncrypted: true,
    salt: bufToHex(salt),
    iv: bufToHex(iv),
    ciphertext: bufToHex(encrypted),
    version: '3.0'
  };
}

async function decryptData(encryptedObj, password){
  const salt = hexToBuf(encryptedObj.salt);
  const iv = hexToBuf(encryptedObj.iv);
  const ciphertext = hexToBuf(encryptedObj.ciphertext);
  const key = await deriveKey(password, new Uint8Array(salt));
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    ciphertext
  );
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

/* ---------------- Vault Backup Package ---------------- */
function collectVaultData(){
  const notes = NX.store.get('notes', []);
  const tasks = NX.store.get('tasks', []);
  const prompts = NX.store.get('prompts', []);
  const plannerBlocks = NX.store.get('planner_blocks', []);
  const settings = NX.store.get('settings', {});
  const focusSessions = NX.store.get('focus_sessions', []);
  const reminders = NX.store.get('reminders', []);
  const profile = NX.store.get('profile', {});

  return {
    app: 'PebbleX',
    format: 'pebble-vault-backup',
    version: '3.0',
    createdAt: new Date().toISOString(),
    stats: {
      notesCount: notes.length,
      tasksCount: tasks.length,
      promptsCount: prompts.length,
      plannerBlocksCount: plannerBlocks.length
    },
    data: {
      notes,
      tasks,
      prompts,
      plannerBlocks,
      settings,
      focusSessions,
      reminders,
      profile
    }
  };
}

async function exportVault(password = ''){
  const vault = collectVaultData();
  const jsonStr = JSON.stringify(vault, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);

  let outputContent = '';
  let filename = '';

  if(password && password.trim()){
    const encResult = await encryptData(jsonStr, password.trim());
    outputContent = JSON.stringify(encResult, null, 2);
    filename = `PebbleX-Vault-Encrypted-${dateStr}.pebble`;
  } else {
    outputContent = jsonStr;
    filename = `PebbleX-Vault-Backup-${dateStr}.json`;
  }

  if(NX.native && NX.native.available && NX.native.saveTextFile){
    const res = await NX.native.saveTextFile(filename, outputContent);
    NX.toastOk('Vault Backup Saved!', res && res.path ? res.path : filename);
  } else {
    // Web fallback
    const blob = new Blob([outputContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    NX.toastOk('Vault Backup Downloaded!', filename);
  }
}

async function restoreVault(content, password = '', mode = 'merge'){
  let parsed = null;
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch(e){
    throw new Error('Invalid backup file. Could not parse JSON.');
  }

  if(parsed.pebbleEncrypted){
    if(!password){
      throw new Error('This backup is encrypted. Please enter the password.');
    }
    const decryptedJson = await decryptData(parsed, password);
    parsed = JSON.parse(decryptedJson);
  }

  if(!parsed.data || !parsed.app){
    throw new Error('Unrecognized backup format. Missing PebbleX data structure.');
  }

  const { notes, tasks, prompts, plannerBlocks, settings, focusSessions, reminders } = parsed.data;

  if(mode === 'clean'){
    if(notes) NX.store.set('notes', notes);
    if(tasks) NX.store.set('tasks', tasks);
    if(prompts) NX.store.set('prompts', prompts);
    if(plannerBlocks) NX.store.set('planner_blocks', plannerBlocks);
    if(settings) NX.store.set('settings', settings);
    if(focusSessions) NX.store.set('focus_sessions', focusSessions);
    if(reminders) NX.store.set('reminders', reminders);
  } else {
    // Merge mode: combine without duplicating IDs
    if(notes && notes.length){
      const curNotes = NX.store.get('notes', []);
      const existingIds = new Set(curNotes.map(n => n.id));
      const newNotes = notes.filter(n => !existingIds.has(n.id));
      NX.store.set('notes', [...newNotes, ...curNotes]);
    }
    if(tasks && tasks.length){
      const curTasks = NX.store.get('tasks', []);
      const existingIds = new Set(curTasks.map(t => t.id));
      const newTasks = tasks.filter(t => !existingIds.has(t.id));
      NX.store.set('tasks', [...curTasks, ...newTasks]);
    }
    if(prompts && prompts.length){
      const curPrompts = NX.store.get('prompts', []);
      const existingIds = new Set(curPrompts.map(p => p.id));
      const newPrompts = prompts.filter(p => !existingIds.has(p.id));
      NX.store.set('prompts', [...curPrompts, ...newPrompts]);
    }
    if(plannerBlocks && plannerBlocks.length){
      const curBlocks = NX.store.get('planner_blocks', []);
      const existingIds = new Set(curBlocks.map(b => b.id));
      const newBlocks = plannerBlocks.filter(b => !existingIds.has(b.id));
      NX.store.set('planner_blocks', [...curBlocks, ...newBlocks]);
    }
  }

  NX.toastOk('Vault Successfully Restored!', `${mode === 'clean' ? 'Replaced' : 'Merged'} ${parsed.stats?.notesCount || (notes||[]).length} notes and ${parsed.stats?.tasksCount || (tasks||[]).length} tasks.`);
  NX.sfx.play('ok');

  if(window.__nx_refreshNotesView) window.__nx_refreshNotesView();
}

/* ---------------- Rolling Local Daily Snapshots ---------------- */
function runDailySnapshot(){
  const today = new Date().toISOString().slice(0, 10);
  const snapKey = 'auto_snapshot_' + today;
  if(NX.store.get(snapKey)) return; // already done today

  const backup = collectVaultData();
  NX.store.set(snapKey, {
    date: today,
    createdAt: Date.now(),
    stats: backup.stats,
    data: backup.data
  });

  // Keep only last 7 days of rolling auto-snapshots
  const allKeys = Object.keys(localStorage || {}).filter(k => k.startsWith('pebble:auto_snapshot_') || k.startsWith('auto_snapshot_'));
  if(allKeys.length > 7){
    allKeys.sort().slice(0, allKeys.length - 7).forEach(k => {
      try { localStorage.removeItem(k); } catch(e){}
    });
  }
}

/* ---------------- Backup & Restore Modal ---------------- */
function openBackupModal(){
  const stats = collectVaultData().stats;
  let activeTab = 'export'; // 'export', 'restore'

  const body = h(`<div>
    <div class="seg sm" style="width:100%;margin-bottom:14px" id="bk-tabs">
      <button class="on" data-tab="export">${icon('download')} Backup & Export</button>
      <button data-tab="restore">${icon('upload')} Restore from File</button>
    </div>

    <!-- Export Tab Content -->
    <div id="bk-export-panel">
      <div class="card p-12" style="background:var(--surface-2);border-radius:12px;margin-bottom:12px">
        <div class="faint tiny bold" style="text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Vault Inventory</div>
        <div class="row gap-12 faint tiny" style="flex-wrap:wrap">
          <span>📝 <b>${stats.notesCount}</b> Notes</span> ·
          <span>📋 <b>${stats.tasksCount}</b> Tasks</span> ·
          <span>⭐ <b>${stats.promptsCount}</b> Prompts</span> ·
          <span>📅 <b>${stats.plannerBlocksCount}</b> Scheduled Blocks</span>
        </div>
      </div>

      <div class="field" style="margin-bottom:12px">
        <label>Encryption Password (Optional)</label>
        <input type="password" class="input" id="bk-export-pwd" placeholder="Leave empty for plain JSON backup">
        <div class="faint tiny" style="margin-top:3px">If entered, your vault will be encrypted with AES-256 GCM before saving.</div>
      </div>

      <button class="btn btn-green btn-full" id="bk-run-export-btn" style="height:36px;font-weight:700">
        ${icon('download')} Download Complete Vault Backup
      </button>

      <div class="faint tiny" style="margin-top:12px;text-align:center">
        🛡️ Automatic daily snapshots are maintained locally for the past 7 days.
      </div>
    </div>

    <!-- Restore Tab Content -->
    <div id="bk-restore-panel" style="display:none">
      <div class="field" style="margin-bottom:12px">
        <label>Select Backup File (.json or .pebble)</label>
        <input type="file" class="input" id="bk-file-input" accept=".json,.pebble">
      </div>

      <div class="field" id="bk-pwd-field" style="display:none;margin-bottom:12px">
        <label>Backup Password</label>
        <input type="password" class="input" id="bk-restore-pwd" placeholder="Enter password to decrypt">
      </div>

      <div class="field" style="margin-bottom:14px">
        <label>Restore Mode</label>
        <select class="select" id="bk-restore-mode">
          <option value="merge">Merge with existing data (Recommended — no data lost)</option>
          <option value="clean">Clean Replace (Overwrites existing data with backup)</option>
        </select>
      </div>

      <div id="bk-preview-box" style="display:none;background:var(--surface-2);border-radius:10px;padding:10px;margin-bottom:12px;font-size:12px"></div>

      <button class="btn btn-dark btn-full" id="bk-run-restore-btn" disabled style="height:36px;font-weight:700">
        ${icon('upload')} Restore Vault
      </button>
    </div>
  </div>`);

  NX.modal({
    title: 'PebbleX Vault Backup & Recovery',
    icon: 'layers',
    body,
    footer: [{ label: 'Close', cls: 'btn-soft' }]
  });

  // Tab switching
  qa('#bk-tabs button', body).forEach(b => {
    b.onclick = () => {
      qa('#bk-tabs button', body).forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      activeTab = b.dataset.tab;
      q('#bk-export-panel', body).style.display = activeTab === 'export' ? 'block' : 'none';
      q('#bk-restore-panel', body).style.display = activeTab === 'restore' ? 'block' : 'none';
    };
  });

  // Run Export
  q('#bk-run-export-btn', body).onclick = async () => {
    const pwd = (q('#bk-export-pwd', body).value || '').trim();
    q('#bk-run-export-btn', body).disabled = true;
    try {
      await exportVault(pwd);
      NX.closeAllModals();
    } catch(e){
      NX.toastErr('Backup Failed', String(e));
    } finally {
      q('#bk-run-export-btn', body).disabled = false;
    }
  };

  // File selection for Restore
  let loadedBackupContent = null;
  q('#bk-file-input', body).onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = String(evt.target.result || '');
        const obj = JSON.parse(text);
        loadedBackupContent = obj;

        const isEncrypted = !!obj.pebbleEncrypted;
        q('#bk-pwd-field', body).style.display = isEncrypted ? 'block' : 'none';

        const prevBox = q('#bk-preview-box', body);
        prevBox.style.display = 'block';
        if(isEncrypted){
          prevBox.innerHTML = `<span style="color:var(--orange)">🔒 Encrypted Vault Backup</span>. Enter password to unlock and restore.`;
        } else {
          const s = obj.stats || {};
          prevBox.innerHTML = `<b>Valid Backup File:</b> ${s.notesCount || (obj.data?.notes||[]).length} Notes, ${s.tasksCount || (obj.data?.tasks||[]).length} Tasks. Created ${U.esc(obj.createdAt ? new Date(obj.createdAt).toLocaleString() : 'recently')}.`;
        }

        q('#bk-run-restore-btn', body).disabled = false;
      } catch(err){
        NX.toastErr('Invalid File', 'Could not parse JSON in selected file.');
        q('#bk-run-restore-btn', body).disabled = true;
      }
    };
    reader.readAsText(file);
  };

  // Run Restore
  q('#bk-run-restore-btn', body).onclick = async () => {
    if(!loadedBackupContent) return;
    const pwd = (q('#bk-restore-pwd', body).value || '').trim();
    const mode = q('#bk-restore-mode', body).value;

    q('#bk-run-restore-btn', body).disabled = true;
    try {
      await restoreVault(loadedBackupContent, pwd, mode);
      NX.closeAllModals();
    } catch(err){
      NX.toastErr('Restore Failed', err.message || String(err));
    } finally {
      q('#bk-run-restore-btn', body).disabled = false;
    }
  };
}

NX.backup = {
  exportVault,
  restoreVault,
  openModal: openBackupModal,
  runDailySnapshot
};

// Run rolling daily snapshot quietly on startup
setTimeout(runDailySnapshot, 3000);

})(window.NX);
