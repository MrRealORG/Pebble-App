import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { sfx } from "../lib/audio";
import { Icon } from "./Icon";

export function useSound() {
  const [on, setOn] = useState(sfx.enabled);
  useEffect(() => sfx.subscribe(setOn) as unknown as () => void, []);
  return [on, () => sfx.toggle()] as const;
}

/** Equalizer bars that dance while sound is on */
function Bars({ on }: { on: boolean }) {
  return (
    <span className="flex h-3.5 items-end gap-[2px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[2.5px] rounded-full bg-current"
          animate={on ? { height: [4, 13, 7, 11, 5] } : { height: 3 }}
          transition={on ? { duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" } : { duration: 0.2 }}
        />
      ))}
    </span>
  );
}

/** Floating sound switch that sits over the demo window */
export function SoundToggle({ floating = false }: { floating?: boolean }) {
  const [on, toggle] = useSound();
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    if (on || !floating) return;
    const t = setTimeout(() => setNudge(true), 5000);
    return () => clearTimeout(t);
  }, [on, floating]);

  return (
    <div className={floating ? "absolute bottom-3 left-3 z-40" : "relative"}>
      <button
        onClick={() => {
          toggle();
          setNudge(false);
        }}
        className="group flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line pl-3 pr-3.5 text-[12.5px] font-bold transition-all hover:-translate-y-0.5"
        style={{
          background: on ? "var(--green)" : "color-mix(in srgb, var(--surface) 85%, transparent)",
          color: on ? "var(--on-green)" : "var(--ink-2)",
          backdropFilter: "blur(10px)",
          boxShadow: on ? "0 6px 20px var(--green-ring)" : "var(--sh-card)",
        }}
        aria-pressed={on}
        title={on ? "Mute the tour" : "Play the tour with sound"}
      >
        {on ? <Bars on /> : <Icon name="volumeOff" size={15} />}
        {on ? "Sound on" : "Play with sound"}
      </button>
      <AnimatePresence>
        {nudge && !on && (
          <motion.span
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="pointer-events-none absolute -top-9 left-0 whitespace-nowrap rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold"
            style={{ background: "var(--ink)", color: "var(--bg)" }}
          >
            Best with sound 🎧
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
