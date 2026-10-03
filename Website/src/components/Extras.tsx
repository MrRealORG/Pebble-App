import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PebbleGlyph, Icon } from "./Icon";
import { useStore } from "../lib/store";
import { sfx } from "../lib/audio";

/**
 * A hidden button. Looks like ordinary decoration until you hover it —
 * then it glows green and asks to be clicked.
 */
export function HiddenSpot({ name, children, title = "…click me?", className = "" }: { name: string; children: ReactNode; title?: string; className?: string }) {
  const { unlock, confetti, secrets } = useStore();
  const found = secrets.has(name);
  const [hover, setHover] = useState(false);
  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        onClick={() => {
          unlock(name);
          confetti();
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="cursor-pointer transition-all duration-300"
        style={{
          color: hover || found ? "var(--green)" : "inherit",
          filter: hover ? "drop-shadow(0 0 12px var(--green-ring))" : "none",
          transform: hover ? "scale(1.18)" : "none",
        }}
        aria-label="Hidden button"
      >
        {children}
      </button>
      <AnimatePresence>
        {hover && !found && (
          <motion.span
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-[10px] px-2.5 py-1 text-[11px] font-bold"
            style={{ background: "var(--ink)", color: "var(--bg)" }}
          >
            {title}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Splash() {
  const [show, setShow] = useState(() => !sessionStorage.getItem("pebblex-booted"));
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => {
      setShow(false);
      sessionStorage.setItem("pebblex-booted", "1");
    }, 1500);
    return () => clearTimeout(t);
  }, [show]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[999999] flex flex-col items-center justify-center"
          style={{ background: "#141413", color: "#F4F2EE" }}
          exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="grid h-[68px] w-[68px] place-items-center rounded-[22px]"
            style={{ background: "linear-gradient(135deg, #1c261b, #151d14)", border: "1px solid rgba(124,213,110,.25)", boxShadow: "0 0 20px rgba(124,213,110,.15)", animation: "nx-pulse 2s ease-in-out infinite" }}
          >
            <PebbleGlyph size={38} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-5 flex items-center gap-1.5 text-[22px] font-extrabold tracking-[-0.02em]">
            Pebble <span className="rounded-md px-1.5 text-[16px] font-extrabold" style={{ background: "#7CD56E", color: "#0E2B0A" }}>X</span>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-1 text-[13px]" style={{ color: "#9B9B94" }}>
            One calm workspace
          </motion.div>
          <div className="relative mt-6 h-[3px] w-[140px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.08)" }}>
            <span className="absolute inset-y-0 w-1/3 rounded-full" style={{ background: "#7CD56E", animation: "nx-shimmer 1.2s ease-in-out infinite" }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function CursorFollower() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [enabled] = useState(() => window.matchMedia("(pointer: fine)").matches);
  useEffect(() => {
    if (!enabled) return;
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, hover = false, down = false, raf = 0;
    let lastEl: Element | null = null;
    const move = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      const t = e.target as HTMLElement;
      const el = t.closest("button, a, [role=button], input, textarea, .cursor-pointer, .menu-item");
      hover = !!el;
      // iOS-style tick, once per element entered — not once per pixel
      if (el && el !== lastEl) {
        lastEl = el;
        sfx.tick();
        // only sweep for "big" targets so it doesn't chatter on dense UI
        const r = el.getBoundingClientRect();
        if (r.width * r.height > 2400) sfx.swoosh();
      } else if (!el) {
        lastEl = null;
      }
    };
    const md = () => {
      down = true;
      sfx.tap();
    };
    const mu = () => {
      down = false;
      sfx.release();
    };
    const loop = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      if (dot.current) dot.current.style.transform = `translate(${x - 3}px, ${y - 3}px)`;
      if (ring.current) {
        const s = (hover ? 1.7 : 1) * (down ? 0.8 : 1);
        ring.current.style.transform = `translate(${rx - 16}px, ${ry - 16}px) scale(${s})`;
        ring.current.style.opacity = hover ? "1" : ".55";
        ring.current.style.background = hover ? "color-mix(in srgb, var(--green) 14%, transparent)" : "transparent";
      }
      raf = requestAnimationFrame(loop);
    };
    addEventListener("mousemove", move);
    addEventListener("mousedown", md);
    addEventListener("mouseup", mu);
    loop();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("mousemove", move);
      removeEventListener("mousedown", md);
      removeEventListener("mouseup", mu);
    };
  }, [enabled]);
  if (!enabled) return null;
  return (
    <>
      <div ref={ring} className="pointer-events-none fixed left-0 top-0 z-[1300] h-8 w-8 rounded-full transition-[opacity,background] duration-200" style={{ border: "1.5px solid var(--green)" }} />
      <div ref={dot} className="pointer-events-none fixed left-0 top-0 z-[1300] h-1.5 w-1.5 rounded-full bg-green" />
    </>
  );
}

/**
 * One-time invitation to turn on sound. A gesture is required before
 * browsers will allow audio, so we simply ask once and get out of the way.
 */
export function SoundOnboard() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("pebblex-sfx") !== null) return;
    const t = setTimeout(() => setShow(true), 2200);
    return () => clearTimeout(t);
  }, []);
  const close = () => {
    setShow(false);
    localStorage.setItem("pebblex-sfx", "0");
  };
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="zen-hide fixed bottom-5 right-5 z-[980] w-[290px] rounded-2xl border border-line bg-surface p-3.5"
          style={{ boxShadow: "var(--sh-pop)" }}
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: "var(--green-soft)", color: "var(--green-deep)" }}>
              <Icon name="volume" size={17} />
            </span>
            <div className="flex-1">
              <div className="text-[13.5px] font-bold">Hear the calm</div>
              <div className="mt-0.5 text-[12px] leading-snug text-ink-2">Soft iOS-style taps as you move and click. No music, no loops.</div>
            </div>
            <button onClick={close} className="grid h-6 w-6 cursor-pointer place-items-center rounded-lg text-ink-3 hover:bg-surface-2" aria-label="Dismiss">
              <Icon name="x" size={13} />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                sfx.setEnabled(true);
                setShow(false);
              }}
              className="btn btn-green h-8 flex-1 text-[12.5px]"
            >
              Turn it on
            </button>
            <button onClick={close} className="btn btn-ghost h-8 text-[12.5px]">
              Not now
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SecretHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("pebblex-hint")) return;
    const t = setTimeout(() => setShow(true), 7000);
    const hide = () => {
      setShow(false);
      localStorage.setItem("pebblex-hint", "1");
    };
    addEventListener("contextmenu", hide);
    return () => {
      clearTimeout(t);
      removeEventListener("contextmenu", hide);
    };
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="zen-hide fixed bottom-5 left-5 z-[950] flex max-w-[300px] items-center gap-3 rounded-2xl border border-line bg-surface p-3 pr-2"
          style={{ boxShadow: "var(--sh-pop)" }}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--purple-soft)", color: "var(--purple)" }}>
            <Icon name="mouse" size={17} />
          </span>
          <div className="text-[12.5px] leading-snug text-ink-2">
            <b className="text-ink">Psst.</b> Right-click anywhere. Hold <span className="kbd">⇧</span> for the secret lab.
          </div>
          <button
            onClick={() => {
              setShow(false);
              localStorage.setItem("pebblex-hint", "1");
            }}
            className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-ink-3 hover:bg-surface-2"
            aria-label="Dismiss"
          >
            <Icon name="x" size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
