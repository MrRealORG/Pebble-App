import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent as RME } from "react";
import { animate, motion, useInView, useMotionValueEvent, useScroll, useSpring, useTransform } from "framer-motion";
import { Icon, PebbleGlyph } from "../components/Icon";
import { useStore } from "../lib/store";
import { THEMES, themeById } from "../lib/themes";
import { sfx } from "../lib/audio";

const ease = [0.16, 1, 0.3, 1] as const;

export function Reveal({ children, delay = 0, y = 30, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

function SectionHead({ over, title, sub }: { over: string; title: ReactNode; sub?: string }) {
  return (
    <Reveal className="mx-auto max-w-[760px] text-center">
      <div className="overline">{over}</div>
      <h2 className="mt-3 text-[clamp(34px,5vw,60px)] font-extrabold leading-[1.02] tracking-[-0.045em]">{title}</h2>
      {sub && <p className="mx-auto mt-4 max-w-[560px] text-[17px] leading-relaxed text-ink-2">{sub}</p>}
    </Reveal>
  );
}

function SpotCard({ children, className = "", dark = false, span = "" }: { children: ReactNode; className?: string; dark?: boolean; span?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: RME) => {
    const r = ref.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    ref.current!.style.setProperty("--mx", `${x}px`);
    ref.current!.style.setProperty("--my", `${y}px`);
    const rx = (y / r.height - 0.5) * -5;
    const ry = (x / r.width - 0.5) * 5;
    ref.current!.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.8, ease }}
      className={span}
    >
      <div
        ref={ref}
        data-fall
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className={`spot h-full overflow-hidden rounded-[24px] p-6 transition-[transform,box-shadow] duration-300 ease-out hover:shadow-[var(--sh-pop)] ${className}`}
        style={{ background: dark ? "var(--dark-card)" : "var(--surface)", border: dark ? "none" : "1px solid var(--line)", boxShadow: "var(--sh-card)", color: dark ? "#F6F5F3" : undefined }}
      >
        {children}
      </div>
    </motion.div>
  );
}

function Tile({ icon, dark = false }: { icon: string; dark?: boolean }) {
  return (
    <div className="grid h-[42px] w-[42px] place-items-center rounded-[13px]" style={{ background: dark ? "rgba(255,255,255,.12)" : "var(--tile)", color: dark ? "#F6F5F3" : "var(--tile-ink)" }}>
      <Icon name={icon} size={19} />
    </div>
  );
}

