# PebbleX — Design System

> "One calm workspace."
> Single source of truth for the visual language of PebbleX.
> Everything below is derived from the code in `renderer/css/`, `renderer/index.html`, and the theme registry in `renderer/js/11-shell.js`.

---

## 1. Product identity

| | |
|---|---|
| **Name** | PebbleX (package `pebblex`, desktop product `Pebble`, appId `com.nexadesk.app`) |
| **Tagline** | One calm workspace |
| **Version** | 0.1.0 |
| **Shape of the mark** | Rounded-square "pebble" glyph, dark tile + green rim light |
| **Voice** | Quiet, confident, no exclamation marks. Short verbs. "Resume", "Focus", "Calm". |
| **Signature** | The green pill. Selection, active nav, primary confirm, meter fill — all green. |

### Brand mark
- Container: rounded square `22px` radius, `68×68` (splash), `56px` (onboarding big), `46px` (login), `34px` (sidebar brand), `28px` (widget).
- Fill: `linear-gradient(135deg, #1c261b, #151d14)` on the splash; `var(--tile)` / `var(--tile-ink)` everywhere the theme is live.
- Green rim: `1px solid rgba(124,213,110,.25)` + glow `0 0 20px rgba(124,213,110,.15)`.
- Glyph: two-tone pebble SVG — body in `currentColor`, contour highlight stroked in `#7CD56E`.

---

## 2. Design principles

1. **Calm over clever.** Soft surfaces, hairline borders, one accent. No gradients on text, no glassmorphism in the app body (blur only on the onboarding backdrop).
2. **Structure never changes with theme.** A theme swaps token *values* only. Never write a `[data-theme]` rule that changes layout, radius, or spacing.
3. **Cards are elevated, wells are recessed.** `surface` + `--sh-card` = a card. `surface-2` / `surface-3` = wells, columns, tracks. `--line` = the hairline between them.
4. **Green means "active / done / positive".** It is never decorative.
5. **Density is desktop density.** 13–14px body, 38px control height, 40px nav rows. It should feel like a tool, not a landing page.
6. **Motion is short and functional.** 120–400ms, ease-out, never blocking.

---

## 3. Design tokens

All tokens live in `renderer/css/00-tokens.css` under `:root`. Never hardcode a color in a component — add a token.

### 3.1 Surfaces

| Token | Default (Elera Light) | Role |
|---|---|---|
| `--bg` | `#F6F5F3` | App background, sidebar, page gutters |
| `--surface` | `#FFFFFF` | Cards, modals, menus, chat body |
| `--surface-2` | `#F1F0ED` | Wells, columns, inputs' rest fill, chips |
| `--surface-3` | `#EBEAE6` | Hover wells, tracks, inactive chip fill |
| `--line` | `#EBEAE6` | Hairlines, dividers |
| `--line-strong` | `#E0DFDA` | Input borders, scrollbar thumbs, kbd keys |
| `--dark-card` | `#2B2B28` | Inverted panels (heatmap, ext bridge, weather) |
| `--dark-card-2` | `#35352F` | Inverted secondary cells |

### 3.2 Ink

| Token | Value | Role |
|---|---|---|
| `--ink` | `#121212` | Primary text, active chip fill |
| `--ink-2` | `#5C5E63` | Secondary text, muted labels |
| `--ink-3` | `#8B8D93` | Tertiary / meta / disabled |
| `--ink-4` | `#B4B6BB` | Faintest — scrollbar thumb, placeholders of placeholders |

Inverted-card text is `#F6F5F3` (title), `#B9B9B2` (body), `#9B9B94` (meta).

### 3.3 Brand green

| Token | Value | Role |
|---|---|---|
| `--green` | `#7CD56E` | Primary accent fill |
| `--green-hover` | `#6FCB61` | Hover on green fills |
| `--green-deep` | `#3E9E33` | Green *text* on soft backgrounds |
| `--green-ink` | `#1E4B16` | Text on `--green-soft` |
| `--green-soft` | `#EAF8E6` | Green tint backgrounds, selected channels |
| `--green-ring` | `rgba(124,213,110,.35)` | Focus rings, glow, active nav shadow |

Text on a `--green` fill is always `#0E2B0A` (hardcoded — the "green ink on green" constant).

### 3.4 Accents

Each accent ships a base + a `*-soft` tint.

| Name | Base | Soft |
|---|---|---|
| blue | `#3E7BFA` | `#E7F0FD` |
| red | `#E25C4A` | `#FDEAE7` |
| yellow | `#B98900` | `#FFF4D6` |
| teal | `#0FA3A3` | `#E0F5F5` |
| purple | `#8B5CF6` | `#F1EAFE` |
| pink | `#E05C9C` | `#FCE7F2` |
| orange | `#E8853D` | `#FDEEDF` |

Usage rule: `X-soft` as background + `X` base as text/icon (`pill.red`, `btn-danger`, `rem-row`). Icons on solid accents use `#fff`.

### 3.5 Dark tile / action button

| Token | Light | Dark themes | Role |
|---|---|---|---|
| `--tile` | `#262624` | inverted (`#F4F4F2`) | Dark icon tile behind a white glyph |
| `--tile-ink` | `#F6F5F3` | inverted (`#1B1B19`) | Glyph color on the tile |
| `--btn-dark` | `#1D1D1B` | light fill on dark themes | The black primary action ("+ New") |
| `--btn-dark-hover` | `#111110` | `#ffffff` | |

