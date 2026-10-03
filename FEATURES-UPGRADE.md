# PebbleX — Points Economy, Store, Leaderboard & Image Uploads
### Feature analysis + upgrade specification

> **Status:** design/spec only — nothing implemented yet.
> **Scope:** the four requested features (points, store, leaderboard, image uploads) plus the supporting upgrades they force.
> **Target:** existing Tauri 2 + vanilla-JS codebase, no new frameworks, no new runtime deps beyond what already exists.

---

## 1. Executive summary

The request is four features, but in this codebase they are really **one** feature with four surfaces:

```
                    ┌──────────────────────────┐
   activity ───────►│   NX.points (ledger)     │◄────── earn rules
   (games, focus,  │   balance + history      │        (existing
    notes, tasks)  └───────────┬──────────────┘        metrics already
                                │                       computed)
                    ┌───────────▼──────────────┐
                    │  NX.store (entitlements) │──► themes unlocked
                    │  owned / active         │──► games unlocked
                    └───────────┬──────────────┘──► cosmetics unlocked
                                │
                    ┌───────────▼──────────────┐
                    │  NX.leaderboard          │◄── reads gameBest,
                    │  local leagues + optional│    gameWins, points
                    │  global (opt-in sync)    │
                    └──────────────────────────┘
```

Everything already needed to *feed* this exists and is already computed:

| Signal | Where it lives today | Reusable as-is? |
|---|---|---|
| 17 games with personal bests | `NX.GAMES` (`renderer/js/01-data.js:270`), `gameBest:<id>` (`01-data.js:286-288`) | Yes |
| Wins per game | `NX.bumpWin()` → `gameWins` (`38-arcade.js:166`) | Yes |
| Play count | `NX.recordPlay()` → `gamePlays` (`38-arcade.js:19`) | Yes |
| Arcade minutes | `gameTime.total` (`38-arcade.js:194-200`) | Yes |
| 16 achievements + live progress | `NX.BADGES` / `NX.badgeProgress()` (`38-arcade.js:110,155`) | Yes — this is the closest thing to a points engine already |
| Daily challenge streak | `NX.dailyState()` (`38-arcade.js:56`) | Yes |
| Focus rounds / streak / week | `NX.focusLog` (`25-timeless.js:351`) | Yes |
| Tracked productive time | `timeless` per-day per-app (`25-timeless.js`) | Yes |
| Notes / tasks / reminders | store keys `notes`, `tasks`, `reminders` | Yes |
| 13 themes + theme engine | `NX.THEMES` (`11-shell.js:11`), `NX.applyTheme()` (`11-shell.js:27`) | Yes |
| Game registry + launch guard | `NX.launchGame()` (`29-games.js:932`) — already has a `NX.toastInfo('Not available')` branch to reuse | Yes |

**Nothing needs to be invented from scratch. This is ~85% wiring.**

---

## 2. Analysis of the current architecture

### 2.1 What Pebble actually is

A **local-first, offline-first desktop workspace** (chat, notes, tasks, Timeless time-tracking, focus/Pomodoro, planner, prompts, AI, widget, 17-game Arcade). Tauri 2 shell (`src-tauri/src/lib.rs`, 1583 lines), vanilla-JS renderer with a hand-rolled `window.NX` namespace, a hand-rolled hash router, and a `localStorage` store that mirrors to a single JSON file on disk.

### 2.2 The five constraints that shape this whole design

**C1 — There is no server.**
No Supabase, no Firebase, no auth backend, no HTTP client crate in `Cargo.toml`. Outbound network is only keyless public APIs (Pollinations, open-meteo, joke APIs). Consequence: **a "global" leaderboard cannot be built without adding infrastructure.** Everything in this spec is therefore designed to be **fully functional offline**, with cloud as an *opt-in add-on* — never a dependency.

**C2 — Identity is local and cosmetic.**
`profile` = `{name, handle, avatar:'#7CD56E', bio, plan:'Pro'}` (`01-data.js:11`). `avatar` is a **hex colour, not an image**. Login is a local PIN (djb2, `00-core.js:227`) and `session:{authed:true}`. There is no user id, no device id, no stable key. Any leaderboard or purchase record needs one of those minted — see §5.1.

**C3 — "Paid" can only mean client-side.**
There is no payment integration and no server to verify a purchase. A points gate on a game is **an honour-system unlock**, which is completely fine for a single-player, offline, no-IAP product — but it must be described honestly in the UI ("unlock with points"), never as a purchase. Never label it "buy" if there is no money changing hands; label it *unlock / redeem*. If real money is ever involved, a server is mandatory.

**C4 — The store mirror serialises the entire workspace on every write.**
`NX.store.set()` → coalescing 500 ms timer → `save_workspace(JSON.stringify(Store.dump()))` (`00-core.js:104-120`). `Store.dump()` walks **every** `pebble.*` key in localStorage. A high-frequency points ledger that appends an entry on every event would trigger full-document rewrites constantly. **This is a real performance trap and it already caused AppHangB1** (see git history: `fix(core): stop the workspace mirror from flooding the UI thread`). The ledger must be **coalesced and append-only in shape**, never written per-keystroke/per-frame. See §4.5.

**C5 — There is no image storage for user content.**
The only image *write* path is `save_file(name, content, base64:true)` → `<Downloads>/Pebble/<safe_name>` (`lib.rs:1011`). The only app-managed image folder is `<AppData>/pebble/icons/` for *extracted app icons* (`lib.rs:95`). The Tauri `assetProtocol.scope` is locked to `**/pebble/icons/**` (`tauri.conf.json`). **Images cannot currently be uploaded into the app at all** — this is the single biggest piece of new Rust work.

