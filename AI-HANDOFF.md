# AI HANDOFF — what changed, and why

> For an AI agent picking this repository up. Read this before editing.
> Everything below was run and verified unless marked **UNVERIFIED**.
> Nothing is committed. The working tree is dirty on purpose.

---

## 1. Repo shape

```
PebbleX/
├── renderer/          vanilla JS + hand-rolled DOM builder. NO framework.
│   ├── js/00-core.js    store, event bus, router, icons, brand logos
│   ├── js/45-points.js  rewards ledger
│   ├── js/49-store.js   entitlements + theme/game gates
│   ├── js/52-modules.js module registry, route guard, offline mode
│   ├── js/53-apps.js    app manager, long-press, System panel
│   ├── js/54-google-sync.js  Google Tasks + Drive
│   └── css/00..16       tokens, 13 themes, per-subsystem styles
├── src-tauri/         Rust: Tauri commands, Win32
│   ├── src/assets.rs    image validation, EXIF strip, derivatives
│   ├── src/sysctl.rs    brightness, volume, battery, data locations
│   └── src/ext_bridge.rs  local HTTP bridge + MCP
├── cloud/pebble-media-api/   Cloudflare Worker + R2 (images)
├── Website/           Vite + React: marketing site, web app, admin panel
└── scripts/           build + 6 test suites
```

Build: `npm run build` (renderer) · `npm run tauri:build` (desktop) ·
`cd Website && npm run build` (site).

---

## 2. Two rules that break the app if you ignore them

**1. Never base64 an image into `NX.store`.**
`NX.store.set()` serialises the **entire workspace** and mirrors it to
`<AppData>/pebble/workspace.json`. Image bytes live on disk or in R2. Only
metadata goes in the store.

**2. Never write to the store from `setInterval` / `requestAnimationFrame`.**
The mirror rewrites the whole document on a 500 ms debounce. A hot loop
writing every tick caused the `AppHangB1` freeze. Coalesce writes — see
`scheduleFlush()` in `45-points.js`.

---

## 3. Files created by this work

| File | Purpose |
|---|---|
| `README.md` | Quick start, architecture, storage map, testing |
| `DESIGN.md` §15–20 | Rewards, apps/modules, images, system controls, third-party sync, website |
| `renderer/js/45-points.js` | Ledger, earn rules, daily caps, levels |
| `renderer/js/49-store.js` | Entitlements, theme + game gates, Store route |
| `renderer/js/50-leaderboard.js` | Personal / league / global boards |
| `renderer/js/51-media-library.js` | Image picker, gallery, R2 sync |
| `renderer/js/52-modules.js` | Module registry, route guard, offline mode |
| `renderer/js/53-apps.js` | App tiles, long-press, System panel |
| `renderer/js/54-google-sync.js` | Google Tasks two-way + Drive backup |
| `renderer/css/15-rewards.css` | Points HUD, store, leaderboard |
| `renderer/css/16-apps.css` | App grid, sliders, Google panel, smooth sidebar |
| `src-tauri/src/assets.rs` | Image validation, EXIF strip, derivatives |
| `src-tauri/src/sysctl.rs` | Brightness, volume, battery, locations |
| `cloud/pebble-media-api/` | Worker + R2 |
| `Website/src/lib/releases.ts` | Real GitHub Releases + download counts |
| `Website/src/workspace/Reviews.tsx` | Reviews wall + bug report form |
| `Website/backend/supabase/004_*.sql` | Reviews, bug reports, role requests |
| `scripts/{rewards,apps,google,brand,markup}-test.js` | 217 tests total |

---

## 4. Files modified (existing)

