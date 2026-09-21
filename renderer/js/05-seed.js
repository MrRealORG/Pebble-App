/* ============================================================
   Pebble — seed.js : starter workspace content
   ============================================================ */
window.NX = window.NX || {};

NX.seedWorkspace = function (uid) {
  const now = Date.now();
  const D = 86400000;
  const iso = (offDays, hh, mm) => {
    const d = new Date(now + offDays * D);
    d.setHours(hh === undefined ? 9 : hh, mm || 0, 0, 0);
    return d.toISOString();
  };
  const day = off => { const d = new Date(now + off * D); return d.toISOString().slice(0, 10); };
  const stamp = off => new Date(now + off * D).toISOString();

  /* ---------------- tags ---------------- */
  const tags = [
    { id: uid('tag'), name: 'work',       color: '#4aa8e8' },
    { id: uid('tag'), name: 'personal',   color: '#4caf7d' },
    { id: uid('tag'), name: 'ideas',      color: '#9b6cf0' },
    { id: uid('tag'), name: 'reading',    color: '#f2994a' },
    { id: uid('tag'), name: 'health',     color: '#eb5757' },
    { id: uid('tag'), name: 'project',    color: '#e86cb0' },
    { id: uid('tag'), name: 'meeting',    color: '#33b8a3' },
    { id: uid('tag'), name: 'learning',   color: '#e3c14a' }
  ];
  const tagId = n => (tags.find(t => t.name === n) || {}).id;

  /* ---------------- projects / task lists ---------------- */
  const projects = [
    { id: uid('prj'), name: 'Product Launch', color: '#7c6cff', icon: '🚀', archived: false, description: 'Everything for the v1.0 release', order: 0 },
    { id: uid('prj'), name: 'Personal',       color: '#4caf7d', icon: '🌱', archived: false, description: 'Life admin & self-improvement', order: 1 },
    { id: uid('prj'), name: 'Learning',       color: '#4aa8e8', icon: '📚', archived: false, description: 'Courses, books, practice', order: 2 },
    { id: uid('prj'), name: 'Home',           color: '#f2994a', icon: '🏠', archived: false, description: 'Household & errands', order: 3 }
  ];
  const pid = n => (projects.find(p => p.name === n) || {}).id;

  const statuses = ['Backlog', 'To Do', 'In Progress', 'Blocked', 'Review', 'Done'];
  const prio = ['None', 'Low', 'Medium', 'High', 'Urgent'];

  /* ---------------- notes ---------------- */
  const welcomeId = uid('note'), launchId = uid('note'), secondBrainId = uid('note'),
        meetingId = uid('note'), readingId = uid('note'), shortcutsId = uid('note'),
        weeklyId = uid('note'), ideasId = uid('note');

  const notes = [
    {
      id: welcomeId, title: '👋 Welcome to Pebble', icon: '✨', emoji: '✨',
      parentId: null, order: 0, favorite: true, archived: false, pinned: true,
      tags: [tagId('personal')], cover: '', coverColor: '#7c6cff',
      created: stamp(-1), updated: stamp(0), createdBy: 'You',
      properties: [
        { id: uid('p'), name: 'Status', type: 'select', options: ['Active', 'Done'], value: 'Active' },
        { id: uid('p'), name: 'Area', type: 'text', value: 'Getting started' },
        { id: uid('p'), name: 'Read time', type: 'number', value: 4 }
      ],
      blocks: [
        { id: uid('b'), type: 'callout', emoji: '🎉', variant: 'info', text: 'This is your **all-in-one workspace**. Notes, tasks, calendar, habits, journal, kanban, wiki, chat, finance, and AI — everything lives in one place and everything is connected.' },
        { id: uid('b'), type: 'h1', text: 'Start here' },
        { id: uid('b'), type: 'number', text: 'Press `Ctrl+K` (or ⌘K) anywhere to open the **command palette** — jump to any note, task, or command instantly.' },
        { id: uid('b'), type: 'number', text: 'Press `Ctrl+Shift+N` for **quick capture** — dump a thought in two seconds and sort it later.' },
        { id: uid('b'), type: 'number', text: 'In any note, type `/` on an empty line to open the **block menu** (headings, toggles, callouts, tables, code, math…).' },
        { id: uid('b'), type: 'number', text: 'Link notes together with `[[double brackets]]` — backlinks and the knowledge graph build themselves.' },
        { id: uid('b'), type: 'divider', text: '' },
        { id: uid('b'), type: 'h2', text: 'The modules' },
        { id: uid('b'), type: 'table', rows: [
          ['Module', 'What it does'],
          ['📝 Notes', 'Block editor, nested pages, backlinks, database view, version history'],
          ['✅ Tasks', 'Lists, subtasks, recurrence, priorities, filters, smart views'],
          ['📊 Kanban', 'Drag-and-drop boards per project, WIP limits, swimlanes'],
          ['📅 Calendar', 'Month / week / day / agenda, events + tasks + habits in one view'],
          ['⏰ Reminders', 'Native OS notifications, snooze, repeat, works from the tray'],
          ['🔥 Habits', 'Daily & weekly habits, streaks, contribution heatmap'],
          ['🎯 Goals', 'OKRs with key results and auto progress from tasks & habits'],
          ['📔 Journal', 'Daily entries, mood tracking, prompts, gratitude'],
          ['⏱️ Pomodoro', 'Focus timer with session log and per-task tracking'],
          ['🕐 Time Tracker', 'Manual & timer-based time logs, per-project reports'],
          ['💰 Finance', 'Accounts, transactions, budgets, categories, charts'],
          ['👥 Contacts', 'Personal CRM with interaction history and follow-ups'],
          ['🔖 Bookmarks', 'Link library with tags, notes and reading status'],
          ['📖 Wiki', 'Structured knowledge base + interactive knowledge graph'],
          ['💬 Chat', 'Discord-style servers, channels, threads, roles, reactions, DMs'],
          ['📥 Inbox', 'One place for every notification across all modules'],
          ['🤖 AI', 'Offline analysis engine + optional API key for real LLM power']
        ]},
        { id: uid('b'), type: 'h2', text: 'Your data is yours' },
        { id: uid('b'), type: 'text', text: 'Everything is stored **locally** — on this machine, in a JSON file. Nothing is uploaded anywhere. Export a full backup any time from Settings → Data.' },
        { id: uid('b'), type: 'callout', emoji: '💡', variant: 'success', text: 'Tip: open **Settings → Keyboard shortcuts** for the full list. There are around 40 of them.' }
      ]
    },
    {
      id: launchId, title: 'Product Launch Plan', icon: '🚀', emoji: '🚀',
      parentId: null, order: 1, favorite: true, archived: false, pinned: false,
      tags: [tagId('work'), tagId('project')], cover: '', coverColor: '#4aa8e8',
      created: stamp(-6), updated: stamp(-1), createdBy: 'You',
      properties: [
        { id: uid('p'), name: 'Owner', type: 'text', value: 'You' },
        { id: uid('p'), name: 'Due', type: 'date', value: day(21) },
        { id: uid('p'), name: 'Status', type: 'select', options: ['Planning', 'Building', 'Shipped'], value: 'Building' }
      ],
      blocks: [
        { id: uid('b'), type: 'h1', text: 'Objective' },
        { id: uid('b'), type: 'text', text: 'Ship v1.0 to the first 100 users without a single P0 bug. Everything below is scoped to that.' },
        { id: uid('b'), type: 'h2', text: 'Workstreams' },
        { id: uid('b'), type: 'toggle', text: '1. Product & engineering', open: false, children: [
          { id: uid('b'), type: 'todo', text: 'Freeze feature scope', done: true },
          { id: uid('b'), type: 'todo', text: 'Fix all P0 + P1 bugs from beta', done: false },
          { id: uid('b'), type: 'todo', text: 'Load test at 10x expected traffic', done: false },
          { id: uid('b'), type: 'todo', text: 'Write rollback plan and rehearse it', done: false }
        ]},
        { id: uid('b'), type: 'toggle', text: '2. Marketing & launch', open: false, children: [
          { id: uid('b'), type: 'todo', text: 'Landing page copy — final pass', done: true },
          { id: uid('b'), type: 'todo', text: 'Launch video (90 seconds, screen capture)', done: false },
          { id: uid('b'), type: 'todo', text: 'Press / newsletter list warmed up', done: false },
          { id: uid('b'), type: 'todo', text: 'Product Hunt assets ready 48h before', done: false }
        ]},
        { id: uid('b'), type: 'toggle', text: '3. Support & docs', open: true, children: [
          { id: uid('b'), type: 'todo', text: 'Help centre: 20 core articles', done: false },
          { id: uid('b'), type: 'todo', text: 'Canned responses for top 15 questions', done: false },
          { id: uid('b'), type: 'todo', text: 'On-call rotation published', done: true }
        ]},
        { id: uid('b'), type: 'divider', text: '' },
        { id: uid('b'), type: 'h2', text: 'Timeline' },
        { id: uid('b'), type: 'table', rows: [
          ['Milestone', 'Date', 'Owner', 'Status'],
          ['Feature freeze', day(-2), 'Eng', '✅ Done'],
          ['Beta feedback closed', day(4), 'PM', '🟡 In progress'],
          ['Release candidate', day(12), 'Eng', '⚪ Not started'],
          ['Docs complete', day(16), 'Support', '⚪ Not started'],
          ['Public launch', day(21), 'All', '⚪ Not started']
        ]},
        { id: uid('b'), type: 'callout', emoji: '⚠️', variant: 'warn', text: 'Biggest risk right now: the load test has slipped twice. If it slips again, cut the collaborative editing feature from v1.0 rather than the launch date.' },
        { id: uid('b'), type: 'h2', text: 'Related' },
        { id: uid('b'), type: 'text', text: 'See [[Weekly Review]] for status, and [[Second Brain Method]] for how this page is organised.' }
      ]
    },
    {
      id: secondBrainId, title: 'Second Brain Method', icon: '🧠', emoji: '🧠',
      parentId: null, order: 2, favorite: true, archived: false, pinned: false,
      tags: [tagId('learning'), tagId('ideas')], cover: '', coverColor: '#9b6cf0',
      created: stamp(-12), updated: stamp(-3), createdBy: 'You',
      properties: [{ id: uid('p'), name: 'Type', type: 'select', options: ['Reference', 'Evergreen'], value: 'Evergreen' }],
      blocks: [
        { id: uid('b'), type: 'text', text: 'A short operating manual for how I want to use this workspace. The point is not to store everything — it is to make sure nothing important gets lost and everything useful is *findable*.' },
        { id: uid('b'), type: 'h2', text: 'Capture' },
        { id: uid('b'), type: 'bullet', text: 'One inbox, zero friction. `Ctrl+Shift+N` → type → done. Do not decide where it goes yet.' },
        { id: uid('b'), type: 'bullet', text: 'Anything that takes less than two minutes: just do it, do not capture it.' },
        { id: uid('b'), type: 'h2', text: 'Organise' },
        { id: uid('b'), type: 'bullet', text: '**Projects** = things with an end date. **Areas** = ongoing responsibilities. **Resources** = reference material.' },
        { id: uid('b'), type: 'bullet', text: 'Prefer links and tags over deep folder nesting. Three levels of nesting is the ceiling.' },
        { id: uid('b'), type: 'h2', text: 'Distil' },
        { id: uid('b'), type: 'bullet', text: 'Every note gets a one-line summary at the top the second time I open it. Progressive summarisation.' },
        { id: uid('b'), type: 'bullet', text: 'Highlight liberally, bold sparingly. If everything is bold, nothing is.' },
        { id: uid('b'), type: 'h2', text: 'Express' },
        { id: uid('b'), type: 'bullet', text: 'Notes only matter if they turn into output: a decision, a draft, a shipped thing.' },
        { id: uid('b'), type: 'callout', emoji: '🔁', variant: 'info', text: 'Weekly review is the engine that keeps this working. See [[Weekly Review Template]].' }
      ]
    },
    {
      id: meetingId, title: 'Team Sync — Notes', icon: '🗓️', emoji: '🗓️',
      parentId: launchId, order: 0, favorite: false, archived: false, pinned: false,
      tags: [tagId('meeting'), tagId('work')], cover: '', coverColor: '#33b8a3',
      created: stamp(-2), updated: stamp(-2), createdBy: 'You',
      properties: [
        { id: uid('p'), name: 'Date', type: 'date', value: day(-2) },
        { id: uid('p'), name: 'Attendees', type: 'text', value: 'You, Priya, Marcus, Dana' }
      ],
      blocks: [
        { id: uid('b'), type: 'h2', text: 'Agenda' },
        { id: uid('b'), type: 'number', text: 'Beta feedback triage' },
        { id: uid('b'), type: 'number', text: 'Load testing status' },
        { id: uid('b'), type: 'number', text: 'Launch comms plan' },
        { id: uid('b'), type: 'h2', text: 'Decisions' },
        { id: uid('b'), type: 'check', text: 'Launch date holds — no slip.' },
        { id: uid('b'), type: 'check', text: 'Collaborative editing moves to v1.1.' },
        { id: uid('b'), type: 'h2', text: 'Action items' },
        { id: uid('b'), type: 'todo', text: '@Marcus — rerun load test with 10k concurrent by Friday', done: false },
        { id: uid('b'), type: 'todo', text: '@Priya — draft the changelog post', done: false },
        { id: uid('b'), type: 'todo', text: 'Me — set up the on-call rotation', done: true },
        { id: uid('b'), type: 'quote', text: 'If we are not embarrassed by the first version, we launched too late.' }
      ]
    },
    {
      id: readingId, title: 'Reading List', icon: '📚', emoji: '📚',
      parentId: null, order: 3, favorite: false, archived: false, pinned: false,
      tags: [tagId('reading')], cover: '', coverColor: '#f2994a',
      created: stamp(-20), updated: stamp(-4), createdBy: 'You',
      properties: [],
      blocks: [
        { id: uid('b'), type: 'table', rows: [
          ['Book', 'Author', 'Status', 'Rating'],
          ['Thinking, Fast and Slow', 'Kahneman', 'Reading', '★★★★☆'],
          ['Deep Work', 'Newport', 'Done', '★★★★★'],
          ['The Design of Everyday Things', 'Norman', 'Done', '★★★★☆'],
          ['Shape Up', 'Singer', 'Queued', '—'],
          ['Thinking in Systems', 'Meadows', 'Queued', '—']
        ]},
        { id: uid('b'), type: 'h3', text: 'Key takeaway — Deep Work' },
        { id: uid('b'), type: 'quote', text: 'The ability to perform deep work is becoming increasingly rare at exactly the same time it is becoming increasingly valuable.' },
        { id: uid('b'), type: 'text', text: 'Practical rule I stole: schedule the deep work first, then let the shallow work fill the gaps. Not the other way around.' }
      ]
    },
    {
      id: shortcutsId, title: 'Keyboard Shortcuts', icon: '⌨️', emoji: '⌨️',
      parentId: null, order: 4, favorite: false, archived: false, pinned: false,
      tags: [tagId('learning')], cover: '', coverColor: '#8b8f98',
      created: stamp(-8), updated: stamp(-8), createdBy: 'You', properties: [],
      blocks: [
        { id: uid('b'), type: 'text', text: 'The ones I actually use, roughly in order of how much time they save me.' },
        { id: uid('b'), type: 'table', rows: [
          ['Shortcut', 'Action'],
          ['Ctrl / ⌘ + K', 'Command palette'],
          ['Ctrl / ⌘ + Shift + N', 'Quick capture'],
          ['Ctrl / ⌘ + Shift + F', 'Global search'],
          ['Ctrl / ⌘ + B', 'Toggle sidebar'],
          ['Ctrl / ⌘ + /', 'Show all shortcuts'],
          ['Ctrl / ⌘ + S', 'Force save'],
          ['/', 'Block menu (in a note)'],
          ['[[', 'Link to another note'],
          ['Ctrl / ⌘ + E', 'Inline code'],
          ['Alt + ↑ / ↓', 'Move block'],
          ['Ctrl / ⌘ + Shift + 1..3', 'Heading 1 / 2 / 3'],
          ['Esc', 'Close any overlay']
        ]}
      ]
    },
    {
      id: weeklyId, title: 'Weekly Review Template', icon: '🔁', emoji: '🔁',
      parentId: null, order: 5, favorite: false, archived: false, pinned: false,
      tags: [tagId('personal')], cover: '', coverColor: '#4caf7d',
      created: stamp(-15), updated: stamp(-7), createdBy: 'You',
      properties: [{ id: uid('p'), name: 'Template', type: 'checkbox', value: true }],
      blocks: [
        { id: uid('b'), type: 'callout', emoji: '🗓️', variant: 'info', text: 'Do this every Friday, 25 minutes, non-negotiable. It is the single highest-leverage habit in this system.' },
        { id: uid('b'), type: 'h2', text: '1. Clear the inbox' },
        { id: uid('b'), type: 'todo', text: 'Process every quick-capture item: file it, task it, or delete it', done: false },
        { id: uid('b'), type: 'h2', text: '2. Review last week' },
        { id: uid('b'), type: 'bullet', text: 'What actually shipped?' },
        { id: uid('b'), type: 'bullet', text: 'What slipped, and why?' },
        { id: uid('b'), type: 'bullet', text: 'What drained energy? What gave it?' },
        { id: uid('b'), type: 'h2', text: '3. Set up next week' },
        { id: uid('b'), type: 'number', text: 'Pick the **three** outcomes that would make next week a win' },
        { id: uid('b'), type: 'number', text: 'Time-block them in the calendar before anything else' },
        { id: uid('b'), type: 'number', text: 'Check every project has a next action' },
        { id: uid('b'), type: 'h2', text: '4. Tidy' },
        { id: uid('b'), type: 'todo', text: 'Archive completed projects', done: false },
        { id: uid('b'), type: 'todo', text: 'Delete or merge stale notes', done: false },
        { id: uid('b'), type: 'todo', text: 'Update goals progress', done: false }
      ]
    },
    {
      id: ideasId, title: 'Ideas Parking Lot', icon: '💡', emoji: '💡',
      parentId: null, order: 6, favorite: false, archived: false, pinned: false,
      tags: [tagId('ideas')], cover: '', coverColor: '#e3c14a',
      created: stamp(-9), updated: stamp(0), createdBy: 'You', properties: [],
      blocks: [
        { id: uid('b'), type: 'text', text: 'No judgement zone. Dump it here, promote it later.' },
        { id: uid('b'), type: 'bullet', text: 'A "focus mode" that hides every module except the one you are in' },
        { id: uid('b'), type: 'bullet', text: 'Weekly email digest of everything captured but never opened' },
        { id: uid('b'), type: 'bullet', text: 'Habit stacking: attach a new habit to an existing one and get reminded in sequence' },
        { id: uid('b'), type: 'bullet', text: 'Voice memos that auto-transcribe into notes' },
        { id: uid('b'), type: 'callout', emoji: '🌱', variant: 'success', text: 'Promoted to a real project: the focus mode idea. See [[Product Launch Plan]].' }
      ]
    }
  ];

  /* ---------------- tasks ---------------- */
  const T = (title, o) => Object.assign({
    id: uid('task'), title, description: '', projectId: null, status: 'To Do', priority: 'Medium',
    parentId: null, tags: [], due: null, start: null, completed: null, done: false,
    estimate: 0, actual: 0, repeat: null, checklist: [], order: 0,
    created: stamp(0), updated: stamp(0), archived: false, subtasks: []
  }, o || {});

  const tasks = [
    T('Finish the launch checklist', { projectId: pid('Product Launch'), status: 'In Progress', priority: 'Urgent', due: iso(1, 17), estimate: 120, tags: [tagId('work')], order: 0,
        description: 'Everything that has to be true before we press the button.',
        checklist: [ { id: uid('c'), text: 'All P0 bugs closed', done: true }, { id: uid('c'), text: 'Load test passed', done: false }, { id: uid('c'), text: 'Rollback plan written', done: false }, { id: uid('c'), text: 'Support docs published', done: false } ] }),
    T('Rerun load test at 10k concurrent', { projectId: pid('Product Launch'), status: 'To Do', priority: 'High', due: iso(3, 12), estimate: 90, tags: [tagId('work')], order: 1 }),
    T('Draft the changelog post', { projectId: pid('Product Launch'), status: 'To Do', priority: 'Medium', due: iso(5, 18), estimate: 60, tags: [tagId('work')], order: 2 }),
    T('Record the 90-second launch video', { projectId: pid('Product Launch'), status: 'Backlog', priority: 'Medium', due: iso(9), estimate: 120, order: 3 }),
    T('Set up Product Hunt listing', { projectId: pid('Product Launch'), status: 'Backlog', priority: 'Low', due: iso(14), estimate: 45, order: 4 }),
    T('Design the onboarding email sequence', { projectId: pid('Product Launch'), status: 'Review', priority: 'Medium', due: iso(7), estimate: 90, order: 5 }),
    T('Beta feedback triage', { projectId: pid('Product Launch'), status: 'Done', priority: 'High', completed: iso(-2), done: true, estimate: 60, actual: 75, order: 6 }),
    T('Freeze feature scope', { projectId: pid('Product Launch'), status: 'Done', priority: 'Urgent', completed: iso(-4), done: true, order: 7 }),

    T('Book the dentist appointment', { projectId: pid('Personal'), status: 'To Do', priority: 'Medium', due: iso(-1, 12), estimate: 10, tags: [tagId('health')], order: 0 }),
    T('Renew passport', { projectId: pid('Personal'), status: 'To Do', priority: 'High', due: iso(20), estimate: 30, order: 1 }),
    T('Plan the weekend trip', { projectId: pid('Personal'), status: 'In Progress', priority: 'Low', due: iso(4), estimate: 45, tags: [tagId('personal')], order: 2 }),
    T('Weekly review', { projectId: pid('Personal'), status: 'To Do', priority: 'High', due: iso(2, 16), estimate: 25, repeat: 'weekly', tags: [tagId('personal')], order: 3 }),
    T('Call Mum', { projectId: pid('Personal'), status: 'To Do', priority: 'Medium', due: iso(0, 19), estimate: 20, repeat: 'weekly', order: 4 }),
    T('Sort out the tax paperwork', { projectId: pid('Personal'), status: 'Blocked', priority: 'High', due: iso(12), estimate: 120, order: 5, description: 'Waiting on the payslips from the old employer.' }),

    T('Finish Deep Work (chapters 6-8)', { projectId: pid('Learning'), status: 'In Progress', priority: 'Low', due: iso(6), estimate: 90, tags: [tagId('reading')], order: 0 }),
    T('Practice typing for 15 minutes', { projectId: pid('Learning'), status: 'To Do', priority: 'Low', estimate: 15, repeat: 'daily', tags: [tagId('learning')], order: 1 }),
    T('Do the SQL window-functions course', { projectId: pid('Learning'), status: 'Backlog', priority: 'Medium', estimate: 240, order: 2 }),
    T('Write up notes on Thinking in Systems', { projectId: pid('Learning'), status: 'Backlog', priority: 'Low', estimate: 60, order: 3 }),

    T('Fix the leaking kitchen tap', { projectId: pid('Home'), status: 'To Do', priority: 'High', due: iso(2), estimate: 40, order: 0 }),
    T('Grocery run', { projectId: pid('Home'), status: 'To Do', priority: 'Medium', due: iso(0, 18), estimate: 45, repeat: 'weekly', order: 1,
        checklist: [ { id: uid('c'), text: 'Vegetables', done: false }, { id: uid('c'), text: 'Coffee', done: false }, { id: uid('c'), text: 'Oat milk', done: false }, { id: uid('c'), text: 'Bread', done: false } ] }),
    T('Declutter the spare room', { projectId: pid('Home'), status: 'Backlog', priority: 'Low', estimate: 180, order: 2 }),
    T('Service the car', { projectId: pid('Home'), status: 'To Do', priority: 'Medium', due: iso(16), estimate: 60, order: 3 })
  ];

  /* ---------------- events ---------------- */
  const E = (title, startISO, mins, o) => Object.assign({
    id: uid('ev'), title, start: startISO, end: new Date(new Date(startISO).getTime() + mins * 60000).toISOString(),
    allDay: false, location: '', description: '', color: '#7c6cff', calendar: 'Personal',
    attendees: [], reminder: 10, repeat: null, linkedNoteId: null, linkedTaskId: null, busy: true
  }, o || {});

  const events = [
    E('Team standup', iso(0, 9, 30), 15, { color: '#33b8a3', calendar: 'Work', repeat: 'weekdays', location: 'Video call', reminder: 5 }),
    E('Team standup', iso(1, 9, 30), 15, { color: '#33b8a3', calendar: 'Work', location: 'Video call', reminder: 5 }),
    E('Team standup', iso(2, 9, 30), 15, { color: '#33b8a3', calendar: 'Work', location: 'Video call', reminder: 5 }),
    E('Team standup', iso(3, 9, 30), 15, { color: '#33b8a3', calendar: 'Work', location: 'Video call', reminder: 5 }),
    E('Team standup', iso(4, 9, 30), 15, { color: '#33b8a3', calendar: 'Work', location: 'Video call', reminder: 5 }),
    E('Launch planning', iso(1, 14), 60, { color: '#7c6cff', calendar: 'Work', location: 'Room 2B', linkedNoteId: launchId, attendees: ['Priya', 'Marcus', 'Dana'], description: 'Go / no-go on the RC date.' }),
    E('Deep work block', iso(0, 13), 120, { color: '#4aa8e8', calendar: 'Focus', description: 'No meetings, no chat, phone in another room.' }),
    E('Deep work block', iso(2, 13), 120, { color: '#4aa8e8', calendar: 'Focus' }),
    E('1:1 with Priya', iso(3, 11), 30, { color: '#9b6cf0', calendar: 'Work', location: 'Video call' }),
    E('Gym', iso(0, 18, 30), 60, { color: '#eb5757', calendar: 'Health' }),
    E('Gym', iso(2, 18, 30), 60, { color: '#eb5757', calendar: 'Health' }),
    E('Gym', iso(4, 18, 30), 60, { color: '#eb5757', calendar: 'Health' }),
    E('Dentist', iso(8, 10), 45, { color: '#f2994a', calendar: 'Health', location: 'Harley St Clinic', reminder: 1440 }),
    E('Passport appointment', iso(18, 9, 15), 30, { color: '#f2994a', calendar: 'Personal', location: 'Post office', reminder: 1440 }),
    E('Car service', iso(16, 8, 30), 60, { color: '#8b8f98', calendar: 'Personal', reminder: 1440 }),
    E('Product launch 🚀', iso(21, 9), 480, { color: '#e86cb0', calendar: 'Work', reminder: 4320, description: 'GO TIME.' }),
    E('Weekly review', iso(4, 16), 30, { color: '#4caf7d', calendar: 'Personal', repeat: 'weekly', linkedNoteId: weeklyId }),
    E('Mum\'s birthday', day(25), 0, { allDay: true, color: '#e3c14a', calendar: 'Personal', reminder: 4320 })
  ];

  /* ---------------- reminders ---------------- */
  const R = (title, atISO, o) => Object.assign({
    id: uid('rem'), title, body: '', at: atISO, repeat: null, done: false, snoozedUntil: null,
    priority: 'normal', deepLink: '#/reminders', linkedId: null, created: stamp(0), fired: false
  }, o || {});

  const reminders = [
    R('Dentist appointment', iso(8, 10), { body: 'Harley St Clinic — bring insurance card', priority: 'high', repeat: null }),
    R('Take the recycling out', iso(0, 20), { body: 'Blue bin, collection is early tomorrow' }),
    R('Submit expenses', iso(4, 17), { body: 'Before the month-end cut-off', priority: 'high' }),
    R('Passport appointment', iso(18, 9, 15), { body: 'Post office, 9:15 sharp', priority: 'high' }),
    R('Water the plants', iso(1, 8), { repeat: 'weekly', body: 'Monstera, fern, and the sad ficus' }),
    R('Mum\'s birthday', day(24), { body: 'Buy the card TODAY, not tomorrow', priority: 'high' }),
    R('Review launch checklist', iso(1, 16), { body: 'One final pass before the RC', deepLink: '#/tasks' }),
    R('Stretch break', iso(0, 15, 30), { repeat: 'daily', body: 'Stand up, shoulders back, 2 minutes' })
  ];

  /* ---------------- habits ---------------- */
  const H = (name, emoji, color, o) => {
    const history = {};
    // generate ~50 days of plausible history
    for (let i = 55; i >= 0; i--) {
      const key = day(-i);
      const r = (i * 7919 + name.length * 31) % 100;
      const base = (o && o.rate) || 70;
      if (r < base) history[key] = 1;
    }
    return Object.assign({
      id: uid('hab'), name, emoji, color, icon: emoji, targetPerWeek: 7, unit: 'times',
      cadence: 'daily', active: true, created: stamp(-55), history, note: '',
      reminders: [], order: 0, bestStreak: 0
    }, o || {});
  };

  const habits = [
    H('Morning walk', '🚶', '#4caf7d', { rate: 84, order: 0, note: '20 minutes minimum, no phone.' }),
    H('Read 20 pages', '📖', '#f2994a', { rate: 68, order: 1, targetPerWeek: 5 }),
    H('Deep work 90 min', '🎯', '#7c6cff', { rate: 57, order: 2, targetPerWeek: 5 }),
    H('No phone before 9am', '📵', '#eb5757', { rate: 46, order: 3 }),
    H('Drink 2L water', '💧', '#4aa8e8', { rate: 79, order: 4 }),
    H('Journal', '✍️', '#9b6cf0', { rate: 62, order: 5, targetPerWeek: 5 }),
    H('Meditate', '🧘', '#33b8a3', { rate: 51, order: 6, cadence: 'daily' }),
    H('Stretch / mobility', '🤸', '#e86cb0', { rate: 40, order: 7, targetPerWeek: 4 })
  ];

  /* ---------------- goals ---------------- */
  const goals = [
    { id: uid('goal'), title: 'Ship Pebble v1.0', description: 'Get the product into the hands of 100 real users.',
      category: 'Career', color: '#7c6cff', targetDate: day(21), progress: 58, status: 'on-track',
      created: stamp(-30), archived: false,
      keyResults: [
        { id: uid('kr'), text: 'All P0 and P1 bugs closed', current: 8, target: 10, unit: 'bugs' },
        { id: uid('kr'), text: 'Load test passes at 10k concurrent users', current: 6, target: 10, unit: 'k users' },
        { id: uid('kr'), text: 'Help centre articles published', current: 11, target: 20, unit: 'articles' },
        { id: uid('kr'), text: 'Pre-launch signups', current: 340, target: 500, unit: 'signups' }
      ]},
    { id: uid('goal'), title: 'Read 24 books this year', description: 'Roughly one every two weeks, mixing non-fiction and fiction.',
      category: 'Learning', color: '#f2994a', targetDate: day(110), progress: 62, status: 'on-track',
      created: stamp(-180), archived: false,
      keyResults: [ { id: uid('kr'), text: 'Books finished', current: 15, target: 24, unit: 'books' } ]},
    { id: uid('goal'), title: 'Run a 10k under 55 minutes', description: 'Currently at 61:20. Two interval sessions plus one long run per week.',
      category: 'Health', color: '#eb5757', targetDate: day(75), progress: 34, status: 'at-risk',
      created: stamp(-60), archived: false,
      keyResults: [
        { id: uid('kr'), text: 'Weekly distance', current: 21, target: 32, unit: 'km' },
        { id: uid('kr'), text: '10k time (minutes)', current: 58, target: 55, unit: 'min' }
      ]},
    { id: uid('goal'), title: 'Save an emergency fund', description: 'Six months of expenses, in a separate account, untouched.',
      category: 'Finance', color: '#4caf7d', targetDate: day(220), progress: 71, status: 'on-track',
      created: stamp(-220), archived: false,
      keyResults: [ { id: uid('kr'), text: 'Saved', current: 8500, target: 12000, unit: '$' } ]}
  ];

  /* ---------------- journal ---------------- */
  const journal = [
    { id: uid('j'), date: day(0), mood: 4, text: 'Good morning — the walk actually happened before the email, which is the whole point. Spent two solid hours on the launch checklist and it moved a lot. Afternoon is going to be meetings; need to protect tomorrow morning.',
      tags: [tagId('work')], gratitude: ['The morning was quiet', 'Priya unblocked the load test'], prompts: {}, weather: '☀️', energy: 4, created: stamp(0) },
    { id: uid('j'), date: day(-1), mood: 3, text: 'Flat day. Too much context switching. Noted for the weekly review: if there are more than three meetings before noon, the deep work block has to move to the afternoon instead of being cancelled.',
      tags: [], gratitude: ['Lunch away from the desk'], prompts: {}, weather: '🌧️', energy: 2, created: stamp(-1) },
    { id: uid('j'), date: day(-2), mood: 5, text: 'Beta feedback triage finished and the verdict is genuinely positive. The two complaints are both about onboarding, which is fixable. Slept well.',
      tags: [tagId('work')], gratitude: ['The beta users were honest and kind', 'Eight hours of sleep'], prompts: {}, weather: '⛅', energy: 5, created: stamp(-2) },
    { id: uid('j'), date: day(-3), mood: 2, text: 'Rough. Bad sleep, and I let an annoying email rent space in my head all day. Reminder to self: write it down, then close the tab.',
      tags: [tagId('health')], gratitude: [], prompts: {}, weather: '🌧️', energy: 1, created: stamp(-3) },
    { id: uid('j'), date: day(-4), mood: 4, text: 'Long run in the morning, 14km. Legs felt good. Finished chapter 5 of Deep Work on the train.',
      tags: [tagId('health'), tagId('reading')], gratitude: ['Dry weather for once'], prompts: {}, weather: '☀️', energy: 4, created: stamp(-4) },
    { id: uid('j'), date: day(-6), mood: 4, text: 'Quiet Saturday. Cooked something ambitious and it mostly worked. No screens until 11am.',
      tags: [tagId('personal')], gratitude: ['A whole day with nothing scheduled'], prompts: {}, weather: '⛅', energy: 4, created: stamp(-6) }
  ];

  /* ---------------- pomodoro sessions ---------------- */
  const pomo = [];
  for (let i = 0; i < 24; i++) {
    const off = -Math.floor(i * 1.6);
    const d = new Date(now + off * D);
    d.setHours(9 + (i % 7), (i % 2) * 30, 0, 0);
    pomo.push({
      id: uid('pomo'), mode: 'focus', plannedMinutes: 25, actualMinutes: 25,
      startedAt: d.toISOString(), endedAt: new Date(d.getTime() + 25 * 60000).toISOString(),
      taskId: i % 3 === 0 ? tasks[0].id : null, note: '', completed: true
    });
  }

  /* ---------------- time logs ---------------- */
  const timeLogs = [];
  const logTasks = ['Finish the launch checklist', 'Rerun load test at 10k concurrent', 'Draft the changelog post', 'Beta feedback triage', 'Set up Product Hunt listing'];
  for (let i = 0; i < 18; i++) {
    const off = -Math.floor(i / 2);
    const t = logTasks[i % logTasks.length];
    const tk = tasks.find(x => x.title === t);
    timeLogs.push({
      id: uid('tl'), taskId: tk ? tk.id : null, projectId: tk ? tk.projectId : null,
      description: t, start: iso(off, 9 + (i % 6)), minutes: 30 + (i % 5) * 20,
      billable: i % 3 !== 0, created: stamp(off)
    });
  }

  /* ---------------- bookmarks ---------------- */
  const bookmarks = [
    { id: uid('bm'), title: 'Refactoring UI', url: 'https://refactoringui.com', description: 'Tactics for making interfaces look designed, written for developers.', tags: [tagId('learning'), 'design'], folder: 'Design', status: 'unread', rating: 0, created: stamp(-9), note: '' },
    { id: uid('bm'), title: 'Every — Writing tools & essays', url: 'https://every.to', description: 'A collection of newsletters about work, technology and writing.', tags: [tagId('reading')], folder: 'Reading', status: 'reading', rating: 4, created: stamp(-14), note: '' },
    { id: uid('bm'), title: 'MDN Web Docs', url: 'https://developer.mozilla.org', description: 'The reference for HTML, CSS and JavaScript.', tags: ['reference', 'dev'], folder: 'Dev', status: 'read', rating: 5, created: stamp(-40), note: 'Bookmark bar material.' },
    { id: uid('bm'), title: 'Nielsen Norman Group', url: 'https://www.nngroup.com/articles/', description: 'Evidence-based UX research articles.', tags: ['design', 'ux'], folder: 'Design', status: 'unread', rating: 0, created: stamp(-5), note: '' },
    { id: uid('bm'), title: 'Excalidraw', url: 'https://excalidraw.com', description: 'Hand-drawn style diagrams in the browser.', tags: ['tools'], folder: 'Tools', status: 'read', rating: 5, created: stamp(-22), note: '' },
    { id: uid('bm'), title: 'Spaced repetition — Gwern', url: 'https://gwern.net/spaced-repetition', description: 'Long essay on why spaced repetition works and how to use it.', tags: [tagId('learning')], folder: 'Reading', status: 'unread', rating: 0, created: stamp(-3), note: '' }
  ];

  /* ---------------- contacts ---------------- */
  const contacts = [
    { id: uid('ct'), name: 'Priya Raman', email: 'priya@example.com', phone: '+1 555 0142', company: 'Pebble', role: 'Head of Product',
      tags: ['team'], birthday: day(48), notes: 'Direct, kind, hates vague updates. Prefers a written brief before any meeting.',
      avatar: '', color: '#9b6cf0', lastContact: stamp(-1), social: { linkedin: '', x: '' },
      interactions: [
        { id: uid('in'), date: stamp(-1), type: 'meeting', note: 'Launch planning — agreed the RC date.' },
        { id: uid('in'), date: stamp(-4), type: 'email', note: 'Sent the beta triage summary.' }
      ], nextFollowUp: iso(2) },
    { id: uid('ct'), name: 'Marcus Webb', email: 'marcus@example.com', phone: '', company: 'Pebble', role: 'Staff Engineer',
      tags: ['team'], birthday: '', notes: 'Owns infra. Will push back on anything that smells like premature scaling — usually correctly.',
      avatar: '', color: '#4aa8e8', lastContact: stamp(-2), social: {},
      interactions: [ { id: uid('in'), date: stamp(-2), type: 'meeting', note: 'Load test post-mortem.' } ], nextFollowUp: iso(3) },
    { id: uid('ct'), name: 'Dana Okafor', email: 'dana@example.com', phone: '', company: 'Pebble', role: 'Design Lead',
      tags: ['team'], birthday: day(120), notes: 'Great taste, allergic to design-by-committee.',
      avatar: '', color: '#e86cb0', lastContact: stamp(-6), social: {}, interactions: [], nextFollowUp: null },
    { id: uid('ct'), name: 'Alex Chen', email: 'alex@vendor.co', phone: '+1 555 0199', company: 'Brightline Hosting', role: 'Account manager',
      tags: ['vendor'], birthday: '', notes: 'Renewal is due in Q4 — ask for the multi-year discount.',
      avatar: '', color: '#f2994a', lastContact: stamp(-24), social: {},
      interactions: [ { id: uid('in'), date: stamp(-24), type: 'call', note: 'Discussed scaling tiers.' } ], nextFollowUp: iso(14) },
    { id: uid('ct'), name: 'Sam Torres', email: 'sam@example.com', phone: '', company: '', role: 'Friend',
      tags: ['personal'], birthday: day(200), notes: 'Met at the conference. Into trail running.',
      avatar: '', color: '#4caf7d', lastContact: stamp(-40), social: {}, interactions: [], nextFollowUp: null }
  ];

  /* ---------------- finance ---------------- */
  const accounts = [
    { id: uid('acc'), name: 'Everyday Checking', type: 'checking', balance: 4280.55, currency: 'USD', color: '#4aa8e8', archived: false, institution: 'North Bank' },
    { id: uid('acc'), name: 'Savings / Emergency Fund', type: 'savings', balance: 8500.00, currency: 'USD', color: '#4caf7d', archived: false, institution: 'North Bank' },
    { id: uid('acc'), name: 'Credit Card', type: 'credit', balance: -612.40, currency: 'USD', color: '#eb5757', archived: false, institution: 'Meridian', limit: 5000 },
    { id: uid('acc'), name: 'Investment', type: 'investment', balance: 15230.18, currency: 'USD', color: '#9b6cf0', archived: false, institution: 'Vanguard-ish' }
  ];
  const aid = n => (accounts.find(a => a.name === n) || {}).id;

  const categories = [
    { id: uid('cat'), name: 'Groceries',      type: 'expense', color: '#4caf7d', icon: '🛒', budget: 480, parent: null },
    { id: uid('cat'), name: 'Rent',           type: 'expense', color: '#7c6cff', icon: '🏠', budget: 1450, parent: null },
    { id: uid('cat'), name: 'Transport',      type: 'expense', color: '#4aa8e8', icon: '🚇', budget: 160, parent: null },
    { id: uid('cat'), name: 'Eating out',     type: 'expense', color: '#f2994a', icon: '🍜', budget: 220, parent: null },
    { id: uid('cat'), name: 'Subscriptions',  type: 'expense', color: '#e86cb0', icon: '🔁', budget: 90, parent: null },
    { id: uid('cat'), name: 'Health',         type: 'expense', color: '#eb5757', icon: '💊', budget: 120, parent: null },
    { id: uid('cat'), name: 'Fun',            type: 'expense', color: '#e3c14a', icon: '🎟️', budget: 130, parent: null },
    { id: uid('cat'), name: 'Salary',         type: 'income',  color: '#33b8a3', icon: '💼', budget: 0, parent: null },
    { id: uid('cat'), name: 'Freelance',      type: 'income',  color: '#4caf7d', icon: '🧾', budget: 0, parent: null },
    { id: uid('cat'), name: 'Interest',       type: 'income',  color: '#9b6cf0', icon: '📈', budget: 0, parent: null }
  ];
  const cid = n => (categories.find(c => c.name === n) || {}).id;

  const transactions = [];
  const groceryItems = [['Whole Foods', 84.21], ['Corner market', 22.40], ['Supermarket run', 118.63], ['Farmers market', 31.05], ['Groceries top-up', 47.88]];
  const foodItems = [['Ramen place', 18.50], ['Coffee — flat white', 4.80], ['Lunch with Priya', 26.00], ['Pizza night', 32.40], ['Bakery', 9.25], ['Sushi', 44.00]];
  const subItems = [['Streaming service', 15.99], ['Cloud storage', 2.99], ['Music subscription', 10.99], ['Gym membership', 42.00], ['Domain renewal', 12.00]];
  const transportItems = [['Metro card top-up', 40.00], ['Rideshare', 17.35], ['Train ticket', 28.50], ['Fuel', 55.10]];
  for (let i = 0; i < 60; i++) {
    const off = -Math.floor(i * 1.35);
    const pick = (arr) => arr[(i * 7 + off) % arr.length];
    let set, cat, amt;
    const r = i % 10;
    if (r < 4) { set = pick(groceryItems); cat = 'Groceries'; amt = -set[1]; }
    else if (r < 7) { set = pick(foodItems); cat = 'Eating out'; amt = -set[1]; }
    else if (r === 7) { set = pick(subItems); cat = 'Subscriptions'; amt = -set[1]; }
    else if (r === 8) { set = pick(transportItems); cat = 'Transport'; amt = -set[1]; }
    else { set = ['Physio session', 65.00][(i % 2) * 2]; cat = 'Health'; amt = -65.00; set = ['Physio session']; }
    const acct = cat === 'Groceries' || cat === 'Eating out' ? 'Everyday Checking' : 'Credit Card';
    transactions.push({
      id: uid('tx'), date: day(off), description: set[0], amount: amt, categoryId: cid(cat),
      accountId: aid(acct), type: 'expense', tags: [], note: '', recurring: cat === 'Subscriptions',
      created: stamp(off)
    });
  }
  // income
  for (let m = 0; m < 3; m++) {
    transactions.push({ id: uid('tx'), date: day(-m * 30 - 2), description: 'Salary', amount: 5200, categoryId: cid('Salary'), accountId: aid('Everyday Checking'), type: 'income', tags: [], note: '', recurring: true, created: stamp(-m * 30 - 2) });
  }
  transactions.push({ id: uid('tx'), date: day(-11), description: 'Freelance — landing page', amount: 850, categoryId: cid('Freelance'), accountId: aid('Everyday Checking'), type: 'income', tags: [], note: '', recurring: false, created: stamp(-11) });
  transactions.push({ id: uid('tx'), date: day(-1), description: 'Rent', amount: -1450, categoryId: cid('Rent'), accountId: aid('Everyday Checking'), type: 'expense', tags: [], note: '', recurring: true, created: stamp(-1) });

  const budgets = categories.filter(c => c.type === 'expense').map(c => ({
    id: uid('bg'), categoryId: c.id, amount: c.budget, period: 'monthly'
  }));

  /* ---------------- wiki ---------------- */
  const W = (title, body, o) => Object.assign({
    id: uid('wk'), title, slug: NX.slug(title), body, tags: [], parentId: null, order: 0,
    created: stamp(-20), updated: stamp(-5), views: 0, links: [], public: false, archived: false
  }, o || {});

  const wiki = [
    W('Onboarding', '## First day\n\n1. Read this page top to bottom.\n2. Get access to the repo, the design file, and the analytics dashboard.\n3. Book a 30-minute intro with every person on the team.\n\n## First week\n\n- Ship one tiny change end to end. The point is the pipeline, not the change.\n- Write down every question you cannot answer, then ask them all at once on Friday.\n\n## First month\n\n- Own one small feature completely.\n- Present something at the Friday demo.\n\nSee also: [[Code Review Guide]], [[Team Norms]].', { tags: ['hr', 'guide'] }),
    W('Code Review Guide', '## What a review is for\n\nCatching real problems and spreading knowledge. Not style policing — the linter does that.\n\n## The rules\n\n- **Comment on the code, never the person.** "This will N+1" not "You always N+1".\n- **Say why.** A bare "change this" teaches nothing.\n- **Mark nitpicks as nitpicks.** Prefix with `nit:` so the author knows it is optional.\n- **Approve with a note if it is 90% there.** Do not block on trivia.\n- **Under 400 lines.** Split anything bigger; review quality collapses past that.\n\n## Turnaround\n\nSame working day. A blocked PR is the most expensive thing in the building.\n\nSee also: [[Onboarding]], [[Incident Response]].', { tags: ['engineering'] }),
    W('Incident Response', '## Severity levels\n\n| Level | Meaning | Response |\n|---|---|---|\n| SEV1 | Down for everyone, data at risk | All hands, immediately |\n| SEV2 | Major feature broken | On-call + owner, 30 min |\n| SEV3 | Degraded, workaround exists | Next business day |\n\n## The checklist\n\n1. Declare the severity out loud in #incidents.\n2. Appoint one **incident commander**. They coordinate; they do not debug.\n3. Open a running timeline document and update it as you go.\n4. Mitigate first, understand later. Rolling back is not failure.\n5. Write the post-mortem within 48 hours. Blameless, always.\n\nSee also: [[Code Review Guide]].', { tags: ['engineering', 'ops'] }),
    W('Team Norms', '## Communication\n\n- **Async by default.** If it does not need an answer in 10 minutes, it is a message not a meeting.\n- **No meeting without an agenda.** Declining is allowed and expected.\n- **Camera optional, always.**\n\n## Working hours\n\nCore overlap is 10:00–15:00. Outside that, do what works for you and set your status.\n\n## Disagreement\n\nDisagree in the document, in the open, before the decision. After the decision, commit fully. Re-litigating in private is the one thing that actually breaks teams.\n\nSee also: [[Onboarding]], [[Incident Response]].', { tags: ['hr', 'culture'] }),
    W('Naming Conventions', '## Files\n\n`kebab-case` for files and folders. No spaces, ever.\n\n## Code\n\n- `camelCase` for functions and variables\n- `PascalCase` for classes and components\n- `SCREAMING_SNAKE` for constants\n- Booleans read as questions: `isLoading`, `hasPermission`, `canEdit`\n\n## Branches\n\n`feat/`, `fix/`, `chore/`, `docs/` followed by a slug: `feat/launch-checklist`.\n\n## Commits\n\nImperative mood, 50 characters or less for the subject. "Add retry logic to the sync job" not "Added retry logic".\n\nSee also: [[Code Review Guide]].', { tags: ['engineering'] }),
    W('Product Principles', '## 1. Fewer, better\n\nA product that does five things well beats one that does fifty adequately. Every feature we add is a feature we must maintain, document, and defend.\n\n## 2. Fast is a feature\n\nPerceived speed matters more than actual features. A 100ms response changes how the whole product feels.\n\n## 3. Recoverable beats careful\n\nPeople will make mistakes. Undo, version history, and a trash bin let us be bold in the interface.\n\n## 4. Local first\n\nThe user owns their data. It works offline, it exports cleanly, and there is no lock-in.\n\n## 5. Boring where it counts\n\nInnovate on the thing that matters, be conventional everywhere else. Nobody wants a creative file picker.\n\nSee also: [[Team Norms]].', { tags: ['product'] })
  ];
  // compute wiki backlinks
  wiki.forEach(p => {
    const found = [];
    wiki.forEach(other => {
      if (other.id !== p.id && other.body.includes('[[' + p.title + ']]')) found.push(other.id);
    });
    p.links = found;
  });

  /* ---------------- chat (Discord-style) ---------------- */
  const roles = [
    { id: uid('role'), name: 'Owner',      color: '#e3c14a', permissions: ['admin'], hoist: true, order: 0 },
    { id: uid('role'), name: 'Admin',      color: '#eb5757', permissions: ['manage', 'post'], hoist: true, order: 1 },
    { id: uid('role'), name: 'Engineer',   color: '#4aa8e8', permissions: ['post'], hoist: true, order: 2 },
    { id: uid('role'), name: 'Design',     color: '#e86cb0', permissions: ['post'], hoist: true, order: 3 },
    { id: uid('role'), name: 'Member',     color: '#8b8f98', permissions: ['post'], hoist: false, order: 4 },
    { id: uid('role'), name: 'Bot',        color: '#33b8a3', permissions: ['post'], hoist: false, order: 5 }
  ];
  const rid = n => (roles.find(r => r.name === n) || {}).id;

  const members = [
    { id: uid('u'), name: 'You',        displayName: 'You',    color: '#7c6cff', status: 'online', roleId: rid('Owner'),    bot: false, activity: 'Building Pebble', joined: stamp(-60) },
    { id: uid('u'), name: 'Priya',      displayName: 'Priya',  color: '#9b6cf0', status: 'online', roleId: rid('Admin'),     bot: false, activity: 'In a meeting', joined: stamp(-58) },
    { id: uid('u'), name: 'Marcus',     displayName: 'Marcus', color: '#4aa8e8', status: 'dnd',    roleId: rid('Engineer'),  bot: false, activity: 'Load testing', joined: stamp(-55) },
    { id: uid('u'), name: 'Dana',       displayName: 'Dana',   color: '#e86cb0', status: 'idle',   roleId: rid('Design'),    bot: false, activity: '', joined: stamp(-50) },
    { id: uid('u'), name: 'Sam',        displayName: 'Sam',    color: '#4caf7d', status: 'offline',roleId: rid('Member'),    bot: false, activity: '', joined: stamp(-30) },
    { id: uid('u'), name: 'Lex',        displayName: 'Lex',    color: '#f2994a', status: 'offline',roleId: rid('Member'),    bot: false, activity: '', joined: stamp(-22) },
    { id: uid('u'), name: 'NexaBot',    displayName: 'NexaBot',color: '#33b8a3', status: 'online', roleId: rid('Bot'),       bot: true,  activity: 'Watching the workspace', joined: stamp(-60) }
  ];
  const mid = n => (members.find(m => m.name === n) || {}).id;

  const server = {
    id: uid('srv'), name: 'Pebble HQ', icon: '🚀', color: '#7c6cff', ownerId: mid('You'),
    description: 'The team workspace', created: stamp(-60), memberIds: members.map(m => m.id)
  };
  const dmServer = {
    id: uid('srv'), name: 'Direct Messages', icon: '✉️', color: '#8b8f98', ownerId: mid('You'),
    description: 'Private conversations', created: stamp(-60), isDM: true, memberIds: members.map(m => m.id)
  };

  const CH = (name, o) => Object.assign({
    id: uid('ch'), serverId: server.id, name, type: 'text', topic: '', category: 'General',
    order: 0, private: false, slowMode: 0, memberIds: [], created: stamp(-60), lastRead: 0
  }, o || {});

  const channels = [
    CH('announcements', { topic: 'Company-wide updates. Read-only for most.', category: 'Information', order: 0 }),
    CH('welcome', { topic: 'New people start here.', category: 'Information', order: 1 }),
    CH('general', { topic: 'Everything and nothing.', category: 'Team', order: 2 }),
    CH('product', { topic: 'Roadmap, specs, scope arguments.', category: 'Team', order: 3 }),
    CH('design', { topic: 'Mocks, critiques, and font discourse.', category: 'Team', order: 4 }),
    CH('engineering', { topic: 'Builds, bugs, and deploy logs.', category: 'Team', order: 5 }),
    CH('launch-war-room', { topic: 'v1.0 launch coordination. High signal only.', category: 'Launch', order: 6, private: false }),
    CH('random', { topic: 'Memes, music, and mildly concerning snacks.', category: 'Social', order: 7 }),
    CH('wins', { topic: 'Post your good news here.', category: 'Social', order: 8 }),
    CH('Priya', { serverId: dmServer.id, type: 'dm', name: 'Priya', topic: '', category: 'DM', order: 0, memberIds: [mid('Priya')] }),
    CH('Marcus', { serverId: dmServer.id, type: 'dm', name: 'Marcus', topic: '', category: 'DM', order: 1, memberIds: [mid('Marcus')] })
  ];
  const chId = n => (channels.find(c => c.name === n) || {}).id;

  const M = (authorName, channelId, text, minsAgo, o) => Object.assign({
    id: uid('msg'), authorId: mid(authorName), channelId, text,
    created: new Date(now - minsAgo * 60000).toISOString(),
    reactions: [], attachments: [], replyTo: null, threadId: null, edited: false, pinned: false, system: false
  }, o || {});

  const messages = [
    M('Priya', chId('announcements'), '**Launch date is locked: three weeks from today.** No slips, no scope creep. If something threatens the date, we cut scope — we do not move the date.', 60 * 26),
    M('Priya', chId('announcements'), 'Full plan is in the workspace: `Notes → Product Launch Plan`.', 60 * 26 + 1),
    M('Marcus', chId('announcements'), '👍', 60 * 25),
    M('Dana', chId('welcome'), 'Hey everyone! Excited to be here. Ping me for anything design-related.', 60 * 50),
    M('Sam', chId('welcome'), 'Welcome Dana! 🎉', 60 * 49),
    M('Marcus', chId('general'), 'Morning. Load test ran overnight — we held 6.4k concurrent before p99 latency went past 800ms.', 60 * 4),
    M('Priya', chId('general'), '6.4k is not bad. What broke first?', 60 * 3.7),
    M('Marcus', chId('general'), 'Database connection pool. It is a config problem, not an architecture problem. I can get us to 10k by raising the pool ceiling and adding read replicas.', 60 * 3.5),
    M('Marcus', chId('general'), 'Roughly two days of work. I would rather spend them now than at 3am on launch day.', 60 * 3.4),
    M('You', chId('general'), 'Agreed — do it. That is the single highest-value thing you could work on this week.', 60 * 3.2),
    M('Priya', chId('general'), '+1. I will move the onboarding copy work to next week.', 60 * 3),
    M('Dana', chId('design'), 'New empty states are up for review. I went with illustrations instead of screenshots — they scale better across themes.', 60 * 8),
    M('Priya', chId('design'), 'These are lovely. One note: the "no tasks yet" one is doing a lot of work, can we shorten the copy?', 60 * 7),
    M('Dana', chId('design'), 'Done. Cut it from 22 words to 9.', 60 * 6.5),
    M('Marcus', chId('engineering'), '```bash\nnpm run build\n# 412 modules transformed.\n# dist/  1.2 MB │ gzip: 318 kB\n# built in 3.42s\n```', 60 * 2),
    M('Marcus', chId('engineering'), 'Bundle is down 18% after splitting the calendar into its own chunk.', 60 * 2 + 1),
    M('You', chId('engineering'), 'Nice. Anything else cheap we can shave before we freeze?', 60 * 1.8),
    M('Marcus', chId('engineering'), 'The icon font. We are shipping 1400 glyphs and using about 60. Swapping to inline SVG kills ~90kB.', 60 * 1.5),
    M('Priya', chId('launch-war-room'), 'War room checklist:\n• Landing page — done\n• Launch video — in progress\n• Press list — 40 contacts, 12 confirmed\n• Support docs — 11 of 20', 60 * 1.2),
    M('Priya', chId('launch-war-room'), 'Docs are the risk. Who has bandwidth?', 60 * 1.1),
    M('Dana', chId('launch-war-room'), 'I can take the visual ones — screenshots and GIFs are most of the work anyway.', 60 * 0.9),
    M('Sam', chId('random'), 'found a bug in the wild: my cat sat on the keyboard and somehow archived every note', 60 * 20),
    M('Lex', chId('random'), 'sounds like a feature request for a "cat mode" 🐱', 60 * 19),
    M('Marcus', chId('random'), 'we should genuinely add a confirm-on-bulk-archive dialog though', 60 * 18),
    M('Priya', chId('wins'), 'Beta feedback closed. **92% said they would recommend it.** Up from 78% in the first round. 🎉', 60 * 30),
    M('Dana', chId('wins'), 'That is a huge jump. The onboarding rework did it.', 60 * 29),
    M('You', chId('wins'), 'Team effort. Genuinely proud of this one.', 60 * 28),
    M('Priya', chId('Priya'), 'Got five minutes? Want to sanity-check the launch order of operations.', 60 * 5),
    M('You', chId('Priya'), 'Yep — after my 2pm.', 60 * 4.5),
    M('Marcus', chId('Marcus'), 'FYI I am going to be heads-down on the replica work tomorrow, probably unreachable until lunch.', 60 * 55),
    M('NexaBot', chId('general'), '📋 **Daily digest** — 4 tasks due today, 2 overdue, 1 reminder firing at 20:00. Habit completion yesterday: 6/8.', 60 * 0.6, { system: true })
  ];

  // reactions
  const addReact = (msgIdx, emoji, names) => {
    messages[msgIdx].reactions = names.map(n => ({ emoji, userId: mid(n) }));
  };
  addReact(5, '🔥', ['You', 'Priya', 'Dana']);
  addReact(9, '👍', ['Marcus', 'Priya']);
  addReact(24, '🎉', ['You', 'Marcus', 'Dana', 'Sam', 'Lex']);
  addReact(21, '😂', ['Priya', 'Dana', 'You']);
  // a reply
  messages[10].replyTo = messages[9].id;

  /* ---------------- inbox ---------------- */
  const inbox = [
    { id: uid('ib'), type: 'reminder', title: 'Dentist appointment in 8 days', body: 'Harley St Clinic — bring your insurance card', icon: 'bell',
      created: stamp(0), read: false, deepLink: '#/reminders', priority: 'high' },
    { id: uid('ib'), type: 'task', title: '1 task overdue', body: '"Book the dentist appointment" was due yesterday', icon: 'task',
      created: stamp(0), read: false, deepLink: '#/tasks', priority: 'high' },
    { id: uid('ib'), type: 'chat', title: 'Marcus in #engineering', body: 'The icon font. We are shipping 1400 glyphs and using about 60…', icon: 'chat',
      created: stamp(0), read: false, deepLink: '#/chat', priority: 'normal' },
    { id: uid('ib'), type: 'habit', title: 'Habit streak at risk', body: 'You have not logged "Deep work 90 min" today — 9 day streak', icon: 'flame',
      created: stamp(0), read: false, deepLink: '#/habits', priority: 'normal' },
    { id: uid('ib'), type: 'ai', title: 'AI weekly insight', body: 'You completed 71% of planned focus time this week, down from 84%.', icon: 'ai',
      created: stamp(-1), read: true, deepLink: '#/ai', priority: 'low' },
    { id: uid('ib'), type: 'calendar', title: 'Launch planning tomorrow at 14:00', body: 'Room 2B with Priya, Marcus and Dana', icon: 'calendar',
      created: stamp(-1), read: true, deepLink: '#/calendar', priority: 'normal' },
    { id: uid('ib'), type: 'finance', title: 'Budget 84% used', body: 'Eating out is at $184 of your $220 monthly budget', icon: 'money',
      created: stamp(-2), read: true, deepLink: '#/finance', priority: 'low' }
  ];

  /* ---------------- templates ---------------- */
  const templates = [
    { id: uid('tpl'), name: 'Meeting notes', icon: '🗓️', category: 'Work', description: 'Agenda, decisions, action items',
      blocks: [
        { type: 'h2', text: 'Attendees' }, { type: 'text', text: '' },
        { type: 'h2', text: 'Agenda' }, { type: 'number', text: '' },
        { type: 'h2', text: 'Notes' }, { type: 'bullet', text: '' },
        { type: 'h2', text: 'Decisions' }, { type: 'check', text: '' },
        { type: 'h2', text: 'Action items' }, { type: 'todo', text: '', done: false }, { type: 'todo', text: '', done: false }
      ]},
    { id: uid('tpl'), name: 'Weekly review', icon: '🔁', category: 'Personal', description: 'Reflect, plan, tidy',
      blocks: [
        { type: 'h2', text: 'Wins this week' }, { type: 'bullet', text: '' },
        { type: 'h2', text: 'What slipped' }, { type: 'bullet', text: '' },
        { type: 'h2', text: 'Energy: what gave / what drained' }, { type: 'bullet', text: '' },
        { type: 'h2', text: 'Top 3 outcomes for next week' }, { type: 'number', text: '' }, { type: 'number', text: '' }, { type: 'number', text: '' }
      ]},
    { id: uid('tpl'), name: 'Daily note', icon: '📅', category: 'Personal', description: 'One page per day',
      blocks: [
        { type: 'h2', text: 'Top 3 for today' }, { type: 'todo', text: '', done: false }, { type: 'todo', text: '', done: false }, { type: 'todo', text: '', done: false },
        { type: 'h2', text: 'Log' }, { type: 'text', text: '' },
        { type: 'h2', text: 'Grateful for' }, { type: 'bullet', text: '' }
      ]},
    { id: uid('tpl'), name: 'Project brief', icon: '🚀', category: 'Work', description: 'Scope a project before starting',
      blocks: [
        { type: 'h2', text: 'Problem' }, { type: 'text', text: 'What is broken and for whom?' },
        { type: 'h2', text: 'Goal' }, { type: 'text', text: 'What does success look like? Make it measurable.' },
        { type: 'h2', text: 'Non-goals' }, { type: 'bullet', text: 'Explicitly out of scope.' },
        { type: 'h2', text: 'Approach' }, { type: 'text', text: '' },
        { type: 'h2', text: 'Risks' }, { type: 'table', rows: [['Risk', 'Likelihood', 'Mitigation'], ['', '', '']] },
        { type: 'h2', text: 'Timeline' }, { type: 'table', rows: [['Milestone', 'Date', 'Owner'], ['', '', '']] }
      ]},
    { id: uid('tpl'), name: 'Book notes', icon: '📚', category: 'Reading', description: 'Capture what stuck',
      blocks: [
        { type: 'h2', text: 'One-line summary' }, { type: 'quote', text: '' },
        { type: 'h2', text: 'Rating' }, { type: 'text', text: '★★★☆☆' },
        { type: 'h2', text: 'Best ideas' }, { type: 'number', text: '' },
        { type: 'h2', text: 'What I will actually do differently' }, { type: 'todo', text: '', done: false }
      ]},
    { id: uid('tpl'), name: 'Decision log', icon: '⚖️', category: 'Work', description: 'Record why you chose what you chose',
      blocks: [
        { type: 'h2', text: 'Context' }, { type: 'text', text: '' },
        { type: 'h2', text: 'Options considered' }, { type: 'table', rows: [['Option', 'Pros', 'Cons'], ['', '', '']] },
        { type: 'h2', text: 'Decision' }, { type: 'callout', emoji: '✅', variant: 'success', text: '' },
        { type: 'h2', text: 'What would make us revisit this?' }, { type: 'bullet', text: '' }
      ]},
    { id: uid('tpl'), name: 'Bug report', icon: '🐛', category: 'Engineering', description: 'Reproducible issue writeup',
      blocks: [
        { type: 'h2', text: 'Summary' }, { type: 'text', text: '' },
        { type: 'h2', text: 'Steps to reproduce' }, { type: 'number', text: '' },
        { type: 'h2', text: 'Expected' }, { type: 'text', text: '' },
        { type: 'h2', text: 'Actual' }, { type: 'text', text: '' },
        { type: 'h2', text: 'Environment' }, { type: 'code', text: 'OS:\nVersion:\nBrowser:' }
      ]},
    { id: uid('tpl'), name: 'Empty page', icon: '📄', category: 'Basic', description: 'A blank note', blocks: [{ type: 'text', text: '' }] }
  ];

  /* ---------------- return the full workspace ---------------- */
  return {
    version: 1,
    createdAt: new Date(now).toISOString(),
    meta: { workspaceName: 'My Workspace', owner: 'You', onboardingDone: true },
    notes, tasks, projects, tags, events, reminders, habits, goals, journal,
    pomodoro: pomo, timeLogs, bookmarks, contacts,
    accounts, categories, transactions, budgets,
    wiki,
    chat: { servers: [server, dmServer], channels, messages, members, roles },
    inbox, templates,
    activity: [
      { id: uid('act'), type: 'note.edit', text: 'Edited “Product Launch Plan”', at: stamp(0), icon: 'note' },
      { id: uid('act'), type: 'task.done', text: 'Completed “Beta feedback triage”', at: stamp(-2), icon: 'task' },
      { id: uid('act'), type: 'habit.done', text: 'Logged “Morning walk”', at: stamp(-2), icon: 'flame' },
      { id: uid('act'), type: 'note.create', text: 'Created “Ideas Parking Lot”', at: stamp(-9), icon: 'note' },
      { id: uid('act'), type: 'goal.update', text: 'Updated “Ship Pebble v1.0” to 58%', at: stamp(-3), icon: 'goal' }
    ],
    trash: []
  };
};