### 2.3 Existing hook points (exact locations)

| What | File:line | Note |
|---|---|---|
| Game catalog | `renderer/js/01-data.js:270-285` | 14 games; 3 appended at `38-arcade.js:653` |
| Best-score helpers | `renderer/js/01-data.js:286-288` | `gameBest` / `setGameBest` / `recordMin` |
| Game registry + launch | `renderer/js/29-games.js:927-951` | `NX.gameRegistry`, `registerGames`, `launchGame` |
| Game grid UI | `renderer/js/29-games.js:22-34` | `.games-grid` / `.game-card[data-g]` |
| Arcade panels (injected) | `renderer/js/38-arcade.js:589` | `NX.afterRouteRender('games', …)` — idempotent guard at `:592` |
| Badge list | `renderer/js/38-arcade.js:110-127` | 16 badges, `{id, ic, t, d, goal, metric}` |
| Badge metrics | `renderer/js/38-arcade.js:130-154` | the exact function a points engine mirrors |
| Badge grant | `renderer/js/38-arcade.js:173-189` | toast + confetti — copy this UX for point awards |
| Themes registry | `renderer/js/11-shell.js:11-25` | 13 themes, `{id,name,dark,bg,side,main,pill}` |
| Theme apply | `renderer/js/11-shell.js:27-39` | `applyTheme` / `cycleTheme` (Ctrl+J) |
| Theme picker UI | `renderer/js/30-settings.js:45-59` | `.theme-grid` |
| Sidebar nav model | `renderer/js/11-shell.js:42-61` | 3 groups: Workspace / Intelligence / Explore |
| Route registration | `renderer/js/11-shell.js:250` | `NX.routeInShell(name,title,icon,render,onMount)` |
| Post-render injection | `renderer/js/14-agenda.js:207` | `NX.afterRouteRender(name, fn)` |
| Settings sections | `renderer/js/30-settings.js:10-21` | add a `Rewards` section here |
| Profile editor | `renderer/js/30-settings.js:61-97` | avatar is a colour swatch row |
| Login / avatar pick | `renderer/js/10-login.js:13,88-96,113` | 8 colour swatches |
| Native bridge | `renderer/js/03-native.js:31` | `invoke()` → `{ok,data}`, never throws |
| Image save (to Downloads) | `renderer/js/03-native.js:80` | `saveImage(dataUrl, name)` |
| Reusable UI | `NX.modal` `02-ui.js:40`, `NX.menu` `:10`, `NX.confirm` `:82`, `NX.confetti` `:263`, `NX.seg` `:274` | all take HTML strings |
| Store | `renderer/js/00-core.js:17-97` | `get/set/del/dump/restore/stats/wipe/flush` |
| Event bus | `renderer/js/00-core.js:176` | `NX.events.on('store:<key>')`, `'arcade:changed'` |
| Rust data dir | `src-tauri/src/lib.rs:76-97` | `data_dir()`, `icons_dir()`, `atomic_write()` `:99` |
| Rust image write | `src-tauri/src/lib.rs:1011` | `save_file` → Downloads/Pebble |
| Asset protocol scope | `src-tauri/tauri.conf.json` | `**/pebble/icons/**` only |

### 2.4 Design-system constraints the new UI must obey

From `DESIGN.md` (427 lines, the source of truth):

- **A theme swaps token *values* only.** Never add layout or radius overrides to a theme block. Adding a theme is exactly 2 steps: a `[data-theme="id"]` token block in `renderer/css/00-tokens.css`, and a registry entry in `11-shell.js`. **This makes unlockable premium themes nearly free** — the CSS already exists, the unlock is just a gate.
- Never hardcode a colour; use tokens. Green means *active/done/positive*, never decorative.
- Green text on a green fill is always `#0E2B0A` (`--green-ink`).
- Every metric uses `tabular-nums`.
- Inline SVG icons only, via `NX.icon(name, size)`; every icon-only button needs `data-tip`.
- Any categorical colour ships with a `*-soft` tint.
- `--orange-deep` and `--sh-soft` are referenced but never defined — a known gap to fix while in here.

### 2.5 Code-health debt this work will surface

| Issue | Evidence | Impact |
|---|---|---|
| `npm test` is broken | `scripts/smoke-test.js:107` → `NX.router.all is not a function` | **No automated regression net.** Highest-risk item. |
| `electron/` is dead code | `03-native.js` no longer references `window.nex`; electron not in devDeps | Confusing; ~37 phantom IPC channels |
| Generated bundles are committed | `renderer/js/bundle.js` (791 KB), `bundle.css` (170 KB) | Merge conflicts; must rebuild after every edit |
| `assets/icons/*` referenced, missing | `package.json` + `scripts/build.js:113` reference `assets/` | Build gap |
| `installer.nsi` unusable | hardcoded `/home/z/...` Linux `OutFile` | Manual installer broken |
| No lint / typecheck | no eslint/prettier/tsconfig anywhere | Typos only caught at runtime |
| No `prefers-reduced-motion` | `DESIGN.md` §11 explicitly flags it | A11y gap |
| `README.txt` says "NexaDesk" | `scripts/build.js:82` | Stale branding |

---

## 3. Design principles for this feature set

1. **Offline-complete.** Every screen works with the network cable pulled. Cloud is a toggle, never a gate.
2. **One ledger, one truth.** `NX.points` is the only thing that spends. No competing balances, no per-feature currencies.
3. **Earn generously, spend on identity.** Earning should be near-automatic (you are already doing the work). Spending should be on *expression* — themes, avatars, badges, titles — not on removing limits. Gating 15 of 17 games behind points is the exception, not the rule, and §6.4 argues for a softer default.
4. **Never fake a purchase.** Points are not money. The UI says "unlock", not "buy".
5. **Reuse, don't reinvent.** Every award goes through the same toast+confetti path as badges (`38-arcade.js:180-184`). Every new screen goes through `NX.routeInShell`. Every new colour comes from a token.
6. **Anti-degenerate economy.** Capped daily earning per source, so the leaderboard measures *consistency*, not idle time. See §4.4.

