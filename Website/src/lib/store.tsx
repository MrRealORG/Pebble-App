import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type Lenis from "lenis";
import { THEMES } from "./themes";
import { TOTAL_SECRETS } from "./secrets";
import { sfx } from "./audio";

export type Toast = { id: number; title: string; msg?: string; kind?: "ok" | "info" | "err" | "secret" };
export type Route = "home" | "docs" | "download" | "changelog";

type Ctx = {
  theme: string;
  setTheme: (id: string, x?: number, y?: number) => void;
  cycleTheme: () => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
  route: Route;
  sub: string;
  go: (r: Route, sub?: string) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  confetti: () => void;
  confettiKey: number;
  lenis: React.MutableRefObject<Lenis | null>;
  scrollTo: (target: string | number) => void;
  secrets: Set<string>;
  unlock: (s: string) => void;
  rain: boolean;
  setRain: (v: boolean) => void;
};

const C = createContext<Ctx | null>(null);

function parseHash(): { route: Route; sub: string } {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [r, s] = h.split("/");
  const route = (["docs", "download", "changelog"].includes(r) ? r : "home") as Route;
  return { route, sub: s ?? "" };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<string>(() => localStorage.getItem("pebblex-theme") || "elera");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [{ route, sub }, setRoute] = useState(parseHash);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [rain, setRain] = useState(false);
  const [secrets, setSecrets] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem("pebblex-secrets") || "[]")));
  const lenis = useRef<Lenis | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pebblex-theme", theme);
  }, [theme]);

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++idRef.current;
      setToasts((arr) => [...arr.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), 3600);
    },
    [dismiss]
  );

  const setTheme = useCallback((id: string, x?: number, y?: number) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (x === undefined || y === undefined || !doc.startViewTransition || reduce) {
      setThemeState(id);
      return;
    }
    sfx.pop();
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = doc.startViewTransition(() => {
      document.documentElement.setAttribute("data-theme", id);
      setThemeState(id);
    });
    t.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 750, easing: "cubic-bezier(.16,1,.3,1)", pseudoElement: "::view-transition-new(root)" }
        );
      })
      .catch(() => {});
  }, []);
  const cycleTheme = useCallback(() => {
    setThemeState((cur) => {
      const i = THEMES.findIndex((t) => t.id === cur);
      return THEMES[(i + 1) % THEMES.length].id;
    });
  }, []);

  const scrollTo = useCallback((target: string | number) => {
    if (lenis.current) lenis.current.scrollTo(target as never, { offset: typeof target === "string" ? -90 : 0, duration: 1.4 });
    else if (typeof target === "number") window.scrollTo({ top: target, behavior: "smooth" });
    else document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const go = useCallback(
    (r: Route, s?: string) => {
      const hash = r === "home" ? "#/" : `#/${r}${s ? "/" + s : ""}`;
      if (window.location.hash !== hash) window.location.hash = hash;
      if (r !== route) {
        lenis.current?.scrollTo(0, { immediate: true });
        window.scrollTo(0, 0);
      }
    },
    [route]
  );

  const confetti = useCallback(() => setConfettiKey((k) => k + 1), []);

  const unlock = useCallback(
    (s: string) => {
      setSecrets((prev) => {
        if (prev.has(s)) return prev;
        const n = new Set(prev);
        n.add(s);
        localStorage.setItem("pebblex-secrets", JSON.stringify([...n]));
        sfx.secret();
        const done = n.size === TOTAL_SECRETS;
        setTimeout(() => toast({ kind: "secret", title: done ? "All secrets found 🏆" : `Secret found · ${n.size}/${TOTAL_SECRETS}`, msg: done ? "You have officially out-calmed PebbleX." : s }), 0);
        return n;
      });
    },
    [toast]
  );

  const value = useMemo(
    () => ({ theme, setTheme, cycleTheme, toasts, toast, dismiss, route, sub, go, paletteOpen, setPaletteOpen, confetti, confettiKey, lenis, scrollTo, secrets, unlock, rain, setRain }),
    [theme, setTheme, cycleTheme, toasts, toast, dismiss, route, sub, go, paletteOpen, confetti, confettiKey, scrollTo, secrets, unlock, rain]
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useStore() {
  const c = useContext(C);
  if (!c) throw new Error("no store");
  return c;
}