| File | Change |
|---|---|
| `00-core.js` | **`NX.glogo()`** brand marks; `NX.icon` untouched |
| `01-data.js` | emits `points:newbest` |
| `03-native.js` | asset / league / system-control wrappers |
| `11-shell.js` | theme lock + `cycleTheme` skip, NAV, points chip, **hides disabled apps** |
| `19-extsync.js` | `setEnabled()` |
| `25-timeless.js` | `setEnabled()` — real start/stop for the 2 s poll |
| `26-reminders.js` | `setEnabled()` — **fixed a leaked interval handle** |
| `29-games.js` | game entitlement gate in `launchGame` |
| `30-settings.js` | +Google / Apps / Folders / System / Rewards sections |
| `38-arcade.js` | emits `points:*` |
| `99-boot.js` | engines start via `modules.isOn()` |
| `src-tauri/src/lib.rs` | `mod assets/sysctl`, 16 commands |
| `src-tauri/Cargo.toml` | **added `jpeg` + `gif`** to the `image` crate |
| `src-tauri/tauri.conf.json` | widened `assetProtocol.scope` |
| `Website/src/pages/Download.tsx` | **rewritten** — real downloads |
| `Website/src/sections/HomeB.tsx` | **deleted 6 fabricated testimonials** |
| `Website/src/workspace/Admin.tsx` | Reviews + Reports tabs, role promotion |

---

## 5. Do not undo these

1. **`cycleTheme` must skip locked themes.** Ctrl+J walks the list; without
   the skip the hotkey looks broken.
2. **`applyTheme` needs `force` on boot** or a locked-but-saved theme bricks
   startup.
3. **`launchGame` gates BEFORE the registry lookup** so a locked game cannot
   start by any path.
4. **Points writes are coalesced** — never award from a timer or rAF.
5. **Task points pay for COMPLETING, not creating.**
6. **Core modules are non-disableable** (`notes`, `today`) — no way back.
7. **Disabling must STOP the engine**, not hide it.
8. **`52-modules.js` must re-wrap ALREADY-REGISTERED routes.** Modules
   register at load time and it loads at position 52. Guarding only
   `Router.register` would guard nothing. Tested.
9. **Unique numeric filenames.** `scripts/build.js` sorts by filename; a
   `46-`/`49-` tie broke a module once already.
10. **A switch needs `<span class="track">`.** See below.
11. **Never say "buy".** No payment integration exists.
12. **No fabricated numbers or testimonials.** GitHub counts downloads; the
    site shows nothing it cannot source.
13. **Admins see counts, never private note bodies.** Enforced by RLS.
14. **Google logos are never theme-tinted.**

---

## 6. Bugs worth knowing about

**The invisible switch.** The CSS selector is
`.switch input:checked + .track`. I wrote `<span></span>` instead of
`<span class="track"></span>`, which renders a 42×24 empty box with no
visible toggle. It fails *silently* — no error, just nothing. Six shipped
this way. `scripts/markup-test.js` now greps the source **and** the built
bundle for the bad shape.

**`startScheduler` in `26-reminders.js` leaked its interval handle**, which
made "turn reminders off" impossible — it kept firing every 15 s.

### Timeless site logos (fixed in this pass)

Four independent bugs meant site icons never appeared. All failed silently —
a broken tile just shows a letter, so nothing threw.

1. **The Rust side returned the page TITLE, not a domain.** A window titled
   `How to install Rust — Google Chrome` produced `url = "How to install Rust"`,
   so every favicon lookup failed. `hostname_from_title()` now extracts a real
   host (embedded URL → leading hostname → `@handle`), requires a plausible TLD
   so `"Version 1.2"` is not mistaken for a host, and strips ports.
2. **`/favicon.ico` was tried first.** Many hosts answer that with HTTP 200 and
   an HTML error page; `<img>` "loads" HTML happily, so the fallback chain
   never advanced and you got a broken-image glyph. The resolver now tries
   DuckDuckGo first and **verifies each candidate actually decodes as an
   image** before caching it.
3. **`.ar-ic` was sized only under `.app-row`.** A site tile in the
   live-session card had no width or height, so the favicon collapsed to an
   unstyled inline image. Base geometry now sits at `.ar-ic`.
