import { useState } from "react";
import { motion } from "framer-motion";
import { BrandMark, Icon } from "../components/Icon";
import { useStore } from "../lib/store";
import { detectOS, Reveal } from "../sections/HomeB";

const ease = [0.16, 1, 0.3, 1] as const;

function DlButton({ label, file, primary = false }: { label: string; file: string; primary?: boolean }) {
  const { toast, confetti } = useStore();
  const [p, setP] = useState<number | null>(null);
  const start = () => {
    if (p !== null) return;
    setP(0);
    let v = 0;
    const iv = setInterval(() => {
      v += 4 + Math.random() * 9;
      if (v >= 100) {
        clearInterval(iv);
        setP(100);
        confetti();
        toast({ title: "Download ready", msg: `${file} — welcome to calm.` });
        setTimeout(() => setP(null), 2200);
      } else setP(v);
    }, 90);
  };
  return (
    <button onClick={start} className={`btn relative overflow-hidden ${primary ? "btn-green btn-lg" : "btn-soft"} w-full`}>
      {p !== null && <span className="absolute inset-y-0 left-0 bg-black/10" style={{ width: `${p}%`, transition: "width .09s linear" }} />}
      <span className="relative flex items-center gap-2">
        {p === null ? (
          <>
            <Icon name="download" size={primary ? 17 : 15} /> {label}
          </>
        ) : p >= 100 ? (
          <>
            <Icon name="check" size={16} /> Downloaded
          </>
        ) : (
          <>
            <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent" style={{ animation: "nx-spin .7s linear infinite" }} />
            <span className="mono-num">{Math.round(p)}%</span>
          </>
        )}
      </span>
    </button>
  );
}