export function Bento() {
  const [ring, setRing] = useState(0);
  const ringRef = useRef<HTMLDivElement>(null);
  const inView = useInView(ringRef, { once: true });
  useEffect(() => {
    if (inView) setTimeout(() => setRing(76), 200);
  }, [inView]);
  const C = 2 * Math.PI * 46;
  return (
    <section id="features" className="mx-auto max-w-[1180px] px-5 py-28">
      <SectionHead over="Everything, quietly" title={<>Nine tools. <span className="text-ink-3">One window.</span></>} sub="Every module shares the same tokens, the same hairlines, the same green. Switching context stops feeling like switching apps." />
      <div className="mt-16 grid auto-rows-[minmax(230px,auto)] grid-cols-1 gap-4 md:grid-cols-6">
        <SpotCard span="md:col-span-4">
          <div className="flex items-start gap-4">
            <Tile icon="chat" />
            <div>
              <h3 className="text-[19px] font-bold tracking-[-0.01em]">Chat that respects focus</h3>
              <p className="mt-1 max-w-[380px] text-[14px] text-ink-2">Server rail, channels and threads. Mentions glow softly in green — never a red flood.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3">
            {[
              ["#7CD56E", "Kai", "pushed the widget build 🎉", "10:42"],
              ["#8B5CF6", "Mira", "@Kai looks calm. Shipping it.", "10:43"],
              ["#E8853D", "Jun", "Timeless says we focused 4h today", "10:45"],
            ].map(([c, n, m, t], i) => (
              <motion.div
                key={n}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + i * 0.15, duration: 0.6, ease }}
                className="flex items-start gap-3"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: c }}>{n[0]}</span>
                <div>
                  <div className="text-[13px] font-bold" style={{ color: c }}>
                    {n} <span className="ml-1 text-[10.5px] font-medium text-ink-3">{t}</span>
                  </div>
                  <div className="text-[13.5px]">
                    {m.startsWith("@") ? (
                      <>
                        <span className="rounded-md bg-green-soft px-1 font-semibold text-green-deep">@Kai</span>
                        {m.slice(4)}
                      </>
                    ) : (
                      m
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </SpotCard>

        <SpotCard span="md:col-span-2" dark>
          <div ref={ringRef} className="flex h-full flex-col">
            <Tile icon="clock" dark />
            <h3 className="mt-4 text-[19px] font-bold" style={{ color: "#F6F5F3" }}>Timeless</h3>
            <p className="text-[13.5px]" style={{ color: "#B9B9B2" }}>Honest, local time tracking.</p>
            <div className="relative mx-auto mt-auto grid h-[112px] w-[112px] place-items-center pt-2">
              <svg width="112" height="112" className="absolute inset-0 -rotate-90">
                <circle cx="56" cy="56" r="46" fill="none" strokeWidth="10" stroke="var(--dark-card-2)" />
                <circle cx="56" cy="56" r="46" fill="none" strokeWidth="10" stroke="var(--green)" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (C * ring) / 100} style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(.16,1,.3,1)" }} />
              </svg>
              <div className="text-center">
                <div className="mono-num text-[26px] font-extrabold" style={{ color: "#F6F5F3" }}>{ring}%</div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "#9B9B94" }}>Productive</div>
              </div>
            </div>
          </div>
        </SpotCard>

        <SpotCard span="md:col-span-2">
          <Tile icon="note" />
          <h3 className="mt-4 text-[19px] font-bold">Markdown notes</h3>
          <p className="text-[13.5px] text-ink-2">Split, edit or preview. Callouts, code, tables.</p>
          <div className="mt-4 rounded-r-xl border-l-[3px] border-green bg-green-soft px-3 py-2 text-[13px] text-ink-2">&gt; One accent. Hairline borders. Quiet.</div>
          <div className="mt-2 rounded-xl border border-line bg-surface-3 p-3 font-mono text-[12px] text-ink-2">
            <span className="text-green-deep">const</span> calm = <span className="text-orange">true</span>;
          </div>
        </SpotCard>

        <SpotCard span="md:col-span-2">
          <Tile icon="spark" />
          <h3 className="mt-4 text-[19px] font-bold">Pel AI</h3>
          <p className="text-[13.5px] text-ink-2">A quiet assistant that lives inside your notes.</p>
          <div className="mt-4 flex flex-col gap-2 text-[13px]">
            <div className="self-end rounded-[16px_6px_16px_16px] bg-green px-3 py-2 font-medium text-on-green">Summarize this week</div>
            <div className="self-start rounded-[6px_16px_16px_16px] bg-surface-2 px-3 py-2">You shipped 13 themes and focused 22% more<span className="caret ml-1" /></div>
          </div>
        </SpotCard>

        <SpotCard span="md:col-span-2">
          <Tile icon="tasks" />
          <h3 className="mt-4 text-[19px] font-bold">Kanban that breathes</h3>
          <p className="text-[13.5px] text-ink-2">Drag, drop, done. Columns tint green on hover.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 p-2">
              <div className="rounded-lg bg-surface p-2 text-[12px] font-semibold" style={{ boxShadow: "var(--sh-card)" }}>Polish widget</div>
            </div>
            <div className="rounded-xl p-2" style={{ background: "var(--green-soft)", outline: "2px dashed var(--green)", outlineOffset: -4 }}>
              <motion.div animate={{ rotate: [1.5, -1, 1.5], y: [0, -3, 0] }} transition={{ duration: 3, repeat: Infinity }} className="rounded-lg bg-surface p-2 text-[12px] font-semibold" style={{ boxShadow: "var(--sh-pop)" }}>
                Ship it ✓
              </motion.div>
            </div>
          </div>
        </SpotCard>

        <SpotCard span="md:col-span-3">
          <div className="flex items-start gap-4">
            <Tile icon="bell" />
            <div>
              <h3 className="text-[19px] font-bold">Reminders with a color</h3>
              <p className="text-[13.5px] text-ink-2">Every reminder carries its own edge. Overdue turns red — once.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            {[
              ["Water the monstera", "Today · 18:00", "var(--teal)"],
              ["Call mum", "Tomorrow", "var(--pink)"],
              ["Renew domain", "Overdue", "var(--red)"],
            ].map(([t, w, c]) => (
              <div key={t} className="flex items-center rounded-2xl bg-surface-2 px-4 py-2.5" style={{ borderLeft: `4px solid ${c}` }}>
                <span className="text-[13.5px] font-semibold">{t}</span>
                <span className="ml-auto text-[12px] font-semibold" style={{ color: w === "Overdue" ? "var(--red)" : "var(--ink-3)" }}>{w}</span>
              </div>
            ))}
          </div>
        </SpotCard>

        <SpotCard span="md:col-span-3">
          <div className="flex items-start gap-4">
            <Tile icon="game" />
            <div>
              <h3 className="text-[19px] font-bold">An arcade for the breaks</h3>
              <p className="text-[13.5px] text-ink-2">2048, Simon, Aim, Scramble. Five minutes, then back to calm.</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {[2, 4, 8, 16, 32, 64, 128, 2048].map((n, i) => (
              <motion.div
                key={n}
                initial={{ scale: 0.5, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, type: "spring", stiffness: 400, damping: 18 }}
                className="mono-num grid h-12 place-items-center rounded-xl text-[15px] font-extrabold"
                style={{
                  background: n === 2048 ? "var(--green)" : `color-mix(in srgb, #E8853D ${10 + i * 11}%, var(--surface-2))`,
                  color: n === 2048 ? "var(--on-green)" : i > 3 ? "#fff" : "var(--ink)",
                }}
              >
                {n}
              </motion.div>
            ))}
          </div>
        </SpotCard>
      </div>
    </section>
  );
}

