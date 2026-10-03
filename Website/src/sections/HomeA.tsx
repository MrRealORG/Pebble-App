import { useEffect, useRef } from "react";
import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { AppDemo } from "../components/AppDemo";
import { Icon, PebbleGlyph } from "../components/Icon";
import { HiddenSpot } from "../components/Extras";
import { useStore } from "../lib/store";

const ease = [0.16, 1, 0.3, 1] as const;

function FloatingPebble({ x, y, size, depth, mx, my, green = false, rot = 0 }: { x: string; y: string; size: number; depth: number; mx: MotionValue<number>; my: MotionValue<number>; green?: boolean; rot?: number }) {
  const tx = useTransform(mx, (v) => v * depth);
  const ty = useTransform(my, (v) => v * depth);
  return (
    <motion.div className="pointer-events-none absolute" style={{ left: x, top: y, x: tx, y: ty }}>
      <div style={{ animation: `nx-float ${5 + depth * 3}s ease-in-out infinite`, rotate: `${rot}deg` }}>
        <div
          style={{
            width: size,
            height: size * 0.78,
            borderRadius: "52% 48% 46% 54% / 58% 52% 48% 42%",
            background: green ? "var(--green)" : "linear-gradient(145deg, var(--surface-3), var(--line-strong))",
            boxShadow: green ? "0 18px 40px var(--green-ring)" : "inset -6px -8px 18px rgba(0,0,0,.06), 0 18px 40px rgba(0,0,0,.08)",
            opacity: green ? 0.9 : 1,
          }}
        />
      </div>
    </motion.div>
  );
}