---

## 4. Feature A — The Points Economy

### 4.1 Module

New file: **`renderer/js/45-points.js`** (loads after `38-arcade.js`, before `99-boot.js`).
Register in `renderer/index.html` after line 135:

```html
<script src="js/38-arcade.js"></script>
<script src="js/45-points.js"></script>
<script src="js/46-store.js"></script>
<script src="js/47-leaderboard.js"></script>
```

> Naming matters: `scripts/build.js` concatenates in **sorted filename order**, and `renderer/index.html` is in a *different, hand-maintained* order. `29-games.js` must precede `38-arcade.js` — that bug already shipped once. Keep both orders consistent and add the new files to **both**.

### 4.2 Data shape

```js
// store key: 'points'
{
  balance: 1240,
  lifetime: 8930,          // never decreases — drives level + leaderboard rank
  earnedToday: 85,
  earnedTodayKey: '2026-10-03',
  spent: 240,
  level: 7,
  history: [                // capped ring, newest last
    { t: 1759000000000, d: 25, r:'game_win', m:'2048 Lite', k:'gm_2048' }
  ]                        // max 400 entries
}
```

- `balance` — spendable. Decreases on purchase.
- `lifetime` — monotonically increasing. Used for level and for the leaderboard, so **spending never demotes you**.
- `history` — capped at 400 entries (~100 KB worst case, fine inside the workspace mirror).

### 4.3 Earn rules

Every rule reads an **existing** signal. No new instrumentation required except one listener.

| Event | Points | Source it taps | Cap |
|---|---|---|---|
| Win a game | `10 + floor(score/50)`, max 60 | `NX.bumpWin` hook | 200/day |
| New personal best | 25 | wrap `NX.setGameBest` | 100/day |
| Play any game | 2 | `NX.recordPlay` hook | 50/day |
| Complete a focus round | 15 | `focus:log` event | 120/day |
| Daily challenge solved | 40 (+15×streak bonus, max +100) | `NX.dailyState()` | once/day |
| Achievement unlocked | 50 | `NX.checkAchievements` hook | once/badge |
| Complete a task | 10 | `tasks` store diff | 100/day |
| Create a note | 8 | `notes` store diff | 60/day |
| 1 hour tracked productive time | 20 | `timeless` aggregate | 60/day |
| 7-day streak bonus | 100 | `dailyState().streak % 7` | once/week |
| First launch of the day | 15 | boot check | once/day |

**Realistic yield:** ~150–250 points/day for an engaged user, ~40 on a lazy day.

### 4.4 Anti-abuse / anti-degenerate design

The leaderboard is only meaningful if idle time does not equal points. Four guards:

1. **Daily caps per source** (table above). Surplus awards are silently dropped — no toast, no ledger entry.
2. **Time-window floor.** A focus round under 60 s earns nothing. A game session under 15 s earns nothing. Requires a `sessionStart` timestamp per activity, tracked in the hook.
3. **Ledger is append-only for `lifetime`.** Nothing but a store wipe can decrease it.
4. **Global daily ceiling: 600 points/day.** After that, awards are dropped and the HUD shows "tomorrow's points are waiting". This is the single most important guard — it caps leaderboard divergence at one day's worth of grinding.

`NX.store.wipe()` (Settings → Storage) resets points to zero. Acceptable: it is a documented reset path.

### 4.5 Mirror-safe writes (C4 — critical)

The workspace mirror writes the **entire store** on a 500 ms debounce (`00-core.js:104-120`). A naive `NX.points.award()` on every win would serialise the whole workspace mid-gameplay.

```js
let pending = 0;
let timer = null;
function scheduleFlush(){
  if(timer) return;                 // coalesce — one timer, not one per award
  timer = setTimeout(()=>{
    timer = null;
    if(!pending) return;
    pending = 0;
    NX.store.set('points', state());   // one write per burst
  }, 1200);
}
```

Also: **never** call `NX.points.award()` from inside a `requestAnimationFrame` loop, a `setInterval` tick, or the Timeless 2 s poll. Only from discrete events (win, complete, unlock). `trackArcadeTime()` (`38-arcade.js:194`) is a 5 s interval writing to the store — do **not** hook point awards into it.

### 4.6 Levels

```
level = 1 + floor( (lifetime / 250) ^ 0.85 )
```
Sub-linear so early levels come fast and later ones take real time. Each level grants a **cosmetic title** (`Rookie → Focused → Arcade Rat → Deep Worker → Streak Master → Pebble Legend`). Titles are pure text — cheap, and they feed the leaderboard nicely.

### 4.7 Public API

```js
NX.points.balance()                 // number
NX.points.lifetime()
NX.points.level()                   // { n, cur, next, pct, title }
NX.points.award(n, reason, meta)    // internal, capped
NX.points.spend(n, reason)          // → boolean
NX.points.canAfford(n)
NX.points.history()                 // newest last, capped 400
NX.points.progressToNextDailyCap()  // for the HUD meter
NX.points.reset()                   // settings only, confirm-gated
```

---

## 5. Feature B — The Store (themes + games + cosmetics)

### 5.1 Identity prerequisite

Purchases and leaderboard rows need a stable key. `profile` currently has none. Mint one on first boot:

```js
// added to NX.defaults.profile
{ ..., pid: null }   // 'p_' + 12 hex chars, generated once, never changes
```

Plus a `deviceName` for local-league display (`U.hashCode`-derived or user-set). **This is not authentication** and should be labelled as a device nickname, not a username — it protects nothing.

### 5.2 Store data shape

```js
// store key: 'entitlements'
{
  owned:   { theme:'nord', game:['gm_wordle','gm_sudoku'] },
  equipped:{ theme:'elera' },
  // cosmetics
  avatarImg: null,        // asset id from §7, overrides profile.avatar
  frame: 'none',          // avatar frame id
  title: null,            // override the level title
  badges: ['streak7'],    // showcase — max 3 pinned
  purchasedAt: { 'theme:neon': 1759000000000 }
}
```

Entitlements are **additive only**. There is no "revoke" path except a full wipe.

### 5.3 Theme unlocking — the cheapest win in this whole spec

Themes already satisfy the DESIGN.md contract completely: the CSS blocks exist, the registry entries exist. Unlocking is pure gating:

**Change 1 — `renderer/js/11-shell.js:27-32`.** `applyTheme` must respect the lock:

```js
NX.applyTheme = function(id, opts){
  const t = THEMES.find(x => x.id === id);
  if(!t) return false;
  if(!opts?.force && !NX.store.isUnlocked('theme:'+t.id)){
    NX.store.openStore('theme:'+t.id);   // opens the store modal on the item
    return false;
  }
  document.documentElement.setAttribute('data-theme', t.id);
  const s = NX.store.get('settings'); s.theme = t.id; NX.store.set('settings', s);
  return true;
};
```

> **Regression risk.** `NX.cycleTheme()` (Ctrl+J, `11-shell.js:33`) walks *every* theme in order. With locks it must **skip locked themes** — otherwise Ctrl+J appears broken. Also `99-boot.js` applies the saved theme at boot; that call needs `{force:true}` so a locked-but-saved theme doesn't brick startup.

**Change 2 — `renderer/js/30-settings.js:45-59`.** The picker gains a locked state:

```html
<div class="theme-card locked" data-th="neon">
  <div class="theme-swatch" style="background:#0C0C0F;filter:grayscale(.7)">
    <i class="ts-side"></i><i class="ts-main"></i><i class="ts-pill"></i>
    <span class="ts-lock">🔒 400</span>
  </div>
  <div class="theme-name">Neon <span class="on-ic">…</span></div>
</div>
```

Clicking a locked swatch opens the store modal, not the theme.

### 5.4 Theme price tiers

| Tier | Themes | Price |
|---|---|---|
| Free (default) | `elera`, `pebble-dark`, `midnight`, `nord` | 0 |
| Common | `forest`, `rose`, `ocean`, `mono` | 150 |
| Rare | `sunset`, `candy`, `coffee`, `slate` | 350 |
| Legendary | `neon` + 4 new ones (§9.1) | 700 |

4 free themes (not 2) is deliberate — a workspace you cannot re-theme at all feels broken. Locking is a progression, not a tax.

### 5.5 Game unlocking — 2 free, the rest earnable

The request was 2 free games. **Recommendation: ship exactly 2 free, but make the paid ones cheap and always-earnable**, because a 17-game arcade where 15 are locked reads as hostile on day one.

Implementation is one guard in `NX.launchGame` (`29-games.js:932`), reusing the branch that already exists:

```js
NX.launchGame = function(id, retried){
  const g = (NX.GAMES||[]).find(x=>x.id===id);
  if(g && !NX.store.isUnlocked('game:'+id)){
    NX.openGameGate(g);     // modal: price, progress, "earn now" CTA
    return;
  }
  /* …existing 932-951 body unchanged… */
};
```

Plus a **visual** lock in the grid (`29-games.js:24-32`) so users see what's ahead, and a **soft preview**: locked games show a dimmed card with "Try a 20-second demo" that runs a scoreless version. A taste of the thing is a better conversion than a padlock.

Game prices scale with depth: common 100, mid 200, deep 350, "premium feel" 500.

**Free pair:** `gm_2048` (the signature one) + `gm_snake` (the universally understood one). Everyone can play something immediately.

### 5.6 Cosmetics (where the real long-tail value is)

- **Avatar image** — ties directly into §7. Upload → asset → `entitlements.avatarImg`.
- **Avatar frames** — 8 CSS-only frames, `border` + `--green-ring` glow variants. ~30 lines of CSS total.
- **Titles** — 12, unlocked by level or points.
- **Badge showcase** — pin up to 3 badges; rendered in the sidebar footer and on leaderboard rows.
- **Sidebar accent** — override `--tile` for the signed-in profile block.
- **Confetti style** — 4 variants (`calm` / `burst` / `coin` / `neon`). Pure CSS keyframes. High delight, near-zero cost.

### 5.7 Store UI

New file **`renderer/js/46-store.js`**, route **`store`** registered via `NX.routeInShell('store','Store','star', …)`.

Layout: 4 tabbed panels — **Themes · Games · Avatar · Titles** — using the existing `.seg` control (`02-ui.js:274`).

```
┌──────────────────────────────────────────────────────────┐
│  ⬤ 1,240 pts   ▓▓▓▓▓▓░░░░░░  L7 Deep Worker   [+85 today]│
├──────────────────────────────────────────────────────────┤
│  [Themes]  [Games]  [Avatar]  [Titles]                   │
│                                                           │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐        │
│  │ swatch │  │ swatch │  │🔒 350  │  │🔒 700  │        │
│  │ Equipped│ │ Owned  │  │ Neon   │  │ Aurora │        │
│  └────────┘  └────────┘  └────────┘  └────────┘        │
└──────────────────────────────────────────────────────────┘
```

