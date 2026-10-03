import { useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import { THEMES, themeById } from "../lib/themes";
import { BrandMark, Icon, PebbleGlyph } from "./Icon";
import { HiddenSpot } from "./Extras";
import { SoundToggle } from "./Sound";
import { TOTAL_SECRETS } from "../lib/secrets";

function Newsletter() {
  const { toast, confetti } = useStore();
  const [v, setV] = useState("");
  const [sent, setSent] = useState(false);
  const ok = /.+@.+\..+/.test(v);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) {
          toast({ kind: "err", title: "That email looks restless", msg: "Check it once more." });
          return;
        }
        setSent(true);
        confetti();
        toast({ title: "You're on the quiet list", msg: "One short email per release. Nothing else." });
        setTimeout(() => {
          setSent(false);
          setV("");
        }, 2600);
      }}
      className="relative overflow-hidden rounded-[22px] border border-line p-6"
      style={{ background: "var(--surface)", boxShadow: "var(--sh-card)" }}
    >
      <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full opacity-70 blur-xl" style={{ background: "var(--green-soft)" }} />
      <div className="pointer-events-none absolute right-16 top-10 h-10 w-10 rounded-full opacity-40 blur-md" style={{ background: "var(--green-soft)" }} />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-green-soft text-green-deep">
            <Icon name="mail" size={15} />
          </span>
          <div className="text-[15px] font-bold tracking-[-0.01em]">The quiet list</div>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">A short note when a release ships. No tips, no tricks, no streak reminders.</p>
        <div className="mt-4 flex h-11 items-center gap-2 rounded-full border-[1.5px] border-line-strong bg-surface-2 pl-4 pr-1.5 transition-all focus-within:border-green focus-within:bg-surface focus-within:shadow-[0_0_0_3px_var(--green-ring)]">
          <input
            value={v}
            onChange={(e) => setV(e.target.value)}
            type="email"
            placeholder="you@calm.inbox"
            className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
          />
          <button type="submit" className="btn btn-green h-8 px-4 text-[12.5px]" disabled={sent}>
            {sent ? <Icon name="check" size={14} /> : "Join"}
          </button>
        </div>
      </div>
    </form>
  );
}

function SecretMeter() {
  const { secrets } = useStore();
  const pct = (secrets.size / TOTAL_SECRETS) * 100;
  const done = secrets.size === TOTAL_SECRETS;
  return (
    <div className="rounded-[22px] border border-line p-6" style={{ background: "var(--surface)", boxShadow: "var(--sh-card)" }}>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-[10px]" style={{ background: "var(--purple-soft)", color: "var(--purple)" }}>
          <Icon name={done ? "gift" : "lock"} size={15} />
        </span>
        <div className="text-[15px] font-bold tracking-[-0.01em]">Secret hunt</div>
        <span className="mono-num ml-auto text-[13px] font-bold text-ink-2">
          {secrets.size}/{TOTAL_SECRETS}
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3">
        <motion.div className="h-full rounded-full" initial={{ width: 0 }} whileInView={{ width: `${pct}%` }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} style={{ background: done ? "var(--purple)" : "var(--green)" }} />
      </div>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {Array.from({ length: TOTAL_SECRETS }).map((_, i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{ background: i < secrets.size ? "var(--green)" : "var(--surface-3)" }}
          />
        ))}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
        {done ? "Every egg found. Genuinely impressive." : <>Right-click, Shift + right-click, the Konami code — and three buttons hiding in plain sight.</>}
      </p>
    </div>
  );
}