export function HeroDemo() {
  const { go, scrollTo } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });

  const headOpacity = useTransform(p, [0, 0.28], [1, 0]);
  const headY = useTransform(p, [0, 0.3], [0, -120]);
  const headScale = useTransform(p, [0, 0.3], [1, 0.92]);
  const headBlur = useTransform(p, [0, 0.28], ["blur(0px)", "blur(10px)"]);
  const demoY = useTransform(p, [0, 0.45], ["52vh", "0vh"]);
  const rotX = useTransform(p, [0, 0.45], [34, 0]);
  const demoScale = useTransform(p, [0, 0.45, 1], [0.82, 1, 1]);
  const glow = useTransform(p, [0.3, 0.6], [0, 1]);
  const chipsOpacity = useTransform(p, [0.5, 0.65], [0, 1]);
  const chipsY = useTransform(p, [0.5, 0.65], [20, 0]);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 60, damping: 20 });
  const smy = useSpring(my, { stiffness: 60, damping: 20 });
  useEffect(() => {
    const on = (e: MouseEvent) => {
      mx.set((e.clientX / innerWidth - 0.5) * 40);
      my.set((e.clientY / innerHeight - 0.5) * 40);
    };
    addEventListener("mousemove", on);
    return () => removeEventListener("mousemove", on);
  }, [mx, my]);

  const words = ["One", "calm", "workspace"];

  return (
    <section ref={ref} className="relative" style={{ height: "260vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* ambient */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[-20%] h-[70vh] w-[80vw] -translate-x-1/2 rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(closest-side, var(--green-soft), transparent)" }} />
          <motion.div className="absolute bottom-[-10%] left-1/2 h-[60vh] w-[70vw] -translate-x-1/2 rounded-full blur-3xl" style={{ opacity: glow, background: "radial-gradient(closest-side, var(--green-ring), transparent)" }} />
        </div>
        <motion.div style={{ opacity: headOpacity }} className="absolute inset-0">
          <FloatingPebble x="8%" y="22%" size={70} depth={0.6} mx={smx} my={smy} rot={-12} />
          <FloatingPebble x="84%" y="18%" size={54} depth={1} mx={smx} my={smy} green rot={18} />
          <FloatingPebble x="78%" y="48%" size={90} depth={0.4} mx={smx} my={smy} rot={8} />
          <FloatingPebble x="14%" y="56%" size={36} depth={1.3} mx={smx} my={smy} green rot={-20} />
          <FloatingPebble x="62%" y="12%" size={28} depth={1.6} mx={smx} my={smy} rot={30} />
        </motion.div>

        {/* headline */}
        <motion.div
          style={{ opacity: headOpacity, y: headY, scale: headScale, filter: headBlur }}
          className="relative z-10 mx-auto flex max-w-[980px] flex-col items-center px-6 pt-[17vh] text-center"
        >
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.1 }}
            onClick={() => go("changelog")}
            className="group flex h-8 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface pl-1.5 pr-3 text-[12.5px] font-semibold text-ink-2"
            style={{ boxShadow: "var(--sh-card)" }}
          >
            <span className="rounded-full bg-green px-2 py-0.5 text-[11px] font-bold text-on-green">New</span>
            v0.1.0 — 13 themes, Pel AI & Timeless
            <Icon name="arrow" size={13} className="transition-transform group-hover:translate-x-0.5" />
          </motion.button>

          <h1 className="mt-7 text-[clamp(48px,9vw,112px)] font-extrabold leading-[0.95] tracking-[-0.055em]">
            {words.map((w, i) => (
              <motion.span
                key={w}
                className="inline-block pr-[0.22em] last:pr-0"
                initial={{ opacity: 0, y: 40, filter: "blur(14px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 1.1, ease, delay: 0.2 + i * 0.12 }}
                style={{ color: w === "calm" ? "var(--green-deep)" : undefined }}
              >
                {w}
              </motion.span>
            ))}
            <motion.span
              className="inline-block"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease, delay: 0.9 }}
            >
              {/* hidden button #1 — the full stop */}
              <HiddenSpot name="The Lost Dot" title="a full stop with a secret">
                .
              </HiddenSpot>
            </motion.span>
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.6 }}
            className="mt-6 max-w-[580px] text-[clamp(16px,1.6vw,19px)] leading-relaxed text-ink-2"
          >
            Chat, notes, tasks, a quiet AI and an honest time tracker — in one desktop app that never raises its voice.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.75 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <button onClick={() => go("download")} className="btn btn-green btn-lg">
              <Icon name="download" size={17} /> Download for free
            </button>
            <button onClick={() => scrollTo(innerHeight * 1.3)} className="btn btn-outline btn-lg">
              <Icon name="play" size={14} /> Watch it work
            </button>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="mt-5 flex items-center gap-4 text-[12.5px] text-ink-3">
            <span className="flex items-center gap-1.5"><Icon name="apple" size={13} /> macOS</span>
            <span className="flex items-center gap-1.5"><Icon name="windows" size={13} /> Windows</span>
            <span className="flex items-center gap-1.5"><Icon name="linux" size={13} /> Linux</span>
            <span className="h-3 w-px bg-line-strong" />
            <span>Free · Offline-first</span>
          </motion.div>
        </motion.div>

        {/* demo */}
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4" style={{ perspective: 1600 }}>
          <motion.div
            style={{ y: demoY, rotateX: rotX, scale: demoScale, transformOrigin: "50% 0%", width: "min(1120px, 94vw, calc((100vh - 110px) * 1.6))" }}
            className="relative"
          >
            <div className="rounded-[26px] p-2" style={{ background: "color-mix(in srgb, var(--surface) 60%, transparent)", boxShadow: "var(--sh-login), inset 0 0 0 1px var(--line)" }}>
              <AppDemo />
            </div>
            <motion.div style={{ opacity: chipsOpacity, y: chipsY }} className="absolute -bottom-12 left-0 right-0 hidden justify-center gap-2 md:flex">
              {["It clicks", "It types", "It drags", "It switches themes"].map((c, i) => (
                <span key={c} className="pill border border-line bg-surface text-ink-2" style={{ boxShadow: "var(--sh-card)" }}>
                  <span className="dot" style={{ color: i === 3 ? "var(--green)" : "var(--ink-4)" }} />
                  {c}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>

        <motion.div style={{ opacity: headOpacity }} className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 text-ink-3">
          <div className="flex h-9 w-6 justify-center rounded-full border-2 border-line-strong pt-1.5">
            <motion.span animate={{ y: [0, 10, 0], opacity: [1, 0.2, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="h-2 w-1 rounded-full bg-ink-3" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Word({ w, i, n, p }: { w: string; i: number; n: number; p: MotionValue<number> }) {
  const start = i / n;
  const opacity = useTransform(p, [start, start + 1.5 / n], [0.12, 1]);
  const y = useTransform(p, [start, start + 1.5 / n], [8, 0]);
  const isGreen = ["one.", "calm", "waits"].includes(w.toLowerCase().replace(/[,]/g, ""));
  return (
    <motion.span style={{ opacity, y, color: isGreen ? "var(--green-deep)" : undefined }} className="mr-[0.25em] inline-block">
      {w}
    </motion.span>
  );
}

export function WordReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const text = "Seven apps fighting for your attention. Or one. Chat with your team, write in markdown, drag tasks to done, ask a quiet AI and see where the hours went. Nothing shouts. Everything waits for you.";
  const words = text.split(" ");
  const barW = useTransform(p, [0, 1], ["0%", "100%"]);
  return (
    <section ref={ref} className="relative" style={{ height: "220vh" }}>
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto max-w-[1000px] px-6">
          <div className="overline mb-6 flex items-center gap-3">
            <PebbleGlyph size={16} /> Why PebbleX
            <span className="h-[2px] w-32 overflow-hidden rounded-full bg-surface-3">
              <motion.span className="block h-full bg-green" style={{ width: barW }} />
            </span>
          </div>
          <p className="text-[clamp(28px,4.4vw,56px)] font-bold leading-[1.12] tracking-[-0.035em]">
            {words.map((w, i) => (
              <Word key={i} w={w} i={i} n={words.length} p={p} />
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}

export function Marquee() {
  const items = ["Chat", "Notes", "Kanban", "Pel AI", "Timeless", "Reminders", "Prompt Saver", "Media", "Arcade", "Widget", "Command palette", "13 themes"];
  const icons = ["chat", "note", "tasks", "spark", "clock", "bell", "bookmark", "image", "game", "layers", "search", "palette"];
  return (
    <div className="relative overflow-hidden border-y border-line py-5" style={{ maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)" }}>
      <div className="marquee flex w-max gap-3">
        {[...items, ...items].map((t, i) => (
          <span key={i} className="flex h-11 items-center gap-2.5 rounded-full border border-line bg-surface px-5 text-[14px] font-semibold text-ink-2" style={{ boxShadow: "var(--sh-card)" }}>
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-tile text-tile-ink">
              <Icon name={icons[i % icons.length]} size={13} />
            </span>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