### 3.6 Geometry

| Token | Value | Applied to |
|---|---|---|
| `--r-lg` | `20px` | Cards, panels, chat body, ai root |
| `--r-md` | `14px` | Inputs, menus, tiles, modals (22px) |
| `--r-sm` | `10px` | Menus items, toolbars, chips, pills |
| `--r-pill` | `999px` | Buttons, chips, meters, badges, swatches |

Ad-hoc radii that are part of the language: `22px` (modal, widget), `24px` (onboarding card), `26px` (login card), `18px` (kanban col, chat members), `16px` (note card, reminder row, prompt card), `13px` (nav item), `12px` (icon tile, input inner).

### 3.7 Elevation

| Token | Value | Role |
|---|---|---|
| `--sh-card` | `0 1px 2px rgba(18,18,18,.04), 0 4px 14px rgba(18,18,18,.04)` | Resting card. Deliberately almost invisible. |
| `--sh-pop` | `0 12px 40px rgba(18,18,18,.14), 0 2px 8px rgba(18,18,18,.06)` | Menus, modals, popovers, hover-lift |
| `--sh-login` | `0 24px 80px rgba(18,18,18,.22)` | Login card only |

Hover-lift on cards is `translateY(-1px..-3px)` + `--sh-pop`. Tapping is `scale(.97)`.

### 3.8 Metrics

| Token | Value |
|---|---|
| `--sidebar-w` | `244px` |
| `--sidebar-mini` | `68px` |
| `--topbar-h` | `64px` |
| `--notes-side-w` | `280px` (fallback, set inline) |
| Base font size | `14px` |
| Base line height | `1.5` |

### 3.9 Spacing scale

There is no spacing token — the scale is implicit and lives in utility classes and component padding. Use these values:

`4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 26` (card padding is `18px 20px 0` + `16px 20px 20px`; modal is `20px 22px 0` + `16px 22px`).

Gutters: `.view-host` = `4px 20px 24px 24px`. Page vertical rhythm = `16px` (`.page{gap:16px}`). Grid gap = `12–16px`.

### 3.10 Z-index ladder

| z | Layer |
|---|---|
| 100 | in-flow content |
| 400 | onboarding backdrop |
| 800 | modal backdrop |
| 900 | context menu |
| 950 | notification center |
| 1000 | toasts container, slash menu |
| 1050 | command palette backdrop |
| 1100 | tooltip |
| 1200 | confetti, mini-sidebar tooltip |
| 999999 | boot splash |

---

## 4. Typography

**Stack:** `'Inter Variable', Inter, -apple-system, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif`
(No `@font-face` is bundled — Inter is used when the host has it, otherwise the system stack. Never assume Inter renders.)
**Mono stack:** `'Sarasa Mono SC', Consolas, monospace` (chat code, API output); `ui-monospace, 'Cascadia Code', Consolas` (AI code blocks, crash logs).
**Numerals:** every metric uses `font-variant-numeric: tabular-nums` (`.mono-num`, stat numbers, clocks, scores).

### Scale

| Role | Size / weight | Tracking |
|---|---|---|
| Display clock | `32px` / 800 | `-0.03em` |
| Pomodoro clock | `44px` / 800 | `-0.02em` |
| Scramble word | `30px` / 800 | `0.28em` |
| Page title (`h1` in topbar) | `21px` / 800 | `-0.02em` |
| Card heading | `15px` / 700 | `-0.01em` |
| Section heading (`h1`) | `24px` / 700 | `-0.02em` |
| Sub-section (`h2`) | `18px` / 700 | `-0.01em` |
| Sub-heading (`h3`) | `15px` / 600 | — |
| Body | `14px` / 400 (1.5) | — |
| Button | `13.5px` / 600 | — |
| Control / menu / input | `13.5px` | — |
| Note body (editor) | `14.5px` / 1.7 | — |
| Small | `12–13px` | — |
| Tiny / meta / time | `10.5–11px` | — |
| Overline / nav label | `10.5px` / 700–800, uppercase | `0.06–0.08em` |
| Brand name | `16.5px` / 800 | `-0.02em` |

Rules: headings carry negative tracking; labels/meta carry positive tracking + uppercase. Never use more than two type sizes inside one card header.

---

## 5. Components

### 5.1 Cards & headers
`.card` (surface + `--r-lg` + `--sh-card`), `.card-h` (`18px 20px 0`, gap `12px`), `.c-title`, `.c-sub`, `.card-b` (`16px 20px 20px`). Inside a dark card, force `#F6F5F3` for the title.

### 5.2 Icon tile
`.tile` — `38×38`, `r-12`, fill `--tile`, glyph `--tile-ink`, svg `18px`. `.tile.sm` — `30×30`, `r-10`, svg `15px`. On dark cards use `rgba(255,255,255,.12)` + `#F6F5F3`.

### 5.3 Buttons
Base `.btn`: `height 38`, `padding 0 16`, `r-pill`, `gap 8`, `13.5px/600`, svg `16px`, `:active{scale .97}`.

