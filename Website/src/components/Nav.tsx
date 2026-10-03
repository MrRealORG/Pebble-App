import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore, type Route } from "../lib/store";
import { THEMES, themeById } from "../lib/themes";
import { BrandMark, Icon } from "./Icon";
import { useSound } from "./Sound";

export function Nav() {
  const { route, go, setPaletteOpen, theme, setTheme, scrollTo, unlock, confetti } = useStore();
  const tapRef = useRef<number[]>([0]);
  const [soundOn, toggleSound] = useSound();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const last = useRef(0);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => {
      const y = scrollY;
      setScrolled(y > 20);
      setHidden(y > 300 && y > last.current + 4 ? true : y < last.current - 4 ? false : hidden);
      last.current = y;
    };
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, [hidden]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setThemeOpen(false);
    };
    addEventListener("mousedown", close);
    return () => removeEventListener("mousedown", close);
  }, []);

  const links: { label: string; r: Route; anchor?: string }[] = [
    { label: "Features", r: "home", anchor: "#features" },
    { label: "Themes", r: "home", anchor: "#themes" },
    { label: "Docs", r: "docs" },
    { label: "Changelog", r: "changelog" },
  ];

  const onLink = (l: (typeof links)[number]) => {
    setMobile(false);
    if (l.anchor) {
      if (route !== "home") {
        go("home");
        setTimeout(() => scrollTo(l.anchor!), 350);
      } else scrollTo(l.anchor);
    } else go(l.r);
  };

  const t = themeById(theme);

  return (
    <motion.header
      className="zen-hide fixed left-0 right-0 top-0 z-[700] flex justify-center px-3 pt-3"
      animate={{ y: hidden && !themeOpen ? -90 : 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
    >
      <nav
        className="flex h-14 w-full max-w-[1120px] items-center gap-2 rounded-[18px] pl-3 pr-2 transition-all duration-300"
        style={{
          background: scrolled ? "color-mix(in srgb, var(--surface) 78%, transparent)" : "transparent",
          backdropFilter: scrolled ? "saturate(180%) blur(18px)" : "none",
          WebkitBackdropFilter: scrolled ? "saturate(180%) blur(18px)" : "none",
          boxShadow: scrolled ? "var(--sh-card), inset 0 0 0 1px var(--line)" : "none",
        }}
      >
        <button
          onClick={() => {
            // hidden button #3 — three quick taps on the mark
            const now = Date.now();
            tapRef.current = now - tapRef.current[tapRef.current.length - 1] > 700 ? [now] : [...tapRef.current, now];
            if (tapRef.current.length >= 3) {
              tapRef.current = [];
              unlock("Triple Tap");
              confetti();
              return;
            }
            go("home");
          }}
          className="flex cursor-pointer items-center gap-2.5 rounded-xl pr-2"
          title="PebbleX"
        >
          <BrandMark size={32} />
          <span className="text-[16.5px] font-extrabold tracking-[-0.02em]">PebbleX</span>
        </button>

        <div className="ml-4 hidden items-center gap-0.5 md:flex">
          {links.map((l) => {
            const active = !l.anchor && route === l.r;
            return (
              <button
                key={l.label}
                onClick={() => onLink(l)}
                className="relative h-9 cursor-pointer rounded-full px-3.5 text-[13.5px] font-semibold transition-colors"
                style={{ color: active ? "var(--ink)" : "var(--ink-2)" }}
              >
                {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-surface-3" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className="relative">{l.label}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden h-9 cursor-pointer items-center gap-2 rounded-full bg-surface-2 pl-3 pr-1.5 text-[13px] text-ink-3 transition-colors hover:bg-surface-3 sm:flex"
          >
            <Icon name="search" size={14} />
            Search
            <span className="kbd ml-3">⌘K</span>
          </button>

          <button
            onClick={() => toggleSound()}
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full transition-colors hover:bg-surface-3"
            aria-pressed={soundOn}
            title={soundOn ? "Mute sound effects" : "Turn on sound effects"}
          >
            {soundOn ? (
              <span className="flex h-3.5 items-end gap-[2px]">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-[2.5px] rounded-full"
                    style={{ background: "var(--green-deep)" }}
                    animate={{ height: [4, 13, 7, 11, 5] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                  />
                ))}
              </span>
            ) : (
              <Icon name="volumeOff" size={17} className="text-ink-2" />
            )}
          </button>

          <div ref={popRef} className="relative">
            <button
              onClick={() => setThemeOpen((v) => !v)}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-full transition-colors hover:bg-surface-3"
              aria-label="Theme"
              title="Theme"
            >
              <span className="h-[18px] w-[18px] rounded-full" style={{ background: `linear-gradient(135deg, ${t.bg} 50%, ${t.pill} 50%)`, boxShadow: "inset 0 0 0 1.5px var(--line-strong)" }} />
            </button>
            <AnimatePresence>
              {themeOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 top-12 w-[320px] origin-top-right rounded-[18px] border border-line bg-surface p-3"
                  style={{ boxShadow: "var(--sh-pop)" }}
                >
                  <div className="flex items-center justify-between px-1 pb-2">
                    <span className="overline">13 themes</span>
                    <span className="text-[11.5px] text-ink-3">Press <span className="kbd">T</span> to cycle</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {THEMES.map((th) => (
                      <button
                        key={th.id}
                        onClick={() => setTheme(th.id)}
                        className="cursor-pointer rounded-xl p-1.5 text-left transition-all hover:-translate-y-0.5"
                        style={{ boxShadow: theme === th.id ? "inset 0 0 0 2px var(--green)" : "inset 0 0 0 1px var(--line)" }}
                      >
                        <div className="flex h-10 overflow-hidden rounded-lg" style={{ background: th.side }}>
                          <div className="w-1/3 p-1">
                            <div className="h-1.5 rounded-sm" style={{ background: th.pill }} />
                          </div>
                          <div className="m-1 ml-0 flex-1 rounded-md" style={{ background: th.main, boxShadow: "inset 0 0 0 1px rgba(128,128,128,.15)" }} />
                        </div>
                        <div className="mt-1 truncate px-0.5 text-[11.5px] font-semibold">{th.name}</div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button onClick={() => go("download")} className="btn btn-dark hidden sm:inline-flex">
            <Icon name="download" size={15} /> Download
          </button>
          <button className="grid h-9 w-9 cursor-pointer place-items-center rounded-full hover:bg-surface-3 md:hidden" onClick={() => setMobile((m) => !m)} aria-label="Menu">
            <Icon name={mobile ? "x" : "menu"} size={18} />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobile && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute left-3 right-3 top-[72px] rounded-[18px] border border-line bg-surface p-2 md:hidden"
            style={{ boxShadow: "var(--sh-pop)" }}
          >
            {links.map((l) => (
              <button key={l.label} onClick={() => onLink(l)} className="menu-item h-11 text-[15px] font-semibold">
                {l.label}
              </button>
            ))}
            <button onClick={() => { setMobile(false); go("download"); }} className="btn btn-green mt-2 w-full">
              <Icon name="download" size={15} /> Download PebbleX
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}