Purchase flow — one confirm modal, never a surprise:

```js
NX.confirm('Unlock Neon?', 'Costs 700 points. You have 1,240.',
  ()=>{
    if(!NX.points.spend(700, 'theme:neon')) { NX.toastErr('Not enough points'); return; }
    NX.store.unlock('theme:neon');
    NX.applyTheme('neon');
    NX.confetti(innerWidth/2, 200);
    NX.sfx.play('confetti');
  });
```

**Anti-misclick rule (DESIGN.md §6, "calm over clever"):** purchases always go through `NX.confirm`. No single-click spending. Ever.

### 5.8 Store access points

1. Sidebar nav item under **Explore** (`11-shell.js:56-60`) — new group "Rewards" with `Store` and `Leaderboard`.
2. Persistent balance chip in the topbar (`11-shell.js:167`), right-aligned before the bell.
3. `Ctrl+Shift+P` command-palette entries (`02-ui.js:113`).
4. Sidebar footer: replace the static `${profile.plan} plan` text (`11-shell.js:135`) with real level + balance.
5. Deep-link: any "locked" affordance anywhere opens the store at that item (`?focus=theme:neon`).

---

## 6. Feature C — The Leaderboard

### 6.1 The honest problem

There is no server (C1). Therefore there are exactly three honest options, and the UI must never imply more than is true:

| Mode | Needs | Truth level | Recommendation |
|---|---|---|---|
| **Personal** | nothing | "Your bests" | Ship first |
| **Local league** | a shared file path | "Peers on this machine" | Ship second — genuinely useful for shared/family PCs |
| **Global** | a backend | "Real players" | Opt-in, clearly labelled, easily self-hosted |

**Never** ship a leaderboard that looks global but is just the local store. That is the fastest way to lose a user's trust.

### 6.2 Phase 1 — Personal leaderboard (zero risk, ship first)

A new tab on the existing Arcade route, injected via the established pattern:

```js
// renderer/js/47-leaderboard.js
NX.afterRouteRender('games', function(view){
  if(!view.querySelector('#gm-grid')) return;
  if(view.querySelector('.lb-strip')) return;      // idempotent, per 38-arcade.js:592
  /* inject a "Leaderboard" button into .arc-strip (38-arcade.js:594) that
     opens NX.modal with: rank-by selector + a sortable table */
});
```

Reuses `gameBest:<id>` (`01-data.js:286`), `gameWins`, `gamePlays`, `NX.points.lifetime()`, `NX.dailyState().streak`. Rank-by options: `Points · Level · Per-game score · Streak · Focus time`.

Table uses the existing `.etable` component (DESIGN.md §5).

### 6.3 Phase 2 — Local league (LAN / shared PC)

A **league file** at `<AppData>/pebble/league.json`, written by a new Rust command:

```rust
#[tauri::command]
async fn league_read() -> String;                    // whole doc as JSON string
#[tauri::command]
async fn league_merge(entry: String) -> bool;        // upsert one member, atomic_write
```

`league_merge` upserts by `profile.pid` and **clamps on read** — it applies the same daily caps as the local economy, so a hand-edited file cannot manufacture a #1 rank. Honest, cheap, no server. Lives on a shared folder (family PC, LAN drive, synced folder) so it works with zero networking.

### 6.4 Phase 3 — Global leaderboard (opt-in)

Only if the user configures a backend in Settings → Rewards. Two workable shapes, given no server exists:

- **A) Cloudflare Worker + D1.** ~120 lines, free tier, a real `leaderboard` table, one `POST /submit` + `GET /top`. Fits this project's "small, self-hostable" character. **Recommended if a backend is wanted.**
- **B) Supabase.** Faster to ship, adds a vendor dependency to a project that currently has zero.

Submission rules:
- Opt-in per user, explicit consent dialog on first enable ("Sends your display name, level and scores to a server").
- Send a **derived handle**, never the raw profile name, unless the user opts in separately.
- Client sends **totals**, not a score log. The server cannot verify anyway, so claiming otherwise is dishonest UI.
- Rate limit: one submit per 10 min, plus `Cache-Control: no-store` on reads.
- **Display a "unverified" marker.** Honest, and it inoculates you against the first "this leaderboard is fake" comment.

### 6.5 Anti-frustration rules

- Show the player's own row **pinned** at the bottom even when outside the top 20, with "you are #47 of 312".
- Show a **percentile**, not just a rank ("top 8%").
- Never show an empty leaderboard with a fake populated placeholder.
- Reset the leaderboard view on `store:` changes so it never renders stale numbers.

---

## 7. Feature D — Image Uploads

This is the only feature that **requires new Rust**, and it is the one with no existing path.

### 7.1 Rust: asset storage

New file **`src-tauri/src/assets.rs`** (keep `lib.rs` from growing further), added as `mod assets;` in `lib.rs`.

```rust
use std::path::PathBuf;

pub fn assets_dir() -> PathBuf { crate::data_dir().join("assets") }
pub fn thumbs_dir() -> PathBuf { crate::assets_dir().join("thumbs") }
```

Five commands:

| Command | Signature | Purpose |
|---|---|---|
| `asset_import` | `(data_url: String, name: String, kind: String) -> AssetResult` | decode base64 → validate → write → thumbnail → return id + url |
| `asset_list` | `(kind: Option<String>) -> Vec<AssetMeta>` | gallery |
| `asset_read` | `(id: String) -> Option<AssetMeta>` | metadata |
| `asset_delete` | `(id: String) -> bool` | move to `.trash` via existing `trash_path` |
| `asset_export` | `(id: String, dest: String) -> SaveFileResult` | copy out to Downloads |