| Variant | Fill | Text |
|---|---|---|
| `.btn-dark` | `--btn-dark` | `--bg` |
| `.btn-green` | `--green` | `#0E2B0A` |
| `.btn-soft` | `--surface-3` → `--line-strong` | `--ink` |
| `.btn-ghost` | transparent → `--surface-3` | `--ink-2` → `--ink` |
| `.btn-outline` | transparent + `1px --line-strong` | `--ink` |
| `.btn-danger` | `--red-soft` | `--red` |

Sizes: `.btn-sm` `30/12px`, `.btn-lg` `46/22px, r-16`, `.btn-full`. Disabled = `opacity .5; pointer-events:none`.
`.icon-btn` — `38×38 r-12`; `.sm` — `30×30 r-9`; `.bubble` — filled with `--btn-dark`.

### 5.4 Chips, pills, badges
- `.chip` — `h32 r-pill`, surface fill, `1px` transparent border; `.chip.active` = `--ink` fill / `--bg` text. Inner `.n` count bubble.
- `.pill` — `h22 r-pill`, `11px/700`, `.dot` = `6px` currentColor. Colors: `.green .blue .red .yellow .purple .teal .pink .orange .gray` (soft bg + base text).
- `.count-chip` — `min-w 22 h22`, `--surface-3` / `--ink-2`.
- `.nav-item .ni-badge` — `h19`, `--surface-3`; on active nav → `rgba(255,255,255,.28)` over green.
- `.delta` — `h20 r-7` stat delta: `.up` green, `.down` red, `.warn` yellow.
- `.tagchip` — purple soft, `h22`.
- `.kbd` / `.kbd-combo kbd` — `11px/700`, `--surface-2`, `1px --line-strong`, `border-bottom-width:2px`, `r-7`.

### 5.5 Avatars
`.avatar` — `32px` circle, `12.5px/700`, `#fff` text, color supplied inline from the avatar palette. `.sm 26`, `.lg 44`, `.xl 72`. `.presence` — `11px` `--green` dot, `2.5px solid --surface` ring.
Avatar palette (8): `#7CD56E #5EB8FF #E8853D #8B5CF6 #E05C9C #0FA3A3 #E25C4A #D4A017`.

### 5.6 Inputs
`.input / .select / .textarea` — `h40`, `0 14px`, `r-md`, `1.5px solid --line-strong`, `--surface` fill, `13.5px`. Focus = `border-color --green` + `box-shadow 0 0 0 3px --green-ring`. Placeholder `--ink-3`.
`.textarea` — `min-h 90`, `10px 14px`, resize vertical, `lh 1.55`.
`.select` — custom chevron (inline SVG data-URI, `right 12px center`), `padding-right 34px`.
`.field` — `label 12.5px/600 --ink-2` above, gap `6px`.
`.search-box` — `h38 r-pill`, surface + `--sh-card`, `220px`, focus-within → green border.

### 5.7 Switch / checkbox
`.switch` — `42×24`, track `--line-strong` → `--green`, `18px` white knob, travel `18px`.
`.check` — `20×20 r-7`, `1.5px --line-strong`; `.checked` → `--green` fill, `#0E2B0A` check, `stroke-width 3.2`.
Native checkbox inputs use `accent-color: var(--green)`.

### 5.8 Menus & popovers
`.menu` — `position:fixed; z900; min-w 190px; padding 6px; r-md; --sh-pop; nx-pop .14s`. `.menu-item` `h36 r-9 13.5px`, hover `--surface-2`, `.danger` → `--red`, `.mi-right` trailing hint. `.menu-sep` hairline. `.menu-label` uppercase overline.
Related: `.notif-pop` (`340×480`, `r-18`), `.cmdk` (`560px`, `r-20`, input row `h56`), `.slash-menu` (`280px`, `r-16`).

### 5.9 Modals
`.modal-backdrop` — `rgba(20,20,18,.45)`, z800. `.modal` — `r-22`, `--sh-pop`, `max-w 480` (`.m-lg 640`, `.m-xl 860`), `max-h 86vh`, `nx-pop .18s`. Header `20px 22px 0`, body `16px 22px` scroll, footer right-aligned `gap 10`.
`.ob-card` (onboarding) — `min(560px, 100vw-40px)`, `r-24`, `34px 38px 26px`, centered, `ob-pop` with a slight overshoot (`cubic-bezier(.2,.9,.3,1.2)`).
`.login-card` — `380px`, `r-26`, `--sh-login`, plus a `180px` `--green-soft` circle bleeding off the top-right.

### 5.10 Toasts & tooltips
`#nx-toasts` — fixed bottom-right, `18px` inset, `340px` wide, `gap 10`.
`.toast` — `r-16`, `--sh-pop`, slides in from right. `.t-icon` `34×34 r-11` in `.ok` green-soft/green-deep, `.err` red, `.info` blue. `.t-title 13.5/700`, `.t-msg 12.5 --ink-2`.
`.nx-tip` — `--ink` fill / `--bg` text, `r-10`, `12px/600`, z1100, `nx-pop .12s`.