export function Footer() {
  const { go, scrollTo, theme, setTheme } = useStore();
  const [hoverTheme, setHoverTheme] = useState<string | null>(null);

  const cols: { h: string; l: [string, () => void][] }[] = [
    { h: "Product", l: [["Download", () => go("download")], ["Changelog", () => go("changelog")], ["Themes", () => go("docs", "themes")], ["Desktop widget", () => go("docs", "widget")]] },
    { h: "Learn", l: [["Documentation", () => go("docs")], ["Quick tour", () => go("docs", "quick-tour")], ["Installation", () => go("docs", "installation")], ["Shortcuts", () => go("docs", "shortcuts")]] },
    { h: "Reference", l: [["Design tokens", () => go("docs", "tokens")], ["FAQ", () => go("docs", "faq")], ["Troubleshooting", () => go("docs", "troubleshooting")], ["Pel AI", () => go("docs", "pel-ai")]] },
  ];

  const socials = [
    ["github", "GitHub"],
    ["twitter", "X"],
    ["discord", "Discord"],
    ["mail", "Email"],
  ];

  return (
    <footer className="zen-hide relative mt-24 overflow-hidden border-t border-line">
      {/* soft ambient wash */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl" style={{ background: "radial-gradient(closest-side, var(--green-soft), transparent)" }} />

      <div className="relative mx-auto max-w-[1180px] px-6">
        {/* ---- top grid ---- */}
        <div className="grid gap-10 py-16 lg:grid-cols-[1.25fr_repeat(3,0.8fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark size={38} />
              <span className="text-[19px] font-extrabold tracking-[-0.025em]">PebbleX</span>
            </div>
            <p className="mt-4 max-w-[280px] text-[14px] leading-relaxed text-ink-2">
              One calm workspace. Chat, notes, tasks, a quiet AI and an honest time tracker — in a single desktop app that never raises its voice.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                ["apple", "macOS"],
                ["windows", "Windows"],
                ["linux", "Linux"],
              ].map(([ic, l]) => (
                <button key={l} onClick={() => go("download")} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] font-semibold text-ink-2 transition-all hover:-translate-y-0.5 hover:text-ink" style={{ boxShadow: "var(--sh-card)" }}>
                  <Icon name={ic} size={13} /> {l}
                </button>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-ink-2" style={{ width: "fit-content" }}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green opacity-60" style={{ animation: "nx-pulse 2s infinite" }} />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green" />
              </span>
              All systems calm · v0.1.0
            </div>
          </div>

          {cols.map((c) => (
            <div key={c.h}>
              <div className="overline">{c.h}</div>
              <ul className="mt-4 space-y-2.5">
                {c.l.map(([label, fn]) => (
                  <li key={label}>
                    <button onClick={fn} className="group flex cursor-pointer items-center gap-1.5 text-[13.5px] text-ink-2 transition-colors hover:text-ink">
                      <span className="h-px w-0 bg-green transition-all duration-300 group-hover:w-3" />
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ---- cards row ---- */}
        <div className="grid gap-4 pb-14 md:grid-cols-2">
          <Newsletter />
          <SecretMeter />
        </div>

        {/* ---- theme strip ---- */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[18px] border border-line bg-surface px-5 py-4" style={{ boxShadow: "var(--sh-card)" }}>
          <div className="min-w-[150px]">
            <div className="overline">Try a theme</div>
            <div className="mt-1 text-[13px] text-ink-2">
              <b className="text-ink">{hoverTheme ?? themeById(theme).name}</b>
              <span className="text-ink-3"> · 13 of them</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={(e) => setTheme(t.id, e.clientX, e.clientY)}
                onMouseEnter={() => setHoverTheme(t.name)}
                onMouseLeave={() => setHoverTheme(null)}
                title={t.name}
                className="h-6 w-6 cursor-pointer rounded-full transition-transform hover:scale-[1.28]"
                style={{
                  background: t.pill,
                  boxShadow: theme === t.id ? "0 0 0 2px var(--bg), 0 0 0 4px var(--ink)" : "inset 0 0 0 1px rgba(0,0,0,.12)",
                }}
              />
            ))}
          </div>
          <div className="ml-auto hidden items-center gap-1.5 lg:flex">
            <span className="kbd">T</span>
            <span className="text-[12px] text-ink-3">to cycle anywhere</span>
          </div>
        </div>

        {/* ---- giant wordmark ---- */}
        <div className="relative select-none overflow-hidden pt-8">
          <div
            className="whitespace-nowrap text-center text-[clamp(56px,14.5vw,190px)] font-extrabold leading-[0.82] tracking-[-0.055em]"
            style={{
              color: "color-mix(in srgb, var(--ink) 9%, transparent)",
              maskImage: "linear-gradient(180deg, #000 34%, transparent 96%)",
              WebkitMaskImage: "linear-gradient(180deg, #000 34%, transparent 96%)",
            }}
          >
            PEBBLE{/* hidden button #2 — the X in the wordmark */}
            <HiddenSpot name="Footer Pebble" title="X marks the spot">
              X
            </HiddenSpot>
          </div>
        </div>

        {/* ---- bottom bar ---- */}
        <div className="relative flex flex-wrap items-center gap-4 border-t border-line py-6">
          <span className="text-[12px] text-ink-3">© {new Date().getFullYear()} PebbleX · com.nexadesk.app</span>
          <div className="hidden gap-4 md:flex">
            {["Privacy", "Terms", "Licenses"].map((l) => (
              <button key={l} className="cursor-pointer text-[12px] text-ink-3 transition-colors hover:text-ink">
                {l}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SoundToggle />
            {socials.map(([ic, l]) => (
              <button
                key={l}
                title={l}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-line bg-surface text-ink-2 transition-all hover:-translate-y-0.5 hover:text-green-deep"
                style={{ boxShadow: "var(--sh-card)" }}
              >
                <Icon name={ic} size={15} />
              </button>
            ))}
            <button
              onClick={() => scrollTo(0)}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-[12.5px] font-bold text-ink-2 transition-all hover:-translate-y-0.5 hover:text-ink"
              style={{ boxShadow: "var(--sh-card)" }}
            >
              <Icon name="arrowUp" size={14} /> Top
            </button>
          </div>
        </div>

        <div className="relative flex items-center justify-center gap-2 pb-8 text-[12px] text-ink-3">
          <PebbleGlyph size={13} />
          Made calmly · Psst — right-click anywhere, or hold <span className="kbd">⇧</span> while you do.
        </div>
      </div>
    </footer>
  );
}


