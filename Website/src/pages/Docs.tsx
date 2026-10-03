import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DOC_SECTIONS } from "../lib/docs";
import { useStore } from "../lib/store";
import { THEMES } from "../lib/themes";
import { Icon } from "../components/Icon";
import { AppDemo } from "../components/AppDemo";

/* ---------- primitives ---------- */
function H2({ id, children, icon }: { id: string; children: ReactNode; icon: string }) {
  const { toast } = useStore();
  const n = String(DOC_SECTIONS.findIndex((d) => d.id === id) + 1).padStart(2, "0");
  return (
    <div className="group mb-4">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="mono-num text-[11px] font-extrabold tracking-[.16em] text-green-deep">{n}</span>
        <span className="h-px w-6 bg-line-strong" />
        <span className="overline">{DOC_SECTIONS.find((d) => d.id === id)?.group}</span>
      </div>
      <h2 className="flex items-center gap-3 text-[27px] font-extrabold leading-[1.1] tracking-[-0.035em]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ background: "var(--green-soft)", color: "var(--green-deep)" }}>
          <Icon name={icon} size={17} />
        </span>
        {children}
        <button
          onClick={() => {
            navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/docs/${id}`);
            toast({ title: "Section link copied" });
          }}
          className="cursor-pointer text-ink-4 opacity-0 transition-opacity hover:text-green-deep group-hover:opacity-100"
          aria-label="Copy link"
        >
          <Icon name="link" size={16} />
        </button>
      </h2>
    </div>
  );
}
const H3 = ({ children }: { children: ReactNode }) => <h3 className="mb-2 mt-7 text-[17px] font-bold tracking-[-0.01em]">{children}</h3>;
const P = ({ children }: { children: ReactNode }) => <p className="my-3 text-[15px] leading-[1.75] text-ink-2">{children}</p>;
const C = ({ children }: { children: ReactNode }) => <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-ink">{children}</code>;

function Callout({ kind = "tip", title, children }: { kind?: "tip" | "info" | "warning" | "danger" | "note"; title: string; children: ReactNode }) {
  const m = {
    tip: ["var(--green-soft)", "var(--green-deep)", "spark"],
    info: ["var(--blue-soft)", "var(--blue)", "globe"],
    warning: ["var(--yellow-soft)", "var(--yellow)", "zap"],
    danger: ["var(--red-soft)", "var(--red)", "shield"],
    note: ["var(--surface-3)", "var(--ink-2)", "note"],
  }[kind];
  return (
    <div className="my-5 flex gap-3 rounded-[14px] border border-line p-4" style={{ background: m[0] }}>
      <span style={{ color: m[1] }} className="mt-0.5">
        <Icon name={m[2]} size={17} />
      </span>
      <div>
        <div className="text-[14px] font-bold" style={{ color: m[1] }}>{title}</div>
        <div className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{children}</div>
      </div>
    </div>
  );
}

function Code({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-line bg-surface-3" data-native-ctx>
      <div className="flex items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-3" style={{ background: "rgba(0,0,0,.06)" }}>
        {lang}
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 normal-case tracking-normal transition-colors hover:bg-green hover:text-on-green"
        >
          <Icon name={copied ? "check" : "copy"} size={12} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.6] text-ink">{code}</pre>
    </div>
  );
}

function Steps({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <ol className="my-5 space-y-0">
      {items.map(([t, d], i) => (
        <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
          {i < items.length - 1 && <span className="absolute left-[13px] top-8 bottom-0 w-px bg-line-strong" />}
          <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-green text-[12.5px] font-extrabold text-on-green">{i + 1}</span>
          <div className="pt-0.5">
            <div className="text-[15px] font-bold">{t}</div>
            <div className="mt-1 text-[14px] leading-relaxed text-ink-2">{d}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-[14px] border border-line">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-surface-2">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 text-[12px] font-semibold text-ink-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line transition-colors hover:bg-surface-2">
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2.5 text-[13.5px]">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Swatch({ c }: { c: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[12.5px]">
      <span className="h-4 w-4 rounded-md" style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.1)" }} />
      {c}
    </span>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-center justify-between py-4 text-left text-[15px] font-semibold">
        {q}
        <motion.span animate={{ rotate: open ? 45 : 0 }} className="text-ink-3">
          <Icon name="plus" size={18} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
            <div className="pb-4 text-[14.5px] leading-relaxed text-ink-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={`doc-${id}`} data-doc={id} className="scroll-mt-28 border-b border-line py-12 first:pt-2 last:border-0">
      {children}
    </section>
  );
}

function Feedback() {
  const { toast, confetti } = useStore();
  const [voted, setVoted] = useState<null | "yes" | "no">(null);
  return (
    <div className="my-10 flex flex-wrap items-center gap-4 rounded-[18px] border border-line bg-surface p-5" style={{ boxShadow: "var(--sh-card)" }}>
      <div className="flex-1">
        <div className="text-[15px] font-bold tracking-[-0.015em]">Was this page helpful?</div>
        <div className="text-[13px] text-ink-3">One click. No survey, we promise.</div>
      </div>
      {voted ? (
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-green-deep">
          <Icon name="check" size={16} /> Thanks — noted.
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setVoted("yes");
              confetti();
              toast({ title: "Thank you", msg: "That helps us write less, better." });
            }}
            className="btn btn-soft"
          >
            <Icon name="heart" size={14} /> Yes
          </button>
          <button onClick={() => setVoted("no")} className="btn btn-ghost">
            Not really
          </button>
        </div>
      )}
    </div>
  );
}

function OSTabs() {
  const [os, setOs] = useState<"mac" | "win" | "linux">(() => {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("mac") ? "mac" : ua.includes("win") ? "win" : "linux";
  });
  const data = {
    mac: { label: "macOS", icon: "apple", code: "# Homebrew\nbrew install --cask pebblex\n\n# or download Pebble-0.1.0-universal.dmg\n# and drag Pebble into /Applications", lang: "bash" },
    win: { label: "Windows", icon: "windows", code: "# winget\nwinget install NexaDesk.PebbleX\n\n# or run Pebble-Setup-0.1.0.exe", lang: "powershell" },
    linux: { label: "Linux", icon: "linux", code: "# AppImage\nchmod +x Pebble-0.1.0.AppImage\n./Pebble-0.1.0.AppImage\n\n# Debian / Ubuntu\nsudo apt install ./pebblex_0.1.0_amd64.deb", lang: "bash" },
  };
  return (
    <div className="my-5">
      <div className="inline-flex rounded-full bg-surface-3 p-[3px]">
        {(Object.keys(data) as (keyof typeof data)[]).map((k) => (
          <button key={k} onClick={() => setOs(k)} className="relative flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold">
            {os === k && <motion.span layoutId="os-seg" className="absolute inset-0 rounded-full bg-surface" style={{ boxShadow: "0 1px 4px rgba(0,0,0,.1)" }} />}
            <span className="relative flex items-center gap-1.5">
              <Icon name={data[k].icon} size={13} /> {data[k].label}
            </span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={os} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          <Code lang={data[os].lang} code={data[os].code} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------- page ---------- */
export function Docs() {
  const { sub, go, scrollTo, setTheme, theme } = useStore();
  const [active, setActive] = useState(sub || "introduction");
  const [q, setQ] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    if (sub) setTimeout(() => scrollTo(`#doc-${sub}`), 80);
  }, [sub, scrollTo]);

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-doc]"));
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive((vis[0].target as HTMLElement).dataset.doc!);
      },
      { rootMargin: "-20% 0px -65% 0px" }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  const groups = useMemo(() => {
    const f = DOC_SECTIONS.filter((d) => d.title.toLowerCase().includes(q.toLowerCase()) || d.group.toLowerCase().includes(q.toLowerCase()));
    const g: Record<string, typeof DOC_SECTIONS> = {};
    f.forEach((d) => (g[d.group] ||= []).push(d));
    return g;
  }, [q]);

  const idx = DOC_SECTIONS.findIndex((d) => d.id === active);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const on = () => {
      const el = document.querySelector("article");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - innerHeight * 0.4;
      const done = -r.top + innerHeight * 0.35;
      setProgress(Math.max(0, Math.min(100, (done / total) * 100)));
    };
    on();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => {
      removeEventListener("scroll", on);
      removeEventListener("resize", on);
    };
  }, []);

  const jump = (id: string) => {
    setMobileNav(false);
    go("docs", id);
    scrollTo(`#doc-${id}`);
  };

  const Sidebar = (
    <div className="flex flex-col gap-4">
      <div className="flex h-10 items-center gap-2 rounded-xl border-[1.5px] border-line-strong bg-surface px-3 focus-within:border-green focus-within:shadow-[0_0_0_3px_var(--green-ring)]">
        <Icon name="search" size={15} className="text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter docs…" className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3" />
      </div>
      {Object.entries(groups).map(([g, items]) => (
        <div key={g}>
          <div className="overline mb-1.5 px-3">{g}</div>
          {items.map((d) => {
            const on = active === d.id;
            return (
              <button
                key={d.id}
                onClick={() => jump(d.id)}
                className="relative flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[11px] px-3 text-left text-[13.5px] font-semibold transition-colors"
                style={{ color: on ? "var(--on-green)" : "var(--ink-2)" }}
              >
                {on && <motion.span layoutId="doc-active" className="absolute inset-0 rounded-[11px] bg-green" style={{ boxShadow: "0 4px 14px var(--green-ring)" }} transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <span className="relative flex items-center gap-2.5">
                  <Icon name={d.icon} size={15} />
                  {d.title}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1280px] px-5 pt-28">
      {/* hero */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="mb-12 overflow-hidden rounded-[28px] border border-line bg-surface" style={{ boxShadow: "var(--sh-card)" }}>
        <div className="grid gap-8 p-8 md:grid-cols-[1.15fr_0.85fr] md:p-11">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill bg-green-soft text-green-deep"><span className="dot" /> v0.1.0</span>
              <span className="pill bg-surface-2 text-ink-2">{DOC_SECTIONS.length} sections</span>
              <span className="pill bg-surface-2 text-ink-2">~10 min read</span>
            </div>
            <h1 className="mt-5 text-[clamp(32px,4.4vw,52px)] font-extrabold leading-[1] tracking-[-0.05em]">
              The PebbleX handbook.
            </h1>
            <p className="mt-4 max-w-[460px] text-[16.5px] leading-relaxed text-ink-2">
              Install it, learn every module, make it yours. Watch the animated tour, skim the steps, copy the commands.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {[
                ["Install now", "installation", "download", "btn-green"],
                ["Watch the tour", "quick-tour", "play", "btn-dark"],
                ["Shortcuts", "shortcuts", "terminal", "btn-outline"],
                ["Themes", "themes", "palette", "btn-outline"],
              ].map(([l, id, ic, cls]) => (
                <button key={id} onClick={() => jump(id)} className={`btn ${cls}`}>
                  <Icon name={ic} size={15} /> {l}
                </button>
              ))}
            </div>
          </div>

          {/* chapter list */}
          <div className="rounded-[20px] p-5" style={{ background: "var(--surface-2)" }}>
            <div className="overline">What’s inside</div>
            <div className="mt-3 flex flex-col gap-1">
              {[
                ["Getting started", "5 sections", "download"],
                ["Workspace", "3 sections", "layers"],
                ["Intelligence", "4 sections", "spark"],
                ["Explore", "2 sections", "globe"],
                ["Personalize", "3 sections", "palette"],
                ["Reference", "3 sections", "book"],
              ].map(([g, n, ic]) => (
                <div key={g} className="flex items-center gap-3 rounded-[11px] bg-surface px-3 py-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-green-soft text-green-deep">
                    <Icon name={ic} size={14} />
                  </span>
                  <span className="text-[13.5px] font-semibold">{g}</span>
                  <span className="ml-auto text-[11.5px] text-ink-3">{n}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-[11px] px-3 py-2.5 text-[12px] text-ink-2" style={{ background: "var(--green-soft)" }}>
              <Icon name="spark" size={14} className="text-green-deep" />
              Every page of this site runs on the app’s own tokens.
            </div>
          </div>
        </div>
      </motion.div>

      <button onClick={() => setMobileNav((v) => !v)} className="btn btn-outline mb-4 lg:hidden">
        <Icon name="menu" size={15} /> Browse sections
      </button>
      <AnimatePresence>
        {mobileNav && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-6 overflow-hidden lg:hidden">
            <div className="card p-3">{Sidebar}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_200px]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto pb-10 pr-1" data-lenis-prevent>
            {Sidebar}
          </div>
        </aside>

        <article className="min-w-0 max-w-[760px]">
          <div className="sticky top-[76px] z-30 -mx-1 mb-2 h-[3px] overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-green transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <Section id="introduction">
            <H2 id="introduction" icon="book">Introduction</H2>
            <P>PebbleX is a desktop workspace that folds chat, notes, tasks, an AI assistant, time tracking, reminders and more into <b className="text-ink">one calm window</b>. It runs locally, ships with 13 themes and is designed to feel like a tool — not a feed.</P>
            <div className="my-6 grid gap-3 sm:grid-cols-3">
              {[
                ["Local-first", "Your data lives on your machine.", "shield"],
                ["Keyboard-first", "⌘K reaches everything.", "terminal"],
                ["Theme-safe", "Layout never changes.", "palette"],
              ].map(([t, d, i]) => (
                <div key={t} className="rounded-2xl border border-line bg-surface p-4" style={{ boxShadow: "var(--sh-card)" }}>
                  <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-green-soft text-green-deep"><Icon name={i} size={15} /></span>
                  <div className="mt-3 text-[14.5px] font-bold">{t}</div>
                  <div className="text-[13px] text-ink-3">{d}</div>
                </div>
              ))}
            </div>
            <Callout kind="tip" title="New here?">Jump straight to the <button className="cursor-pointer font-semibold text-green-deep underline" onClick={() => jump("quick-tour")}>Quick tour</button> — it’s a 30-second animated walkthrough of the real interface.</Callout>
          </Section>

          <Section id="installation">
            <H2 id="installation" icon="download">Installation</H2>
            <P>PebbleX runs on macOS 12+, Windows 10+ and most modern Linux distributions. Pick your platform:</P>
            <OSTabs />
            <Table
              head={["Platform", "Package", "Size", "Arch"]}
              rows={[
                [<b>macOS</b>, <C>Pebble-0.1.0-universal.dmg</C>, "92 MB", "Apple Silicon + Intel"],
                [<b>Windows</b>, <C>Pebble-Setup-0.1.0.exe</C>, "84 MB", "x64 · arm64"],
                [<b>Linux</b>, <C>Pebble-0.1.0.AppImage</C>, "96 MB", "x64"],
              ]}
            />
            <Callout kind="warning" title="Gatekeeper on macOS">If macOS says the app can’t be opened, right-click Pebble in Applications and choose <b>Open</b> once.</Callout>
          </Section>

          <Section id="quick-tour">
            <H2 id="quick-tour" icon="play">Quick tour</H2>
            <P>This is a live motion recording of PebbleX — rendered in real time with the same tokens as the app. Watch the cursor move through the dashboard, create and drag a task, write a markdown note, ask Pel AI, and switch themes.</P>
            <div className="my-6 rounded-[24px] border border-line bg-surface p-3 sm:p-4" style={{ boxShadow: "var(--sh-pop)" }}>
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className="pill bg-red-soft text-red"><span className="dot" style={{ animation: "nx-pulse 1.6s infinite" }} /> LIVE</span>
                <span className="text-[13px] font-semibold">PebbleX · Product tour</span>
                <span className="ml-auto text-[12px] text-ink-3">~31s loop</span>
              </div>
              <AppDemo controls />
            </div>
            <Table
              head={["Chapter", "What happens"]}
              rows={[
                [<b>Dashboard</b>, "Stat strip and focus heatmap"],
                [<b>Tasks</b>, "New task → typed → dragged to Done"],
                [<b>Notes</b>, "Markdown typed in split view with live preview"],
                [<b>Pel AI</b>, "Prompt sent, reply streams in"],
                [<b>Themes</b>, "Midnight → Sunset → Neon, layout untouched"],
              ]}
            />
          </Section>

          <Section id="first-launch">
            <H2 id="first-launch" icon="zap">First launch</H2>
            <Steps
              items={[
                ["Meet the splash", "A 68px pebble mark pulses green while PebbleX boots. It fades out in .35s."],
                ["Onboarding", "Pick a name, an avatar color and a starting theme. You can change everything later."],
                ["Choose your modules", "Turn off what you don’t need — the sidebar only shows what you use."],
                [<>Press <C>⌘K</C></>, "The command palette is the fastest way around. Try typing “new note”."],
              ]}
            />
          </Section>

          <Section id="web-workspace">
            <H2 id="web-workspace" icon="globe">Web workspace & sync</H2>
            <P>Your desktop workspace now has a home at <C>/app</C>. Use the same Firebase account for tasks, notes, saved prompts, reminders, and AI conversations. Desktop usage is shown as a read-only summary. Games and Timeless stay on desktop.</P>
            <Callout kind="info" title="Try it without an account">Until cloud credentials are configured, the workspace is a local preview with sample desktop data. Changes stay in your browser and are never imported into a real account.</Callout>
            <div className="my-5 flex flex-wrap gap-3">
              <a href="/app" className="btn btn-green">Open workspace <Icon name="arrow" size={14} /></a>
              <a href="/login" className="btn btn-outline">Sign in</a>
              <a href="/setup-guide.md" target="_blank" rel="noreferrer" className="btn btn-soft">Cloud setup guide <Icon name="book" size={14} /></a>
            </div>
            <H3>Connect your existing app</H3>
            <P>Firebase handles sign-in; Supabase stores and streams the workspace. The integration guide covers the database migration, server functions, administrator claims, and the desktop sync adapter. The desktop source must connect that adapter to its local store before changes can travel between devices.</P>
            <Callout kind="tip" title="Admin access is server-controlled">The <C>/admin</C> panel requires a Firebase admin claim. Administrators can view account metadata, record counts, and activity, but cannot read other users' private notes or AI message bodies.</Callout>
          </Section>

          <Section id="chat">
            <H2 id="chat" icon="chat">Chat</H2>
            <P>A 70px server rail, a 250px channel list and a chat body with rounded top-left corner. Consecutive messages from the same author are grouped; hover to reveal timestamps.</P>
            <Table head={["Action", "How"]} rows={[["Mention", <C>@name</C>], ["Code block", <C>```lang</C>], ["Send", <span className="kbd">↵</span>], ["New line", <><span className="kbd">⇧</span> <span className="kbd">↵</span></>]]} />
            <Callout kind="info" title="Mentions">Mentions render as green-deep text on green-soft — readable on all 13 themes.</Callout>
          </Section>

          <Section id="notes">
            <H2 id="notes" icon="note">Notes</H2>
            <P>Two columns: a 280px list and an editor with <b className="text-ink">edit</b>, <b className="text-ink">split</b> and <b className="text-ink">preview</b> modes. Notes support headings, quotes, callouts, tables, highlights and fenced code.</P>
            <Code lang="markdown" code={"# Weekly review\n\n> [!tip] Keep it short\n> Three wins, one lesson.\n\n- Shipped **13 themes**\n- ==Focus up 22%==\n\n```ts\nconst calm = true;\n```"} />
            <Callout kind="note" title="Trash">Deleted notes stay in Trash for 30 days, shown with a soft red banner.</Callout>
          </Section>

          <Section id="tasks">
            <H2 id="tasks" icon="tasks">Tasks & Kanban</H2>
            <P>Columns are 280px wells. Drag a card and the target column tints green with a dashed outline. Dragging cards tilt 1.5° so you always know what’s in your hand.</P>
            <Steps items={[["Create", <>Click <b>+ New</b> or press <C>⌘⇧N</C>.</>], ["Organize", "Drag between columns, or use ⌥ + ←/→."], ["Finish", "Drop on Done — the counter updates instantly."]]} />
          </Section>

          <Section id="pel-ai">
            <H2 id="pel-ai" icon="spark">Pel AI</H2>
            <P>Pel is a quiet assistant. AI bubbles sit on surface-2; yours are green. Replies stream in with a blinking 7×14 green caret.</P>
            <Callout kind="tip" title="Context from notes">Type <C>/note</C> in the composer to attach a note as context.</Callout>
          </Section>

          <Section id="timeless">
            <H2 id="timeless" icon="clock">Timeless</H2>
            <P>Local, honest time tracking. Apps are categorized as <span className="font-semibold text-green-deep">Productive</span>, <span className="font-semibold text-yellow">Neutral</span> or <span className="font-semibold text-red">Distraction</span>, summarized in a 112px donut and a heat strip.</P>
            <Callout kind="info" title="Privacy">Timeless never uploads window titles. Everything is computed on-device.</Callout>
          </Section>

          <Section id="reminders">
            <H2 id="reminders" icon="bell">Reminders</H2>
            <P>Each reminder carries its own color as a 4px left edge. Overdue reminders turn red — once — and wait patiently.</P>
          </Section>

          <Section id="prompts">
            <H2 id="prompts" icon="bookmark">Prompt Saver</H2>
            <P>Save, tag and favorite your best prompts. Favorites get an orange star and float to the top. Click any card to copy.</P>
          </Section>

          <Section id="media">
            <H2 id="media" icon="image">Media</H2>
            <P>Annotate screenshots on a canvas stage. The marker tool draws at 0.45 alpha and 3× width. Ink palette has 9 colors.</P>
            <div className="my-4 flex flex-wrap gap-2">
              {["#E25C4A", "#E8853D", "#E9C46A", "#7CD56E", "#5EB8FF", "#8B5CF6", "#E05C9C", "#121212", "#FFFFFF"].map((c) => (
                <span key={c} className="h-8 w-8 rounded-full" style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.12)" }} title={c} />
              ))}
            </div>
          </Section>

          <Section id="arcade">
            <H2 id="arcade" icon="game">Arcade</H2>
            <P>Short breaks, built in: <b className="text-ink">2048</b>, <b className="text-ink">Simon</b>, <b className="text-ink">Aim</b> and <b className="text-ink">Scramble</b>. Scores use tabular numerals so nothing jiggles.</P>
          </Section>

          <Section id="themes">
            <H2 id="themes" icon="palette">Themes</H2>
            <P>13 themes swap token values only — never layout, radius or spacing. Click a row to try it on this site.</P>
            <Table
              head={["Theme", "Mode", "--bg", "Accent", ""]}
              rows={THEMES.map((t) => [
                <b>{t.name}</b>,
                t.dark ? "Dark" : "Light",
                <Swatch c={t.bg} />,
                <Swatch c={t.pill} />,
                <button onClick={(e) => setTheme(t.id, e.clientX, e.clientY)} className={`btn h-7 px-3 text-[12px] ${theme === t.id ? "btn-green" : "btn-soft"}`}>{theme === t.id ? "Active" : "Try"}</button>,
              ])}
            />
            <H3>Add your own</H3>
            <Code lang="css" code={'[data-theme="matcha"] {\n  --bg: #F2F5EE;\n  --surface: #FFFFFF;\n  --green: #6FA85A;\n  --green-soft: #E6F0DF;\n  /* tokens only — no layout overrides */\n}'} />
          </Section>

          <Section id="widget">
            <H2 id="widget" icon="layers">Desktop widget</H2>
            <P>A transparent always-on-top window with a 32px clock, today’s tasks and your focus timer. Double-click to switch to <b className="text-ink">mini mode</b> (18px clock).</P>
          </Section>

          <Section id="shortcuts">
            <H2 id="shortcuts" icon="terminal">Keyboard shortcuts</H2>
            <Table
              head={["Action", "macOS", "Windows / Linux"]}
              rows={[
                ["Command palette", <><span className="kbd">⌘</span> <span className="kbd">K</span></>, <><span className="kbd">Ctrl</span> <span className="kbd">K</span></>],
                ["Cycle theme", <span className="kbd">T</span>, <span className="kbd">T</span>],
                ["New note", <><span className="kbd">⌘</span> <span className="kbd">N</span></>, <><span className="kbd">Ctrl</span> <span className="kbd">N</span></>],
                ["New task", <><span className="kbd">⌘</span> <span className="kbd">⇧</span> <span className="kbd">N</span></>, <><span className="kbd">Ctrl</span> <span className="kbd">⇧</span> <span className="kbd">N</span></>],
                ["Toggle sidebar", <><span className="kbd">⌘</span> <span className="kbd">\</span></>, <><span className="kbd">Ctrl</span> <span className="kbd">\</span></>],
                ["Focus mode", <><span className="kbd">⌘</span> <span className="kbd">⇧</span> <span className="kbd">F</span></>, <><span className="kbd">Ctrl</span> <span className="kbd">⇧</span> <span className="kbd">F</span></>],
                ["Toggle widget", <><span className="kbd">⌥</span> <span className="kbd">Space</span></>, <><span className="kbd">Alt</span> <span className="kbd">Space</span></>],
              ]}
            />
          </Section>

          <Section id="tokens">
            <H2 id="tokens" icon="cpu">Design tokens</H2>
            <P>All tokens live in <C>renderer/css/00-tokens.css</C>. Never hardcode a color in a component — add a token.</P>
            <Table
              head={["Token", "Elera Light", "Role"]}
              rows={[
                [<C>--bg</C>, <Swatch c="#F6F5F3" />, "App background"],
                [<C>--surface</C>, <Swatch c="#FFFFFF" />, "Cards, modals, menus"],
                [<C>--surface-2</C>, <Swatch c="#F1F0ED" />, "Wells, inputs"],
                [<C>--ink</C>, <Swatch c="#121212" />, "Primary text"],
                [<C>--ink-2</C>, <Swatch c="#5C5E63" />, "Secondary text"],
                [<C>--green</C>, <Swatch c="#7CD56E" />, "Primary accent"],
                [<C>--green-deep</C>, <Swatch c="#3E9E33" />, "Green text on soft"],
                [<C>--r-lg</C>, "20px", "Cards, panels"],
                [<C>--sh-pop</C>, "0 12px 40px …", "Menus, modals"],
              ]}
            />
          </Section>

          <Section id="faq">
            <H2 id="faq" icon="search">FAQ</H2>
            <Faq q="Is PebbleX free?">Yes. PebbleX is free for personal use. Team features may come later as an optional plan.</Faq>
            <Faq q="Does it work offline?">Everything except AI calls and chat sync works fully offline.</Faq>
            <Faq q="Where is my data stored?">In your OS user-data folder. You can export everything as Markdown + JSON from Settings → Privacy.</Faq>
            <Faq q="Can I make my own theme?">Yes — add a <C>[data-theme]</C> block with token overrides and register it. See Themes above.</Faq>
            <Faq q="Are there secrets on this website?">Maybe. Try holding Shift when you right-click. There are seven to find.</Faq>
          </Section>

          <Section id="troubleshooting">
            <H2 id="troubleshooting" icon="shield">Troubleshooting</H2>
            <Callout kind="danger" title="App won’t start">Delete the cache folder and relaunch. Your notes are not stored in the cache.</Callout>
            <Code lang="bash" code={"# macOS\nrm -rf ~/Library/Application\\ Support/Pebble/Cache\n\n# Windows\nrmdir /s %APPDATA%\\Pebble\\Cache\n\n# Linux\nrm -rf ~/.config/Pebble/Cache"} />
            <P>Still stuck? Open <b className="text-ink">Settings → About → Report a bug</b> — crash logs are attached automatically.</P>
          </Section>

          <Feedback />

          <div className="my-12 grid gap-3 sm:grid-cols-2">
            {idx > 0 && (
              <button onClick={() => jump(DOC_SECTIONS[idx - 1].id)} className="card cursor-pointer p-5 text-left transition-transform hover:-translate-y-0.5">
                <div className="text-[12px] text-ink-3">← Previous</div>
                <div className="text-[15px] font-bold">{DOC_SECTIONS[idx - 1].title}</div>
              </button>
            )}
            {idx < DOC_SECTIONS.length - 1 && (
              <button onClick={() => jump(DOC_SECTIONS[idx + 1].id)} className="card col-start-2 cursor-pointer p-5 text-right transition-transform hover:-translate-y-0.5">
                <div className="text-[12px] text-ink-3">Next →</div>
                <div className="text-[15px] font-bold">{DOC_SECTIONS[idx + 1].title}</div>
              </button>
            )}
          </div>
        </article>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <div className="overline mb-3">Reading progress</div>
            <div className="relative mx-auto mb-6 grid h-24 w-24 place-items-center">
              <svg width="96" height="96" className="absolute -rotate-90">
                <circle cx="48" cy="48" r="40" fill="none" stroke="var(--surface-3)" strokeWidth="8" />
                <circle cx="48" cy="48" r="40" fill="none" stroke="var(--green)" strokeWidth="8" strokeLinecap="round" strokeDasharray={251} strokeDashoffset={251 - (251 * progress) / 100} style={{ transition: "stroke-dashoffset .6s" }} />
              </svg>
              <span className="mono-num text-[20px] font-extrabold">{Math.round(progress)}%</span>
            </div>
            <div className="overline mb-2">On this page</div>
            <div className="border-l border-line">
              {DOC_SECTIONS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => jump(d.id)}
                  className="-ml-px block w-full cursor-pointer border-l-2 py-1 pl-3 text-left text-[12.5px] transition-colors"
                  style={{ borderColor: active === d.id ? "var(--green)" : "transparent", color: active === d.id ? "var(--ink)" : "var(--ink-3)", fontWeight: active === d.id ? 600 : 400 }}
                >
                  {d.title}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
