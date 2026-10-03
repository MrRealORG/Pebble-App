import { useEffect } from "react";
import Lenis from "lenis";
import { AnimatePresence, motion } from "framer-motion";
import { StoreProvider, useStore } from "./lib/store";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";
import { ContextMenu } from "./components/ContextMenu";
import { CommandPalette } from "./components/CommandPalette";
import { Confetti, ScrollProgress, SecretEngine, Toasts } from "./components/Overlays";
import { CursorFollower, SecretHint, SoundOnboard, Splash } from "./components/Extras";
import { HeroDemo, Marquee, WordReveal } from "./sections/HomeA";
import { Bento, DownloadCTA, HorizontalModules, KeyboardSection, Principles, Stats, Testimonials, ThemesShowcase } from "./sections/HomeB";
import { Docs } from "./pages/Docs";
import { Changelog, Download } from "./pages/Download";
import { themeById } from "./lib/themes";
import WorkspaceRoot from "./workspace/WorkspaceRoot";
import { usePath } from "./workspace/navigation";

function Home() {
  return (
    <>
      <HeroDemo />
      <Marquee />
      <WordReveal />
      <Bento />
      <Stats />
      <HorizontalModules />
      <ThemesShowcase />
      <Principles />
      <KeyboardSection />
      <Testimonials />
      <DownloadCTA />
    </>
  );
}

function Shell() {
  const { route, lenis, setPaletteOpen, paletteOpen, cycleTheme, toast, theme } = useStore();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const l = new Lenis({
      duration: 1.25,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.4,
    });
    lenis.current = l;
    let raf = 0;
    const loop = (time: number) => {
      l.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      l.destroy();
      lenis.current = null;
    };
  }, [lenis]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, [contenteditable=true]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/" && !paletteOpen) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key.toLowerCase() === "t" && !paletteOpen) cycleTheme();
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [paletteOpen, setPaletteOpen, cycleTheme]);

  // announce theme changes from keyboard
  useEffect(() => {
    const t = themeById(theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bg);
  }, [theme]);

  useEffect(() => {
    const titles: Record<string, string> = {
      home: "PebbleX — One calm workspace",
      docs: "Docs · PebbleX",
      download: "Download · PebbleX",
      changelog: "Changelog · PebbleX",
    };
    document.title = titles[route];
  }, [route]);

  useEffect(() => {
    // Console easter egg
    console.log("%c PebbleX %c One calm workspace. Psst: try ↑↑↓↓←→←→BA ", "background:#7CD56E;color:#0E2B0A;font-weight:800;border-radius:6px;padding:4px 8px", "color:#8B8D93");
    void toast;
  }, [toast]);

  return (
    <div className="relative min-h-screen">
      <ScrollProgress />
      <Nav />
      <AnimatePresence mode="wait">
        <motion.main
          key={route}
          initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {route === "home" && <Home />}
          {route === "docs" && <Docs />}
          {route === "download" && <Download />}
          {route === "changelog" && <Changelog />}
        </motion.main>
      </AnimatePresence>
      <Footer />
      <ContextMenu />
      <CommandPalette />
      <Toasts />
      <Confetti />
      <SecretEngine />
      <SecretHint />
      <SoundOnboard />
      <CursorFollower />
      <Splash />
    </div>
  );
}

function ApplicationRouter() {
  const path = usePath();
  const workspace = /^\/(app|admin|login|signup)(\/|\?|$)/.test(path);
  return workspace ? <><WorkspaceRoot /><Toasts /><Confetti /></> : <Shell />;
}

export default function App() {
  return (
    <StoreProvider>
      <ApplicationRouter />
    </StoreProvider>
  );
}
