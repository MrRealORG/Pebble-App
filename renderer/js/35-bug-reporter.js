/* ============================================================
   PebbleX v0.1 — 35-bug-reporter.js
   Dedicated Bug Reporter & System Diagnostics:
   - System telemetry & environment health inspector
   - Real-time error log & native crash dump collector
   - Interactive Bug Report generator (pre-filled GitHub Issue)
   - One-click Diagnostic Report copy (Markdown)
   - Diagnostic JSON bundle exporter
   - Safe UI state reset
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const logBuffer = [];
const MAX_LOGS = 100;

function recordLog(level, message, details){
  const entry = {
    ts: Date.now(),
    time: new Date().toLocaleTimeString(),
    level: level || 'error',
    message: String(message || 'Unknown issue'),
    details: details ? String(details) : ''
  };
  logBuffer.push(entry);
  if(logBuffer.length > MAX_LOGS) logBuffer.shift();
}

NX.recordLog = recordLog;

// Global error hooks
window.addEventListener('error', (e) => {
  recordLog('error', e.message || 'Script error', (e.filename || '') + ':' + (e.lineno || '') + (e.error && e.error.stack ? '\n' + e.error.stack : ''));
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const msg = reason && reason.message ? reason.message : String(reason);
  const stack = reason && reason.stack ? reason.stack : '';
  recordLog('error', 'Unhandled Promise Rejection: ' + msg, stack);
});

// Capture console.error & console.warn softly
const origErr = console.error;
console.error = function(...args){
  try {
    const str = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    recordLog('error', str);
  } catch(e){}
  origErr.apply(console, args);
};

const origWarn = console.warn;
console.warn = function(...args){
  try {
    const str = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    recordLog('warn', str);
  } catch(e){}
  origWarn.apply(console, args);
};

NX.openBugReporter = async function(initialErr){
  if(initialErr) {
    recordLog('error', initialErr.message || String(initialErr), initialErr.stack || '');
  }

  // Gather system telemetry
  const stats = NX.store ? NX.store.stats() : { sizeKB:0 };
  const notesCount = (NX.store.get('notes', []) || []).length;
  const tasksCount = (NX.store.get('tasks', []) || []).length;
  const promptsCount = (NX.store.get('prompts', []) || []).length;
  let extStatus = { connected:false, extSessions:0 };
  let nativeCrashes = [];

  try {
    if(NX.native && NX.native.extStatus) extStatus = await NX.native.extStatus();
    if(NX.native && NX.native.crashLogs) nativeCrashes = await NX.native.crashLogs();
  } catch(e){}

  const sysInfo = {
    appVersion: '0.1.0',
    platform: 'Windows x64',
    runtime: 'Tauri v2 + Rust + WebView2',
    userAgent: navigator.userAgent,
    screen: `${window.innerWidth}x${window.innerHeight} (DPR: ${window.devicePixelRatio || 1})`,
    storageSize: `${stats.sizeKB || 0} KB`,
    notesCount,
    tasksCount,
    promptsCount,
    bridgeStatus: extStatus.connected ? 'Online (127.0.0.1:47615)' : 'Standby / Local',
    nativeCrashCount: nativeCrashes.length,
    recordedLogsCount: logBuffer.length
  };

  let activeTab = 'report'; // 'report' | 'logs' | 'system'
  let logFilter = 'all';

  function renderContent(){
    const body = h(`<div class="bug-reporter-box" style="display:flex;flex-direction:column;gap:14px;min-height:360px">
      <!-- Tabs -->
      <div class="seg sm" id="br-tabs" style="align-self:flex-start">
        <button class="${activeTab==='report'?'on':''}" data-tab="report">${icon('edit',13)} Report Bug</button>
        <button class="${activeTab==='logs'?'on':''}" data-tab="logs">${icon('activity',13)} Error Logs (${logBuffer.length + nativeCrashes.length})</button>
        <button class="${activeTab==='system'?'on':''}" data-tab="system">${icon('monitor',13)} System Health</button>
      </div>

      <!-- Tab Content Area -->
      <div id="br-tab-body" style="flex:1"></div>
    </div>`);

    const tabBody = q('#br-tab-body', body);

    if(activeTab === 'report'){
      tabBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="field">
            <label class="faint tiny bold">Issue Title</label>
            <input class="input" id="br-title" placeholder="Brief summary of what went wrong…" value="${initialErr ? U.esc(initialErr.message || 'Error occurred') : ''}">
          </div>
          <div class="row gap-8">
            <div class="field" style="flex:1">
              <label class="faint tiny bold">Category / Severity</label>
              <select class="input sm" id="br-sev">
                <option value="crash">🔴 Crash / App Freeze</option>
                <option value="ui" selected>🟠 UI Glitch / Visual Bug</option>
                <option value="sync">🟡 Data / Sync Issue</option>
                <option value="feature">💡 Feature Request / Improvement</option>
              </select>
            </div>
            <div class="field" style="flex:1">
              <label class="faint tiny bold">Module Affected</label>
              <select class="input sm" id="br-module">
                <option value="notes">Notes Tracker</option>
                <option value="todo">Tasks / Microsoft To Do</option>
                <option value="timeless">Timeless Tracking</option>
                <option value="focus">Focus Shield / Pomodoro</option>
                <option value="prompts">Prompt Saver</option>
                <option value="copilot">Ask Pebble AI</option>
                <option value="spotlight">Spotlight Quick-Capture</option>
                <option value="widget">Desktop Widget</option>
                <option value="other">Other / General</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label class="faint tiny bold">Steps to Reproduce</label>
            <textarea class="input" id="br-steps" rows="3" placeholder="1. What were you doing?&#10;2. What did you click?&#10;3. What happened unexpectedly?"></textarea>
          </div>
          <div class="field">
            <label class="faint tiny bold">Expected vs Actual Result</label>
            <input class="input sm" id="br-expected" placeholder="What should have happened instead?">
          </div>
        </div>
      `;
    } else if(activeTab === 'logs'){
      const filteredLogs = logBuffer.filter(l => logFilter === 'all' || l.level === logFilter);
      tabBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px">
          <div class="row gap-8" style="align-items:center;justify-content:space-between">
            <div class="seg sm" id="br-log-filters">
              <button class="${logFilter==='all'?'on':''}" data-lf="all">All (${logBuffer.length})</button>
              <button class="${logFilter==='error'?'on':''}" data-lf="error">Errors (${logBuffer.filter(x=>x.level==='error').length})</button>
              <button class="${logFilter==='warn'?'on':''}" data-lf="warn">Warnings (${logBuffer.filter(x=>x.level==='warn').length})</button>
            </div>
            <button class="btn btn-sm btn-soft" id="br-clear-logs" style="font-size:11px">${icon('trash',11)} Clear Logs</button>
          </div>
          <div class="md-pre" id="br-logs-view" style="max-height:220px;overflow-y:auto;font-size:11.5px;font-family:Consolas,monospace;background:var(--card-bg, #1a1b1e);color:#e2e8f0;padding:10px;border-radius:8px">
            ${nativeCrashes.length ? `<div style="color:var(--red,#f87171);margin-bottom:8px"><b>Native Crash Dumps (${nativeCrashes.length}):</b>\n${U.esc(nativeCrashes.join('\n\n'))}</div><hr style="border-color:#334155;margin:8px 0">` : ''}
            ${filteredLogs.length ? filteredLogs.map(l => `
              <div style="margin-bottom:6px;border-bottom:1px solid #33415533;padding-bottom:4px">
                <span style="color:#94a3b8">[${l.time}]</span> <span style="font-weight:700;color:${l.level==='error'?'#f87171':'#fbbf24'}">[${l.level.toUpperCase()}]</span> ${U.esc(l.message)}
                ${l.details ? `<div style="color:#64748b;font-size:10.5px;white-space:pre-wrap;margin-top:2px">${U.esc(l.details)}</div>` : ''}
              </div>
            `).join('') : '<div style="color:#64748b">No recent errors recorded. System healthy! ✨</div>'}
          </div>
        </div>
      `;
      const clrBtn = q('#br-clear-logs', tabBody);
      if(clrBtn) clrBtn.onclick = async () => {
        logBuffer.length = 0;
        nativeCrashes.length = 0;
        if(NX.native && NX.native.clearCrashLogs) await NX.native.clearCrashLogs();
        renderContent();
        NX.toastOk('Error logs cleared');
      };
      qa('#br-log-filters button', tabBody).forEach(b => {
        b.onclick = () => { logFilter = b.dataset.lf; renderContent(); };
      });
    } else if(activeTab === 'system'){
      tabBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="grid col-2 gap-8" style="font-size:12.5px">
            <div class="card" style="padding:10px;background:var(--bg-2)">
              <div class="faint tiny bold">APP RUNTIME</div>
              <div><b>PebbleX v${sysInfo.appVersion}</b></div>
              <div class="faint tiny">${sysInfo.runtime}</div>
            </div>
            <div class="card" style="padding:10px;background:var(--bg-2)">
              <div class="faint tiny bold">OPERATING SYSTEM</div>
              <div><b>${sysInfo.platform}</b></div>
              <div class="faint tiny">${sysInfo.screen}</div>
            </div>
            <div class="card" style="padding:10px;background:var(--bg-2)">
              <div class="faint tiny bold">LOCAL DATABASE</div>
              <div><b>${sysInfo.storageSize} stored</b></div>
              <div class="faint tiny">${sysInfo.notesCount} notes · ${sysInfo.tasksCount} tasks · ${sysInfo.promptsCount} prompts</div>
            </div>
            <div class="card" style="padding:10px;background:var(--bg-2)">
              <div class="faint tiny bold">TIMELESS BRIDGE (MCP)</div>
              <div><b>${sysInfo.bridgeStatus}</b></div>
              <div class="faint tiny">${extStatus.extSessions} extension sessions tracked</div>
            </div>
          </div>
          <div class="row gap-8" style="justify-content:flex-end;margin-top:6px">
            <button class="btn btn-soft btn-sm" id="br-safe-reset">${icon('refresh',12)} Safe Reset UI Layout</button>
          </div>
        </div>
      `;
      const resetBtn = q('#br-safe-reset', tabBody);
      if(resetBtn) resetBtn.onclick = () => {
        NX.confirm('Reset UI Layout?', 'This will reset view layout and sidebar collapsed states without deleting any notes, tasks, or settings.', () => {
          ['ui:notesSidebarCollapsed', 'ui:sidebarCollapsed', 'viewMode'].forEach(k => {
            try { localStorage.removeItem('px:' + k); } catch(e){}
          });
          NX.toastOk('UI layout reset', 'Reloading view…');
          setTimeout(() => location.reload(), 300);
        }, { yes:'Reset Layout', danger:false, icon:'refresh' });
      };
    }

    qa('#br-tabs button', body).forEach(b => {
      b.onclick = () => { activeTab = b.dataset.tab; renderContent(); };
    });

    const host = q('#br-host');
    if(host){ host.innerHTML = ''; host.appendChild(body); }
  }

  function generateMarkdownReport(){
    const title = (q('#br-title') ? q('#br-title').value.trim() : '') || 'Bug report';
    const sev = q('#br-sev') ? q('#br-sev').value : 'ui';
    const mod = q('#br-module') ? q('#br-module').value : 'general';
    const steps = (q('#br-steps') ? q('#br-steps').value.trim() : '') || 'N/A';
    const exp = (q('#br-expected') ? q('#br-expected').value.trim() : '') || 'N/A';

    const recentErrLines = logBuffer.slice(-10).map(l => `[${l.time}] [${l.level.toUpperCase()}] ${l.message}${l.details ? ' -> ' + l.details : ''}`).join('\n');

    return `### 🐞 Bug Report: ${title}

**Category / Severity:** ${sev}
**Module Affected:** ${mod}

#### 📋 Steps to Reproduce:
${steps}

#### 🎯 Expected vs Actual:
${exp}

#### 💻 Environment Telemetry:
- **Pebble Version:** ${sysInfo.appVersion}
- **Runtime:** ${sysInfo.runtime}
- **Platform:** ${sysInfo.platform}
- **Screen:** ${sysInfo.screen}
- **Storage:** ${sysInfo.storageSize} (${sysInfo.notesCount} notes, ${sysInfo.tasksCount} tasks)
- **Bridge / MCP:** ${sysInfo.bridgeStatus}

#### 📜 Recent Error Logs:
\`\`\`
${recentErrLines || 'No recent errors'}
\`\`\`
`;
  }

  const modalBody = h(`<div><div id="br-host"></div></div>`);

  NX.modal({
    title: 'Bug Reporter & System Diagnostics',
    icon: 'activity',
    body: modalBody,
    footer: [
      { label:'Cancel', cls:'btn-soft' },
      { label:'Copy Report', icon:'copy', cls:'btn-soft', onClick: () => {
        const md = generateMarkdownReport();
        NX.native.clipboardWrite(md).then(() => {
          NX.toastOk('Diagnostic report copied!', 'Ready to paste into GitHub Issue or Discord.');
          NX.sfx.play('ok');
        });
      }},
      { label:'Export Bundle', icon:'download', cls:'btn-soft', onClick: () => {
        const data = {
          sysInfo,
          logs: logBuffer,
          nativeCrashes,
          generatedAt: new Date().toISOString()
        };
        const fname = 'PebbleX-diagnostics-' + Date.now() + '.json';
        U.download(fname, JSON.stringify(data, null, 2));
        NX.toastOk('Exported debug bundle', fname);
      }},
      { label:'Open GitHub Issue', icon:'send', cls:'btn-green', onClick: () => {
        const title = (q('#br-title') ? q('#br-title').value.trim() : '') || 'Bug report';
        const md = generateMarkdownReport();
        const url = 'https://github.com/MrRealORG/Pebble-App/issues/new?title=' + encodeURIComponent('[Bug]: ' + title) + '&body=' + encodeURIComponent(md);
        NX.native.openExternal(url).then(() => {
          NX.closeAllModals();
          NX.toastOk('Opening GitHub issue in browser…');
        });
      }}
    ]
  });

  setTimeout(() => renderContent(), 20);
};

})(window.NX);