Reuse, do not rewrite:
- `safe_name()` — `lib.rs:1002`
- `atomic_write()` — `lib.rs:99`
- `trash_path()` — `lib.rs:1102`
- `base64::Engine::decode` with `STANDARD` — as `save_file` does (`lib.rs:1021`)
- `image` crate for decode + encode (already a dep, `Cargo.toml`, feature `png`)

**`asset_import` must enforce, before touching disk:**
1. Sniff the real MIME from magic bytes. **Never trust the extension or the declared type.**
2. Hard cap at **5 MB** decoded.
3. Hard cap dimensions at **6000×6000**.
4. Re-encode to PNG/JPEG via the `image` crate. This **strips EXIF, GPS, and any embedded payload** — mandatory for user-uploaded images, and worth stating explicitly in the UI.
5. Generate the id as `<16 hex>` (FNV-1a like `md5ish` at `lib.rs:601`, plus a counter to avoid collisions).
6. Thumbnail: `image::imageops::resize`, 320 px longest edge, into `assets/thumbs/`.

```rust
#[derive(Serialize)]
pub struct AssetResult {
    ok: bool,
    id: String,
    url: String,          // http://asset.localhost/... (desktop)
    thumb: String,        // thumbnail url
    w: u32, h: u32,
    bytes: usize,
    error: String,
}
```

### 7.2 Tauri config: widen the asset scope

`src-tauri/tauri.conf.json`:

```jsonc
"assetProtocol": {
  "enable": true,
  "scope": [
    "$APPDATA/pebble/icons/**",
    "$DATA/pebble/icons/**",
    "**/pebble/icons/**",
    "$APPDATA/pebble/assets/**",     // ← new
    "$DATA/pebble/assets/**",        // ← new
    "**/pebble/assets/**"            // ← new
  ]
}
```