### 5.11 Data display
- `.etable` — `th 12px --ink-3`, `td 13.5px`, hairline rows, row hover `--surface-2`.
- `.meter` — `h8 r-pill` track `--surface-3`, fill `--green`, `width .4s`.
- `.ring` — SVG, rotated `-90deg`, `.bg` `--surface-3`, `.fg` `--green` round-cap, `.6s` dashoffset.
- `.heat` — 7-col grid, `gap 6`, cells `r-8` `--dark-card-2` / `#B9B9B2`, `.hot` → green fill `#0E2B0A` text, `.today` → `2px` green outline.
- `.seg` — segmented control: `--surface-3` track, `3px` padding, buttons `h30 r-pill`, `.on` = surface + `0 1px 4px` shadow.
- `.empty` — `44px 20px` padding, icon `38px opacity .5`, `.e-title 14.5/700 --ink-2`, `.e-sub 12.5 --ink-3 max-w 280`.
- `.skel` — gradient sweep `90deg` surface-2→3→2, `1.2s`.

---

## 6. App shell

```
┌──────────────┬───────────────────────────────────────┐
│  sidebar     │  topbar 64px  (title · search · bell) │
│  244px       ├───────────────────────────────────────┤
│  (68 mini)   │  .view-host  (4/20/24/24 padding)    │
│              │                                       │
│  [avatar]    │                                       │
└──────────────┴───────────────────────────────────────┘
```

- **Brand row** — 34px mark, `16.5px/800` name + optional `.env` chip, 28px collapse button (svg rotates `180deg` in mini).
- **Nav** — grouped by `nav-label` overlines (`Workspace` / `Intelligence` / `Explore`). `.nav-item` `h40 r-13 13.5/600`, hover `--surface-3`. **Active = `--green` fill, `#0E2B0A` text, `0 4px 14px --green-ring`, plus a 4×26 `--ink` bar on the left of the server rail variant.** In mini mode labels collapse and `data-name` renders as a fixed tooltip.
- **Sidebar footer** — hairline top border, `side-user` avatar + name + plan.
- **Topbar** — `.page-title 21px/800` with an optional 12.5px sub; right side holds search, notif bell, avatar.
- **Notification center** — `.notif-item` `r-12`; `.unread` = `--green-soft`.
- **Bell badge** — 15px `--red` pill, `2px solid --bg` ring.
- **Command palette** — top-anchored at `14vh`, `560px`; `.cmdk-item` `r-12`, hover/on `--surface-2`; right side `.ck-go` kbd hint.
- **Stat strip** — a single card split by `1px --line-strong` left borders; `.s-num 23px/800` tabular, with `.of` and `.unit` suffixes.
- **Dashboard grids** — `.dash-grid 1.6fr 1fr`, `.dash-row2 1fr 1fr 1.2fr`, `.dash-live 1.1fr 1fr`, all `gap 16`.

---

## 7. Theme system

13 themes. Registry + swatch preview data: `renderer/js/11-shell.js` (`NX.THEMES`). Token overrides: `renderer/css/00-tokens.css`. Applied by setting `data-theme` on `<html>` and persisting to `settings.theme`. `NX.cycleTheme()` walks the list.

| id | Name | Dark | `--bg` | `--surface` | Accent (`--green` slot) |
|---|---|---|---|---|---|
| `elera` | Elera Light | no | `#F6F5F3` | `#FFFFFF` | `#7CD56E` |
| `pebble-dark` | Pebble Dark | yes | `#161614` | `#1F1F1D` | `#7CD56E` |
| `midnight` | Midnight | yes | `#0B1020` | `#111730` | `#5AD8A6` |
| `nord` | Nord | yes | `#2E3440` | `#3B4252` | `#A3BE8C` |
| `forest` | Forest | yes | `#101610` | `#172017` | `#8FD97A` |
| `rose` | Rose | no | `#FBF3F4` | `#FFFFFF` | `#E8849B` |
| `ocean` | Ocean | no | `#F1F6F8` | `#FFFFFF` | `#2EB5A0` |
| `mono` | Mono | no | `#F4F4F4` | `#FFFFFF` | `#1A1A1A` |
| `sunset` | Sunset | no | `#FBF4EF` | `#FFFFFF` | `#F08A4B` |
| `candy` | Candy | no | `#F5F2FB` | `#FFFFFF` | `#9E7BFF` |
| `coffee` | Coffee | no | `#F3EEE8` | `#FFFFFF` | `#B08954` |
| `slate` | Slate | yes | `#181B20` | `#20242B` | `#8FA3BF` |
| `neon` | Neon | yes | `#0C0C0F` | `#141419` | `#5EF38C` |

### Adding a theme
1. Add a `[data-theme="id"]{ ... }` block in `00-tokens.css` overriding **only** tokens.
2. Add the registry entry in `11-shell.js` with `id, name, dark, bg, side, main, pill`.
3. Do **not** add a layout or radius override.

### Known token gaps (fix before shipping new themes)
- `--orange-deep` is referenced in `20-dashboard.js` / `31-prompts.js` but never defined — it silently falls back to `var(--ink-2)`.
- `--sh-soft` is referenced once in `.resume-banner .rb-ic` with an inline fallback.
- `elera` has no `[data-theme]` block; it *is* the `:root` default.
- `pebble-dark`, `forest` rely on `:root` for `--green-hover` / `--green-deep` / `--green-ring`.

---

## 8. Module patterns

