import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "../lib/store";
import { THEMES } from "../lib/themes";
import { DOC_SECTIONS } from "../lib/docs";
import { Icon } from "./Icon";
import { fireSecret } from "./Overlays";

type Item = { id: string; label: string; group: string; icon: string; hint?: string; swatch?: string; run: () => void };

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, go, setTheme, confetti, toast, lenis } = useStore();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items: Item[] = useMemo(
    () => [
      { id: "home", label: "Go to Home", group: "Pages", icon: "home", run: () => go("home") },
      { id: "docs", label: "Open Documentation", group: "Pages", icon: "book", run: () => go("docs") },
      { id: "dl", label: "Download PebbleX", group: "Pages", icon: "download", hint: "v0.1.0", run: () => go("download") },
      { id: "log", label: "Changelog", group: "Pages", icon: "refresh", run: () => go("changelog") },
      ...DOC_SECTIONS.map((d) => ({ id: "d-" + d.id, label: d.title, group: "Docs", icon: d.icon, hint: d.group, run: () => go("docs", d.id) })),
      ...THEMES.map((t) => ({ id: "t-" + t.id, label: `Theme: ${t.name}`, group: "Themes", icon: t.dark ? "moon" : "sun", swatch: t.pill, run: () => { setTheme(t.id); toast({ title: `${t.name} applied`, msg: t.vibe }); } })),
      { id: "c", label: "Celebrate", group: "Actions", icon: "star", run: confetti },
      { id: "s-rain", label: "Make it rain pebbles", group: "Secret", icon: "rain", run: () => fireSecret("rain") },
      { id: "s-grav", label: "Turn off gravity… or on", group: "Secret", icon: "arrowUp", run: () => fireSecret("gravity") },
      { id: "s-disco", label: "Theme disco", group: "Secret", icon: "palette", run: () => fireSecret("disco") },
    ],
    [go, setTheme, confetti, toast]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.filter((i) => i.group !== "Secret");
    return items.filter((i) => (i.label + " " + i.group + " " + (i.hint ?? "")).toLowerCase().includes(s));
  }, [q, items]);

  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setIdx(0);
      lenis.current?.stop();
      setTimeout(() => inputRef.current?.focus(), 30);
    } else lenis.current?.start();
  }, [paletteOpen, lenis]);

  useEffect(() => setIdx(0), [q]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const exec = (i?: Item) => {
    if (!i) return;
    setPaletteOpen(false);
    setTimeout(i.run, 60);
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div
          className="fixed inset-0 z-[1050] flex justify-center px-4 pt-[14vh]"
          style={{ background: "rgba(20,20,18,.45)", backdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={() => setPaletteOpen(false)}
        >
          <motion.div
            className="h-fit w-[560px] max-w-full overflow-hidden rounded-[20px] border border-line bg-surface"
            style={{ boxShadow: "var(--sh-login)" }}
            initial={{ opacity: 0, scale: 0.94, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 items-center gap-3 border-b border-line px-5">
              <Icon name="search" size={18} className="text-ink-3" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
                  if (e.key === "Enter") exec(filtered[idx]);
                  if (e.key === "Escape") setPaletteOpen(false);
                }}
                placeholder="Search docs, themes, actions…"
                className="h-full flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
              />
              <span className="kbd">esc</span>
            </div>
            <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2" data-lenis-prevent>
              {filtered.length === 0 && (
                <div className="px-4 py-10 text-center text-[13px] text-ink-3">Nothing here. Try “theme”, “notes” or… “secret”.</div>
              )}
              {filtered.map((it, i) => {
                const head = it.group !== lastGroup;
                lastGroup = it.group;
                return (
                  <div key={it.id}>
                    {head && <div className="menu-label pt-3">{it.group}</div>}
                    <button
                      data-idx={i}
                      onMouseMove={() => setIdx(i)}
                      onClick={() => exec(it)}
                      className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[13.5px] transition-colors"
                      style={{ background: i === idx ? "var(--surface-2)" : "transparent" }}
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface-3 text-ink-2">
                        {it.swatch ? <span className="h-3 w-3 rounded-full" style={{ background: it.swatch }} /> : <Icon name={it.icon} size={14} />}
                      </span>
                      <span className="flex-1 truncate font-medium">{it.label}</span>
                      {it.hint && <span className="text-[11.5px] text-ink-3">{it.hint}</span>}
                      {i === idx && <span className="kbd">↵</span>}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-[11.5px] text-ink-3">
              <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
              <span className="flex items-center gap-1.5"><span className="kbd">↵</span> open</span>
              <span className="ml-auto">Tip: Shift + right-click anywhere</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
