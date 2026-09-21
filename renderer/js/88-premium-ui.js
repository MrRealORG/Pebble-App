/* ============================================================
   Pebble — 88-premium-ui.js
   Premium UI patches: enhanced profile footer, boot screen
   ============================================================ */
(function (NX) {
  'use strict';

  /* ============================================================
     BOOT SCREEN — Enhanced with step indicators
     ============================================================ */
  const _bootHints = [
    'Loading workspace data…',
    'Building interface…',
    'Initialising modules…',
    'Ready ✨'
  ];

  // Inject step dots into boot screen
  function enhanceBoot() {
    const inner = document.querySelector('.boot-inner');
    if (!inner) return;

    // Add step dots after the progress bar
    const bar = inner.querySelector('.boot-bar');
    if (bar && !inner.querySelector('.boot-steps')) {
      const steps = document.createElement('div');
      steps.className = 'boot-steps';
      for (let i = 0; i < 4; i++) {
        const s = document.createElement('div');
        s.className = 'boot-step' + (i === 0 ? ' active' : '');
        s.dataset.step = i;
        steps.appendChild(s);
      }
      bar.parentNode.insertBefore(steps, bar);
    }

    // Animate steps as hint text changes
    const hint = document.getElementById('bootHint');
    if (hint) {
      const observer = new MutationObserver(() => {
        const txt = hint.textContent.trim();
        const idx = _bootHints.findIndex(h => txt.startsWith(h.slice(0, 12)));
        if (idx >= 0) {
          const dots = document.querySelectorAll('.boot-step');
          dots.forEach((d, i) => {
            d.classList.toggle('active', i === idx);
            d.classList.toggle('done', i < idx);
          });
        }
      });
      observer.observe(hint, { childList: true, characterData: true, subtree: true });
    }
  }

  // Run as soon as DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceBoot);
  } else {
    enhanceBoot();
  }

  /* ============================================================
     SIDEBAR PROFILE FOOTER — Premium avatar + status
     ============================================================ */
  function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function buildPremiumUserFooter() {
    const el = document.getElementById('sbUser');
    if (!el) return;

    const store = NX.store;
    const sel = NX.sel;
    if (!store || !sel) return;

    const name = store.getSetting('userName', 'You');
    const initials = getInitials(name);

    // Stats
    let tasksDone = 0, totalTasks = 0, habDone = 0, habTotal = 0;
    try {
      const ts = NX.aiEngine ? NX.aiEngine.taskSummary() : { done: 0, total: 0 };
      tasksDone = ts.done || 0;
      totalTasks = ts.total || 0;
      const hab = sel.habitsCompletedToday ? sel.habitsCompletedToday() : { done: 0, total: 0 };
      habDone = hab.done || 0;
      habTotal = hab.total || 0;
    } catch (e) {}

    el.innerHTML = '';

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'sb-avatar';
    avatar.textContent = initials;
    avatar.title = name;

    // User info
    const info = document.createElement('div');
    info.className = 'sb-user-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'sb-user-name';
    nameEl.textContent = name;

    const roleEl = document.createElement('div');
    roleEl.className = 'sb-user-role';

    const dot = document.createElement('span');
    dot.className = 'sb-user-dot';

    roleEl.appendChild(dot);
    roleEl.appendChild(document.createTextNode(store.desktop ? 'Desktop · Offline-first' : 'Web · Offline-first'));

    info.appendChild(nameEl);
    info.appendChild(roleEl);

    // Settings cog
    const cog = document.createElement('button');
    cog.className = 'icon-btn';
    cog.title = 'Settings';
    cog.style.cssText = 'flex: 0 0 auto; width: 26px; height: 26px; color: var(--tx-4);';
    cog.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m-9.5 3.5h1.27A8 8 0 0 1 5.34 8.69L4.4 7.76a1.5 1.5 0 0 1 2.12-2.12l.93.93A8 8 0 0 1 10.5 4.27V3a1.5 1.5 0 0 1 3 0v1.27a8 8 0 0 1 2.81 1.7l.93-.93a1.5 1.5 0 0 1 2.12 2.12l-.93.93A8 8 0 0 1 20.23 11.5H21.5a1.5 1.5 0 0 1 0 3h-1.27a8 8 0 0 1-1.7 2.81l.93.93a1.5 1.5 0 0 1-2.12 2.12l-.93-.93a8 8 0 0 1-2.81 1.7V21.5a1.5 1.5 0 0 1-3 0v-1.27a8 8 0 0 1-2.81-1.7l-.93.93A1.5 1.5 0 0 1 4.4 18.35l.93-.93a8 8 0 0 1-1.7-2.81H2.5a1.5 1.5 0 0 1 0-3z"/></svg>`;
    cog.onclick = (e) => { e.stopPropagation(); NX.router.navigate('#/settings'); };

    el.appendChild(avatar);
    el.appendChild(info);
    el.appendChild(cog);

    // Stats bar
    const statsEl = document.getElementById('sbStats');
    if (statsEl && (totalTasks > 0 || habTotal > 0)) {
      statsEl.innerHTML = '';
      if (totalTasks > 0) {
        const s1 = document.createElement('div');
        s1.className = 'sb-stat';
        s1.innerHTML = `<b>${tasksDone}</b><span>Done</span>`;
        statsEl.appendChild(s1);
      }
      if (habTotal > 0) {
        const s2 = document.createElement('div');
        s2.className = 'sb-stat';
        s2.innerHTML = `<b>${habDone}/${habTotal}</b><span>Habits</span>`;
        statsEl.appendChild(s2);
      }
      const streakEl = document.createElement('div');
      streakEl.className = 'sb-stat';
      try {
        const best = (NX.store.habits || NX.store.get('habits', []));
        const habits = typeof best.all === 'function' ? best.all() : [];
        const maxStreak = habits.reduce((m, hb) => {
          try { return Math.max(m, sel.habitStreak ? sel.habitStreak(hb) : 0); } catch { return m; }
        }, 0);
        streakEl.innerHTML = `<b>${maxStreak}d</b><span>Streak</span>`;
      } catch {
        streakEl.innerHTML = `<b>–</b><span>Streak</span>`;
      }
      statsEl.appendChild(streakEl);
    }
  }

  /* ============================================================
     PATCH SHELL — Wire up after boot completes
     ============================================================ */
  const _origBoot = NX.shell && NX.shell.boot;

  // Patch the existing updateUserFooter if available, otherwise hook into store
  function patchUserFooter() {
    // Override the existing footer renderer
    const origUpdate = NX.shell && NX.shell.updateUserFooter;
    if (NX.shell) {
      NX.shell.updateUserFooter = function () {
        try { origUpdate && origUpdate.call(NX.shell); } catch (e) {}
        try { buildPremiumUserFooter(); } catch (e) {}
      };
    }

    // Also rebuild on store changes
    if (NX.store && NX.store.on) {
      NX.store.on(() => {
        try { buildPremiumUserFooter(); } catch (e) {}
      });
    }

    // Build immediately if elements already exist
    setTimeout(() => {
      try { buildPremiumUserFooter(); } catch (e) {}
    }, 500);

    // Build again after full boot
    setTimeout(() => {
      try { buildPremiumUserFooter(); } catch (e) {}
    }, 1500);
  }

  // Hook into DOMContentLoaded and also after app becomes visible
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(patchUserFooter, 100);
  });

  // MutationObserver to detect when #app becomes visible (after boot)
  const appObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'hidden' && m.target.id === 'app') {
        if (!m.target.hidden) {
          setTimeout(() => {
            try { buildPremiumUserFooter(); } catch (e) {}
          }, 200);
        }
      }
    }
  });
  const appEl = document.getElementById('app');
  if (appEl) {
    appObserver.observe(appEl, { attributes: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('app');
      if (el) appObserver.observe(el, { attributes: true });
    });
  }

  /* ============================================================
     DASHBOARD HERO — Animate stat cards on load
     ============================================================ */
  function animateStats() {
    const stats = document.querySelectorAll('.stat');
    stats.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(16px)';
      setTimeout(() => {
        el.style.transition = 'opacity 350ms ease, transform 350ms cubic-bezier(.25,.46,.45,.94)';
        el.style.opacity = '';
        el.style.transform = '';
      }, 60 + i * 50);
    });
  }

  // Hook into router render events
  if (NX.router) {
    const origRender = NX.router.render;
    if (origRender) {
      NX.router.render = function (...args) {
        const result = origRender.apply(NX.router, args);
        setTimeout(() => {
          try {
            if (NX.router.currentId() === 'dashboard') animateStats();
          } catch (e) {}
        }, 50);
        return result;
      };
    }
  }

})(window.NX);