4. **The old fallback did `p.textContent = letter`,** destroying the wrapper
   element and its styling. Replaced with a letter tile that upgrades in
   place.

Also removed the double `.ar-ic` wrapper in the live-session card.

`scripts/icon-test.js` pins all of this (36 tests), including evaluating
`cleanHost` directly rather than regexing its source.

---

## 7. Google integration

**Keep is not integrated, and that is a Google restriction.** The Keep API
requires domain-wide delegation from a Workspace Super Admin; consumer
`@gmail.com` accounts get `invalid_scope`. It is a corporate DLP tool.
Google Tasks is the checkbox API and works everywhere. **Do not "fix" this.**

Two-way sync timestamps both sides. Newer wins; **a missing timestamp always
favours local**; the loser goes to a conflict log shown as "Kept local".

Tokens are stripped from Drive backups (tested). `disconnect()` deletes them.
⚠️ The refresh token still sits in `workspace.json` unencrypted — the fix is
Windows Credential Manager, which needs new Rust.

**Client secret:** Google installed-app OAuth uses **PKCE**; the secret plays
no part. `setClientId()` rejects anything starting `GOCSPX-`. A real secret
was pasted in chat during this work — it must be rotated, and it was never
written to a file (swept repeatedly).

---

## 8. Test suites

```bash
npm test              # 253 tests across 6 suites
npm run test:rewards  # 65
npm run test:apps     # 44
npm run test:google   # 57
npm run test:brand    # 31
npm run test:icon     # 36
node scripts/markup-test.js   # 20
npm run test:icon     # 36 - favicon resolver, host parsing, tile geometry
npm run test:rust     # see caveat
```

All renderer suites pass. `cargo check` passes.

---

## 9. Known broken / unverified

| Item | State |
|---|---|
| `cargo build --release` | **BROKEN — pre-existing toolchain bug.** rustc crashes with `STATUS_STACK_BUFFER_OVERRUN` inside `windows` / `time` / `serde_json`. Reproduces with all local changes stashed. Use the `x86_64-pc-windows-msvc` toolchain or CI. |
| Brightness / volume | **UNVERIFIED.** No interactive desktop in the agent session (`GetDefaultAudioEndpoint` → `E_NOTIMPL`). Code path is correct and degrades gracefully; needs a check on a real desktop. |
| Migration `004_*.sql` | Written, **not applied.** Reviews/reports tabs load empty until you run it in the Supabase SQL editor. |
| `admin_request_role` | Queue works; applying the claim needs `backend/firebase/set-admin.cjs` with a service-role key on a trusted machine. |
| `.pebble-media-token` | Live credential in the repo root. **Delete and rotate.** Add to `.gitignore`. |

---

## 10. Security — read before deploying

- Rotate the Supabase secret key and JWT signing keys. Both were pasted in
  chat during this work.
- Rotate the Google OAuth client. Its secret was pasted too.
- `.pebble-media-token` is a live Worker credential sitting untracked.
- Admin role promotion is **deliberately a queue**, not a switch. The claim
  lives in the Firebase token; only a server with the service account can
  set it.

---

## 11. Deliberately deferred by the user

- **Tablet mode** and **phone-style layout** — asked for, explicitly
  postponed. Not started.
- **Android app** — `devices.kind` is `web/desktop/extension`; add
  `'android'` when a client exists.

---

## 12. Conventions to match

- One IIFE per file, attaching to `window.NX`. No modules, no imports.
- `const { h, q, qa, util:U, icon } = NX;` at the top of view modules.
- Tokens only in CSS (`--green-soft`, `--surface-2`, `--r-md`). Never a
  literal colour — **except brand marks**.
- Numbers use `tabular-nums`.
- Icon-only buttons get `data-tip`.
- Categorical colours ship a `*-soft` tint.
- Any new switchable module needs a registry entry in `52-modules.js` or it
  cannot be disabled.