export function HorizontalModules() {
  const ref = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dist, setDist] = useState(0);
  useLayoutEffect(() => {
    const m = () => setDist(Math.max(0, (trackRef.current?.scrollWidth ?? 0) - innerWidth + 48));
    m();
    addEventListener("resize", m);
    return () => removeEventListener("resize", m);
  }, []);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const x = useTransform(p, [0, 1], [0, -dist]);
  const total = 6;
  const [step, setStep] = useState(1);
  useMotionValueEvent(p, "change", (v: number) => setStep(Math.min(total, Math.floor(v * (total + 0.2)) + 1)));

  return (
    <section ref={ref} className="relative" style={{ height: "360vh" }}>
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="mx-auto mb-7 flex w-full max-w-[1180px] items-end justify-between gap-6 px-6">
          <div>
            <div className="overline">Scroll down · read sideways</div>
            <h2 className="mt-2 text-[clamp(30px,3.6vw,46px)] font-extrabold leading-[1.02] tracking-[-0.045em]">
              Designed to <span className="text-ink-3">disappear.</span>
            </h2>
            <p className="mt-2 max-w-[420px] text-[14px] leading-relaxed text-ink-2">Six rules that make every screen in PebbleX feel like the same room.</p>
          </div>
          <div className="hidden w-52 shrink-0 sm:block">
            <div className="mb-2 flex items-center justify-end gap-1.5">
              {SLIDES.map((s, i) => (
                <motion.span
                  key={s.id}
                  className="h-1.5 rounded-full"
                  animate={{ width: i + 1 === step ? 22 : 6, background: i + 1 <= step ? "var(--green)" : "var(--surface-3)" }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                />
              ))}
            </div>
            <div className="mono-num text-right text-[11.5px] font-semibold text-ink-3">
              {String(step).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </div>
          </div>
        </div>
        <motion.div ref={trackRef} style={{ x }} className="flex w-max items-stretch gap-4 pl-6 will-change-transform md:pl-[max(24px,calc((100vw-1180px)/2+24px))]">
          {SLIDES.map((s) => (
            <SlideCard key={s.id} slide={s} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------- the six slides ---------------- */

type Slide = { id: string; w: string; n: string; over: string; title: string; body: string; kind: "photo" | "well" | "mark" | "themes" | "type" | "density"; img?: string };

const SLIDES: Slide[] = [
  { id: "desk", w: "clamp(300px,32vw,440px)", n: "01", over: "The desk", title: "Made for the desk you already love.", body: "Desktop density, not landing-page density. 14px body, 38px controls, 40px nav rows. It should feel like a tool you own, not a page you visit.", kind: "photo", img: "/images/desk.jpg" },
  { id: "well", w: "clamp(272px,26vw,330px)", n: "02", over: "Depth", title: "Cards elevate. Wells recess.", body: "Surface plus a shadow is a card. Surface-2 and surface-3 are wells and tracks. A hairline sits between them — nothing else separates layers.", kind: "well" },
  { id: "mark", w: "clamp(272px,25vw,320px)", n: "03", over: "The mark", title: "One dark tile. One green contour.", body: "The pebble is a dark tile with a single rim of #7CD56E. It is the only glow in the entire product.", kind: "mark" },
  { id: "themes", w: "clamp(288px,28vw,360px)", n: "04", over: "The system", title: "13 themes, one skeleton.", body: "A theme swaps token values only. Never layout, never radius, never spacing. Tap a swatch — the whole site changes.", kind: "themes" },
  { id: "type", w: "clamp(272px,26vw,330px)", n: "05", over: "The scale", title: "Two sizes in a header. Four in a card.", body: "Headings carry negative tracking. Labels carry positive tracking and uppercase. Never two sizes inside one card header.", kind: "type" },
  { id: "density", w: "clamp(272px,26vw,330px)", n: "06", over: "The density", title: "It should feel like a tool.", body: "38px controls, 40px nav rows, 999px pills. Every metric uses tabular numerals so nothing ever jiggles.", kind: "density" },
];

/* ---------------- live specimens ---------------- */

function WellSpecimen() {
  return (
    <div className="rounded-[14px] p-3" style={{ background: "var(--surface-2)" }}>
      <div className="rounded-[12px] bg-surface p-3" style={{ boxShadow: "var(--sh-card)" }}>
        <div className="text-[12.5px] font-bold">A card</div>
        <div className="mt-0.5 font-mono text-[10.5px] text-ink-3">--surface + --sh-card</div>
      </div>
      <div className="my-2 h-px" style={{ background: "var(--line-strong)" }} />
      <div className="text-[11px] font-semibold text-ink-3">A well — surface-2</div>
    </div>
  );
}

function ThemesSpecimen() {
  const { setTheme, theme } = useStore();
  const [hot, setHot] = useState<string | null>(null);
  return (
    <div className="rounded-[14px] p-3" style={{ background: "var(--surface-2)" }}>
      <div className="grid grid-cols-7 gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            onMouseEnter={() => {
              setHot(t.id);
              sfx.tick();
            }}
            onMouseLeave={() => setHot(null)}
            title={t.name}
            className="h-6 w-6 cursor-pointer rounded-full transition-transform hover:scale-[1.3]"
            style={{
              background: t.pill,
              boxShadow: theme === t.id ? "0 0 0 2px var(--surface), 0 0 0 4px var(--ink)" : "inset 0 0 0 1px rgba(0,0,0,.12)",
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex h-4 items-center text-[11px] font-semibold text-ink-3">{hot ? themeById(hot).name : "Hover a swatch"}</div>
    </div>
  );
}

function TypeSpecimen() {
  const rows: [string, string, string][] = [
    ["Page title", "21px / 800", "text-[21px] font-extrabold tracking-[-0.02em] leading-none"],
    ["Card heading", "15px / 700", "text-[15px] font-bold tracking-[-0.01em]"],
    ["Body", "14px / 400", "text-[14px]"],
    ["Overline", "10.5px / 800", "overline"],
  ];
  return (
    <div className="space-y-1.5 rounded-[14px] p-3" style={{ background: "var(--surface-2)" }}>
      {rows.map(([l, spec, cls]) => (
        <div key={l} className="flex items-baseline gap-2.5">
          <span className="w-[62px] shrink-0 font-mono text-[10px] text-ink-3">{spec}</span>
          <span className={cls}>{l}</span>
        </div>
      ))}
    </div>
  );
}

function DensitySpecimen() {
  return (
    <div className="space-y-2 rounded-[14px] p-3" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-center gap-2">
        <span className="btn btn-dark h-[38px] text-[12px]">Button · 38px</span>
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-surface text-ink-2" style={{ boxShadow: "var(--sh-card)" }}>
          <Icon name="plus" size={16} />
        </span>
      </div>
      <div className="flex h-[40px] items-center gap-2 rounded-[13px] px-3 text-[12.5px] font-semibold" style={{ background: "var(--green)", color: "var(--on-green)", boxShadow: "0 4px 14px var(--green-ring)" }}>
        <Icon name="home" size={16} /> Nav row · 40px
      </div>
      <div className="mono-num text-[11.5px] text-ink-3">3h 12m · 18% · tabular-nums</div>
    </div>
  );
}

function SlideCard({ slide }: { slide: Slide }) {
  const [hov, setHov] = useState(false);
  const dark = slide.kind === "mark";
  return (
    <motion.article
      data-fall
      onMouseEnter={() => {
        setHov(true);
        sfx.swoosh();
      }}
      onMouseLeave={() => setHov(false)}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.7, ease }}
      className="relative flex shrink-0 flex-col overflow-hidden rounded-[22px] border"
      style={{
        width: slide.w,
        height: "min(62vh, 460px)",
        background: dark ? "var(--dark-card)" : "var(--surface)",
        borderColor: hov ? "var(--green)" : dark ? "transparent" : "var(--line)",
        boxShadow: hov ? "var(--sh-pop)" : "var(--sh-card)",
        color: dark ? "#F6F5F3" : undefined,
        transform: hov ? "translateY(-4px)" : "none",
        transition: "transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s, border-color .25s",
      }}
    >
      {/* media / specimen */}
      <div className="relative h-[46%] shrink-0 overflow-hidden">
        {slide.kind === "photo" && <img src={slide.img} alt="" className="h-full w-full scale-110 object-cover transition-transform duration-[900ms] ease-out" style={{ transform: hov ? "scale(1.18)" : "scale(1.1)" }} loading="lazy" />}
        {slide.kind === "mark" && (
          <div className="grid h-full place-items-center" style={{ background: "linear-gradient(160deg, #1c261b, #0d120c)" }}>
            <div className="grid h-[78px] w-[78px] place-items-center rounded-[24px]" style={{ background: "var(--tile)", color: "var(--tile-ink)", border: "1px solid rgba(124,213,110,.25)", boxShadow: "0 0 34px rgba(124,213,110,.28)" }}>
              <PebbleGlyph size={44} />
            </div>
          </div>
        )}
        {slide.kind !== "photo" && slide.kind !== "mark" && (
          <div className="h-full p-4" style={{ background: dark ? "var(--dark-card)" : "var(--green-soft)" }}>
            {slide.kind === "well" && <WellSpecimen />}
            {slide.kind === "themes" && <ThemesSpecimen />}
            {slide.kind === "type" && <TypeSpecimen />}
            {slide.kind === "density" && <DensitySpecimen />}
          </div>
        )}
        {/* ghost number */}
        <span
          className="mono-num pointer-events-none absolute right-4 top-3 text-[44px] font-extrabold leading-none"
          style={{ color: dark ? "rgba(255,255,255,.14)" : "rgba(18,18,18,.10)" }}
        >
          {slide.n}
        </span>
      </div>

      {/* copy */}
      <div className="flex flex-1 flex-col p-5">
        <div className="overline" style={{ color: dark ? "#9B9B94" : "var(--ink-3)" }}>
          {slide.over}
        </div>
        <h3 className="mt-2 text-[19px] font-extrabold leading-[1.14] tracking-[-0.03em]">{slide.title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: dark ? "#B9B9B2" : "var(--ink-2)" }}>
          {slide.body}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-4">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--green)" }} />
          <span className="text-[11px] font-bold uppercase tracking-[.08em]" style={{ color: dark ? "#9B9B94" : "var(--ink-3)" }}>
            PebbleX tokens
          </span>
        </div>
      </div>
    </motion.article>
  );
}

export function ThemesShowcase() {
  const { theme, setTheme, toast } = useStore();
  return (
    <section id="themes" className="relative mx-auto max-w-[1180px] px-5 py-28">
      <SectionHead over="13 themes · zero layout shifts" title={<>Pick a mood. <span className="text-ink-3">Click one.</span></>} sub="This whole website runs on PebbleX tokens. Tap any theme — watch it ripple from your cursor." />
      <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {THEMES.map((t, i) => {
          const active = theme === t.id;
          return (
            <motion.button
              key={t.id}
              data-fall
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 5) * 0.06, duration: 0.7, ease }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.97 }}
              onClick={(e) => {
                setTheme(t.id, e.clientX, e.clientY);
                toast({ title: `${t.name}`, msg: t.vibe });
              }}
              className="cursor-pointer rounded-[20px] bg-surface p-2 text-left"
              style={{ boxShadow: active ? "0 0 0 2px var(--green), var(--sh-pop)" : "var(--sh-card), inset 0 0 0 1px var(--line)" }}
            >
              <div className="flex h-[110px] overflow-hidden rounded-[14px]" style={{ background: t.side }}>
                <div className="flex w-[34%] flex-col gap-1.5 p-2.5">
                  <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-[4px]" style={{ background: t.dark ? "#F4F4F2" : "#262624" }} />
                    <span className="h-1.5 w-6 rounded-full opacity-30" style={{ background: t.dark ? "#fff" : "#000" }} />
                  </div>
                  <span className="mt-1 h-3.5 rounded-md" style={{ background: t.pill }} />
                  <span className="h-1.5 w-4/5 rounded-full opacity-20" style={{ background: t.dark ? "#fff" : "#000" }} />
                  <span className="h-1.5 w-3/5 rounded-full opacity-20" style={{ background: t.dark ? "#fff" : "#000" }} />
                  <span className="h-1.5 w-2/3 rounded-full opacity-20" style={{ background: t.dark ? "#fff" : "#000" }} />
                </div>
                <div className="m-2 ml-0 flex flex-1 flex-col gap-1.5 rounded-[10px] p-2" style={{ background: t.main, boxShadow: "inset 0 0 0 1px rgba(128,128,128,.14)" }}>
                  <span className="h-2 w-1/2 rounded-full opacity-30" style={{ background: t.dark ? "#fff" : "#000" }} />
                  <div className="flex flex-1 gap-1.5">
                    <span className="flex-1 rounded-md opacity-10" style={{ background: t.dark ? "#fff" : "#000" }} />
                    <span className="flex-1 rounded-md opacity-10" style={{ background: t.dark ? "#fff" : "#000" }} />
                  </div>
                  <span className="h-2 w-2/5 rounded-full" style={{ background: t.pill }} />
                </div>
              </div>
              <div className="flex items-center gap-2 px-1.5 pb-1 pt-2.5">
                <span className="text-[13.5px] font-bold">{t.name}</span>
                {t.dark && <Icon name="moon" size={12} className="text-ink-3" />}
                {active && (
                  <span className="ml-auto grid h-5 w-5 place-items-center rounded-full bg-green text-on-green">
                    <Icon name="check" size={11} stroke={3.2} />
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="col-span-2 flex flex-col justify-between rounded-[20px] bg-dark-card p-5 sm:col-span-3 lg:col-span-2"
          style={{ color: "#F6F5F3" }}
        >
          <div className="font-mono text-[12.5px] leading-relaxed" style={{ color: "#B9B9B2" }}>
            <span style={{ color: "var(--green)" }}>[data-theme="{theme}"]</span> {"{"}
            <br />
            &nbsp;&nbsp;--bg: <span style={{ color: "#F6F5F3" }}>{THEMES.find((x) => x.id === theme)?.bg}</span>;
            <br />
            &nbsp;&nbsp;--green: <span style={{ color: "#F6F5F3" }}>{THEMES.find((x) => x.id === theme)?.pill}</span>;
            <br />
            &nbsp;&nbsp;<span style={{ color: "#9B9B94" }}>/* layout: untouched */</span>
            <br />
            {"}"}
          </div>
          <div className="mt-4 text-[13px]" style={{ color: "#9B9B94" }}>Tip: press <span className="kbd">T</span> anywhere to cycle.</div>
        </motion.div>
      </div>
    </section>
  );
}

function Counter({ to, suffix = "", dur = 1.6 }: { to: number; suffix?: string; dur?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, to, { duration: dur, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => ref.current && (ref.current.textContent = Math.round(v).toString() + suffix) });
    return () => c.stop();
  }, [inView, to, suffix, dur]);
  return <span ref={ref} className="mono-num">0{suffix}</span>;
}

export function Stats() {
  const s = [
    { n: 13, l: "Themes", sub: "Light, dark & in-between" },
    { n: 9, l: "Modules", sub: "In one calm window" },
    { n: 0, l: "Trackers", sub: "Your data stays local" },
    { n: 120, l: "ms", sub: "Typical interaction", suffix: "" },
  ];
  return (
    <section className="mx-auto max-w-[1180px] px-5 py-10">
      <div className="card grid grid-cols-2 overflow-hidden md:grid-cols-4">
        {s.map((x, i) => (
          <div key={x.l} className="p-7" style={{ borderLeft: i ? "1px solid var(--line-strong)" : "none" }}>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[44px] font-extrabold tracking-[-0.04em]">
                <Counter to={x.n} suffix={x.suffix} />
              </span>
              <span className="text-[14px] font-semibold text-ink-3">{x.l}</span>
            </div>
            <div className="mt-1 text-[13px] text-ink-2">{x.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const PRINCIPLES: [string, string, string][] = [
  ["01", "Calm over clever.", "Soft surfaces, hairline borders, one accent. No gradients on text, no glass in the body."],
  ["02", "Structure never changes.", "A theme swaps token values only — never layout, radius or spacing."],
  ["03", "Green means done.", "It marks selection, active nav and completed work. It is never decoration."],
  ["04", "Motion is functional.", "120 to 400 milliseconds, ease out, and it never blocks you."],
];

export function Principles() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 130, damping: 30 });
  const scale = useTransform(p, [0, 1], [1.14, 1]);
  return (
    <section ref={ref} className="mx-auto max-w-[1180px] px-5 py-24">
      <div className="grid items-center gap-10 md:grid-cols-[0.85fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, ease }}
          className="relative overflow-hidden rounded-[26px]"
          style={{ aspectRatio: "4 / 5", boxShadow: "var(--sh-pop)" }}
        >
          <motion.img src="/images/dark-pebble.jpg" alt="Dark pebble with a single green rim light" style={{ scale }} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,10,8,0) 38%, rgba(8,10,8,.82))" }} />
          <div className="absolute inset-x-0 bottom-0 p-7">
            <div className="overline" style={{ color: "#7CD56E" }}>Design principle #1</div>
            <h2 className="mt-2 text-[clamp(30px,3.4vw,44px)] font-extrabold leading-[1] tracking-[-0.045em] text-white">Calm over clever.</h2>
            <p className="mt-3 max-w-[300px] text-[13.5px] leading-relaxed text-white/70">Just the work, and a little green when something’s done.</p>
          </div>
        </motion.div>

        <div>
          <Reveal>
            <div className="overline">The rules we don’t break</div>
            <h2 className="mt-3 text-[clamp(30px,3.8vw,46px)] font-extrabold leading-[1.02] tracking-[-0.045em]">Four decisions do most of the work.</h2>
            <p className="mt-4 max-w-[460px] text-[16px] leading-relaxed text-ink-2">
              Everything you see on this page runs on the same tokens as the app. If a screen feels quiet, it’s because these four rules made it so.
            </p>
          </Reveal>
          <div className="mt-8 grid gap-px overflow-hidden rounded-[20px] border border-line bg-line sm:grid-cols-2">
            {PRINCIPLES.map(([n, t, d], i) => (
              <Reveal key={n} delay={i * 0.07}>
                <div className="h-full bg-surface p-6 transition-colors hover:bg-surface-2">
                  <div className="mono-num text-[11.5px] font-extrabold tracking-[.12em] text-green-deep">{n}</div>
                  <div className="mt-2 text-[15.5px] font-bold tracking-[-0.015em]">{t}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function KeyboardSection() {
  const [pressed, setPressed] = useState<string | null>(null);
  useEffect(() => {
    const d = (e: KeyboardEvent) => setPressed(e.key.toLowerCase());
    const u = () => setTimeout(() => setPressed(null), 140);
    addEventListener("keydown", d);
    addEventListener("keyup", u);
    return () => {
      removeEventListener("keydown", d);
      removeEventListener("keyup", u);
    };
  }, []);
  const rows = [
    { keys: ["⌘", "K"], match: ["meta", "k"], label: "Command palette", desc: "Jump anywhere in two keystrokes." },
    { keys: ["T"], match: ["t"], label: "Cycle theme", desc: "Try it now — this site listens." },
    { keys: ["⌘", "N"], match: ["n"], label: "New note", desc: "Starts in split view." },
    { keys: ["⌘", "⇧", "F"], match: ["f"], label: "Focus mode", desc: "Timeless starts a session." },
  ];
  return (
    <section className="mx-auto max-w-[1180px] px-5 py-28">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <Reveal>
          <div className="overline">Keyboard first</div>
          <h2 className="mt-3 text-[clamp(34px,4.6vw,56px)] font-extrabold leading-[1.02] tracking-[-0.045em]">Your hands never leave home row.</h2>
          <p className="mt-4 max-w-[440px] text-[17px] leading-relaxed text-ink-2">Every action has a shortcut. Every icon-only button has a tooltip. Press the keys on the right — they press back.</p>
        </Reveal>
        <div className="flex flex-col gap-3">
          {rows.map((r, i) => {
            const hit = pressed && r.match.includes(pressed);
            return (
              <Reveal key={r.label} delay={i * 0.08}>
                <div className="card flex items-center gap-4 p-4 transition-all" style={{ boxShadow: hit ? "0 0 0 2px var(--green), var(--sh-pop)" : undefined }}>
                  <div className="flex gap-1.5">
                    {r.keys.map((k) => (
                      <motion.span
                        key={k}
                        animate={{ y: hit ? 2 : 0 }}
                        className="grid h-11 min-w-11 place-items-center rounded-xl px-2 text-[15px] font-bold"
                        style={{
                          background: hit ? "var(--green)" : "var(--surface-2)",
                          color: hit ? "var(--on-green)" : "var(--ink)",
                          border: "1px solid var(--line-strong)",
                          borderBottomWidth: hit ? 1 : 3,
                        }}
                      >
                        {k}
                      </motion.span>
                    ))}
                  </div>
                  <div>
                    <div className="text-[15px] font-bold">{r.label}</div>
                    <div className="text-[13px] text-ink-3">{r.desc}</div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function detectOS(): "mac" | "win" | "linux" {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "win";
  return "linux";
}

function MiniWindow() {
  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-surface" style={{ boxShadow: "var(--sh-pop)" }}>
      <div className="flex h-8 items-center gap-1.5 border-b border-line px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        <span className="mx-auto text-[10.5px] font-semibold text-ink-3">PebbleX</span>
      </div>
      <div className="flex">
        <div className="w-[30%] border-r border-line p-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-4 w-4 rounded-[5px]" style={{ background: "var(--tile)" }} />
            <span className="h-1.5 w-8 rounded-full bg-surface-3" />
          </div>
          <div className="mt-2.5 flex flex-col gap-1">
            {[1, 0, 0].map((a, i) => (
              <span key={i} className="h-4 rounded-[6px]" style={{ background: a ? "var(--green)" : "var(--surface-2)" }} />
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-1">
            {[0, 0].map((a, i) => (
              <span key={i} className="h-4 rounded-[6px] bg-surface-2" data-a={a} />
            ))}
          </div>
        </div>
        <div className="flex-1 p-3">
          <div className="flex items-center gap-2">
            <div>
              <div className="h-2.5 w-16 rounded-full bg-surface-3" />
              <div className="mt-1.5 h-1.5 w-10 rounded-full bg-surface-2" />
            </div>
            <div className="ml-auto flex gap-1">
              <span className="h-4 w-4 rounded-full bg-surface-2" />
              <span className="h-4 w-4 rounded-full bg-green" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg p-1.5" style={{ background: "var(--surface-2)" }}>
                <div className="h-1.5 w-2/3 rounded-full bg-surface-3" />
                <div className="mt-1.5 h-3 w-1/2 rounded-full" style={{ background: i === 1 ? "var(--green)" : "var(--surface-3)" }} />
              </div>
            ))}
          </div>
          <div className="mt-2.5 rounded-[12px] p-2.5" style={{ background: "var(--surface-2)" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-1.5 py-[3px]">
                <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: i < 2 ? "var(--green)" : "transparent", border: i < 2 ? "none" : "1.5px solid var(--line-strong)" }} />
                <span className="h-1.5 flex-1 rounded-full bg-surface-3" style={{ opacity: i < 2 ? 0.5 : 1 }} />
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 rounded-[10px] px-2 py-1.5" style={{ background: "var(--green-soft)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--green)" }} />
            <span className="h-1.5 flex-1 rounded-full" style={{ background: "var(--green)", opacity: 0.35 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DownloadCTA() {
  const { go } = useStore();
  const os = detectOS();
  const label = os === "mac" ? "macOS" : os === "win" ? "Windows" : "Linux";
  return (
    <section className="mx-auto max-w-[1180px] px-5 py-16">
      <Reveal>
        <div className="grain relative overflow-hidden rounded-[28px] border border-line bg-surface" style={{ boxShadow: "var(--sh-card)" }}>
          <div className="pointer-events-none absolute -left-24 -top-28 h-[380px] w-[520px] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, var(--green-soft), transparent)" }} />
          <div className="relative grid items-center gap-10 p-8 md:grid-cols-[1.05fr_0.95fr] md:p-12">
            <div>
              <span className="pill bg-green-soft text-green-deep">
                <span className="dot" style={{ animation: "nx-pulse 2s infinite" }} /> v0.1.0 · free for personal use
              </span>
              <h2 className="mt-5 text-[clamp(32px,4.4vw,54px)] font-extrabold leading-[1.02] tracking-[-0.05em]">
                Get calm in <span style={{ color: "var(--green-deep)" }}>30 seconds.</span>
              </h2>
              <p className="mt-4 max-w-[420px] text-[16px] leading-relaxed text-ink-2">
                No account, no credit card, no onboarding carousel. Download it, open it, get back to work.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button onClick={() => go("download")} className="btn btn-green btn-lg">
                  <Icon name={os === "mac" ? "apple" : os === "win" ? "windows" : "linux"} size={17} /> Download for {label}
                </button>
                <button onClick={() => go("docs")} className="btn btn-outline btn-lg">
                  <Icon name="book" size={16} /> Read the docs
                </button>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-3">
                <span className="flex items-center gap-1.5"><Icon name="check" size={13} className="text-green-deep" /> Signed & notarized</span>
                <span className="flex items-center gap-1.5"><Icon name="check" size={13} className="text-green-deep" /> 92 MB</span>
                <span className="flex items-center gap-1.5"><Icon name="check" size={13} className="text-green-deep" /> Offline-first</span>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 28, rotate: -1.5 }}
              whileInView={{ opacity: 1, y: 0, rotate: -1.5 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease, delay: 0.15 }}
              className="relative"
            >
              <MiniWindow />
              <div className="absolute -bottom-4 left-5 flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] font-bold" style={{ background: "var(--green)", color: "var(--on-green)", boxShadow: "0 10px 24px var(--green-ring)" }}>
                <Icon name="check" size={13} stroke={3} /> Done for today
              </div>
            </motion.div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Testimonials() {
  const q = [
    ["“The first productivity app that lowered my heart rate.”", "Ana R.", "Designer"],
    ["“Neon theme at 2am is a vibe. Midnight at 9am is a vibe.”", "Tom K.", "Engineer"],
    ["“I deleted four apps the day I installed PebbleX.”", "Priya S.", "Founder"],
    ["“Timeless told me the truth. I needed that.”", "Leo M.", "Writer"],
    ["“The kanban drop shadow is… unreasonably satisfying.”", "Yuki T.", "PM"],
    ["“Finally, an AI that doesn’t shout.”", "Sam O.", "Student"],
  ];
  return (
    <section className="py-16">
      <Reveal className="mb-10 text-center">
        <div className="overline">Loved quietly</div>
      </Reveal>
      <div className="relative overflow-hidden" style={{ maskImage: "linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)" }}>
        <div className="marquee flex w-max gap-4" style={{ animationDuration: "60s" }}>
          {[...q, ...q].map(([t, n, r], i) => (
            <div key={i} className="card w-[340px] shrink-0 p-6">
              <div className="flex gap-0.5 text-green">{[0, 1, 2, 3, 4].map((s) => <Icon key={s} name="star" size={13} />)}</div>
              <p className="mt-3 text-[15px] font-medium leading-relaxed">{t}</p>
              <div className="mt-4 text-[12.5px] text-ink-3"><b className="text-ink-2">{n}</b> · {r}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