export function Download() {
  const os = detectOS();
  const { go } = useStore();
  const plats = [
    { id: "mac", name: "macOS", icon: "apple", req: "macOS 12 Monterey or later", files: [["Universal (.dmg)", "Pebble-0.1.0-universal.dmg"], ["Apple Silicon (.zip)", "Pebble-0.1.0-arm64.zip"]] },
    { id: "win", name: "Windows", icon: "windows", req: "Windows 10 (1903) or later", files: [["Installer (.exe)", "Pebble-Setup-0.1.0.exe"], ["Portable (.zip)", "Pebble-0.1.0-win.zip"]] },
    { id: "linux", name: "Linux", icon: "linux", req: "glibc 2.31+, X11 or Wayland", files: [["AppImage", "Pebble-0.1.0.AppImage"], ["Debian (.deb)", "pebblex_0.1.0_amd64.deb"]] },
  ] as const;
  const mine = plats.find((p) => p.id === os)!;

  return (
    <div className="mx-auto max-w-[1180px] px-5 pt-32">
      <div className="relative text-center">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/3 rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, var(--green-soft), transparent)" }} />
        <motion.div initial={{ scale: 0.5, opacity: 0, rotate: -15 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 220, damping: 15 }} className="relative mx-auto w-fit">
          <div style={{ animation: "nx-float 5s ease-in-out infinite" }}>
            <BrandMark size={96} radius={30} />
          </div>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 30, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 1, ease, delay: 0.1 }} className="relative mt-8 text-[clamp(44px,7vw,88px)] font-extrabold leading-[0.95] tracking-[-0.055em]">
          Download PebbleX
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.25 }} className="relative mx-auto mt-4 max-w-[520px] text-[17px] text-ink-2">
          Version 0.1.0 · Free for personal use · Signed builds for every platform.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.4 }} className="relative mx-auto mt-8 max-w-[360px]">
          <DlButton primary label={`Download for ${mine.name}`} file={mine.files[0][1]} />
          <div className="mt-3 text-[12.5px] text-ink-3">We detected {mine.name}. {mine.req}.</div>
        </motion.div>
      </div>

      <div className="mt-20 grid gap-4 md:grid-cols-3">
        {plats.map((p, i) => (
          <Reveal key={p.id} delay={i * 0.08}>
            <div className="card relative h-full overflow-hidden p-6 transition-all hover:-translate-y-1 hover:shadow-[var(--sh-pop)]" style={{ boxShadow: p.id === os ? "0 0 0 2px var(--green), var(--sh-card)" : undefined }}>
              {p.id === os && <span className="pill absolute right-4 top-4 bg-green-soft text-green-deep"><span className="dot" /> Your system</span>}
              <div className="grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-tile-ink">
                <Icon name={p.icon} size={22} />
              </div>
              <div className="mt-4 text-[20px] font-extrabold tracking-[-0.02em]">{p.name}</div>
              <div className="text-[13px] text-ink-3">{p.req}</div>
              <div className="mt-5 flex flex-col gap-2">
                {p.files.map(([l, f]) => (
                  <DlButton key={f} label={l} file={f} />
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-16 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <Reveal>
          <div className="card h-full p-7">
            <div className="overline">What’s inside</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ["chat", "Chat"], ["note", "Notes"], ["tasks", "Kanban"], ["spark", "Pel AI"], ["clock", "Timeless"], ["bell", "Reminders"], ["bookmark", "Prompt Saver"], ["image", "Media"], ["game", "Arcade"], ["layers", "Widget"],
              ].map(([ic, l]) => (
                <div key={l} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-green-soft text-green-deep"><Icon name={ic} size={14} /></span>
                  <span className="text-[13.5px] font-semibold">{l}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="card h-full p-7">
            <div className="overline">Verify your download</div>
            <p className="mt-3 text-[14px] text-ink-2">Compare the SHA-256 checksum before installing.</p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface-3 p-4 font-mono text-[11.5px] leading-[1.7] text-ink-2" data-native-ctx>
{`shasum -a 256 Pebble-0.1.0-universal.dmg
# 7cd56e3e9e33f6f5f31e4b16eaf8e6…`}
            </pre>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => go("docs", "installation")} className="btn btn-outline"><Icon name="book" size={14} /> Install guide</button>
              <button onClick={() => go("changelog")} className="btn btn-ghost">Release notes <Icon name="arrow" size={14} /></button>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

export function Changelog() {
  const releases = [
    {
      v: "0.1.0", date: "Today", tag: "Latest", items: [
        ["New", "green", "13 themes with live swatch previews in Settings"],
        ["New", "green", "Pel AI with streaming replies and note context"],
        ["New", "green", "Timeless — local, honest time tracking"],
        ["New", "green", "Desktop widget with mini mode"],
        ["Improved", "blue", "Command palette search across every module"],
        ["Fixed", "orange", "--orange-deep token now defined for all themes"],
      ],
    },
    {
      v: "0.0.9", date: "Last month", tag: "Beta", items: [
        ["New", "green", "Kanban drag & drop with dashed green drop targets"],
        ["New", "green", "Markdown callouts: tip, info, warning, danger, note"],
        ["Improved", "blue", "Boot splash paints in under 80ms"],
      ],
    },
    {
      v: "0.0.5", date: "Earlier", tag: "Alpha", items: [
        ["New", "green", "Chat with server rail and grouped messages"],
        ["New", "green", "Notes with split / edit / preview"],
        ["New", "green", "Arcade: 2048, Simon, Aim, Scramble"],
      ],
    },
  ];
  return (
    <div className="mx-auto max-w-[860px] px-5 pt-32">
      <Reveal>
        <div className="overline">Changelog</div>
        <h1 className="mt-3 text-[clamp(40px,6vw,72px)] font-extrabold leading-[0.95] tracking-[-0.05em]">What’s new, quietly.</h1>
        <p className="mt-4 text-[17px] text-ink-2">Every release, every fix. No exclamation marks.</p>
      </Reveal>
      <div className="relative mt-14">
        <div className="absolute bottom-0 left-[11px] top-2 w-px bg-line-strong" />
        {releases.map((r, i) => (
          <Reveal key={r.v} delay={i * 0.05}>
            <div className="relative pb-12 pl-12">
              <span className="absolute left-0 top-1.5 grid h-[23px] w-[23px] place-items-center rounded-full border-[3px] border-bg bg-green" style={{ boxShadow: i === 0 ? "0 0 0 6px var(--green-ring)" : undefined }} />
              <div className="flex flex-wrap items-center gap-3">
                <span className="mono-num text-[26px] font-extrabold tracking-[-0.03em]">v{r.v}</span>
                <span className={`pill ${i === 0 ? "bg-green text-on-green" : "bg-surface-3 text-ink-2"}`}>{r.tag}</span>
                <span className="text-[13px] text-ink-3">{r.date}</span>
              </div>
              <div className="card mt-4 divide-y divide-[var(--line)]">
                {r.items.map(([k, c, t], j) => (
                  <div key={j} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="pill w-[78px] justify-center" style={{ background: `var(--${c}-soft)`, color: c === "green" ? "var(--green-deep)" : `var(--${c})` }}>{k}</span>
                    <span className="text-[14px]">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
