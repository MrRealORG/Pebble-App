# Pebble

> formerly NexaDesk — renamed in v3 because "pebble" is calmer than "desk".

**An all-in-one local-first workspace.** Notes, wiki, tasks, kanban, calendar, reminders, habits, goals, journal, focus timer, time tracking, finance, contacts, bookmarks, Discord-style team chat, a unified inbox, and an AI assistant — in one desktop app.

Built with zero runtime dependencies. No account, no server, no telemetry. Everything lives on your machine.

---

## Quick start

### Option A — Run the web build right now (nothing to install)

Open **`dist/web/index.html`** in any browser. It is a single self-contained file with all CSS and JS inlined.

Your data is saved in that browser's `localStorage`. Use **Settings → Data & backup** to export a JSON backup you can restore anywhere (including the desktop app).

### Option B — Run the desktop app

You need [Node.js 18+](https://nodejs.org).

```bash
npm install      # downloads Electron (~110 MB)
npm start        # builds the bundle and launches the app
```

The desktop build adds: system tray, **native notifications that fire while the window is hidden**, global shortcuts that work when Pebble is not focused, real file dialogs, window geometry memory, and a JSON data file in your OS user-data folder instead of localStorage.

### Option C — Build installers for Windows / macOS / Linux

```bash
npm run dist:win     # NSIS installer + portable .exe
npm run dist:mac     # .dmg for Intel and Apple Silicon
npm run dist:linux   # AppImage + .deb
```

Or double-click the ready-made scripts in `dist/desktop/`:
`build-windows.bat` · `build-mac.sh` · `build-linux.sh`

Output lands in `release/`.

> **Prebuilt Linux runtime:** `dist/desktop/Pebble-linux-x64/` is a complete, ready-to-run app — just `./run.sh`. It needs the usual Electron GUI libraries (`libgtk-3-0 libnss3 libasound2 libgbm1` on Debian/Ubuntu).

---

## New in v3.0 — the simple update

- **Renamed to Pebble**, with 40 hand-drawn SVG glyphs replacing every UI emoji and geometric SVG avatars
- **Easy Mode by default**: five buttons in the rail and a HOME screen that shows you ONE thing to do
- **Skill Wallet**: export/import your whole skill+prompt collection as one `.wallet` file; paste-install; drag-drop anywhere; server sync
- **Desktop widget island**: a frameless always-on-top pill on your screen with timer, alerts and XP
- **Tauri + Rust** desktop shell (`src-tauri/`) alongside Electron — same bundle, atomic Rust persistence
- Ambient sounds, Zen Write, Scratchpad, Eisenhower matrix, circadian themes, streak freezes, SVG share cards, six new themes

## New in v2.0

- **Dynamic Island** — an animated pill at the top with your timer, alerts, XP and shortcuts; click to expand
- **AI Copilot sidebar** (`Ctrl+Shift+C`) — watches what you do, suggests actions, **executes commands**, and talks (voice in via Web Speech / Windows ASR, voice out via TTS)
- **Game layer** — XP, levels, ranks, daily quests, 30 achievements, and a **Shop** where points buy themes, avatars, frames and titles
- **The commitment** — promise daily minutes; miss them and the app locks until you work or watch a sponsor ad (placeholders wired for your real ad SDK)
- **Prompt Manager** and **Skill Vault** — save prompts with `{{variables}}`; drag-drop `.skill` / `.md` / `.txt` / `.zip` skills anywhere
- **Simple Mode**, Theme Studio, custom CSS, motion/blur/saturation controls — unlimited customisation
- **Onboarding wizard**, profiles with passcode login, and a **real sync server** (`node tools/server.js`)
- **Splash v2** and an **updater** with staged desktop updates

## First five things to try

| | |
|---|---|
| **`Ctrl/⌘ + K`** | Command palette. Jumps to any note, task, message or command. Press `Tab` inside it to cycle content-type filters. |
| **`Ctrl/⌘ + Shift + N`** | Quick capture. Type `Email Sam tomorrow 3pm !high #work` and it parses the date, priority and tag automatically. |
| **Type `/` in a note** | Block menu — 24 block types including toggles, callouts, tables, code, equations, live task lists and stat cards. |
| **Type `[[` in a note** | Wiki-link autocomplete. Creates backlinks and feeds the knowledge graph. If the page doesn't exist, `Enter` creates it. |
| **AI → Tools** | Plan my day, weekly review, task extraction, flashcards, text analysis, topic clustering — all work offline. |

---

## Modules

| Module | What's in it |
|---|---|
| **Dashboard** | Greeting, live stat tiles, today's tasks, AI-ranked "do these next", schedule, habits, quick actions, insights, momentum, activity feed |
| **Notes** | Block editor, nested page tree with drag-to-reparent, properties (9 types), backlinks + unlinked mentions, database/table view with grouping, markdown source view, version history, 8 templates, cover images, outline, readability & sentiment analysis |
| **Tasks** | Smart view (overdue / today / quick wins / blocked), list, **kanban with drag-and-drop**, table, month calendar. Subtasks, checklists, recurrence, estimates, bulk actions, AI priority scoring, "Plan my day" time-blocking |
| **Calendar** | Month / week / day / agenda / **free-time finder**. Drag events to reschedule, click a slot to create, recurring events, `.ics` import & export, per-calendar visibility toggles |
| **Reminders** | Native OS notifications (fire from the tray while hidden), snooze presets, repeating rules, one-click convert to task or event |
| **Habits** | Daily / weekday / weekly cadence, streaks, contribution heatmap, per-habit 26-week history, day-of-week analysis, 6-month trend, backfill, auto-reminders |
| **Goals** | OKRs with key results, auto-computed progress, pace tracking (ahead / on-track / behind / overdue), coaching prompts, convert key results to tasks |
| **Journal** | Daily entries, 5-point mood + energy + weather, gratitude, rotating prompts, timeline, 4-month mood calendar, word-frequency analysis, AI reflection |
| **Focus** | Pomodoro with configurable phases, task linking, session log, 14-day chart, chime, auto-start breaks, `Space` to start/pause |
| **Time** | Running timer that survives reloads, per-task tracking, manual logs, billable flag, reports by project / billability / top time sinks |
| **Finance** | Accounts, transactions, categories, monthly budgets with over-limit alerts, donut + bar charts, recurring-charge detection, net worth, 12-month trend |
| **Contacts** | Personal CRM — interaction history, follow-up scheduling, neglected-contact detection (60+ days), birthday tracking, "mentioned in notes" cross-links |
| **Bookmarks** | Grid/list, folders, reading status, ratings, browser-HTML import, Netscape-format export, AI note generation from a link |
| **Wiki** | Markdown pages, `[[links]]`, backlinks, broken-link checker, **force-directed knowledge graph** (drag, zoom, hover-highlight), alphabetical index, orphan finder with "find a home" suggestions |
| **Chat** | Discord-style: servers, categorised channels, DMs, threads-by-reply, roles & permissions, presence, @-mentions with autocomplete, reactions, pinned messages, typing indicators, simulated members, AI bot, channel summarisation, markdown export |
| **Inbox** | Every notification from every module in one place, with priority and deep links |
| **AI** | Chat over your workspace, insights, 12 tools, daily briefing. Offline engine always works; add an API key for full LLM power |
| **Search** | BM25-style ranked full-text search across 13 content types with type filters, snippets, highlighting and a generated short answer |
| **Settings** | Appearance, AI, notifications, projects, tags, templates, finance setup, data & backup, shortcuts, trash, about |

Full inventory: **[FEATURES.md](FEATURES.md)**

---

## The AI, honestly explained

Pebble has **two** AI layers.

**1. The offline engine** — always on, no key, no network. Written from scratch:

- BM25-style ranked search with IDF weighting and recency boost
- Retrieval-based Q&A that quotes your actual notes and cites sources
- Extractive summarisation (sentence scoring with lead/conclusion bias)
- Natural-language date parsing — `"tomorrow 3pm"`, `"next friday"`, `"in 2 hours"`, `"12 March"`
- Quick-capture parsing — `"Email Sam tomorrow 3pm !high #work @Personal"`
- Task priority scoring (due date × priority × status × checklist progress × effort)
- Action-item extraction with owner and due-date detection
- Readability (Flesch reading ease + grade level), sentiment with negation handling
- SM-2 spaced-repetition scheduling for flashcards
- Keyword extraction, tag suggestion against your existing vocabulary, topic clustering
- Related-note discovery, generated weekly review and daily digest

**2. Optional real LLM** — add a key in **Settings → AI**:

OpenAI · Anthropic · Gemini · Groq · OpenRouter · any OpenAI-compatible endpoint (Ollama, LM Studio)

Every feature tries the API first and **falls back to the offline engine automatically**, so nothing ever breaks because a key is missing or a request fails. Your key is stored in your local workspace file and is only ever sent to the provider you chose.

---

## Project layout

```
Pebble/
├── electron/
│   ├── main.js            window, tray, global shortcuts, reminder scheduler, IPC
│   └── preload.js         context-isolated bridge (window.nex)
├── renderer/
│   ├── index.html         app shell: rail, sidebar, topbar, palette, quick capture
│   ├── css/               5 files → bundle.css   (tokens, boot, components, notes, modules)
│   └── js/                22 files → bundle.js
│       ├── 00-utils.js          DOM, formatting, date math, 90 icons
│       ├── 05-seed.js           starter workspace content
│       ├── 10-store.js          data layer, CRUD, persistence, selectors, recurrence
│       ├── 15-ui.js             toasts, modals, forms, menus, emoji picker, charts
│       ├── 20-ai-engine.js      the offline language engine
│       ├── 25-ai-api.js         LLM providers + context assembly
│       ├── 28-md.js             blocks ↔ markdown ↔ HTML ↔ CSV
│       ├── 30-router.js         module registry + hash routing
│       ├── 35-shell.js          chrome, command palette, quick capture, shortcuts
│       ├── 38-components.js     shared task/event/habit widgets
│       └── 40–70                the 19 modules
├── scripts/
│   ├── build.js           concatenates CSS + JS, emits the standalone web app
│   ├── make_icons.py      generates every icon size from pure Pillow
│   ├── package-desktop.js builds app.asar + ready-to-run runtime + build scripts
│   └── smoke-test.js      105-check runtime test in jsdom
├── assets/icons/          PNG 16→1024, tray icon, SVG master
└── dist/
    ├── web/index.html     ← open this to run immediately
    ├── Pebble-web.zip
    └── desktop/           app.asar, build scripts, Pebble-linux-x64/
```

No framework, no bundler at runtime, no build step needed to read the code. `npm run build` is plain Node string concatenation.

---

## Development

```bash
npm run build     # regenerate bundles + web app
npm start         # build and launch Electron
npm run web       # build and serve dist/web on :8080
npm test          # 105-check smoke test in jsdom
```

Edit the files in `renderer/css/` and `renderer/js/` — never `bundle.*`, those are generated.

---

## Where your data lives

| Build | Location |
|---|---|
| Desktop | `<userData>/nexadesk-data/workspace.json` (+ a localStorage mirror) |
| Browser | `localStorage` for that file/origin |

Find the exact path in **Settings → About**. Export a backup any time from **Settings → Data & backup** — ten export formats are available.

---

## Known limits

- **Unsigned binaries.** macOS Gatekeeper and Windows SmartScreen will warn. Right-click → Open, or sign with your own certificate.
- **Cross-compiled builds can't be smoke-tested here.** They are verified by binary format, not execution.
- **Attachments are stored as data URLs**, so very large images grow your workspace file. A warning appears above 6 MB.
- **Chat is single-machine.** Members other than you are simulated locally — there is no networking layer. The data model is server-shaped so a real backend could be dropped in.
- **Browser build reminders** need the tab open. The desktop build polls from the main process and fires from the tray.

---

## License

MIT.
