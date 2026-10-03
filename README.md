# PebbleX

**One calm workspace.** A local-first desktop app for notes, tasks, time
tracking and focus — plus the website, admin panel and browser extension
around it.

> Everything in PebbleX works with the network unplugged. Cloud is an
> opt-in add-on, never a dependency.

---

## Quick start

```bash
npm install
npm run build          # bundles renderer + writes dist/web/index.html
npm run tauri:dev      # desktop app (Tauri 2)
npm run tauri:build    # installer + portable binaries
```

Requires Node 20+, Rust stable, and a Windows toolchain for the desktop
build (the app is Windows-first; the renderer and website are not).

---

## What it does

| Module | What it is |
|---|---|
| **Notes** | A real markdown vault on disk (`Documents/PebbleX Notes`). Wiki links, backlinks, note history, SM-2 spaced repetition. |
| **Tasks** | Kanban board, priority, projects, planning view. |
| **Timeless** | Automatic per-app time tracking, classified productive / neutral / distracting. Local only. |
| **Focus** | Pomodoro, ambient sound, focus shield, live session history. |
| **Arcade** | 17 mini-games, a seeded daily challenge, 16 achievements. |
| **Chat / Pel AI** | Discord-shaped chat, plus keyless AI. |
| **Widget** | Always-on-top floating window with a compact mode. |
| **Rewards** | Points earned by using the app, spent on themes, games and cosmetics. |
| **Apps & features** | Every module can be switched off individually. Offline mode blocks all network calls. |
| **System** | Real display brightness and system volume on Windows. |

---

## Architecture

Three deployable pieces plus a cloud backend.

```
PebbleX repo
├── renderer/            vanilla JS + hand-rolled DOM builder (no framework)
│   ├── js/00-core.js      store (localStorage + disk mirror), event bus, router
│   ├── js/11-shell.js     app shell, nav, theme engine
│   ├── js/45-points.js    rewards ledger  (additive)
│   ├── js/49-store.js     entitlements + theme/game gates
│   ├── js/52-modules.js   module registry, route guard, offline mode
│   ├── js/53-apps.js      app manager, long-press, system panel
│   └── css/               design tokens + 13 themes
├── src-tauri/           Rust: Tauri commands, Win32 integration
│   ├── src/assets.rs      image validation, EXIF strip, derivatives
│   ├── src/sysctl.rs      brightness, volume, battery, data locations
│   └── src/ext_bridge.rs  local HTTP bridge for the extension + MCP
├── cloud/pebble-media-api/   Cloudflare Worker + R2 (images)
├── extension/           Chrome MV3 extension (local bridge)
└── Website/             React + Vite marketing site, web app, admin panel
    └── backend/supabase/  SQL migrations
```

### Two rules that are easy to break

**1. Never base64 an image into `NX.store`.**
`NX.store.set()` serialises the **entire workspace** and mirrors it to disk.
Image bytes live on disk (or in R2); only metadata goes in the store.

**2. Never write to the store from a `setInterval` or `requestAnimationFrame`.**
The mirror rewrites the whole document on a 500 ms debounce. A hot loop
writing every tick is what caused the `AppHangB1` UI freeze. Coalesce
writes instead — see `scheduleFlush()` in `45-points.js`.

---

## Storage

Everything is local-first, in `<AppData>/pebble/`:

| Path | Contents |
|---|---|
| `workspace.json` | the whole workspace document |
| `settings.json` | small native-readable settings |
| `assets/` | uploaded images + derivatives (32/64/128/512) |
| `icons/` | extracted Windows app icons |
| `crashes/` | panic logs |
| `.trash/` | soft-deleted items (recoverable) |
| `league.json` | shared leaderboard file |
| `Documents/PebbleX Notes/` | your real `.md` vault |

**Delete an asset and it goes to `.trash`, not the Recycle Bin.**

---

## Testing

```bash
npm test              # 109 renderer tests (rewards + apps)
npm run test:rewards  # 65 — points caps, unlocks, game/theme gates
npm run test:apps     # 44 — module registry, route guard, offline mode
npm run test:rust     # Rust unit tests (see caveat below)
```

### ⚠️ Known toolchain issue

On some Windows setups `cargo test` and `cargo build --release` crash inside
third-party crates (`windows`, `time`, `serde_json`) with
`STATUS_STACK_BUFFER_OVERRUN`. This is **not** a PebbleX bug — it reproduces
with all local changes stashed. Workarounds: use the
`x86_64-pc-windows-msvc` toolchain, upgrade rustc, or build on CI.

`cargo check` works regardless, because it skips codegen.

---

## Cloud

| Piece | Purpose |
|---|---|
| Cloudflare R2 (`pebble-media`) | user images. Egress is free and unlimited. |
| Worker `pebble-media-api` | upload / serve / delete, bearer-token auth. |
| Supabase | auth, workspace sync, admin tools. |

The Worker stores **fixed derivatives** (32/64/128/512) generated
client-side. This is deliberate: Cloudflare Images Free allows only 5,000
unique transformations/month before failing with error `9422`, which an
avatar-heavy app would hit at ~1,600 users. Pre-generated immutable objects
mean zero transformation requests.

**Never commit secrets.** `.pebble-media-token`, `.env*` and
`service-account*.json` are gitignored. The Supabase publishable key is
safe in client code; the secret key and JWT signing keys are not.

---

## The Website

```bash
cd Website
npm install
npm run dev
npm run build
```

Routes: `/` marketing, `/download`, `/docs`, `/changelog`, and
`/app` · `/login` · `/signup` · `/admin` for the workspace.

Copy `.env.example` to `.env` and fill in the public keys. Apply the SQL
migrations in `backend/supabase/` in order (001 → 004).

---

## Design

`DESIGN.md` is the source of truth for the visual language: tokens, type
scale, components, the 13 themes, and the rules for adding new UI. Read it
before touching CSS.

The one principle that constrains everything:

> **A theme swaps token *values* only — never layout, radius or spacing.**
> New UI must render correctly in all themes without a per-theme override.

---

## Licence

MIT.