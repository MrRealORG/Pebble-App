import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../lib/store";
import { Icon } from "./Icon";
import { THEMES } from "../lib/themes";

export const fireSecret = (name: string) => window.dispatchEvent(new CustomEvent("pebble:secret", { detail: name }));

export function Toasts() {
  const { toasts, dismiss } = useStore();
  return (
    <div className="fixed bottom-[18px] right-[18px] z-[1000] flex w-[340px] max-w-[calc(100vw-36px)] flex-col gap-[10px]">
      <AnimatePresence>
        {toasts.map((t) => {
          const k = t.kind ?? "ok";
          const ic =
            k === "ok" ? { bg: "var(--green-soft)", c: "var(--green-deep)", i: "check" } :
            k === "err" ? { bg: "var(--red-soft)", c: "var(--red)", i: "x" } :
            k === "secret" ? { bg: "var(--purple-soft)", c: "var(--purple)", i: "gift" } :
            { bg: "var(--blue-soft)", c: "var(--blue)", i: "spark" };
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onClick={() => dismiss(t.id)}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-3 pr-4"
              style={{ boxShadow: "var(--sh-pop)" }}
            >
              <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px]" style={{ background: ic.bg, color: ic.c }}>
                <Icon name={ic.i} size={16} />
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="text-[13.5px] font-bold">{t.title}</div>
                {t.msg && <div className="text-[12.5px] text-ink-2">{t.msg}</div>}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

const CONF_COLORS = ["#7CD56E", "#5EB8FF", "#E8853D", "#8B5CF6", "#E05C9C", "#0FA3A3", "#E25C4A", "#D4A017"];

export function Confetti() {
  const { confettiKey } = useStore();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!confettiKey) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [confettiKey]);
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 1.2 + Math.random() * 0.9,
        size: 6 + Math.random() * 7,
        color: CONF_COLORS[i % CONF_COLORS.length],
        round: Math.random() > 0.6,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confettiKey]
  );
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[1200] overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: -20,
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            background: p.color,
            borderRadius: p.round ? 99 : 2,
            animation: `nx-confetti ${p.dur}s cubic-bezier(.25,.6,.4,1) ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

function PebbleRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const resize = () => {
      c.width = innerWidth * dpr;
      c.height = innerHeight * dpr;
    };
    resize();
    addEventListener("resize", resize);
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--green").trim() || "#7CD56E";
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#121212";
    const drops = Array.from({ length: 70 }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * -innerHeight,
      r: 5 + Math.random() * 12,
      v: 1.5 + Math.random() * 3.5,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.04,
      g: Math.random() > 0.75,
    }));
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const d of drops) {
        d.y += d.v;
        d.rot += d.vr;
        if (d.y > innerHeight + 30) {
          d.y = -30;
          d.x = Math.random() * innerWidth;
        }
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r, d.r * 0.72, 0, 0, Math.PI * 2);
        ctx.fillStyle = d.g ? accent : ink;
        ctx.globalAlpha = d.g ? 0.85 : 0.14;
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
    };
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[1150] h-full w-full" />;
}

function Flashlight({ onExit }: { onExit: () => void }) {
  const [p, setP] = useState({ x: innerWidth / 2, y: innerHeight / 2 });
  useEffect(() => {
    const m = (e: MouseEvent) => setP({ x: e.clientX, y: e.clientY });
    const k = (e: KeyboardEvent) => e.key === "Escape" && onExit();
    addEventListener("mousemove", m);
    addEventListener("keydown", k);
    return () => {
      removeEventListener("mousemove", m);
      removeEventListener("keydown", k);
    };
  }, [onExit]);
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1140]"
      style={{ background: `radial-gradient(circle 190px at ${p.x}px ${p.y}px, transparent 0, transparent 120px, rgba(0,0,0,.93) 200px)` }}
    >
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-xs font-semibold text-white">Flashlight on · press Esc</div>
    </div>
  );
}

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

export function SecretEngine() {
  const { rain, setRain, unlock, confetti, toast, setTheme, theme } = useStore();
  const [flash, setFlash] = useState(false);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    let buf: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      buf = [...buf, e.key].slice(-KONAMI.length);
      if (buf.join(",").toLowerCase() === KONAMI.join(",").toLowerCase()) {
        confetti();
        unlock("The Konami Pebble");
        buf = [];
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [confetti, unlock]);

  useEffect(() => {
    const on = (e: Event) => {
      const name = (e as CustomEvent).detail as string;
      if (name === "rain") {
        setRain(!rain);
        unlock("Pebble Rain");
      }
      if (name === "flashlight") {
        setFlash(true);
        unlock("Flashlight");
      }
      if (name === "xray") {
        document.body.classList.toggle("xray");
        unlock("X-Ray Vision");
      }
      if (name === "zen") {
        const on = document.body.classList.toggle("zen");
        toast({ kind: "info", title: on ? "Zen mode" : "Zen mode off", msg: on ? "Chrome hidden. Right-click to leave." : undefined });
        unlock("Zen Mode");
      }
      if (name === "gravity") {
        unlock("Gravity");
        const els = Array.from(document.querySelectorAll<HTMLElement>("[data-fall]"));
        els.forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > innerHeight) return;
          el.style.transition = `transform ${1 + Math.random() * 0.6}s cubic-bezier(.55,0,.85,.4)`;
          el.style.transform = `translateY(${innerHeight - r.top + 200}px) rotate(${(Math.random() - 0.5) * 70}deg)`;
        });
        setTimeout(() => {
          els.forEach((el) => {
            el.style.transition = "transform .9s cubic-bezier(.2,.9,.3,1.15)";
            el.style.transform = "";
          });
        }, 2300);
      }
      if (name === "disco") {
        unlock("Theme Disco");
        const start = themeRef.current;
        let i = 0;
        const iv = setInterval(() => {
          setTheme(THEMES[i % THEMES.length].id);
          i++;
          if (i > THEMES.length * 2) {
            clearInterval(iv);
            setTheme(start);
          }
        }, 160);
      }
    };
    addEventListener("pebble:secret", on);
    return () => removeEventListener("pebble:secret", on);
  }, [rain, setRain, unlock, toast, setTheme]);

  return (
    <>
      {rain && <PebbleRain />}
      {flash && <Flashlight onExit={() => setFlash(false)} />}
    </>
  );
}

export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      if (ref.current) ref.current.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
    };
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return <div ref={ref} className="fixed left-0 right-0 top-0 z-[960] h-[2px] origin-left bg-green" style={{ transform: "scaleX(0)" }} />;
}
