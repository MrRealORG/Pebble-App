/* ============================================================
   Pebble — 72-game.js : XP, levels, achievements, quests,
   shop (themes/avatars/titles), punishment + ad unlock system
   Nothing is removed — all of this layers on top.
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  /* ================= state ================= */
  function G() {
    const d = store().data;
    if (!d.game) d.game = fresh();
    return d.game;
  }
  function fresh() {
    return {
      xp: 0, points: 0, level: 1, totalXp: 0,
      owned: ['theme_default', 'av_fox'], equipped: { theme: 'theme_default', avatar: 'av_fox', frame: null, title: null, icon: null },
      achievements: {}, quests: {}, questDay: null,
      stats: { tasksDone: 0, habitsDone: 0, focusMin: 0, notes: 0, journal: 0, msgs: 0, searches: 0, days: 0, logins: 0, skills: 0, prompts: 0, shopBuys: 0, adsWatched: 0 },
      commitment: { enabled: false, dailyMinutes: 60, graceDays: 1 },
      lock: { locked: false, missedDates: [], unlockedAt: null },
      lastActiveDay: null, history: []
    };
  }
  const save = () => { store().touch(); store().emit('game'); };

  /* ================= XP curve ================= */
  const xpForLevel = l => Math.round(80 * Math.pow(l, 1.35));
  function levelFromXp(total) {
    let l = 1, need = xpForLevel(1);
    while (total >= need && l < 200) { total -= need; l++; need = xpForLevel(l); }
    return { level: l, into: total, need };
  }
  const RANKS = [['Rookie', 1], ['Explorer', 3], ['Builder', 6], ['Operator', 10], ['Strategist', 15], ['Architect', 21], ['Visionary', 28], ['Legend', 40], ['Mythic', 60]];
  const rankFor = l => RANKS.slice().reverse().find(r => l >= r[1])[0];

  /* ================= award ================= */
  function award(xp, reason, opts) {
    opts = opts || {};
    const g = G();
    const pts = opts.points !== undefined ? opts.points : Math.round(xp / 2);
    g.xp += xp; g.totalXp += xp; g.points += pts;
    const before = levelFromXp(g.totalXp - xp).level;
    const after = levelFromXp(g.totalXp);
    g.level = after.level;
    g.history.unshift({ at: Date.now(), xp, pts, reason });
    if (g.history.length > 400) g.history.length = 400;
    save();
    if (!opts.silent) flyXp('+' + xp + ' XP' + (pts ? '  ·+' + pts + ' pts' : ''), opts.x, opts.y);
    if (after.level > before) levelUp(after.level);
    checkAchievements();
    return { xp, pts };
  }

  function flyXp(text, x, y) {
    const el = h('div.xp-fly', text);
    el.style.left = (x !== undefined ? x : innerWidth / 2 - 40 + (Math.random() * 60 - 30)) + 'px';
    el.style.top = (y !== undefined ? y : innerHeight - 130) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  function levelUp(level) {
    const t = h('div.levelup-toast', `🎉 LEVEL ${level} — ${rankFor(level)}!  Rewards unlocked in the Shop`);
    document.body.appendChild(t);
    confetti(90);
    NX.shell.notify('Pebble', `Level ${level} reached — ${rankFor(level)} rank!`);
    setTimeout(() => t.remove(), 4000);
  }

  function confetti(n) {
    const colors = ['#7c6cff', '#33b8a3', '#4aa8e8', '#e86cb0', '#f2994a', '#e3c14a', '#4caf7d', '#eb5757'];
    for (let i = 0; i < (n || 60); i++) {
      const p = h('div.confetti-piece');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.top = '-4vh';
      p.style.background = NX.randomOf(colors);
      p.style.animationDuration = (1.6 + Math.random() * 1.8) + 's';
      p.style.animationDelay = (Math.random() * 0.5) + 's';
      p.style.borderRadius = Math.random() > .5 ? '99px' : '2px';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 4200);
    }
  }

  /* ================= achievements ================= */
  const ACH = [
    { id: 'first_task', ico: 'check', name: 'First Blood', desc: 'Complete your very first task', pts: 50, test: g => g.stats.tasksDone >= 1 },
    { id: 'task_10', ico: 'star', name: 'Getting Things Done', desc: 'Complete 10 tasks', pts: 120, test: g => g.stats.tasksDone >= 10 },
    { id: 'task_50', ico: 'bolt', name: 'Task Machine', desc: 'Complete 50 tasks', pts: 400, test: g => g.stats.tasksDone >= 50 },
    { id: 'task_100', ico: 'trophy', name: 'Centurion', desc: 'Complete 100 tasks', pts: 900, test: g => g.stats.tasksDone >= 100 },
    { id: 'habit_7', ico: 'flame', name: 'Week of Fire', desc: 'Log any habit 7 days in a row', pts: 200, test: () => store().habits.all().some(x => sel().habitStreak(x) >= 7) },
    { id: 'habit_30', ico: 'flame', name: 'Unstoppable', desc: 'Reach a 30-day habit streak', pts: 800, test: () => store().habits.all().some(x => sel().habitStreak(x) >= 30) },
    { id: 'focus_1h', ico: 'clock', name: 'Deep End', desc: 'Accumulate 1 hour of focus time', pts: 100, test: g => g.stats.focusMin >= 60 },
    { id: 'focus_10h', ico: 'zen', name: 'Flow State', desc: 'Accumulate 10 hours of focus time', pts: 500, test: g => g.stats.focusMin >= 600 },
    { id: 'focus_50h', ico: 'clock', name: 'Time Bender', desc: 'Accumulate 50 hours of focus time', pts: 1500, test: g => g.stats.focusMin >= 3000 },
    { id: 'note_1', ico: 'note', name: 'Blank Page No More', desc: 'Create your first note', pts: 40, test: g => g.stats.notes >= 1 },
    { id: 'note_25', ico: 'note', name: 'Second Brain', desc: 'Create 25 notes', pts: 300, test: g => g.stats.notes >= 25 },
    { id: 'journal_7', ico: 'scratch', name: 'Dear Diary', desc: 'Write 7 journal entries', pts: 150, test: g => g.stats.journal >= 7 },
    { id: 'links_10', ico: 'graph', name: 'Web Weaver', desc: 'Create 10 wiki/back links between pages', pts: 180, test: () => sel().noteLinks().filter(l => l.toId).length >= 10 },
    { id: 'zero_inbox', ico: 'inbox', name: 'Inbox Zero', desc: 'Clear the inbox completely', pts: 120, test: () => sel().unreadInbox().length === 0 && store().inbox.count() > 0 },
    { id: 'all_habits', ico: 'star', name: 'Perfect Day', desc: 'Complete every habit in one day', pts: 250, test: () => { const t = sel().habitsCompletedToday(); return t.total > 0 && t.done === t.total; } },
    { id: 'finance_10', ico: 'wallet', name: 'Money Eyes', desc: 'Log 10 transactions', pts: 100, test: () => store().transactions.count() >= 10 },
    { id: 'social_20', ico: 'chat', name: 'Team Player', desc: 'Send 20 chat messages', pts: 150, test: g => g.stats.msgs >= 20 },
    { id: 'skill_1', ico: 'puzzle', name: 'Skill Issue', desc: 'Install your first skill into the vault', pts: 100, test: g => g.stats.skills >= 1 },
    { id: 'skill_5', ico: 'spark', name: 'Loaded', desc: 'Install 5 skills', pts: 300, test: g => g.stats.skills >= 5 },
    { id: 'prompt_5', ico: 'scratch', name: 'Prompt Engineer', desc: 'Save 5 prompts in the manager', pts: 150, test: g => g.stats.prompts >= 5 },
    { id: 'shop_1', ico: 'wallet', name: 'Treat Yourself', desc: 'Buy your first shop item', pts: 80, test: g => g.stats.shopBuys >= 1 },
    { id: 'shop_all_themes', ico: 'prism', name: 'Collector', desc: 'Own 4 themes', pts: 400, test: g => g.owned.filter(o => o.startsWith('theme_')).length >= 4 },
    { id: 'lvl_5', ico: 'star', name: 'Rising Star', desc: 'Reach level 5', pts: 200, test: g => g.level >= 5 },
    { id: 'lvl_10', ico: 'trophy', name: 'Halfway Hero', desc: 'Reach level 10', pts: 500, test: g => g.level >= 10 },
    { id: 'lvl_25', ico: 'crown', name: 'Grandmaster', desc: 'Reach level 25', pts: 2000, test: g => g.level >= 25 },
    { id: 'night_owl', ico: 'moon', name: 'Night Owl', desc: 'Complete a focus session after midnight', pts: 130, test: () => store().pomodoro.all().some(p => new Date(p.startedAt).getHours() < 5) },
    { id: 'early_bird', ico: 'sun', name: 'Early Bird', desc: 'Complete a focus session before 7am', pts: 130, test: () => store().pomodoro.all().some(p => { const hh = new Date(p.startedAt).getHours(); return hh >= 5 && hh < 7; }) },
    { id: 'quest_day', ico: 'cal', name: 'Daily Devotion', desc: 'Complete all daily quests in one day', pts: 200, test: g => { const q = todayQuests(); return q.length && q.every(x => (g.quests[x.id] || 0) >= x.target); } },
    { id: 'ad_1', ico: 'sound', name: 'Humble Pie', desc: 'Watch an unlock ad after missing a commitment', pts: 60, test: g => g.stats.adsWatched >= 1 },
    { id: 'comeback', ico: 'orbit', name: 'Comeback Story', desc: 'Return after missing a day and hit your commitment', pts: 300, test: g => g.stats.comebacks >= 1 }
  ];

  function checkAchievements() {
    const g = G();
    let newly = [];
    ACH.forEach(a => {
      if (g.achievements[a.id]) return;
      let ok = false;
      try { ok = a.test(g); } catch (e) { ok = false; }
      if (ok) { g.achievements[a.id] = Date.now(); newly.push(a); }
    });
    if (newly.length) {
      save();
      newly.forEach(a => {
        g.points += a.pts; save();
        NX.ui.toast({ type: 'success', title: `🏆 Achievement: ${a.name}`, message: `${a.desc} · +${a.pts} points`, duration: 6000 });
        confetti(40);
      });
    }
  }

  /* ================= daily quests ================= */
  function todayQuests() {
    return [
      { id: 'q_task', ico: 'check', label: 'Complete 3 tasks', target: 3, xp: 40 },
      { id: 'q_habit', ico: 'flame', label: 'Log 2 habits', target: 2, xp: 30 },
      { id: 'q_focus', ico: 'clock', label: 'Focus for 25 minutes', target: 25, xp: 45 },
      { id: 'q_note', ico: 'note', label: 'Create or edit a note', target: 1, xp: 25 },
      { id: 'q_journal', ico: 'scratch', label: 'Write a journal entry', target: 1, xp: 25 }
    ];
  }
  function questProgress(id) {
    const g = G();
    const day = NX.todayStr();
    if (g.questDay !== day) { g.quests = {}; g.questDay = day; }
    return g.quests[id] || 0;
  }
  function bumpQuest(id, by) {
    const g = G();
    const day = NX.todayStr();
    if (g.questDay !== day) { g.quests = {}; g.questDay = day; }
    const q = todayQuests().find(x => x.id === id);
    if (!q) return;
    const before = g.quests[id] || 0;
    if (before >= q.target) return;
    g.quests[id] = Math.min(q.target, before + (by || 1));
    if (g.quests[id] >= q.target) {
      save();
      award(q.xp, 'Quest: ' + q.label, { points: Math.round(q.xp / 2) });
      NX.ui.toast({ type: 'success', title: ' Quest complete', message: q.label + ` · +${q.xp} XP`, duration: 4200 });
    } else save();
  }

  /* ================= shop ================= */
  const SHOP = [
    { id: 'theme_default', kind: 'theme', name: 'Classic', price: 0, ico: '🌗', desc: 'The built-in four themes.', data: {} },
    { id: 'theme_sunset', kind: 'theme', name: 'Sunset Drive', price: 400, ico: '🌇', desc: 'Warm oranges and deep purples.', data: { '--bg': '#1b1216', '--bg-elev': '#241820', '--bg-sunken': '#150d11', '--bg-hover': '#2e1f28', '--bg-active': '#3a2833', '--bg-rail': '#170f13', '--bg-sidebar': '#1e1419', '--bg-card': '#241820', '--bg-input': '#2a1c25', '--bg-code': '#1d1318', '--tx': '#f6e8e2', '--tx-2': '#d8bdb4', '--tx-3': '#a8867d', '--tx-4': '#7a5f58', '--bd': '#3a2833', '--bd-2': '#4a3341', '--bd-strong': '#5c4052', '--brand-1': '#ff7a59', '--brand-2': '#ffb347' } },
    { id: 'theme_forest', kind: 'theme', name: 'Deep Forest', price: 400, ico: '🌲', desc: 'Mossy greens on bark brown.', data: { '--bg': '#10160f', '--bg-elev': '#161d14', '--bg-sunken': '#0b100a', '--bg-hover': '#1e271c', '--bg-active': '#283325', '--bg-rail': '#0d120c', '--bg-sidebar': '#131a11', '--bg-card': '#161d14', '--bg-input': '#1a2218', '--bg-code': '#121810', '--tx': '#e4eede', '--tx-2': '#bccab4', '--tx-3': '#8b9a83', '--tx-4': '#61705a', '--bd': '#26301f', '--bd-2': '#324029', '--bd-strong': '#405235', '--brand-1': '#69c463', '--brand-2': '#a3d977' } },
    { id: 'theme_ocean', kind: 'theme', name: 'Abyss', price: 500, ico: '🌊', desc: 'Bioluminescent deep sea.', data: { '--bg': '#08121a', '--bg-elev': '#0d1a24', '--bg-sunken': '#050d13', '--bg-hover': '#132431', '--bg-active': '#1a3040', '--bg-rail': '#061017', '--bg-sidebar': '#0a161e', '--bg-card': '#0d1a24', '--bg-input': '#10202b', '--bg-code': '#09141c', '--tx': '#dcecf5', '--tx-2': '#a9c4d4', '--tx-3': '#7593a5', '--tx-4': '#4d6a7b', '--bd': '#16293a', '--bd-2': '#1f3849', '--bd-strong': '#2b4a5e', '--brand-1': '#38bdf8', '--brand-2': '#22d3ee' } },
    { id: 'theme_candy', kind: 'theme', name: 'Candy Pop', price: 600, ico: '🍭', desc: 'Pastel light theme that slaps.', data: { '--bg': '#fdf6fb', '--bg-elev': '#ffffff', '--bg-sunken': '#f7ecf4', '--bg-hover': '#f4e3ef', '--bg-active': '#eed4e7', '--bg-rail': '#fbeff8', '--bg-sidebar': '#fcf2fa', '--bg-card': '#ffffff', '--bg-input': '#ffffff', '--bg-code': '#f8eef6', '--tx': '#43284a', '--tx-2': '#6d4a75', '--tx-3': '#98789f', '--tx-4': '#bda3c2', '--bd': '#f0d9ea', '--bd-2': '#e5c4dd', '--bd-strong': '#d3a8c8', '--brand-1': '#e05fc4', '--brand-2': '#8b5cf6' } },
    { id: 'theme_rose', kind: 'theme', name: 'Rose Quartz', price: 450, ico: 'bloom', desc: 'Soft pink stone, warm greys.', data: { '--bg': '#191417', '--bg-elev': '#221a1e', '--bg-sunken': '#120e11', '--bg-hover': '#2b2126', '--bg-active': '#372a30', '--bg-rail': '#151013', '--bg-sidebar': '#1b1519', '--bg-card': '#221a1e', '--bg-input': '#281e23', '--bg-code': '#1a1417', '--tx': '#f4e9ee', '--tx-2': '#d3bcc7', '--tx-3': '#a28794', '--tx-4': '#75606b', '--bd': '#332830', '--bd-2': '#41333c', '--bd-strong': '#52414b', '--brand-1': '#e77fae', '--brand-2': '#b78cf0' } },
    { id: 'theme_mint', kind: 'theme', name: 'Mint Milk', price: 450, ico: 'leaf', desc: 'Airy light green, very calm.', data: { '--bg': '#f4faf6', '--bg-elev': '#ffffff', '--bg-sunken': '#e9f4ec', '--bg-hover': '#e0efe4', '--bg-active': '#d2e7d8', '--bg-rail': '#eef7f0', '--bg-sidebar': '#f2f9f4', '--bg-card': '#ffffff', '--bg-input': '#ffffff', '--bg-code': '#eef6f0', '--tx': '#22392c', '--tx-2': '#4c6355', '--tx-3': '#78907f', '--tx-4': '#9fb4a6', '--bd': '#d8e8dc', '--bd-2': '#c4dcc9', '--bd-strong': '#a9c9b1', '--brand-1': '#2fae7d', '--brand-2': '#5bc0be' } },
    { id: 'theme_slate', kind: 'theme', name: 'Slate Pro', price: 500, ico: 'stone', desc: 'Cool grey-blue, business calm.', data: { '--bg': '#161a1e', '--bg-elev': '#1d2227', '--bg-sunken': '#101417', '--bg-hover': '#252b31', '--bg-active': '#2f363e', '--bg-rail': '#121619', '--bg-sidebar': '#181d21', '--bg-card': '#1d2227', '--bg-input': '#22282e', '--bg-code': '#161b1f', '--tx': '#e7ebee', '--tx-2': '#b6c0c8', '--tx-3': '#84919b', '--tx-4': '#5b6873', '--bd': '#272e34', '--bd-2': '#333b43', '--bd-strong': '#414a54', '--brand-1': '#5aa7e8', '--brand-2': '#7dd3fc' } },
    { id: 'theme_plum', kind: 'theme', name: 'Plum Night', price: 550, ico: 'gem', desc: 'Deep purple velvet.', data: { '--bg': '#171221', '--bg-elev': '#1f1830', '--bg-sunken': '#110d19', '--bg-hover': '#292040', '--bg-active': '#34294e', '--bg-rail': '#130e1c', '--bg-sidebar': '#191327', '--bg-card': '#1f1830', '--bg-input': '#251d38', '--bg-code': '#171126', '--tx': '#efe9f7', '--tx-2': '#c6bad8', '--tx-3': '#9486ab', '--tx-4': '#6a5c80', '--bd': '#2c2342', '--bd-2': '#3a2f56', '--bd-strong': '#4a3d6b', '--brand-1': '#a78bfa', '--brand-2': '#f0abfc' } },
    { id: 'theme_sand', kind: 'theme', name: 'Dune', price: 450, ico: 'sun', desc: 'Warm desert light theme.', data: { '--bg': '#faf6ef', '--bg-elev': '#fffdf8', '--bg-sunken': '#f2ece1', '--bg-hover': '#ece4d6', '--bg-active': '#e2d8c6', '--bg-rail': '#f6f1e8', '--bg-sidebar': '#f8f4ec', '--bg-card': '#fffdf8', '--bg-input': '#fffdf8', '--bg-code': '#f4eee3', '--tx': '#3c3427', '--tx-2': '#63573f', '--tx-3': '#8d7f63', '--tx-4': '#b0a284', '--bd': '#e6dcca', '--bd-2': '#d8ccb4', '--bd-strong': '#c2b394', '--brand-1': '#c2703d', '--brand-2': '#d9a441' } },
    { id: 'theme_arctic', kind: 'theme', name: 'Arctic', price: 600, ico: 'freeze', desc: 'Ice-white with glacier blue.', data: { '--bg': '#f2f7fa', '--bg-elev': '#ffffff', '--bg-sunken': '#e7f0f5', '--bg-hover': '#dceaf1', '--bg-active': '#cfe1ea', '--bg-rail': '#edf4f8', '--bg-sidebar': '#f0f6f9', '--bg-card': '#ffffff', '--bg-input': '#ffffff', '--bg-code': '#ecf3f7', '--tx': '#1e3242', '--tx-2': '#47617４'.replace('４','4'), '--tx-3': '#7191a5', '--tx-4': '#98b2c2', '--bd': '#d5e4ec', '--bd-2': '#bfd6e2', '--bd-strong': '#a3c2d2', '--brand-1': '#2f80ed', '--brand-2': '#00b8d9' } },
    { id: 'theme_noir', kind: 'theme', name: 'True Noir', price: 700, ico: 'moon', desc: 'OLED pure black. Battery saver.', data: { '--bg': '#000000', '--bg-elev': '#0a0a0a', '--bg-sunken': '#050505', '--bg-hover': '#161616', '--bg-active': '#222222', '--bg-rail': '#030303', '--bg-sidebar': '#080808', '--bg-card': '#0a0a0a', '--bg-input': '#101010', '--bg-code': '#0c0c0c', '--tx': '#f2f2f2', '--tx-2': '#c4c4c4', '--tx-3': '#8e8e8e', '--tx-4': '#5f5f5f', '--bd': '#1e1e1e', '--bd-2': '#2c2c2c', '--bd-strong': '#3d3d3d', '--brand-1': '#e5e5e5', '--brand-2': '#9ca3af' } },
    { id: 'av_fox', kind: 'avatar', name: 'Fox', price: 0, ico: 'cat', desc: 'Clever and quick.' },
    { id: 'av_dragon', kind: 'avatar', name: 'Dragon', price: 250, ico: 'flare', desc: 'Hoards completed tasks.' },
    { id: 'av_robot', kind: 'avatar', name: 'Robot', price: 250, ico: 'prism', desc: 'Beep. Boop. Productive.' },
    { id: 'av_wizard', kind: 'avatar', name: 'Wizard', price: 350, ico: 'orbit', desc: 'Casts focus spells.' },
    { id: 'av_cat', kind: 'avatar', name: 'Cat', price: 200, ico: 'cat', desc: 'Naps between pomodoros.' },
    { id: 'av_panda', kind: 'avatar', name: 'Panda', price: 200, ico: 'bloom', desc: 'Calm. Bamboo. Deep work.' },
    { id: 'av_alien', kind: 'avatar', name: 'Alien', price: 450, ico: 'ghost', desc: 'Works in another timezone.' },
    { id: 'av_ghost', kind: 'avatar', name: 'Ghost', price: 500, ico: 'ghost', desc: 'Invisible in meetings.' },
    { id: 'frame_gold', kind: 'frame', name: 'Gold Frame', price: 600, ico: 'crown', desc: 'A golden ring around your avatar.' },
    { id: 'frame_rainbow', kind: 'frame', name: 'Rainbow Frame', price: 800, ico: 'orbit', desc: 'Animated rainbow avatar ring.' },
    { id: 'frame_fire', kind: 'frame', name: 'Fire Frame', price: 700, ico: 'flame', desc: 'Your avatar, but on fire.' },
    { id: 'title_grind', kind: 'title', name: 'Title: The Grinder', price: 300, ico: 'bolt', desc: 'Shows next to your name.' },
    { id: 'title_sage', kind: 'title', name: 'Title: Sage', price: 400, ico: 'leaf', desc: 'For the wise ones.' },
    { id: 'title_chaos', kind: 'title', name: 'Title: Chaos Agent', price: 500, ico: 'flare', desc: 'Embrace the entropy.' },
    { id: 'icon_gem', kind: 'appicon', name: 'Gem App Icon', price: 900, ico: 'gem', desc: 'Swap the rail logo to a gem.' },
    { id: 'icon_rocket', kind: 'appicon', name: 'Rocket App Icon', price: 900, ico: 'rocket', desc: 'Swap the rail logo to a rocket.' },
    { id: 'fx_confetti', kind: 'fx', name: 'Mega Confetti', price: 350, ico: 'spark', desc: 'Doubles confetti on every level-up.' }
  ];
  const shopItem = id => SHOP.find(s => s.id === id);

  function buy(id) {
    const g = G(); const it = shopItem(id);
    if (!it) return;
    if (g.owned.includes(id)) { equip(id); return; }
    if (g.points < it.price) {
      NX.ui.toast({ type: 'warn', title: 'Not enough points', message: `You need ${it.price - g.points} more points. Earn XP by doing your work!`, duration: 5000 });
      const chip = document.querySelector('.xp-chip'); if (chip) { chip.classList.add('shake'); setTimeout(() => chip.classList.remove('shake'), 500); }
      return;
    }
    g.points -= it.price; g.owned.push(id); g.stats.shopBuys = (g.stats.shopBuys || 0) + 1;
    save(); equip(id);
    confetti(70);
    NX.ui.toast({ type: 'success', title: `🛍️ Purchased: ${it.name}`, message: `-${it.price} points · equipped!`, duration: 5000 });
    checkAchievements();
  }
  function equip(id) {
    const g = G(); const it = shopItem(id);
    if (!it || !g.owned.includes(id)) return;
    g.equipped[it.kind] = id;
    save(); applyCosmetics();
    NX.ui.toast({ message: `${it.ico} ${it.name} equipped`, duration: 2000 });
  }
  function applyCosmetics() {
    const g = G();
    // theme override
    const root = document.documentElement;
    SHOP.filter(s => s.kind === 'theme').forEach(s => {
      Object.keys(s.data || {}).forEach(k => root.style.removeProperty(k));
    });
    const th = shopItem(g.equipped.theme);
    if (th && th.data) Object.entries(th.data).forEach(([k, v]) => root.style.setProperty(k, v));
    // rail logo
    const logo = document.querySelector('.rail-logo');
    if (logo) {
      const ic = shopItem(g.equipped.appicon);
      logo.innerHTML = ic ? `<span style="font-size:19px">${ic.ico}</span>`
        : `<svg viewBox="0 0 64 64" width="20" height="20"><path d="M20 44V20l24 24V20" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    // avatar frame + title in sidebar
    const u = document.getElementById('sbUser');
    if (u) NX.shell.updateUserFooter && NX.shell.updateUserFooter();
  }

  /* ================= punishment / commitment ================= */
  function commitmentMinutesToday() {
    const day = NX.todayStr();
    const focus = NX.sum(store().pomodoro.all().filter(p => p.completed && p.mode === 'focus' && String(p.startedAt).slice(0, 10) === day).map(p => p.actualMinutes || p.plannedMinutes || 0));
    const logged = NX.sum(store().timeLogs.all().filter(l => String(l.start).slice(0, 10) === day).map(l => l.minutes || 0));
    return focus + logged;
  }

  function evaluateCommitment() {
    const g = G();
    if (!g.commitment.enabled) { g.lock.locked = false; return; }
    const today = NX.todayStr();
    if (g.lastActiveDay === today) return;      // already evaluated today
    // evaluate yesterday (and any missed days since last check)
    const missed = [];
    let d = NX.addDays(new Date(), -1);
    for (let i = 0; i < 14; i++) {
      const k = NX.ymd(d);
      if (g.lastActiveDay && k <= g.lastActiveDay) break;
      if (k >= (g.commitment.startedOn || '0000')) {
        const mins = dayMinutes(k);
        if (mins < g.commitment.dailyMinutes) missed.push(k);
      }
      d = NX.addDays(d, -1);
    }
    g.lock.missedDates = NX.unique((g.lock.missedDates || []).concat(missed));
    const effective = Math.max(0, g.lock.missedDates.length - (g.commitment.graceDays || 0));
    if (effective > 0 && commitmentMinutesToday() < g.commitment.dailyMinutes) {
      if (!g.lock.locked) {
        g.lock.locked = true;
        NX.shell.notify('Pebble is locked 🔒', `You missed ${effective} day${effective > 1 ? 's' : ''} of your ${g.commitment.dailyMinutes}-minute commitment. Watch an ad to unlock.`);
      }
    } else if (g.lock.locked && commitmentMinutesToday() >= g.commitment.dailyMinutes) {
      unlock('work');
    }
    g.lastActiveDay = today;
    save();
  }
  function dayMinutes(k) {
    const focus = NX.sum(store().pomodoro.all().filter(p => p.completed && p.mode === 'focus' && String(p.startedAt).slice(0, 10) === k).map(p => p.actualMinutes || p.plannedMinutes || 0));
    const logged = NX.sum(store().timeLogs.all().filter(l => String(l.start).slice(0, 10) === k).map(l => l.minutes || 0));
    return focus + logged;
  }
  function unlock(how) {
    const g = G();
    g.lock.locked = false;
    g.lock.missedDates = [];
    g.lock.unlockedAt = Date.now();
    if (how === 'work') { g.stats.comebacks = (g.stats.comebacks || 0) + 1; }
    save();
    NX.ui.toast({ type: 'success', title: '🔓 Unlocked', message: how === 'ad' ? 'Thanks for watching. Now go do the work!' : 'You hit today\'s commitment. Respect.', duration: 5000 });
    NX.router.render();
  }

  const ALLOWED_WHEN_LOCKED = new Set(['settings', 'pomodoro', 'time', 'game']);
  function isLocked() { return !!(G().lock && G().lock.locked); }

  /* ================= AD PLAYER (placeholder — swap in real ads later) ================= */
  const ADS = [
    { brand: 'FocusJuice', tag: 'SPONSOR', bg: 'linear-gradient(135deg,#7c2ae8,#e8447c)', g: 'tide', html: '<b style="font-size:22px;color:#fff">FocusJuice</b><div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px">Hydration for deep work.<br>Code 40% faster. Probably.</div>' },
    { brand: 'ChairMax 9000', tag: 'AD', bg: 'linear-gradient(135deg,#0e7a5f,#b7d94c)', g: 'zen', html: '<b style="font-size:22px;color:#fff">ChairMax 9000</b><div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:4px">Your spine called.<br>It wants this chair.</div>' },
    { brand: 'ProcrastiNATE', tag: 'SPONSOR', bg: 'linear-gradient(135deg,#b45309,#fbbf24)', g: 'moon', html: '<b style="font-size:22px;color:#fff">ProcrastiNATE</b><div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:4px">The app for not using apps.<br>(Irony sold separately.)</div>' },
    { brand: 'CloudNine Beds', tag: 'AD', bg: 'linear-gradient(135deg,#1d4ed8,#67e8f9)', g: 'wave', html: '<b style="font-size:22px;color:#fff">CloudNine</b><div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:4px">Sleep is a feature,<br>not a bug.</div>' }
  ];

  function showLockScreen() {
    if (document.getElementById('lockScreen')) return;
    const g = G();
    const missed = Math.max(0, (g.lock.missedDates || []).length - (g.commitment.graceDays || 0));
    const overlay = h('div.lock-screen', { id: 'lockScreen' });
    const card = h('div.lock-card');
    card.appendChild(h('div.lk-ico', { style: { display: 'flex', justifyContent: 'center', color: 'var(--acc-red)' }, html: NX.glyph('lock', 52, 1.5) }));
    card.appendChild(h('h2', 'Pebble is locked'));
    card.appendChild(h('p', [
      `You committed to `, h('b', g.commitment.dailyMinutes + ' minutes'), ` of work per day.`,
      h('br'), `You missed `, h('b', { style: { color: 'var(--acc-red)' } }, missed + ' day' + (missed > 1 ? 's' : '')), ` — so everything except Focus, Time and Settings is locked.`,
      h('br'), h('br'), 'Two ways out:',
      h('br'), `1. Do today's ${g.commitment.dailyMinutes} minutes (Focus timer counts).`,
      h('br'), '2. Watch a sponsor ad below.'
    ]));

    const adBox = h('div.ad-frame');
    let adSeconds = Number(store().getSetting('adSeconds', 60));
    let remaining = adSeconds;
    let adTimer = null;
    let adIdx = Math.floor(Math.random() * ADS.length);
    const renderAd = () => {
      NX.clear(adBox);
      const ad = ADS[adIdx % ADS.length];
      adBox.style.background = ad.bg;
      const slide = h('div.ad-slide', { html: `<div style="text-align:center"><div style="display:flex;justify-content:center;color:#fff;opacity:.9;margin-bottom:8px">${NX.glyph(ad.g || 'spark', 44, 1.5)}</div>${ad.html}</div>` });
      adBox.appendChild(slide);
      adBox.appendChild(h('div.ad-tag', ad.tag));
      const timerEl = h('div.ad-timer', NX.fmtClock(remaining));
      adBox.appendChild(timerEl);
      clearInterval(adTimer);
      adTimer = setInterval(() => {
        remaining--;
        timerEl.textContent = remaining <= 0 ? '✓' : NX.fmtClock(remaining);
        if (remaining % 8 === 0 && remaining !== adSeconds) { adIdx++; renderAd(); return; }
        if (remaining <= 0) {
          clearInterval(adTimer);
          g.stats.adsWatched = (g.stats.adsWatched || 0) + 1;
          save();
          award(5, 'Watched an unlock ad', { points: 0, silent: true });
          overlay.remove();
          unlock('ad');
          checkAchievements();
        }
      }, 1000);
    };
    card.appendChild(adBox);
    card.appendChild(h('div.row', { style: { justifyContent: 'center', gap: '8px', marginTop: '6px' } }, [
      h('button.btn.sm.subtle', { onclick: () => { adIdx++; remaining = adSeconds; renderAd(); } }, 'Skip to next ad (restarts timer)'),
      h('button.btn.sm.ghost', { onclick: () => {
        clearInterval(adTimer);
        overlay.remove();
        NX.router.navigate('#/pomodoro');
        NX.ui.toast({ type: 'info', title: 'Unlock by working', message: `Log ${g.commitment.dailyMinutes} minutes and the lock lifts automatically.`, duration: 6000 });
      } }, 'I\'ll work instead →')
    ]));
    card.appendChild(h('p.tiny.muted', { style: { marginTop: '14px' } }, 'Ads are placeholders baked into the app. Wire your real ad SDK into ADS[] in renderer/js/72-game.js later.'));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    renderAd();
  }

  /* ================= activity hooks (auto XP) ================= */
  function hookEvents() {
    store().on('tasks', () => {
      const done = sel().doneTasks().length;
      const g = G();
      if (done > (g._lastDone || 0)) {
        const delta = done - (g._lastDone || 0);
        g.stats.tasksDone = (g.stats.tasksDone || 0) + delta;
        save();
        award(15 * delta, 'Completed a task');
        bumpQuest('q_task', delta);
        checkAchievements();
      }
      g._lastDone = done;
    });
    store().on('habits', () => {
      const t = sel().habitsCompletedToday();
      const g = G();
      if (t.done > (g._lastHab || 0)) {
        const delta = t.done - (g._lastHab || 0);
        g.stats.habitsDone = (g.stats.habitsDone || 0) + delta;
        save();
        award(10 * delta, 'Logged a habit');
        bumpQuest('q_habit', delta);
        checkAchievements();
      }
      g._lastHab = t.done;
    });
    store().on('pomodoro', () => {
      const mins = sel().focusMinutesToday();
      const g = G();
      if (mins > (g._lastFocus || 0)) {
        const delta = mins - (g._lastFocus || 0);
        g.stats.focusMin = (g.stats.focusMin || 0) + delta;
        save();
        award(delta, delta + ' min of focus');
        bumpQuest('q_focus', delta);
        checkAchievements();
      }
      g._lastFocus = mins;
    });
    store().on('notes', () => {
      const g = G();
      const n = store().notes.count();
      if (n > (g._lastNotes || 0)) {
        g.stats.notes = (g.stats.notes || 0) + (n - (g._lastNotes || 0));
        save(); award(8, 'Created a note'); bumpQuest('q_note'); checkAchievements();
      }
      g._lastNotes = n;
    });
    store().on('journal', () => {
      const g = G();
      const n = store().journal.count();
      if (n > (g._lastJournal || 0)) {
        g.stats.journal = (g.stats.journal || 0) + (n - (g._lastJournal || 0));
        save(); award(12, 'Wrote a journal entry'); bumpQuest('q_journal'); checkAchievements();
      }
      g._lastJournal = n;
    });
    store().on('messages', () => { const g = G(); g.stats.msgs = store().messages.count(); checkAchievements(); });
    // daily login
    const g = G();
    const day = NX.todayStr();
    if (g.lastLoginDay !== day) { g.lastLoginDay = day; g.stats.logins = (g.stats.logins || 0) + 1; save(); }
    // baseline counters so hooks don't fire on load
    g._lastDone = sel().doneTasks().length;
    g._lastHab = sel().habitsCompletedToday().done;
    g._lastFocus = sel().focusMinutesToday();
    g._lastNotes = store().notes.count();
    g._lastJournal = store().journal.count();
  }

  /* ================= UI: header chip ================= */
  function xpChip() {
    const g = G();
    const lv = levelFromXp(g.totalXp);
    const chip = h('button.xp-chip.press', { title: 'Your progress — click for the Game Center', onclick: () => NX.router.navigate('#/game') }, [
      h('span.lvl', String(lv.level)),
      h('span', { style: { fontWeight: '800' } }, rankFor(lv.level)),
      h('span.pts', '★ ' + NX.fmtNum(g.points))
    ]);
    return chip;
  }

  /* ================= GAME CENTER MODULE ================= */
  function render(params) {
    const g = G();
    const lv = levelFromXp(g.totalXp);
    let tab = (params && params.tab) || NX.localStore.get('nexadesk.gameTab', 'home');
    const page = h('div.page');
    page.appendChild(NX.components.pageHead({
      icon: 'trophy', title: 'Game Center',
      sub: `Level ${lv.level} ${rankFor(lv.level)} · ${NX.fmtNum(g.points)} points · ${NX.fmtNum(g.totalXp)} lifetime XP`,
      actions: [xpChip()]
    }));

    // level progress hero
    page.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)', background: 'linear-gradient(120deg, var(--sel), transparent)', borderColor: 'rgba(124,108,255,.3)' } }, [
      h('div.row', { style: { gap: '18px', alignItems: 'center', flexWrap: 'wrap' } }, [
        h('div', { style: { flex: '0 0 auto' } }, NX.ui.ring(lv.into / lv.need * 100, 92, 9)),
        h('div.grow', { style: { minWidth: '220px' } }, [
          h('div.row', { style: { gap: '9px', marginBottom: '4px' } }, [
            h('b', { style: { fontSize: '20px', letterSpacing: '-.4px' } }, `Level ${lv.level} · ${rankFor(lv.level)}`),
            h('span.chip.chip-pur', 'next: ' + rankFor(lv.level + 1) + ' at L' + (lv.level + 1))
          ]),
          h('div.small.muted', `${NX.fmtNum(lv.into)} / ${NX.fmtNum(lv.need)} XP to level ${lv.level + 1}`),
          h('div.progress', { style: { marginTop: '9px' } }, h('i', { style: { width: (lv.into / lv.need * 100) + '%' } }))
        ]),
        h('div', { style: { textAlign: 'center', flex: '0 0 auto' } }, [
          h('div', { style: { display: 'flex', justifyContent: 'center' }, html: NX.avatarSVG(store().getSetting('userName', 'you'), 44) }),
          h('div.small.muted', { style: { marginTop: '4px' } }, (store().getSetting('userName', 'You'))),
          G().equipped.title ? h('span.chip.chip-yel', { style: { marginTop: '5px' } }, (shopItem(G().equipped.title) || {}).name.replace('Title: ', '')) : null
        ])
      ])
    ]));

    page.appendChild(h('div.tabs', ['home', 'quests', 'achievements', 'shop', 'commitment'].map(t =>
      h('button' + (tab === t ? '.on' : ''), { onclick: () => { NX.localStore.set('nexadesk.gameTab', t); NX.router.go('game', { tab: t }); } },
        t[0].toUpperCase() + t.slice(1)))));

    if (tab === 'home') page.appendChild(homeTab(g));
    else if (tab === 'quests') page.appendChild(questsTab(g));
    else if (tab === 'achievements') page.appendChild(achTab(g));
    else if (tab === 'shop') page.appendChild(shopTab(g));
    else page.appendChild(commitTab(g));
    return page;
  }

  function homeTab(g) {
    const wrap = h('div');
    const stats = [
      ['Tasks completed', g.stats.tasksDone || 0, '✅'], ['Habits logged', g.stats.habitsDone || 0, '🔥'],
      ['Focus minutes', NX.fmtDuration(g.stats.focusMin || 0), '⏱️'], ['Notes created', g.stats.notes || 0, '📝'],
      ['Journal entries', g.stats.journal || 0, '📔'], ['Messages sent', g.stats.msgs || 0, '💬'],
      ['Skills installed', g.stats.skills || 0, '🧩'], ['Prompts saved', g.stats.prompts || 0, '⌨️'],
      ['Ads watched', g.stats.adsWatched || 0, '📺'], ['Shop purchases', g.stats.shopBuys || 0, '🛍️']
    ];
    wrap.appendChild(h('div.grid.grid-auto-sm.stagger', stats.map(([l, v, ico]) =>
      h('div.stat', [h('div.st-label', l), h('div.st-value', { style: { fontSize: '21px' } }, String(v)), h('div.st-ico', { style: { opacity: '.55', display: 'flex' }, html: NX.glyphOrText(ico, 22) })]))));

    wrap.appendChild(h('div.section-head', { style: { marginTop: '22px' } }, [h('h2', 'Recent XP')]));
    const hist = (g.history || []).slice(0, 14);
    wrap.appendChild(hist.length ? h('div.card.pad-0', hist.map(x => h('div.list-row', [
      h('span', { style: { fontSize: '15px' } }, '⚡'),
      h('div.lr-main', [h('div.lr-title', x.reason), h('div.lr-sub', NX.relTime(x.at))]),
      h('b.small', { style: { color: 'var(--acc-yel)' } }, '+' + x.xp + ' XP'),
      x.pts ? h('span.chip.chip-yel', '+' + x.pts + ' pts') : null
    ]))) : h('p.small.muted', 'Do things. Earn XP. It will show up here.'));
    return wrap;
  }

  function questsTab(g) {
    const wrap = h('div');
    wrap.appendChild(h('div.section-head', [h('h2', 'Today\'s quests'), h('span.sh-sub', 'resets at midnight')]));
    const qs = todayQuests();
    wrap.appendChild(h('div.col.stagger', { style: { gap: '8px' } }, qs.map(q => {
      const p = questProgress(q.id);
      const done = p >= q.target;
      return h('div.quest-row' + (done ? '.done' : ''), [
        h('span.q-ico', { html: NX.glyphOrText(q.ico, 18) }),
        h('div.grow', [h('div', { style: { fontSize: '13px', fontWeight: '600' } }, q.label),
          h('div.tiny.muted', `+${q.xp} XP`)]),
        h('div.q-bar', h('div.progress.thin', h('i', { style: { width: Math.min(100, p / q.target * 100) + '%', background: done ? 'var(--acc-grn)' : 'var(--brand-1)' } }))),
        h('b.small', { style: { minWidth: '44px', textAlign: 'right' } }, `${Math.min(p, q.target)}/${q.target}`),
        done ? h('span.chip.chip-grn', 'done') : null
      ]);
    })));
    const allDone = qs.every(q => questProgress(q.id) >= q.target);
    if (allDone) wrap.appendChild(h('div.card', { style: { marginTop: '14px', background: 'var(--acc-grn-bg)', borderColor: 'rgba(76,175,125,.4)', textAlign: 'center' } },
      h('div', [h('div', { style: { fontSize: '30px' } }, '🏅'), h('b', 'All quests complete!'), h('div.small.muted', 'The Daily Devotion achievement is yours.')])))
    checkAchievements();
    return wrap;
  }

  function achTab(g) {
    const wrap = h('div');
    const unlocked = ACH.filter(a => g.achievements[a.id]);
    wrap.appendChild(h('div.section-head', [h('h2', `Achievements`), h('span.sh-sub', `${unlocked.length}/${ACH.length} unlocked`), h('div.grow'),
      h('div.progress', { style: { width: '140px' } }, h('i', { style: { width: (unlocked.length / ACH.length * 100) + '%' } }))]));
    wrap.appendChild(h('div.grid.grid-auto.stagger', ACH.map(a => {
      const on = !!g.achievements[a.id];
      return h('div.ach-card' + (on ? '.unlocked' : '.locked'), [
        h('div.ac-ico', { html: NX.glyphOrText(a.ico, 22) }),
        h('div.grow', { style: { minWidth: '0' } }, [h('b', a.name), h('span', a.desc)]),
        h('div.ac-pts', on ? '✓ ' + a.pts : a.pts + ' pts')
      ]);
    })));
    return wrap;
  }

  function shopTab(g) {
    const wrap = h('div');
    wrap.appendChild(h('div.card.pad-sm', { style: { marginBottom: '14px', background: 'var(--acc-yel-bg)', borderColor: 'rgba(227,193,74,.35)' } }, [
      h('div.row', { style: { gap: '10px' } }, [
        h('span', { style: { fontSize: '22px' } }, '★'),
        h('div.grow', [h('b', NX.fmtNum(g.points) + ' points'),
          h('div.small.muted', 'Earn points by completing tasks, habits, focus sessions, quests and achievements. Spend them here.')]),
        h('button.btn.sm.subtle', { onclick: () => NX.router.go('game', { tab: 'quests' }) }, 'Earn more →')
      ])
    ]));
    const KINDS = [['theme', ' Themes'], ['avatar', '🐾 Avatars'], ['frame', '🖼️ Avatar frames'], ['title', '🏷️ Titles'], ['appicon', '📱 App icons'], ['fx', '✨ Effects']];
    KINDS.forEach(([kind, label]) => {
      const items = SHOP.filter(s => s.kind === kind);
      if (!items.length) return;
      wrap.appendChild(h('div.section-head', [h('h2', label)]));
      wrap.appendChild(h('div.grid.grid-auto.stagger', items.map(it => {
        const owned = g.owned.includes(it.id);
        const equipped = g.equipped[kind] === it.id;
        return h('div.shop-item' + (owned ? '.owned' : ''), [
          equipped ? h('div.si-equipped', 'equipped') : null,
          h('div.si-preview', { style: kind === 'theme' && it.data ? { background: it.data['--bg'] || 'var(--bg-sunken)', color: it.data['--brand-1'] || 'var(--brand-1)', border: '1px solid ' + (it.data['--bd'] || 'var(--bd)') } : { background: 'var(--bg-sunken)' }, html: kind === 'avatar' ? NX.avatarSVG(it.name, 46) : NX.glyph(it.ico || 'pebble', 30, 1.6) }),
          h('b', it.name),
          h('div.si-desc', it.desc),
          owned
            ? h('button.si-owned', { onclick: () => equip(it.id) }, equipped ? '✓ Equipped' : 'Equip')
            : h('button.si-price.press', { onclick: () => buy(it.id) }, '★ ' + it.price)
        ]);
      })));
    });
    return wrap;
  }

  function commitTab(g) {
    const wrap = h('div');
    const c = g.commitment;
    wrap.appendChild(card2('Daily commitment (the punishment system)', 'Promise a daily work minimum. Miss it (after your grace days) and Pebble locks itself until you either do the work or watch a sponsor ad.', [
      row2('Enable commitments', 'Turns on the lock + ad-unlock mechanic', toggleSwitch('commitEnabled', c.enabled, v => { c.enabled = v; if (!v) { c.startedOn = NX.todayStr(); g.lock.missedDates = []; g.lock.locked = false; } else c.startedOn = c.startedOn || NX.todayStr(); save(); })),
      row2('Daily minutes', 'Focus timer + time tracking both count', h('input.input.sm', { type: 'number', min: 5, max: 720, step: 5, value: c.dailyMinutes, style: { width: '90px' }, onchange: e => { c.dailyMinutes = NX.clamp(Number(e.target.value) || 60, 5, 720); save(); } })),
      row2('Grace days', 'Missed days forgiven before locking kicks in', h('input.input.sm', { type: 'number', min: 0, max: 7, value: c.graceDays, style: { width: '70px' }, onchange: e => { c.graceDays = NX.clamp(Number(e.target.value) || 0, 0, 7); save(); } })),
      row2('Ad length (seconds)', 'Placeholder ads run this long. Swap in your real ad SDK later.', h('input.input.sm', { type: 'number', min: 15, max: 300, step: 15, value: store().getSetting('adSeconds', 60), style: { width: '90px' }, onchange: e => store().setSetting('adSeconds', NX.clamp(Number(e.target.value) || 60, 15, 300)) }))
    ]));

    wrap.appendChild(card2('Status', '', [
      h('div.grid.grid-3', { style: { gap: '9px', marginBottom: '10px' } }, [
        h('div.stat' + (isLocked() ? '.accent-red' : '.accent-grn'), [h('div.st-label', 'Lock state'), h('div.st-value', { style: { fontSize: '17px' } }, isLocked() ? 'Locked' : 'Open')]),
        h('div.stat', [h('div.st-label', 'Worked today'), h('div.st-value', { style: { fontSize: '17px' } }, NX.fmtDuration(commitmentMinutesToday())), h('div.st-sub', 'of ' + c.dailyMinutes + ' min')]),
        h('div.stat' + ((g.lock.missedDates || []).length ? '.accent-org' : ''), [h('div.st-label', 'Missed days'), h('div.st-value', { style: { fontSize: '17px' } }, String((g.lock.missedDates || []).length))])
      ]),
      h('div.row', { style: { gap: '8px' } }, [
        isLocked() ? h('button.btn.primary', { onclick: showLockScreen }, 'Watch ad to unlock') : null,
        h('button.btn.ghost', { onclick: () => NX.router.navigate('#/pomodoro') }, 'Log focus time →'),
        h('div.grow'),
        g.lock.missedDates && g.lock.missedDates.length ? h('button.btn.danger', { onclick: async () => { if (await NX.ui.confirm({ title: 'Forgive missed days?', message: 'This clears the miss record without watching an ad. Be honest with yourself.', confirmLabel: 'Forgive', danger: false })) { g.lock.missedDates = []; g.lock.locked = false; save(); NX.router.render(); } } }, 'Forgive (cheat)') : null
      ])
    ]));

    wrap.appendChild(card2('How it works', '', [
      h('ol.small.muted', { style: { paddingLeft: '20px', lineHeight: '1.9' } }, [
        h('li', 'Each night (on next launch) Pebble checks yesterday\'s logged minutes against your commitment.'),
        h('li', 'Misses beyond your grace days accumulate.'),
        h('li', 'While in debt, the app locks at launch: only Focus, Time and Settings remain usable.'),
        h('li', 'Unlock by logging today\'s minutes (auto-detected) or by watching a full sponsor ad.'),
        h('li', 'Ads are placeholders in code — plug your real ad provider into the ADS array when ready.')
      ])
    ]));
    return wrap;
  }

  function card2(title, sub, children) {
    return h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
      h('div.card-head', [h('h3', title), sub ? h('span.sh-sub.small.muted', sub) : null]),
      ...children
    ]);
  }
  function row2(label, hint, ctl) {
    return h('div.setting-row', [h('div.sr-text', [h('b', label), hint ? h('span', hint) : null]), h('div.sr-ctl', ctl)]);
  }
  function toggleSwitch(key, val, onchange) {
    const inp = h('input', { type: 'checkbox', checked: !!val, onchange: e => onchange(e.target.checked) });
    return h('label.switch', [inp, h('span.track')]);
  }

  /* ================= export ================= */
  NX.game = {
    G, award, buy, equip, applyCosmetics, confetti, flyXp, checkAchievements,
    bumpQuest, todayQuests, questProgress, xpChip, ACH, SHOP, shopItem,
    isLocked, showLockScreen, evaluateCommitment, commitmentMinutesToday,
    ALLOWED_WHEN_LOCKED, levelFromXp, rankFor, render
  };

  NX.router.register({
    id: 'game', name: 'Game', icon: 'trophy', group: 'life', order: 66,
    render,
    badge: () => 0,
    commands: () => [
      { label: 'Game: open shop', icon: 'star', run: () => NX.router.go('game', { tab: 'shop' }) },
      { label: 'Game: today\'s quests', icon: 'target', run: () => NX.router.go('game', { tab: 'quests' }) },
      { label: 'Game: achievements', icon: 'trophy', run: () => NX.router.go('game', { tab: 'achievements' }) },
      { label: 'Game: commitment & lock settings', icon: 'lock', run: () => NX.router.go('game', { tab: 'commitment' }) }
    ]
  });
})(window.NX);