| Module | Signature pattern |
|---|---|
| **Chat** | 70px server rail of `.srv-tile` (`46px r-16`, squashes to `r-13` on hover/active, `-2px` lift) → `250px` `.chan-list` on `--surface-2` → chat body `--surface` with `--r-lg` on the top-left only. Messages: 32px avatar + author in avatar color + `10.5px` time; consecutive messages `.grouped` (hide head until hover). `@mention` = `--green-deep` on `--green-soft`. Composer: `--surface-2` well, `r-18`, `1.5px` transparent border → green on focus, `36px r-12` green send button. |
| **Notes** | Two-column: list (`280px`) + editor. `.note-card` `r-16`, 1.5px transparent border → green when selected, hover lifts `-1px`. Editor: toolbar hairline row, `19px/800` borderless title, split / edit / preview modes. Folders are `--surface-2` pills; active = `--green-soft` + green text. Trash banner = `--red-soft` with a `--red` bottom border. |
| **Tasks** | Kanban: `grid-auto-flow: column`, 280px columns, `.kcol` on `--surface-2` `r-18`; `.dragover` = `--green-soft` + dashed `2px` green outline inset `-4px`. `.task-card` `--surface r-14`, grab cursor, dragging = `opacity .45` + `rotate(1.5deg)`. Column color dot uses `--kc`. |
| **Pel AI** | Message max-width 76%; AI bubble `--surface-2` with a 6px top-left corner, user bubble `--green` with `#0E2B0A` text and a 6px top-right corner. Suggestion chips `h30`. Caret = `7×14` green block blinking at `1s`. |
| **Timeless** | `1fr 340px` grid. Productivity donut ring (`112px`, number `26px/800`). App rows `34px r-11` tiles, `.ar-bar` meter capped at `180px`. Category colors: Productive `--green`, Neutral `--yellow`, Distraction `--red`. Heat strip = `.timeline-strip` `h34 r-10`. |
| **Reminders** | `.rem-row` `--surface r-16` with a `4px` left border in `--rm` (the reminder's own color); `.overdue` forces `--red`. |
| **Prompt Saver** | `.pr-card` `--surface`, `1px --line`, `r-18`; icon `34px r-11` on `--green-soft` with `--green` glyph; body preview in a `--surface-2` well, `min-h 54`. Favorite star = `--orange`. |
| **Media** | Canvas stage in `--surface-2 r-18`, canvas `r-10` with `--sh-pop`. Marker tool = 0.45 alpha, 3× line width. Ink palette (9): `#E25C4A #E8853D #E9C46A #7CD56E #5EB8FF #8B5CF6 #E05C9C #121212 #FFFFFF`. |
| **Arcade** | `.game-card` grid `minmax(220px,1fr)`, `46px r-14` colored icon tile, hover `-3px`. 2048 uses its own fixed warm ramp ending on `--green` for the 2048 tile. Simon pads `120×120 r-22`. Aim target = radial green dot on a `--surface-2` pad. |
| **Settings** | Sticky 220px nav + content. `.set-row` hairline-separated, `.hotkey-row` same. Theme picker: `.theme-card` `2px` transparent border → green when active, with a `.theme-swatch` mini-mockup (sidebar / main / pill layers). |
| **Widget** | Transparent window, `body.widget-mode`. `.widget` `r-22`, `--surface`, hairline, `0 16px 40px` shadow. Head `28px` mark + `13.5px/800` title. Clock `32px/800 -0.03em`. `.mini-mode` drops to `18px` clock and hides `.w-hide-mini`. |

### Markdown (notes preview + AI)
`md-h1 24px` (rule under) · `md-h2 19px` · `md-h3 16px --ink-2` · body `1.7` line-height · `md-quote` = `3px` green left border on `--green-soft`, `r-0 12 12 0` · `md-callout` = `r-14`, `1px --line`, `16px 6px` · `md-codeblock` = `--surface-3`, `1px --line`, `r-12`, header strip `rgba(0,0,0,.06)` uppercase 11px, copy button turns green on hover · `md-pre` = `12.5px/1.6` mono · `md-table` with `--surface-3` header · `md-mark` = `rgba(255,220,50,.35)` · `md-link` = `--green-deep` underlined.
Callout colors: tip/success `--green-soft`, info `--blue-soft`, warning `--yellow-soft`, danger `--red-soft`, note `--surface-3`.

---

## 9. Motion

### Keyframes
| Name | Behavior | Duration |
|---|---|---|
| `nx-fade-up` | `translateY(10px)` → 0 + fade | `.25–.30s` |
| `nx-fade` | opacity | `.15–.25s` |
| `nx-pop` | `scale(.92)` → 1 + fade | `.12–.18s` |
| `nx-slide-in` | `translateX(24px)` → 0 (toasts) | `.22s` |
| `nx-spin` | rotate (spinners) | — |
| `nx-pulse` | opacity `1 → .45` | `1.6–2.4s` |
| `nx-shake` | horizontal jitter (form errors) | `.4s` |
| `nx-confetti` | `translateY(120vh) rotate(720deg)` | `1.4s` |
| `nx-bar-grow` | `scaleY(0)` → 1 | — |
| `nx-typing` | 3-dot typing indicator, `.15s` stagger | `1.1s` |
| `skel` | shimmer sweep | `1.2s` |
| `ob-pop` | onboarding overshoot `cubic-bezier(.2,.9,.3,1.2)` | `.35s` |
| `ai-blink` / `nx-splash-*` | caret blink, splash pulse + slide | `1s / 2s / 1.2s` |

### Transition defaults
`background .12–.15s`, `color .12–.15s`, `border-color .15s`, `transform .1s` (press), `box-shadow .15s`, `width/height .3–.4s` (meters), `stroke-dashoffset .6s` (rings). Theme change crossfades `background`/`color` over `.25s`.

### Interaction
- Press: `scale(.97)` (`.96` on Simon pads, `.92` on send).
- Hover lift on cards: `-1px` (notes, tasks) to `-3px` (games, API cards, theme cards).
- Drag: source `opacity .4` + slight scale/rotate; drop target = `--green-soft` + dashed `2px` green outline.

---

## 10. Iconography

- Inline SVG sprites only, built by `NX.icon(name, size)` in `renderer/js/00-core.js`. No icon fonts, no external requests.
- Sizing ladder: `11` (inline meta) → `13` (toolbars) → `15` (chip / small tile) → `16–17` (button, menu) → `18–19` (icon button, nav) → `20–22` (card / game).
- Default stroke style: `stroke-width 2`, round caps/joins, `fill="none"` (exceptions: the brand pebble glyph and game icons are filled).
- Global guard in `04-modules.css`: `svg{max-width:48px;max-height:48px}`.
- Every icon-only button carries `data-tip` for the `.nx-tip` tooltip.

---

## 11. Accessibility

- Focus ring: `:focus-visible{outline:2px solid var(--green); outline-offset:2px; border-radius:6px}`. Inputs swap the outline for `border-color --green` + `0 0 0 3px --green-ring`.
- Green text never sits on green fill below `--green-soft` contrast — use `--green-deep` / `--green-ink`.
- Ink ramp guarantees ≥3 levels of de-emphasis; `--ink-4` is for decorative hairlines only, never body copy.
- Reduced motion: add `@media (prefers-reduced-motion: reduce){ *{animation-duration:.01ms!important; transition-duration:.01ms!important} }` — **not yet implemented.**
- `::selection` uses `--green-ring`.

---

## 12. Boot splash

`#nx-splash` in `renderer/index.html`, inline (zero external dependency, paints first).
`#141413` background, `#F4F2EE` text, 68px mark with green pulse glow, `Pebble` + green `X` badge, sub "One calm workspace", 140×3 loader bar with a green shimmer sliding `1.2s`. Fades out over `.35s` on `cubic-bezier(.16,1,.3,1)`. Hidden entirely in `body.widget-mode`.

---

## 13. Rules for new UI

1. Use tokens. If you need a new color, add it to `:root` **and** to every theme that needs it.
2. Copy an existing component's geometry before inventing one — radius, height, and shadow ladder are already decided.
3. New interactive elements need `:hover`, `:active`, `:focus-visible`, and `[disabled]` states.
4. Anything clickable without a label gets `data-tip`.
5. New colors that are categorical must also ship a `*-soft` tint for backgrounds.
6. If it appears in the shell, it must survive all 13 themes without layout changes.
7. A disabled feature must show **why** it is off and how to turn it back on — never a blank view.
8. Never show a number that is not measured. If there is no data source, omit the stat rather than inventing one.
9. Respect `prefers-reduced-motion` on anything you animate, and keep the `body.no-motion` escape hatch working.
10. Give every new switchable module a registry entry in `52-modules.js`, or it cannot be disabled.

---

## 14. File map

| File | Contents |
|---|---|
| `renderer/index.html` | Boot splash + CSS/JS load order + root containers (`#nx-login #nx-app #nx-widget-root #nx-overlay-root #nx-toasts`) |
| `renderer/css/00-tokens.css` | Tokens + all 13 theme overrides |
| `renderer/css/01-base.css` | Reset, typography, scrollbars, focus, keyframes, utilities |
| `renderer/css/02-components.css` | Cards, buttons, chips, avatars, inputs, menus, modals, toasts, tables, meters |
| `renderer/css/03-shell.css` | Login window, sidebar, topbar, notification center, command palette, stat strip |
| `renderer/css/04-modules.css` | Chat, notes, kanban, AI, Timeless, reminders, API, media, games, settings, markdown |
| `renderer/css/05-timeless.css` | Live-session card, extension bridge card |
| `renderer/css/06-widget.css` | Desktop widget + mini mode |
| `renderer/css/07-upgrade.css` | Onboarding, dashboard live cards, AI chat, crash/bug reports |
| `renderer/js/00-core.js` | `NX.icon`, `NX.h`, `U.colorFor`, avatar palette, utilities |
| `renderer/js/11-shell.js` | `NX.THEMES`, theme engine, `NAV` model, sidebar filtering |
| `renderer/js/45-points.js` | Rewards ledger: earn rules, daily caps, levels, coalesced writes |
| `renderer/js/46-cloud.js` | Optional Firebase/Supabase cloud layer (offline no-op) |
| `renderer/js/49-store.js` | Entitlements, theme + game gates, Store route |
| `renderer/js/50-leaderboard.js` | Personal / league / global boards |
| `renderer/js/51-media-library.js` | Image picker, gallery, R2 sync |
| `renderer/js/52-modules.js` | Module registry, enable/disable, route guard, offline mode |
| `renderer/js/53-apps.js` | App tiles, long-press sheet, hide, System panel |
| `renderer/js/54-google-sync.js` | Google Tasks two-way sync + Drive backup |
| `renderer/css/15-rewards.css` | Points HUD, store, leaderboard, lock states |
| `renderer/css/16-apps.css` | App grid, sliders, folders, Google panel, smooth sidebar |
| `src-tauri/src/assets.rs` | Image validation, EXIF strip, derivatives, CRUD |
| `src-tauri/src/sysctl.rs` | Brightness, volume, battery, data locations |
| `cloud/pebble-media-api/` | Worker + R2 image service |

---

## 15. Rewards economy

Points are **earned by using the app** and spent on identity. `NX.points`
in `renderer/js/45-points.js`; entitlements in `renderer/js/49-store.js`.

| Store key | Shape |
|---|---|
| `points` | `{ balance, lifetime, spent, earnedToday, earnedTodayKey, capsToday, flags, history }` |
| `entitlements` | `{ owned, equipped, avatarImg, frame, title, showcase }` |

- `balance` is spendable. `lifetime` **never decreases** — spending cannot
  demote you, and level + leaderboard rank both read `lifetime`.
- `history` is a ring capped at 400 entries.
- **Only disabled modules are persisted** to `modules`, so a module shipped
  in a later release inherits its registry default instead of a stale `off`.

### Earn rules and daily caps

| Event | Points | Cap/day |
|---|---|---|
| Win a game | `10 + floor(score/50)`, max 60 | 200 |
| New personal best | 25 | 100 |
| Play any game | 2 | 50 |
| Complete a focus round | 15 | 120 |
| Daily challenge solved | 40 + `15 × (streak−1)`, max 140 | once/day |
| Achievement unlocked | 50 | once ever |
| Complete a task | 10 | 100 |
| Write a note | 8 | 60 |
| Hour of tracked productive time | 20 | 60 |
| 7-day streak bonus | 100 | once/week |
| First launch of the day | 15 | once/day |

**Global ceiling: 600 points/day.** Surplus awards are dropped silently.
This is the anti-grind guard — without it, points measure idle time rather
than consistency and the leaderboard is meaningless.

Focus rounds under 60 s and game sessions under 15 s earn nothing.

### Price tiers

| Kind | Free | Common | Rare / Mid | Deep | Legendary / Premium |
|---|---|---|---|---|---|
| Themes | `elera`, `pebble-dark`, `midnight`, `nord` | 150 | 350 | — | 700 |
| Games | `gm_2048`, `gm_snake` | 100 | 200 | 350 | 500 |

**Say "unlock", never "buy."** No payment integration exists; a points gate
is an honour system and the copy must reflect that.

Every purchase goes through `NX.confirm`. Never a single click.

### Copy rules

- Level titles are earned automatically (`Rookie` → `Pebble Legend`).
- A locked item stays **visible** with its price. A padlock nobody sees is
  a feature nobody discovers.
- Cosmetic frames are CSS-only (~30 lines for all 8).

---

## 16. Apps, modules and offline mode

`renderer/js/52-modules.js` holds one registry of every switchable module;
Settings, the Apps screen and the route guard all read from it.

```js
{ id, n, ic, group, on, core, d, net }
```

- `core: true` modules **cannot be disabled** — disabling the shell or the
  store would strand the user with no way back.
- `net: true` marks a module that needs the internet (AI, weather, sync).

### Disable means stopped, not hidden

Disabling calls the module's `setEnabled()`, which clears its timers:

| Module | Effect |
|---|---|
| Timeless | stops the 2 s foreground-window poll |
| Reminders | clears the 15 s scheduler interval |
| Extension | stops the 4 s bridge drain |
| Widget | closes the widget window |
| Weather | clears the dashboard card |

A "disabled" module that keeps polling in the background is not disabled.

### Route guard

Every route is wrapped so a disabled module shows an explanation with a
"Turn it back on" button, rather than a blank view.

**Load-order trap:** modules register their routes via `routeInShell` at
load time, and `52-modules.js` loads at position 52 — long after. Wrapping
only `Router.register` from that point on would guard **nothing**. The guard
therefore re-wraps `Router.routes` on install. There is a test for this.

### Offline mode

A hard local switch, not a UI preference. `NX.netFetch()` **rejects** while
offline, so a module that forgets to check still cannot reach the network.
Switching it on also force-disables cloud sync.

---

## 17. Images

Local-first. An import always lands on local disk first and is usable with
the network unplugged; sync is opt-in.

```
<AppData>/pebble/assets/<id>/{full,512,128,64,32}.png
<AppData>/pebble/assets/index.json      metadata only — never image bytes
```

Security model (`src-tauri/src/assets.rs`) — uploaded bytes are untrusted:

1. Sniff the real format from **magic bytes**, never the extension or the
   declared MIME type.
2. Cap at 12 MB and 40 megapixels.
3. **Decode and re-encode** through the `image` crate. This strips
   EXIF/GPS/ICC and any appended payload, so a polyglot never reaches disk
   verbatim.
4. Store under a generated id — only `[a-f0-9]{8,64}` reaches the
   filesystem, so there is no traversal surface at all.
5. Delete moves to `.trash` (recoverable), never a hard delete.

**Never base64 an image into `NX.store`** — it would be serialised into the
workspace mirror on every write and blow past the localStorage quota.

Cloud copies reuse the same four fixed sizes. Cloudflare Images Free allows
only 5,000 unique transformations/month before failing with `9422`, which an
avatar-heavy app would hit at ~1,600 users. Pre-generated immutable objects
mean zero transformation requests.

Avatar rendering goes through **one** helper, `NX.avatarHtml(profile, size)`,
so a half-landed image feature cannot produce mismatched avatars.

---

## 18. System controls

`src-tauri/src/sysctl.rs` shells out to PowerShell, matching the existing
pattern in `pick_text_files()` and `asr_record()`. Nothing here is
reachable from the current dependency set.

| Control | API | Failure mode |
|---|---|---|
| Brightness | WMI, then Dxva2 `SetMonitorBrightness` | unsupported on external monitors / VMs |
| Volume | `IAudioEndpointVolume` (Core Audio COM) | `E_NOTIMPL` over RDP / headless |
| Battery | `Win32_Battery` | reports 100% on desktops |
| Data locations | filesystem | always works |

**Every control returns `{ ok, supported, error }` and never throws.** A
slider that throws is worse than one that reports "unsupported". Sliders
debounce at 140 ms — never spawn a process per pixel.

Honest labelling matters more than feature count here: the foreground-window
reader is called **"App in focus"**, not "Windows notifications", because
WinRT `UserNotificationListener` is unreachable and it does not read
notification text.

---

## 19. Third-party sync

`renderer/js/54-google-sync.js`. Google Tasks (two-way) and Google Drive
(daily backup). All of it runs in the renderer because `src-tauri` has no HTTP
client — adding `reqwest` for one feature would mean new dependency risk on a
toolchain that is already crashing.

### Conflict rule

Both sides are timestamped, so "edit on either side, it shows up on the other"
works without a merge UI:

| Condition | Winner |
|---|---|
| Remote newer | remote |
| Local newer | local |
| Identical timestamps | **local** |
| Missing local timestamp | remote |
| Missing remote timestamp | **local** |
| Neither side changed since last sync | local |

Two rules matter most:

1. **A missing timestamp always favours local.** An unprovable remote edit
   must never erase work.
2. **The losing version is never discarded.** It goes to the conflict log with
   both timestamps and shows in Settings as "Kept local".

A conflict is never silent. That is the difference between sync and data loss.

### Credential handling

- Tokens are never rendered into the DOM.
- `disconnect()` **deletes** them rather than flipping a flag, so the
  credential cannot survive in the workspace file or a later backup.
- `backupPayload()` strips `googleSync`, `mediaSync`, `session` and `auth`
  before anything is uploaded. There is a test asserting the refresh token,
  access token, PIN hash and account email are all absent.
- Both sync paths refuse to run while offline mode is on.

⚠️ The refresh token still sits in `workspace.json` unencrypted. Windows
Credential Manager would fix it and needs new Rust — not done.

### Brand marks are the one exception to the token rule

Every other icon is `currentColor` + `stroke-width 2`, so it re-tints per theme. **Google logos must not.** `NX.glogo(name, size)` in `00-core.js` returns filled, multi-colour SVG in Google's published palette:

| id | Mark |
|---|---|
| `g` | the four-colour G |
| `tasks` | blue check |
| `drive` | tri-colour triangle |
| `keep` | amber bulb |
| `calendar`, `photos` | also available |

Keep them outside the single-path map (`P`) — they cannot live there. 35 tests
assert they are filled, not stroked, and carry real brand colour.

⚠️ These are hand-drawn approximations, not Google's official asset files.
Google's brand guidelines require marks be used unmodified and not imply
endorsement. Before shipping publicly, download the official SVGs from
<https://about.google/brand-resource-center/> and swap them in — `glogo()`
takes a size and class, so only the SVG body changes.

### Google Keep

Not integrated, deliberately. Keep's REST API is enterprise-only: it needs
domain-wide delegation from a Workspace Super Admin, and consumer accounts
get `invalid_scope`. Google Tasks is the checkbox API that works everywhere.
Say this plainly in the UI rather than shipping something that 403s.

---

## 20. Website & admin

Separate Vite + React app in `Website/`. Shares tokens and product voice,
not code.

```
/            marketing          /app      workspace
/download    downloads          /login    /signup
/docs        documentation      /admin    administration
/changelog   releases
```

### Design rules on the site

- Same token vocabulary (`--surface`, `--green-soft`, `--r-md`) so the site
  and the app read as one product.
- **Marketing pages never fabricate metrics.** Show a number only if it is
  measured. If a counter has no data source yet, say so rather than
  inventing one.
- Download buttons must trigger a real download. A simulated progress bar
  that resolves to nothing is a lie the user can feel.

### Supabase model

Migrations in `Website/backend/supabase/`, applied in order.

| Table | Purpose |
|---|---|
| `profiles` | one row per account. `account_enabled` + `protected_account` gate access |
| `workspace_items` | notes/tasks/messages. `origin` records which surface wrote it |
| `devices` | web / desktop / extension, heartbeated |
| `app_usage` | aggregate minutes. `usage_consent` is per-user and required |
| `activity_events` | metadata-only audit log |

Identity is **Firebase** (`px_valid_identity()` validates the Google
issuer); Supabase is the database. `px_admin()` reads the server-issued
`admin` claim — it is never read from client storage.

Privacy rule, already enforced by RLS: **admins see counts, never private
note or message bodies.** `admin_usage_summary()` returns aggregates only.
Preserve that if you add admin tooling.