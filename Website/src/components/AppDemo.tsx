import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BrandMark, Icon } from "./Icon";
import { SoundToggle } from "./Sound";
import { sfx } from "../lib/audio";

const W = 1120;
const H = 700;
type View = "dash" | "tasks" | "notes" | "ai" | "settings";
type Card = { id: string; title: string; tag: string; c: string; av: string };

const CHAPTERS = [
  { label: "Dashboard", dur: 2600 },
  { label: "Tasks", dur: 6200 },
  { label: "Notes", dur: 6400 },
  { label: "Pel AI", dur: 8200 },
  { label: "Themes", dur: 7400 },
];

const INIT_TODO: Card[] = [
  { id: "a", title: "Review onboarding copy", tag: "Writing", c: "purple", av: "#E05C9C" },
  { id: "b", title: "Sync calendar with team", tag: "Ops", c: "blue", av: "#5EB8FF" },
];
const INIT_DOING: Card[] = [
  { id: "c", title: "Widget mini mode", tag: "Design", c: "orange", av: "#8B5CF6" },
  { id: "d", title: "Timeless heat strip", tag: "Build", c: "teal", av: "#7CD56E" },
];
const INIT_DONE: Card[] = [{ id: "e", title: "13 themes pass QA", tag: "QA", c: "green", av: "#E8853D" }];

const NOTE_LINES = ["# Weekly calm review", "", "- Shipped **13 themes** without a layout change", "- Focus time up 22% this week", "> One accent. Hairline borders. Quiet."];
const AI_PROMPT = "Plan a calm afternoon for me";
const AI_REPLY =
  "Here’s a gentle plan:\n1. 14:00 — 50 min deep work on “Widget mini mode”\n2. 14:50 — 10 min walk, no screens\n3. 15:00 — Review onboarding copy\n4. 16:30 — Inbox zero, then wrap up";

const THEME_CARDS = [
  { id: "pebble-dark", name: "Pebble Dark", side: "#161614", main: "#1F1F1D", pill: "#7CD56E" },
  { id: "midnight", name: "Midnight", side: "#0B1020", main: "#111730", pill: "#5AD8A6" },
  { id: "rose", name: "Rose", side: "#FBF3F4", main: "#FFFFFF", pill: "#E8849B" },
  { id: "ocean", name: "Ocean", side: "#F1F6F8", main: "#FFFFFF", pill: "#2EB5A0" },
  { id: "sunset", name: "Sunset", side: "#FBF4EF", main: "#FFFFFF", pill: "#F08A4B" },
  { id: "neon", name: "Neon", side: "#0C0C0F", main: "#141419", pill: "#5EF38C" },
];

class Cancel extends Error {}

