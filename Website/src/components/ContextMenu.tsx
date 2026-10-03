import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../lib/store";
import { THEMES, themeById } from "../lib/themes";
import { Icon } from "./Icon";
import { fireSecret } from "./Overlays";
import { TOTAL_SECRETS } from "../lib/secrets";

type Pos = { x: number; y: number; secret: boolean };

const SECRETS = [
  { id: "rain", label: "Pebble Rain", icon: "rain", hint: "toggle" },
  { id: "gravity", label: "Gravity", icon: "arrowUp", hint: "drop it" },
  { id: "flashlight", label: "Flashlight", icon: "eye", hint: "Esc" },
  { id: "xray", label: "X-Ray Vision", icon: "layers", hint: "toggle" },
  { id: "disco", label: "Theme Disco", icon: "palette", hint: "2s" },
  { id: "zen", label: "Zen Mode", icon: "wind", hint: "toggle" },
];

export function ContextMenu() {
  const { theme, setTheme, cycleTheme, go, setPaletteOpen, toast, confetti, scrollTo, secrets } = useStore();
  const [pos, setPos] = useState<Pos | null>(null);
  const [themesOpen, setThemesOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [adj, setAdj] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [data-native-ctx]")) return;
      e.preventDefault();
      setThemesOpen(false);
      setPos({ x: e.clientX, y: e.clientY, secret: e.shiftKey || e.altKey });
    };
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("contextmenu", onCtx);
    addEventListener("click", close);
    addEventListener("scroll", close, { passive: true });
    addEventListener("keydown", onKey);
    addEventListener("resize", close);
    return () => {
      removeEventListener("contextmenu", onCtx);
      removeEventListener("click", close);
      removeEventListener("scroll", close);
      removeEventListener("keydown", onKey);
      removeEventListener("resize", close);
    };
  }, []);

  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAdj({
      x: Math.min(pos.x, innerWidth - r.width - 10),
      y: Math.min(pos.y, innerHeight - r.height - 10),
    });
  }, [pos, themesOpen]);

  const run = (fn: () => void) => () => {
    fn();
    setPos(null);
  };

  return (
    <AnimatePresence>
      {pos && (
        <motion.div
          ref={ref}
          key={`${pos.x}-${pos.y}`}
          className="menu"
          style={{ left: adj.x || pos.x, top: adj.y || pos.y, transformOrigin: "top left" }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.08 } }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {pos.secret ? (
            <>
              <div className="menu-label flex items-center gap-2">
                <Icon name="gift" size={12} /> Secret lab · {secrets.size}/{TOTAL_SECRETS} found
              </div>
              {SECRETS.map((s) => (
                <button key={s.id} className="menu-item" onClick={run(() => fireSecret(s.id))}>
                  <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: "var(--purple-soft)", color: "var(--purple)" }}>
                    <Icon name={s.icon} size={13} />
                  </span>
                  {s.label}
                  {secrets.has(s.label) && <Icon name="check" size={13} className="text-green-deep" />}
                  <span className="mi-right">{s.hint}</span>
                </button>
              ))}
              <div className="menu-sep" />
              <div className="px-2.5 py-1.5 text-[11.5px] leading-snug text-ink-3">
                Four more hide outside this menu: ↑ ↑ ↓ ↓ ← → ← → B A, a full stop, a letter in the footer, and three taps on the mark.
              </div>
            </>
          ) : (
            <>
              <div className="menu-label">PebbleX</div>
              <button className="menu-item" onClick={run(() => go("home"))}>
                <Icon name="home" size={16} className="text-ink-2" /> Home
              </button>
              <button className="menu-item" onClick={run(() => go("docs"))}>
                <Icon name="book" size={16} className="text-ink-2" /> Documentation
              </button>
              <button className="menu-item" onClick={run(() => go("download"))}>
                <Icon name="download" size={16} className="text-ink-2" /> Download
                <span className="mi-right">v0.1.0</span>
              </button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={run(() => setPaletteOpen(true))}>
                <Icon name="search" size={16} className="text-ink-2" /> Command palette
                <span className="mi-right">⌘K</span>
              </button>
              <button className="menu-item" onClick={(e) => { e.stopPropagation(); setThemesOpen((v) => !v); }}>
                <Icon name="palette" size={16} className="text-ink-2" /> Theme
                <span className="mi-right flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: themeById(theme).pill }} />
                  {themeById(theme).name}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {themesOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-7 gap-1.5 px-2.5 py-2">
                      {THEMES.map((t) => (
                        <button
                          key={t.id}
                          title={t.name}
                          onClick={() => setTheme(t.id)}
                          className="relative h-6 w-6 cursor-pointer rounded-full transition-transform hover:scale-110"
                          style={{
                            background: `linear-gradient(135deg, ${t.bg} 50%, ${t.pill} 50%)`,
                            boxShadow: theme === t.id ? `0 0 0 2px var(--surface), 0 0 0 4px ${t.pill}` : "inset 0 0 0 1px rgba(0,0,0,.12)",
                          }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <button className="menu-item" onClick={run(cycleTheme)}>
                <Icon name="refresh" size={16} className="text-ink-2" /> Next theme
                <span className="mi-right">T</span>
              </button>
              <div className="menu-sep" />
              <button
                className="menu-item"
                onClick={run(() => {
                  navigator.clipboard?.writeText(location.href);
                  toast({ title: "Link copied", msg: "Share the calm." });
                })}
              >
                <Icon name="link" size={16} className="text-ink-2" /> Copy page link
              </button>
              <button className="menu-item" onClick={run(() => scrollTo(0))}>
                <Icon name="arrowUp" size={16} className="text-ink-2" /> Back to top
              </button>
              <button className="menu-item" onClick={run(confetti)}>
                <Icon name="star" size={16} className="text-ink-2" /> Celebrate
              </button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={(e) => { e.stopPropagation(); setPos({ ...pos, secret: true }); }}>
                <Icon name="lock" size={16} className="text-purple" />
                <span className="text-ink-2">Secret lab</span>
                <span className="mi-right">⇧ right-click</span>
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