> Keep the wildcard form for parity with the existing icons entries; the resolved path on Windows is under `%APPDATA%\pebble\`.

**Web fallback:** `NX.native` already returns `{ok:false, stub:true}` on web (`03-native.js:38`). `asset_import` must handle that: fall back to storing a downscaled **data URL in the store key** `media:inline` (hard-capped at ~1.5 MB total, oldest evicted) so the web build still works. Note the localStorage quota (~5 MB) — this fallback is genuinely limited and the UI should say so.

### 7.3 Renderer bridge

`renderer/js/03-native.js`, after `saveImage` (`:80-83`):

```js
async assetImport(dataUrl, name, kind){
  const r = await this.invoke('asset_import', { dataUrl, name: name || 'image.png', kind: kind || 'misc' });
  return r && r.ok ? r.data : null;
},
async assetList(kind){ const r = await this.invoke('asset_list', { kind }); return r && r.ok && Array.isArray(r.data) ? r.data : []; },
async assetDelete(id){ const r = await this.invoke('asset_delete', { id }); return !!(r && r.ok); },
async assetExport(id, name){ const r = await this.invoke('asset_export', { id, dest: name }); return r && r.ok ? r.data : null; },
```

### 7.4 Upload UX — a shared picker, used everywhere

New file **`renderer/js/48-media-library.js`** exposing:

```js
NX.media.pick({ kind, maxMB })   // → Promise<AssetMeta|null>
NX.media.gallery(kind)           // → renders .media-grid into a host
NX.media.dropZone(el, onFiles)   // drag & drop, uses the DESIGN.md drop style
NX.media.attachTo(editor, kind)  // paste / drag / toolbar button
```

Flow: drag-drop or paste or pick → client-side preview + downscale to ≤1600 px → `asset_import` → thumbnail → insert reference.

Interaction rules already specified in DESIGN.md §9: drop target = `--green-soft` background + dashed `2px` green outline. Reuse it.

### 7.5 Surfaces that accept images

| Surface | Change | File |
|---|---|---|
| **Profile avatar** | colour swatches (8) **+** "Upload photo" | `30-settings.js:69-72` |
| **Login avatar** | same, next to the swatch row | `10-login.js:88-96` |
| **Notes** | insert image, plus `![[image.png]]` wiki-link resolution | `22-notes.js` |
| **Chat** | image attachments on messages | `21-chat.js` |
| **Tasks** | cover image on a task card | `23-todo.js` |
| **Store / Avatar tab** | full avatar gallery + crop | new `46-store.js` |
| **Media route** | the gallery itself, and reuse the existing annotator | `28-media.js` |

The existing Media route already has a canvas annotator (`28-media.js`) — its "Save PNG" already calls `saveImage`. Add "Save to library" as a second button rather than replacing the flow.

### 7.6 Store key

```js
// 'assets' — index only, never image bytes
{
  [id]: { id, kind, name, w, h, bytes, createdAt, url, thumb, ref }
}
```
Bytes live on disk. **Never base64 an image into `NX.store`** — it would be serialised into the workspace mirror on every write and blow past localStorage in minutes (C4).

### 7.7 Housekeeping

- LRU prune at 500 MB / 500 assets, with a Settings row showing disk usage and a "Clear cache" action.
- Delete → existing `.trash` (`lib.rs:1102`), so it's recoverable.
- `37-backup.js` must **exclude** `assets/` by default (large, regenerable thumbs) with an explicit opt-in.

---

## 8. Implementation plan

### Phase 0 — Stop the bleeding (must be first)

| # | Task | File |
|---|---|---|
| 0.1 | Fix `scripts/smoke-test.js` (targets removed NexaDesk API: `NX.router.all`, `NX.store.data`, `NX.ui.toast`, `NX.actions.*`) and re-enable `npm test` in CI | `scripts/smoke-test.js` |
| 0.2 | Add smoke cases for `points`, `entitlements`, `themeLock`, `launchGame` guard | `scripts/smoke-test.js` |
| 0.3 | Add `npm run lint` (minimal eslint, no framework churn) + CI step | `package.json`, `.github/workflows/build.yml` |
| 0.4 | Stop committing generated `bundle.js` / `bundle.css`; gitignore them | `.gitignore` |
| 0.5 | Add the four new files to **both** `index.html` **and** verify sorted-order concatenation | `renderer/index.html` |
| 0.6 | Define `--orange-deep`, `--sh-soft`; implement `prefers-reduced-motion` | `00-tokens.css`, new motion block |

### Phase 1 — Points engine (`45-points.js`) — no Rust, no UI risk

- 1.1 Ledger shape + `NX.store.isUnlocked` helper on the store.
- 1.2 `NX.points.*` API with coalesced flush (§4.5).
- 1.3 Level curve + 12 titles.
- 1.4 Hook `bumpWin` / `setGameBest` / `recordPlay` / `focus:log` / `badges` / task+note diffs.
- 1.5 Daily caps + the 600/day global ceiling.
- 1.6 **Points HUD chip** in the topbar (balance, level, today meter).
- 1.7 Verify: no mirror regression — profile the write rate during a 5-minute arcade session.

### Phase 2 — Store (`46-store.js`) + theme lock

- 2.1 `entitlements` shape + `pid` minting.
- 2.2 `applyTheme` lock + **`cycleTheme` skips locked** (regression-critical).
- 2.3 `NX.launchGame` guard + locked grid cards + 20 s demo preview.
- 2.4 Store route: 4 tabs, prices, confirm-on-purchase, insufficient-funds state.
- 2.5 Cosmetics: frames, titles, badge showcase, confetti styles.
- 2.6 Settings → new **Rewards** section: balance, level, history table, reset.

### Phase 3 — Image uploads (Rust `assets.rs`) — the heavy lift

- 3.1 `assets.rs`: dirs, `asset_import` with magic-byte sniffing, size/dimension caps, re-encode (EXIF strip), thumbnail, atomic write.
- 3.2 `asset_list` / `asset_read` / `asset_delete` / `asset_export`.
- 3.3 Widen `assetProtocol.scope`.
- 3.4 `03-native.js` wrappers + web `media:inline` fallback.
- 3.5 `48-media-library.js`: picker, gallery, drop zone, paste handler.
- 3.6 Wire avatar (profile + login), notes, chat, tasks, store.
- 3.7 Disk-usage row + prune.

### Phase 4 — Leaderboard (`47-leaderboard.js`)

- 4.1 Personal board on the Arcade route (inject via `NX.afterRouteRender`).
- 4.2 `league_read` / `league_merge` Rust commands + shared-path setting.
- 4.3 Local league UI, pinned self-row, percentile.
- 4.4 (Optional, separate decision) Global board behind an explicit opt-in setting.

### Phase 5 — Native integration & polish

- 5.1 MCP tools: `pebble_get_points`, `pebble_unlock_theme`, `pebble_list_store`.
- 5.2 Widget shows balance + level.
- 5.3 Command palette entries.
- 5.4 Extension: popup shows level/balance; POST via the existing bridge.
- 5.5 `DESIGN.md` — add a "Points & store" section documenting the earn table, price tiers, and the token-only theme rule for unlockable themes.

---

## 9. Additional upgrade recommendations

### 9.1 New unlockable themes (each is ~10 lines)

`aurora`, `paper`, `mono-dark`, `sand`. Each = one `[data-theme]` token block + one registry entry. That is the entire cost — which makes them the highest margin content in the app.

### 9.2 Respect `prefers-reduced-motion`

DESIGN.md §11 flags it as missing. Add a global block that zeroes `animation-duration`/`transition-duration` and stops `nx-confetti` and `nx-splash-pulse`. Low effort, real accessibility win, and it pairs naturally with confetti rewards.

### 9.3 Fix the smoke test, then add real tests

Currently `npm test` crashes. Every one of these features touches shared state (`applyTheme`, `launchGame`, the store mirror) — shipping without a working harness is how the next AppHangB1 happens.

### 9.4 Daily quests

Three rotating objectives ("win 2 games", "finish a 25-min focus round", "complete 5 tasks"), seeded like the daily challenge (`mulberry32(daySeed())`, `38-arcade.js:38-49`). Rewards 50–150. Reuses the exact machinery already there. This is what keeps the economy from being passive.

### 9.5 Season pass

A 30-day track, free tier + points-unlockable premium tier. Points already exist; this is a UI shell over them. Big perceived value, low engineering cost.

### 9.6 A real anti-cheat note

There is none, and there cannot be one client-side. Any global board must be labelled unverified. Writing this into the UI is cheaper than writing it into a bug report later.

### 9.7 Repaint the profile avatar everywhere

`U.initials()` is used in the sidebar (`11-shell.js:134`), login, chat, and leaderboard rows. Once `avatarImg` exists, add one helper `NX.avatarHtml(profile, size)` that returns `<img>` when an asset exists and the initials span otherwise — and route **all four** call sites through it. Otherwise you get inconsistent avatars, which is the classic symptom of a half-landed image feature.

### 9.8 MCP + extension as points surfaces

`ext_bridge.rs` already exposes JSON-RPC and the extension already heartbeats to it. Adding `pebble_get_points` and a `points` push event makes the ecosystem scriptable and is nearly free.

### 9.9 Cleanups worth doing while in the file

| Item | Action |
|---|---|
| `electron/` | delete (dead; `03-native.js` no longer references it) |
| `electron-builder` config in `package.json` | remove |
| `installer.nsi` | fix the `/home/z/...` `OutFile` path |
| `assets/icons/*` | create, or drop the references from `package.json` |
| `scripts/build.js:82` | "NexaDesk" → "PebbleX" |
| `DESIGN.md` §14 | file map stops at `11-shell.js`; extend through `48-*` |
| `.github/workflows/build.yml` | add test + lint steps |

---

## 10. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| `cycleTheme` walks into a locked theme → Ctrl+J looks broken | **High** | Skip locked in `cycleTheme`; boot apply uses `{force:true}`; smoke test |
| Ledger writes flood the workspace mirror → AppHang | **High** | Coalesced 1.2 s flush (§4.5); never award from a timer/RAF; profile it |
| localStorage quota — images or points blowing the store | **High** | Bytes on disk only; `media:inline` fallback hard-capped; never base64 into the store |
| 15 of 17 games locked feels hostile | Medium | 4 free themes, cheap games, demo previews, visible progress |
| Untrusted image upload (EXIF/GPS/malformed) | Medium | Magic-byte sniff, size/dim caps, re-encode through `image` |
| "Leaderboard" implying global when it's local | Medium | Explicit mode labelling; no global-looking UI without a backend |
| New JS files load in the wrong order | Medium | `29`/`38` bug already shipped once; add to `index.html` **and** verify bundle order |
| Whole-workspace mirror grows large | Low | Points history capped at 400; assets excluded from backup |
| Timezone/clock tampering inflates points | Low | Daily caps + 600/day ceiling bound the damage; document it |
| `assetProtocol` scope too broad | Low | Scope to `**/pebble/assets/**` only, not a bare `**` |

---

## 11. Definition of done

- [ ] `npm run build` produces bundles with the new files in the right order
- [ ] `npm test` passes (Phase 0 made it work again) and covers the guards
- [ ] Ctrl+J cycles only through unlocked themes
- [ ] `NX.launchGame` cannot start a locked game by any path (grid click, palette, deep link, `NX.launchGame` direct call)
- [ ] No award can exceed the daily cap or the 600/day ceiling
- [ ] Store write rate under a 5-minute arcade session is ≤ the pre-change baseline
- [ ] A 5 MB / 6000×6000 / non-image / malformed image upload is rejected with a clear message and writes nothing
- [ ] Uploaded images carry no EXIF/GPS after import
- [ ] Deleting an asset is recoverable via `.trash`
- [ ] Every leaderboard view states its mode (personal / local / global) and marks global rows unverified
- [ ] A locked item is never spendable without a confirm modal
- [ ] All 13 existing themes + new ones render with no layout change (DESIGN.md principle 2)
- [ ] `DESIGN.md` documents the earn table, price tiers, and the token-only theme rule

---

## 12. File map of the change

```
NEW
  renderer/js/45-points.js          ledger, levels, earn rules, caps
  renderer/js/46-store.js           store route, 4 tabs, purchases, cosmetics
  renderer/js/47-leaderboard.js     personal + local league boards
  renderer/js/48-media-library.js   picker, gallery, drop zone, paste
  renderer/css/15-rewards.css       store, leaderboard, media, lock states
  src-tauri/src/assets.rs           asset storage + validation + thumbnails

MODIFIED
  renderer/index.html                        +4 script tags (order matters)
  renderer/js/00-core.js                     store.isUnlocked, flush coalescing
  renderer/js/03-native.js                   +assetImport/List/Delete/Export
  renderer/js/11-shell.js                    applyTheme lock, cycleTheme skip,
                                             NAV groups, sidebar balance
  renderer/js/01-data.js                     profile.pid, defaults
  renderer/js/29-games.js                   launchGame guard, locked cards
  renderer/js/38-arcade.js                   award hooks, leaderboard mount point
  renderer/js/30-settings.js                 Rewards section, avatar upload
  renderer/js/10-login.js                    avatar upload
  renderer/js/22-notes.js                    image insert
  renderer/js/21-chat.js                     attachments
  renderer/js/23-todo.js                     cover image
  renderer/js/28-media.js                    "Save to library"
  renderer/js/37-backup.js                   exclude assets/
  renderer/css/00-tokens.css                 +reward tokens, new themes
  src-tauri/src/lib.rs                       mod assets; +league_read/merge
  src-tauri/src/ext_bridge.rs                +points MCP tools
  src-tauri/tauri.conf.json                  assetProtocol scope
  extension/manifest.json + popup.js         level/balance display
  package.json                               lint script
  .github/workflows/build.yml                test + lint steps
  .gitignore                                 untrack generated bundles
  DESIGN.md                                  new "Points & store" section
  scripts/smoke-test.js                      fix + new coverage
```

---

## 13. Open questions for the user

1. **Global leaderboard — yes or no?** It is the single largest scope item. Without it the feature is fully offline and free to ship; with it you are committing to a backend and an ops burden.
2. **Truly 2 free games, or 4 free themes + 2 free games?** Recommendation in §5.4/§5.5: free themes, 2 free games, cheap unlocks, demo previews.
3. **Should points be earnable offline and synced later, or only online?** Recommendation: earn offline, sync opportunistically — keeps the app usable with no network, which is its defining trait.
4. **Do purchased themes ever expire (seasonal) or are they permanent?** §5 assumes permanent. Seasonal needs an expiry field and a re-unlock path.
5. **Asset budget per user** — §7.7 proposes 500 MB / 500 assets. Confirm or change.
6. **Do you want the `electron/` dead-code removal in this pass?** Recommended (Phase 0.7) but it touches packaging.