export function AppDemo({ controls = false, className = "" }: { controls?: boolean; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [view, setView] = useState<View>("dash");
  const [cursor, setCursor] = useState({ x: 560, y: 380 });
  const [pressing, setPressing] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [todo, setTodo] = useState(INIT_TODO);
  const [doing] = useState(INIT_DOING);
  const [done, setDone] = useState(INIT_DONE);
  const [draft, setDraft] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Card | null>(null);
  const [note, setNote] = useState("");
  const [prompt, setPrompt] = useState("");
  const [msgs, setMsgs] = useState<{ me: boolean; text: string }[]>([]);
  const [aiTyping, setAiTyping] = useState(false);
  const [demoTheme, setDemoTheme] = useState<string | undefined>(undefined);
  const [demoToast, setDemoToast] = useState<string | null>(null);
  const [chapter, setChapter] = useState(0);
  const [chElapsed, setChElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [runId, setRunId] = useState(0);
  const [hover, setHover] = useState<string | null>(null);

  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const pausedRef = useRef(false);
  pausedRef.current = !playing || !inView;
  const elapsedRef = useRef(0);

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.15 });
    io.observe(wrapRef.current!);
    return () => io.disconnect();
  }, []);

  const resetState = useCallback(() => {
    setView("dash");
    setTodo(INIT_TODO);
    setDone(INIT_DONE);
    setDraft(null);
    setGhost(null);
    setNote("");
    setPrompt("");
    setMsgs([]);
    setAiTyping(false);
    setDemoTheme(undefined);
    setDemoToast(null);
    setHover(null);
  }, []);

  useEffect(() => {
    const token = { cancelled: false };
    const wait = (ms: number) =>
      new Promise<void>((res, rej) => {
        let left = ms;
        const tick = () => {
          if (token.cancelled) return rej(new Cancel());
          if (!pausedRef.current) {
            left -= 40;
            elapsedRef.current += 40;
            setChElapsed(elapsedRef.current);
          }
          if (left <= 0) res();
          else setTimeout(tick, 40);
        };
        setTimeout(tick, 40);
      });

    const pos = (key: string, dx = 0, dy = 0) => {
      const stage = stageRef.current;
      const el = stage?.querySelector<HTMLElement>(`[data-demo="${key}"]`);
      if (!stage || !el) return null;
      // Walk offsetParent chain: layout coords ignore CSS transforms (3D tilt / scale)
      let x = 0;
      let y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== stage) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
      }
      if (n === stage) return { x: x + el.offsetWidth / 2 + dx, y: y + el.offsetHeight / 2 + dy };
      const s = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const k = s.width / W;
      return { x: (r.left - s.left + r.width / 2) / k + dx, y: (r.top - s.top + r.height / 2) / k + dy };
    };
    const move = async (key: string, ms = 800, dx = 0, dy = 0) => {
      const p = pos(key, dx, dy);
      if (p) setCursor(p);
      setHover(key);
      await wait(ms);
    };
    const click = async () => {
      setPressing(true);
      const c = cursorRef.current;
      setRipples((r) => [...r, { id: Date.now() + Math.random(), x: c.x, y: c.y }]);
      sfx.click();
      await wait(160);
      setPressing(false);
      await wait(140);
    };
    const type = async (text: string, set: (s: string) => void, speed = 42) => {
      for (let i = 1; i <= text.length; i++) {
        set(text.slice(0, i));
        sfx.key();
        await wait(text[i - 1] === " " ? speed * 0.6 : speed);
      }
    };
    const goView = (v: View) => {
      setView(v);
      sfx.whoosh();
    };
    const chapterStart = (i: number) => {
      setChapter(i);
      elapsedRef.current = 0;
      setChElapsed(0);
    };
    const toastIt = async (t: string) => {
      setDemoToast(t);
      sfx.chime();
      setTimeout(() => setDemoToast((cur) => (cur === t ? null : cur)), 1800);
    };

    const run = async () => {
      while (!token.cancelled) {
        resetState();
        chapterStart(0);
        setCursor({ x: 620, y: 420 });
        await wait(700);
        await move("stat-focus", 700);
        await move("heat-today", 900);

        chapterStart(1);
        await move("nav-tasks");
        await click();
        goView("tasks");
        await wait(600);
        await move("btn-new", 700);
        await click();
        setDraft("");
        await wait(250);
        await type("Ship the landing page", (s) => setDraft(s));
        await wait(350);
        const newCard: Card = { id: "n" + Date.now(), title: "Ship the landing page", tag: "Launch", c: "green", av: "#7CD56E" };
        setDraft(null);
        setTodo((t) => [{ ...newCard, id: "new" }, ...t]);
        await wait(250);
        await move("card-new", 600);
        setPressing(true);
        sfx.pick();
        setTodo((t) => t.filter((c) => c.id !== "new"));
        setGhost(newCard);
        await move("drop-done", 1000);
        setPressing(false);
        setGhost(null);
        setDone((d) => [newCard, ...d]);
        sfx.drop();
        toastIt("Task moved to Done");
        await wait(900);

        chapterStart(2);
        await move("nav-notes");
        await click();
        goView("notes");
        await wait(500);
        await move("note-editor", 700);
        await click();
        await type(NOTE_LINES.join("\n"), setNote, 26);
        await wait(900);

        chapterStart(3);
        await move("nav-ai");
        await click();
        goView("ai");
        await wait(500);
        await move("composer", 700);
        await click();
        await type(AI_PROMPT, setPrompt, 45);
        await move("send", 500);
        await click();
        setMsgs([{ me: true, text: AI_PROMPT }]);
        setPrompt("");
        sfx.send();
        setAiTyping(true);
        await wait(1100);
        setAiTyping(false);
        setMsgs((m) => [...m, { me: false, text: "" }]);
        sfx.blip();
        for (let i = 1; i <= AI_REPLY.length; i += 3) {
          const s = AI_REPLY.slice(0, i);
          setMsgs((m) => [m[0], { me: false, text: s }]);
          if (i % 12 === 1) sfx.key();
          await wait(28);
        }
        setMsgs((m) => [m[0], { me: false, text: AI_REPLY }]);
        await wait(1000);

        chapterStart(4);
        await move("nav-settings");
        await click();
        goView("settings");
        await wait(600);
        for (const id of ["midnight", "sunset", "neon"]) {
          await move("theme-" + id, 750);
          await click();
          setDemoTheme(id);
          sfx.pop();
          toastIt(`${THEME_CARDS.find((t) => t.id === id)?.name} applied`);
          await wait(1100);
        }
        await move("nav-dash", 800);
        await click();
        goView("dash");
        await wait(1400);
      }
    };
    run().catch((e) => {
      if (!(e instanceof Cancel)) console.error(e);
    });
    return () => {
      token.cancelled = true;
    };
  }, [runId, resetState]);

  const restart = () => {
    setPlaying(true);
    setRunId((r) => r + 1);
  };

  const navItems: { id: View; label: string; icon: string; key: string; badge?: string }[] = [
    { id: "dash", label: "Dashboard", icon: "home", key: "nav-dash" },
    { id: "tasks", label: "Tasks", icon: "tasks", key: "nav-tasks", badge: String(todo.length + doing.length) },
    { id: "notes", label: "Notes", icon: "note", key: "nav-notes" },
  ];
  const navItems2: { id: View; label: string; icon: string; key: string }[] = [
    { id: "ai", label: "Pel AI", icon: "spark", key: "nav-ai" },
  ];

  const titles: Record<View, [string, string]> = {
    dash: ["Good afternoon, Mira", "Thursday · 3 tasks due today"],
    tasks: ["Tasks", "Launch board · 6 cards"],
    notes: ["Notes", "46 notes · 4 folders"],
    ai: ["Pel AI", "Your quiet assistant"],
    settings: ["Settings", "Appearance"],
  };

  return (
    <div className={className}>
      <div ref={wrapRef} className="relative w-full" style={{ height: H * scale }}>
        <div
          ref={stageRef}
          data-theme={demoTheme}
          className="absolute left-0 top-0 overflow-hidden"
          style={{
            width: W,
            height: H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            borderRadius: 22,
            background: "var(--bg)",
            color: "var(--ink)",
            fontSize: 14,
            transition: "background .4s, color .4s",
            boxShadow: "0 0 0 1px var(--line-strong)",
          }}
        >
          {/* title bar */}
          <div className="flex h-9 items-center gap-2 px-4" style={{ background: "var(--bg)" }}>
            <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
            <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <span className="h-3 w-3 rounded-full bg-[#28C840]" />
            <span className="ml-auto mr-auto text-[12px] font-semibold text-ink-3">PebbleX</span>
            <span className="w-12" />
          </div>
          <div className="flex" style={{ height: H - 36 }}>
            {/* sidebar */}
            <aside className="flex w-[214px] shrink-0 flex-col px-3 pb-3" style={{ background: "var(--bg)" }}>
              <div className="flex items-center gap-2.5 px-2 py-2">
                <BrandMark size={32} />
                <div className="text-[16px] font-extrabold tracking-[-0.02em]">PebbleX</div>
                <span className="ml-auto rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-ink-3">0.1</span>
              </div>
              <div className="mt-3 px-2 text-[10.5px] font-extrabold uppercase tracking-[.08em] text-ink-3">Workspace</div>
              <div className="mt-1.5 flex flex-col gap-1">
                {navItems.map((n) => (
                  <NavItem key={n.id} id={n.id} label={n.label} icon={n.icon} badge={n.badge} keyName={n.key} active={view === n.id} />
                ))}
                <NavItem id="chat" label="Chat" icon="chat" active={false} keyName="" badge="3" />
              </div>
              <div className="mt-4 px-2 text-[10.5px] font-extrabold uppercase tracking-[.08em] text-ink-3">Intelligence</div>
              <div className="mt-1.5 flex flex-col gap-1">
                {navItems2.map((n) => (
                  <NavItem key={n.id} id={n.id} label={n.label} icon={n.icon} keyName={n.key} active={view === n.id} />
                ))}
                <NavItem id="tl" label="Timeless" icon="clock" active={false} keyName="" />
                <NavItem id="rm" label="Reminders" icon="bell" active={false} keyName="" />
              </div>
              <div className="mt-4 px-2 text-[10.5px] font-extrabold uppercase tracking-[.08em] text-ink-3">Explore</div>
              <div className="mt-1.5 flex flex-col gap-1">
                <NavItem id="ar" label="Arcade" icon="game" active={false} keyName="" />
                <NavItem id="settings" label="Settings" icon="settings" active={view === "settings"} keyName="nav-settings" />
              </div>
              <div className="mt-auto flex items-center gap-2.5 border-t border-line px-2 pt-3">
                <div className="relative grid h-8 w-8 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: "#8B5CF6" }}>
                  M<span className="absolute -bottom-0.5 -right-0.5 h-[11px] w-[11px] rounded-full bg-green" style={{ border: "2.5px solid var(--bg)" }} />
                </div>
                <div className="leading-tight">
                  <div className="text-[13px] font-semibold">Mira Chen</div>
                  <div className="text-[11px] text-ink-3">Calm plan</div>
                </div>
              </div>
            </aside>

            {/* main */}
            <main className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-16 shrink-0 items-center gap-3 pl-6 pr-5">
                <div>
                  <div className="text-[21px] font-extrabold leading-tight tracking-[-0.02em]">{titles[view][0]}</div>
                  <div className="text-[12.5px] text-ink-3">{titles[view][1]}</div>
                </div>
                <div className="ml-auto flex h-[38px] w-[220px] items-center gap-2 rounded-full border border-line bg-surface px-4 text-[13px] text-ink-3" style={{ boxShadow: "var(--sh-card)" }}>
                  <Icon name="search" size={15} /> Search
                  <span className="kbd ml-auto">⌘K</span>
                </div>
                <div className="relative grid h-[38px] w-[38px] place-items-center rounded-xl bg-surface text-ink-2" style={{ boxShadow: "var(--sh-card)" }}>
                  <Icon name="bell" size={18} />
                  <span className="absolute right-1.5 top-1.5 h-[9px] w-[9px] rounded-full bg-red" style={{ border: "2px solid var(--surface)" }} />
                </div>
              </div>
              <div className="relative min-h-0 flex-1 pb-6 pl-6 pr-5 pt-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={view}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full"
                  >
                    {view === "dash" && <DashView hover={hover} />}
                    {view === "tasks" && <TasksView todo={todo} doing={doing} done={done} draft={draft} />}
                    {view === "notes" && <NotesView note={note} />}
                    {view === "ai" && <AiView msgs={msgs} prompt={prompt} typing={aiTyping} />}
                    {view === "settings" && <SettingsView active={demoTheme} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </main>
          </div>

          {/* demo toast */}
          <AnimatePresence>
            {demoToast && (
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                className="absolute bottom-5 right-5 flex w-[280px] items-center gap-3 rounded-2xl border border-line bg-surface p-3"
                style={{ boxShadow: "var(--sh-pop)" }}
              >
                <div className="grid h-[34px] w-[34px] place-items-center rounded-[11px] bg-green-soft text-green-deep">
                  <Icon name="check" size={16} />
                </div>
                <div>
                  <div className="text-[13.5px] font-bold">{demoToast}</div>
                  <div className="text-[12px] text-ink-2">Saved locally</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ghost drag card */}
          {ghost && (
            <motion.div
              className="pointer-events-none absolute z-40 w-[230px]"
              initial={false}
              animate={{ x: cursor.x - 110, y: cursor.y - 26, rotate: 2.5 }}
              transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
              style={{ left: 0, top: 0 }}
            >
              <TaskCard card={ghost} lifted />
            </motion.div>
          )}

          {/* ripples */}
          {ripples.map((r) => (
            <motion.span
              key={r.id}
              className="pointer-events-none absolute z-50 rounded-full"
              style={{ left: r.x - 20, top: r.y - 20, width: 40, height: 40, border: "2px solid var(--green)" }}
              initial={{ scale: 0.2, opacity: 0.9 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              onAnimationComplete={() => setRipples((rs) => rs.filter((x) => x.id !== r.id))}
            />
          ))}

          {/* cursor */}
          <motion.div
            className="pointer-events-none absolute left-0 top-0 z-50"
            initial={false}
            animate={{ x: cursor.x - 4, y: cursor.y - 3, scale: pressing ? 0.86 : 1 }}
            transition={{ x: { duration: 0.8, ease: [0.65, 0, 0.35, 1] }, y: { duration: 0.8, ease: [0.65, 0, 0.35, 1] }, scale: { duration: 0.12 } }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 3px 6px rgba(0,0,0,.35))" }}>
              <path d="M4 2.5 19.5 12l-7 1.6L9 20.5z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </motion.div>
        </div>

        {/* sound switch floats over the window */}
        <div className="absolute bottom-3 left-3 z-40" style={{ transform: `scale(${Math.max(0.7, Math.min(1, scale * 1.15))})`, transformOrigin: "bottom left" }}>
          <SoundToggle />
        </div>
      </div>

      {controls && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-dark h-10 w-10 !p-0" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
            <Icon name={playing ? "pause" : "play"} size={15} />
          </button>
          <button className="btn btn-soft h-10 w-10 !p-0" onClick={restart} aria-label="Restart">
            <Icon name="refresh" size={15} />
          </button>
          <div className="flex min-w-[240px] flex-1 gap-1.5">
            {CHAPTERS.map((c, i) => (
              <div key={c.label} className="flex-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-green"
                    style={{
                      width: i < chapter ? "100%" : i > chapter ? "0%" : `${Math.min(100, (chElapsed / c.dur) * 100)}%`,
                      transition: "width .1s linear",
                    }}
                  />
                </div>
                <div className={`mt-1.5 text-[11.5px] font-semibold ${i === chapter ? "text-ink" : "text-ink-3"}`}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ label, icon, active, badge, keyName }: { id: string; label: string; icon: string; active: boolean; badge?: string; keyName?: string }) {
  const k = keyName;
  return (
    <div
      className="flex h-[38px] items-center gap-2.5 rounded-[13px] px-3 text-[13.5px] font-semibold transition-all duration-200"
      style={{
        background: active ? "var(--green)" : "transparent",
        color: active ? "var(--on-green)" : "var(--ink-2)",
        boxShadow: active ? "0 4px 14px var(--green-ring)" : "none",
      }}
    >
      <span data-demo={k || undefined} className="flex flex-1 items-center gap-2.5">
        <Icon name={icon} size={17} />
        {label}
      </span>
      {badge && (
        <span
          className="grid h-[19px] min-w-[19px] place-items-center rounded-full px-1.5 text-[10.5px] font-bold"
          style={{ background: active ? "rgba(255,255,255,.28)" : "var(--surface-3)" }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function Card2({ children, className = "", dark = false, ...p }: { children: React.ReactNode; className?: string; dark?: boolean; [k: string]: unknown }) {
  return (
    <div
      {...p}
      className={`rounded-[20px] ${className}`}
      style={{ background: dark ? "var(--dark-card)" : "var(--surface)", boxShadow: "var(--sh-card)", border: dark ? "none" : "1px solid var(--line)" }}
    >
      {children}
    </div>
  );
}

function DashView({ hover }: { hover: string | null }) {
  const stats = [
    { k: "stat-focus", l: "Focus today", n: "3h 12m", d: "+18%" },
    { k: "s2", l: "Tasks", n: "8", of: "/12", d: "+3" },
    { k: "s3", l: "Streak", n: "14", unit: "days", d: "best" },
    { k: "s4", l: "Notes", n: "46", d: "+5" },
  ];
  const heat = [1, 0, 2, 1, 3, 0, 1, 2, 3, 1, 0, 2, 3, 2, 1, 3, 2, 0, 1, 3, 2, 3, 1, 2, 3, 3, 2, 1];
  return (
    <div className="flex h-full flex-col gap-4">
      <Card2 className="grid grid-cols-4 py-4">
        {stats.map((s, i) => (
          <div key={s.k} data-demo={s.k} className="px-5" style={{ borderLeft: i ? "1px solid var(--line-strong)" : "none" }}>
            <div className="text-[12px] font-semibold text-ink-3">{s.l}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="mono-num text-[23px] font-extrabold tracking-[-0.02em]">{s.n}</span>
              {s.of && <span className="text-[13px] text-ink-3">{s.of}</span>}
              {s.unit && <span className="text-[12px] text-ink-3">{s.unit}</span>}
              <span className="ml-auto rounded-[7px] bg-green-soft px-1.5 py-0.5 text-[11px] font-bold text-green-deep">{s.d}</span>
            </div>
          </div>
        ))}
      </Card2>
      <div className="grid min-h-0 flex-1 grid-cols-[1.6fr_1fr] gap-4">
        <Card2 className="p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-[38px] w-[38px] place-items-center rounded-xl bg-tile text-tile-ink">
              <Icon name="tasks" size={18} />
            </div>
            <div>
              <div className="text-[15px] font-bold tracking-[-0.01em]">Today</div>
              <div className="text-[12.5px] text-ink-3">3 of 5 complete</div>
            </div>
            <div className="ml-auto h-2 w-28 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full w-3/5 rounded-full bg-green" />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-1">
            {[
              ["Morning pages", true, "Personal", "gray"],
              ["Design review with Kai", true, "Design", "orange"],
              ["Write release notes", true, "Launch", "green"],
              ["Widget mini mode polish", false, "Build", "teal"],
              ["Inbox zero", false, "Ops", "blue"],
            ].map(([t, d, tag, c]) => (
              <div key={t as string} className="flex h-11 items-center gap-3 rounded-xl px-2 hover:bg-surface-2">
                <span
                  className="grid h-5 w-5 place-items-center rounded-[7px]"
                  style={{ background: d ? "var(--green)" : "transparent", border: d ? "none" : "1.5px solid var(--line-strong)", color: "var(--on-green)" }}
                >
                  {d && <Icon name="check" size={12} stroke={3.2} />}
                </span>
                <span className={`text-[13.5px] ${d ? "text-ink-3 line-through" : "font-medium"}`}>{t as string}</span>
                <span className="pill ml-auto" style={{ background: `var(--${c}-soft, var(--surface-3))`, color: `var(--${c}, var(--ink-2))` }}>
                  <span className="dot" />
                  {tag as string}
                </span>
              </div>
            ))}
          </div>
        </Card2>
        <Card2 dark className="p-5">
          <div className="text-[15px] font-bold" style={{ color: "#F6F5F3" }}>Focus heatmap</div>
          <div className="text-[12.5px]" style={{ color: "#9B9B94" }}>Last 4 weeks</div>
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {heat.map((h, i) => (
              <div
                key={i}
                data-demo={i === 27 ? "heat-today" : undefined}
                className="grid aspect-square place-items-center rounded-lg text-[10px] font-bold transition-all"
                style={{
                  background: h >= 3 ? "var(--green)" : h === 2 ? "color-mix(in srgb, var(--green) 55%, var(--dark-card-2))" : h === 1 ? "color-mix(in srgb, var(--green) 22%, var(--dark-card-2))" : "var(--dark-card-2)",
                  color: h >= 3 ? "var(--on-green)" : "#B9B9B2",
                  outline: i === 27 ? "2px solid var(--green)" : "none",
                  outlineOffset: 2,
                  transform: hover === "heat-today" && i === 27 ? "scale(1.12)" : "none",
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-[12px]" style={{ color: "#B9B9B2" }}>
            <span>Avg 2h 48m / day</span>
            <span className="font-bold" style={{ color: "var(--green)" }}>↑ 22%</span>
          </div>
        </Card2>
      </div>
    </div>
  );
}

function TaskCard({ card, lifted = false, ...p }: { card: Card; lifted?: boolean; [k: string]: unknown }) {
  return (
    <div
      {...p}
      className="rounded-[14px] bg-surface p-3"
      style={{ boxShadow: lifted ? "var(--sh-pop)" : "var(--sh-card)", border: "1px solid var(--line)" }}
    >
      <div className="text-[13.5px] font-semibold">{card.title}</div>
      <div className="mt-2.5 flex items-center">
        <span className="pill" style={{ background: `var(--${card.c}-soft)`, color: `var(--${card.c === "green" ? "green-deep" : card.c})`, height: 22 }}>
          <span className="dot" />
          {card.tag}
        </span>
        <span className="ml-auto h-[22px] w-[22px] rounded-full" style={{ background: card.av }} />
      </div>
    </div>
  );
}

function TasksView({ todo, doing, done, draft }: { todo: Card[]; doing: Card[]; done: Card[]; draft: string | null }) {
  const cols: { t: string; c: string; cards: Card[]; drop?: boolean }[] = [
    { t: "To do", c: "var(--ink-3)", cards: todo },
    { t: "In progress", c: "var(--orange)", cards: doing },
    { t: "Done", c: "var(--green)", cards: done, drop: true },
  ];
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        {["All", "Mine", "Launch"].map((c, i) => (
          <span
            key={c}
            className="flex h-8 items-center rounded-full px-3.5 text-[13px] font-semibold"
            style={{ background: i === 0 ? "var(--ink)" : "var(--surface)", color: i === 0 ? "var(--bg)" : "var(--ink-2)", boxShadow: i ? "var(--sh-card)" : "none" }}
          >
            {c}
          </span>
        ))}
        <span data-demo="btn-new" className="btn btn-dark ml-auto">
          <Icon name="plus" size={15} /> New task
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-3.5">
        {cols.map((col) => (
          <div key={col.t} className="flex flex-col gap-2.5 rounded-[18px] bg-surface-2 p-3">
            <div className="flex items-center gap-2 px-1 text-[13px] font-bold">
              <span className="h-2 w-2 rounded-full" style={{ background: col.c }} />
              {col.t}
              <span className="ml-1 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-surface-3 px-1.5 text-[11px] text-ink-2">{col.cards.length + (col.t === "To do" && draft !== null ? 1 : 0)}</span>
            </div>
            {col.drop && <div data-demo="drop-done" className="h-1" />}
            {col.t === "To do" && draft !== null && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-[14px] bg-surface p-3" style={{ border: "1.5px solid var(--green)", boxShadow: "0 0 0 3px var(--green-ring)" }}>
                <div className="text-[13.5px] font-semibold">
                  {draft || <span className="text-ink-3">Task title…</span>}
                  <span className="caret ml-0.5" />
                </div>
              </motion.div>
            )}
            <AnimatePresence initial={false}>
              {col.cards.map((c) => (
                <motion.div key={c.id} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.25 }}>
                  <TaskCard card={c} data-demo={c.id === "new" ? "card-new" : undefined} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderMd(text: string) {
  return text.split("\n").map((l, i) => {
    const bold = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((p, j) => (j % 2 ? <b key={j}>{p}</b> : p));
    if (l.startsWith("# ")) return <div key={i} className="mb-2 border-b border-line pb-2 text-[22px] font-extrabold tracking-[-0.02em]">{l.slice(2)}</div>;
    if (l.startsWith("- ")) return <div key={i} className="flex gap-2 pl-1"><span className="text-green-deep">•</span><span>{bold(l.slice(2))}</span></div>;
    if (l.startsWith("> ")) return <div key={i} className="my-2 rounded-r-xl border-l-[3px] border-green bg-green-soft px-3 py-2 text-ink-2">{l.slice(2)}</div>;
    if (l.startsWith(">")) return <div key={i} className="my-2 rounded-r-xl border-l-[3px] border-green bg-green-soft px-3 py-2 text-ink-2">{l.slice(1)}</div>;
    return <div key={i} className="min-h-[10px]">{bold(l)}</div>;
  });
}

function NotesView({ note }: { note: string }) {
  const notes = [
    ["Weekly calm review", "Shipped 13 themes…", true],
    ["Launch checklist", "DMG notarized, MSI signed", false],
    ["Reading list", "The Shape of Design", false],
    ["Ideas", "Widget weather card", false],
  ];
  return (
    <div className="grid h-full grid-cols-[240px_1fr] gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5">
          {["All", "Work", "Life"].map((f, i) => (
            <span key={f} className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: i === 0 ? "var(--green-soft)" : "var(--surface-2)", color: i === 0 ? "var(--green-deep)" : "var(--ink-2)" }}>
              {f}
            </span>
          ))}
        </div>
        {notes.map(([t, s, a]) => (
          <div key={t as string} className="rounded-2xl bg-surface p-3" style={{ border: `1.5px solid ${a ? "var(--green)" : "transparent"}`, boxShadow: "var(--sh-card)" }}>
            <div className="text-[13.5px] font-bold">{t as string}</div>
            <div className="truncate text-[12px] text-ink-3">{s as string}</div>
            <div className="mt-1 text-[10.5px] text-ink-4">Today</div>
          </div>
        ))}
      </div>
      <Card2 className="flex min-h-0 flex-col">
        <div className="flex items-center gap-1 border-b border-line px-4 py-2 text-ink-3">
          {["B", "I", "H", "“", "</>"].map((b) => (
            <span key={b} className="grid h-7 min-w-7 place-items-center rounded-lg px-1.5 text-[12.5px] font-bold hover:bg-surface-2">{b}</span>
          ))}
          <div className="ml-auto flex rounded-full bg-surface-3 p-[3px] text-[12px] font-semibold">
            {["Edit", "Split", "Preview"].map((m, i) => (
              <span key={m} className="rounded-full px-3 py-1" style={{ background: i === 1 ? "var(--surface)" : "transparent", boxShadow: i === 1 ? "0 1px 4px rgba(0,0,0,.1)" : "none" }}>{m}</span>
            ))}
          </div>
        </div>
        <div data-demo="note-editor" className="grid min-h-0 flex-1 grid-cols-2">
          <pre className="m-0 whitespace-pre-wrap border-r border-line p-5 font-mono text-[12.5px] leading-[1.7] text-ink-2">
            {note}
            <span className="caret" />
          </pre>
          <div className="p-5 text-[14px] leading-[1.7]">{renderMd(note)}</div>
        </div>
      </Card2>
    </div>
  );
}

function AiView({ msgs, prompt, typing }: { msgs: { me: boolean; text: string }[]; prompt: string; typing: boolean }) {
  return (
    <Card2 className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-5">
        {msgs.length === 0 && (
          <div className="m-auto text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-green-soft text-green-deep">
              <Icon name="spark" size={24} />
            </div>
            <div className="mt-3 text-[16px] font-bold">Ask Pel anything</div>
            <div className="text-[13px] text-ink-3">Plans, summaries, drafts — offline-first.</div>
            <div className="mt-4 flex justify-center gap-2">
              {["Summarize my notes", "Plan my week", "Draft a reply"].map((s) => (
                <span key={s} className="flex h-[30px] items-center rounded-full bg-surface-2 px-3 text-[12.5px] font-medium text-ink-2">{s}</span>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`max-w-[76%] whitespace-pre-line px-4 py-3 text-[13.5px] leading-[1.6] ${m.me ? "self-end" : "self-start"}`}
            style={{
              background: m.me ? "var(--green)" : "var(--surface-2)",
              color: m.me ? "var(--on-green)" : "var(--ink)",
              borderRadius: m.me ? "18px 6px 18px 18px" : "6px 18px 18px 18px",
            }}
          >
            {m.text}
            {!m.me && m.text.length > 0 && <span className="caret ml-0.5" />}
          </motion.div>
        ))}
        {typing && (
          <div className="flex gap-1 self-start rounded-[6px_18px_18px_18px] bg-surface-2 px-4 py-3.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-ink-3" style={{ animation: `nx-typing 1.1s ${i * 0.15}s infinite` }} />
            ))}
          </div>
        )}
      </div>
      <div className="p-4 pt-0">
        <div data-demo="composer" className="flex h-[52px] items-center gap-2 rounded-[18px] bg-surface-2 pl-4 pr-2" style={{ border: `1.5px solid ${prompt ? "var(--green)" : "transparent"}` }}>
          <span className="flex-1 text-[13.5px]">{prompt || <span className="text-ink-3">Message Pel…</span>}{prompt && <span className="caret ml-0.5" />}</span>
          <span data-demo="send" className="grid h-9 w-9 place-items-center rounded-xl bg-green text-on-green">
            <Icon name="arrowUp" size={17} />
          </span>
        </div>
      </div>
    </Card2>
  );
}

function SettingsView({ active }: { active?: string }) {
  return (
    <div className="grid h-full grid-cols-[190px_1fr] gap-4">
      <div className="flex flex-col gap-1">
        {["General", "Appearance", "Shortcuts", "Widget", "Privacy", "About"].map((s) => (
          <div key={s} className="flex h-9 items-center rounded-xl px-3 text-[13.5px] font-semibold" style={{ background: s === "Appearance" ? "var(--surface)" : "transparent", color: s === "Appearance" ? "var(--ink)" : "var(--ink-2)", boxShadow: s === "Appearance" ? "var(--sh-card)" : "none" }}>
            {s}
          </div>
        ))}
      </div>
      <Card2 className="p-5">
        <div className="text-[15px] font-bold">Theme</div>
        <div className="text-[12.5px] text-ink-3">Swaps token values only — layout never moves.</div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {THEME_CARDS.map((t) => (
            <div key={t.id} data-demo={"theme-" + t.id} className="rounded-2xl bg-surface p-2 transition-all" style={{ border: `2px solid ${active === t.id ? "var(--green)" : "var(--line)"}`, transform: active === t.id ? "translateY(-3px)" : "none" }}>
              <div className="flex h-[84px] overflow-hidden rounded-xl" style={{ background: t.side }}>
                <div className="w-[34%] p-2">
                  <div className="h-2 w-8 rounded-full opacity-40" style={{ background: t.pill }} />
                  <div className="mt-2 h-3 rounded-md" style={{ background: t.pill }} />
                  <div className="mt-1.5 h-2 w-3/4 rounded-full bg-gray-400/30" />
                  <div className="mt-1.5 h-2 w-2/3 rounded-full bg-gray-400/30" />
                </div>
                <div className="m-1.5 ml-0 flex-1 rounded-lg p-2" style={{ background: t.main }}>
                  <div className="h-2 w-1/2 rounded-full bg-gray-400/40" />
                  <div className="mt-2 h-6 rounded-md bg-gray-400/15" />
                </div>
              </div>
              <div className="flex items-center justify-between px-1 pb-0.5 pt-2 text-[12.5px] font-semibold">
                {t.name}
                {active === t.id && <span className="grid h-4 w-4 place-items-center rounded-full bg-green text-on-green"><Icon name="check" size={10} stroke={3.2} /></span>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          <div>
            <div className="text-[13.5px] font-semibold">Follow system appearance</div>
            <div className="text-[12px] text-ink-3">Switch between light and dark automatically</div>
          </div>
          <span className="relative h-6 w-[42px] rounded-full bg-green">
            <span className="absolute right-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow" />
          </span>
        </div>
      </Card2>
    </div>
  );
}
