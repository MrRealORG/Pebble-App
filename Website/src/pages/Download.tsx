import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BrandMark, Icon } from "../components/Icon";
import { useStore } from "../lib/store";
import {
  fetchReleases,
  startDownload,
  assetLabel,
  bytes,
  compact,
  since,
  type ReleaseAsset,
  type ReleaseBundle,
  type SiteStats,
} from "../lib/releases";
import { supabase } from "../workspace/cloud";
import { BugReportForm, Reviews } from "../workspace/Reviews";
import { detectOS, Reveal } from "../sections/HomeB";

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * A REAL download button.
 *
 * The previous version animated a progress bar with setInterval and then
 * resolved to nothing — the `file` prop was never used. This one points an
 * <a download> at the actual GitHub release asset, so the browser fetches
 * a real binary and GitHub increments a real counter.
 */
function DlButton({
  label,
  asset,
  primary = false,
  hint,
}: {
  label: string;
  asset: ReleaseAsset;
  primary?: boolean;
  hint?: string;
}) {
  const { toast, confetti } = useStore();
  const [busy, setBusy] = useState(false);

  const go = () => {
    if (busy) return;
    setBusy(true);
    startDownload(asset);
    try {
      confetti();
    } catch {
      /* confetti is decorative */
    }
    toast({ title: "Download started", msg: `${asset.name} · ${bytes(asset.size)}` });
    /* reset so the button is usable again; GitHub's counter is the real
       source of truth, so we deliberately do not increment anything here */
    setTimeout(() => setBusy(false), 900);
  };

  return (
    <div>
      <button
        onClick={go}
        disabled={busy}
        className={`btn w-full ${primary ? "btn-green btn-lg" : "btn-soft"}`}
      >
        <span className="flex items-center gap-2">
          {busy ? (
            <>
              <span
                className="h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                style={{ animation: "nx-spin .7s linear infinite" }}
              />
              Starting…
            </>
          ) : (
            <>
              <Icon name="download" size={primary ? 17 : 15} /> {label}
            </>
          )}
        </span>
      </button>
      {hint && <div className="mt-1.5 text-center text-[11.5px] text-ink-3">{hint}</div>}
    </div>
  );
}

/** Honest empty state. We never invent a download count. */
function NoReleases({ error }: { error: string }) {
  return (
    <div className="card p-7 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] bg-surface-3 text-ink-3">
        <Icon name="download" size={20} />
      </div>
      <div className="mt-4 text-[17px] font-bold">No published builds yet</div>
      <p className="mx-auto mt-2 max-w-[420px] text-[13.5px] text-ink-2">
        {error
          ? `We could not reach the release server (${error}). Nothing is being faked here — please try again shortly.`
          : "Builds appear here the moment CI publishes a release. Check back soon."}
      </p>
    </div>
  );
}

export function Download() {
  const os = detectOS();
  const [bundle, setBundle] = useState<ReleaseBundle | null>(null);
  const [stats, setStats] = useState<SiteStats | null>(null);

  useEffect(() => {
    let live = true;
    void fetchReleases().then((b) => {
      if (live) setBundle(b);
    });
    /* Supabase extras are optional; the page must work without them */
    void (async () => {
      const { fetchSiteStats } = await import("../lib/releases");
      const s = await fetchSiteStats(supabase);
      if (live) setStats(s);
    })();
    return () => {
      live = false;
    };
  }, []);

  const mine = bundle?.byPlatform?.[os] ?? null;

  const platforms = useMemo(
    () => [
      { id: "win", name: "Windows", icon: "windows", req: "Windows 10 (1903) or later" },
      { id: "mac", name: "macOS", icon: "apple", req: "Built from the same source" },
      { id: "linux", name: "Linux", icon: "linux", req: "Built from the same source" },
    ],
    [],
  );

  const real = bundle?.ok && bundle.totalDownloads > 0;

  return (
    <div className="mx-auto max-w-[1180px] px-5 pt-32">
      <div className="relative text-center">
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/3 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--green-soft), transparent)" }}
        />
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 15 }}
          className="relative mx-auto w-fit"
        >
          <div style={{ animation: "nx-float 5s ease-in-out infinite" }}>
            <BrandMark size={96} radius={30} />
          </div>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, ease, delay: 0.1 }}
          className="relative mt-8 text-[clamp(44px,7vw,88px)] font-extrabold leading-[0.95] tracking-[-0.055em]"
        >
          Download PebbleX
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: 0.25 }}
          className="relative mx-auto mt-4 max-w-[520px] text-[17px] text-ink-2"
        >
          {bundle?.latest
            ? `${bundle.latest.name || bundle.latest.tag_name} · published ${since(bundle.latest.published_at)} · free for personal use.`
            : "Free for personal use. Open source, no account needed."}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: 0.4 }}
          className="relative mx-auto mt-8 max-w-[360px]"
        >
          {mine ? (
            <DlButton
              primary
              label={`Download for ${platforms.find((p) => p.id === os)?.name}`}
              asset={mine}
              hint={`${assetLabel(mine)} · ${bytes(mine.size)}`}
            />
          ) : bundle && !bundle.ok ? (
            <div className="btn btn-soft btn-lg w-full cursor-not-allowed opacity-60">
              <Icon name="download" size={17} /> Preparing builds…
            </div>
          ) : (
            <div className="btn btn-soft btn-lg w-full cursor-not-allowed opacity-60">
              <Icon name="download" size={17} /> No {platforms.find((p) => p.id === os)?.name} build yet
            </div>
          )}
          <div className="mt-3 text-[12.5px] text-ink-3">
            {mine
              ? `We detected ${platforms.find((p) => p.id === os)?.name}. ${platforms.find((p) => p.id === os)?.req}.`
              : "Pick a platform below if this one is not built yet."}
          </div>
        </motion.div>

        {/* Real, measured numbers. Nothing here is a placeholder. */}
        <div className="relative mx-auto mt-10 flex max-w-[560px] flex-wrap items-center justify-center gap-3">
          <span className="pill bg-surface-3 text-ink-2">
            <span className="dot" />
            {real ? `${compact(bundle!.totalDownloads)} real downloads` : "Downloads counted live from releases"}
          </span>
          {bundle?.stale && (
            <span className="pill bg-surface-3 text-ink-3">offline — last known figures</span>
          )}
          {stats?.ok && stats.accounts > 0 && (
            <span className="pill bg-surface-3 text-ink-2">{compact(stats.accounts)} accounts</span>
          )}
        </div>
      </div>

      <div className="mt-20 grid gap-4 md:grid-cols-3">
        {platforms.map((p, i) => {
          const asset = bundle?.byPlatform?.[p.id] ?? null;
          return (
            <Reveal key={p.id} delay={i * 0.08}>
              <div
                className="card relative h-full overflow-hidden p-6 transition-all hover:-translate-y-1 hover:shadow-[var(--sh-pop)]"
                style={{ boxShadow: p.id === os && asset ? "0 0 0 2px var(--green), var(--sh-card)" : undefined }}
              >
                {p.id === os && asset && (
                  <span className="pill absolute right-4 top-4 bg-green-soft text-green-deep">
                    <span className="dot" /> Your system
                  </span>
                )}
                <div className="grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-tile-ink">
                  <Icon name={p.icon} size={22} />
                </div>
                <div className="mt-4 text-[20px] font-extrabold tracking-[-0.02em]">{p.name}</div>
                <div className="text-[13px] text-ink-3">
                  {asset ? `${p.req} · ${bytes(asset.size)}` : p.req}
                </div>

                <div className="mt-5 flex flex-col gap-2">
                  {asset ? (
                    <>
                      <DlButton label={assetLabel(asset)} asset={asset} />
                      {/* real per-asset count straight from GitHub */}
                      <div className="text-center text-[11.5px] text-ink-3">
                        {compact(asset.download_count)} downloads
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[13px] border border-line bg-surface-2 px-4 py-3 text-center text-[12.5px] text-ink-3">
                      Not built for {p.name} yet. The same source builds every platform.
                    </div>
                  )}
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      {!bundle?.ok && <div className="mt-6"><NoReleases error={bundle?.error ?? ""} /></div>}

      {/* Release history — real tags, real dates, real counts */}
      {bundle && bundle.releases.length > 0 && (
        <div className="mt-16">
          <Reveal>
            <div className="card p-7">
              <div className="overline">Release history</div>
              <div className="mt-4 divide-y divide-[var(--line)]">
                {bundle.releases.slice(0, 5).map((r) => {
                  const dl = r.assets.reduce((n, a) => n + (a.download_count || 0), 0);
                  return (
                    <div key={r.tag_name} className="flex flex-wrap items-center gap-3 py-3.5">
                      <span className="mono-num text-[15px] font-extrabold">{r.tag_name}</span>
                      <span className="text-[12.5px] text-ink-3">{since(r.published_at)}</span>
                      {r.prerelease && <span className="pill bg-yellow-soft text-yellow">pre-release</span>}
                      <span className="pill bg-surface-3 text-ink-2">{compact(dl)} downloads</span>
                      <span className="text-[12px] text-ink-3">{r.assets.length} file(s)</span>
                      <a
                        href={r.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-[12.5px] text-ink-2 underline decoration-line-strong underline-offset-3 hover:text-ink"
                      >
                        Release notes
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          </Reveal>
        </div>
      )}

      <div className="mt-16 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <Reveal>
          <div className="card h-full p-7">
            <div className="overline">Real reviews</div>
            <div className="mt-4"><Reviews compactMode /></div>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="card h-full p-7">
            <div className="overline">Found a problem?</div>
            <p className="mt-3 text-[14px] text-ink-2">
              Reports go straight to the developer and land in the same queue the admin panel reads.
              No account needed — a broken build often cannot sign in.
            </p>
            <div className="mt-4"><BugReportForm /></div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

export function Changelog() {
  const [bundle, setBundle] = useState<ReleaseBundle | null>(null);

  useEffect(() => {
    let live = true;
    void fetchReleases().then((b) => {
      if (live) setBundle(b);
    });
    return () => {
      live = false;
    };
  }, []);

  /* GitHub release notes when they exist; otherwise the static history. */
  const releases = bundle?.releases.filter((r) => (r.body || "").trim().length > 40) ?? [];

  return (
    <div className="mx-auto max-w-[860px] px-5 pt-32">
      <Reveal>
        <div className="overline">Changelog</div>
        <h1 className="mt-3 text-[clamp(40px,6vw,72px)] font-extrabold leading-[0.95] tracking-[-0.05em]">
          What’s new, quietly.
        </h1>
        <p className="mt-4 text-[17px] text-ink-2">Every release, every fix. No exclamation marks.</p>
      </Reveal>

      <div className="relative mt-14">
        <div className="absolute bottom-0 left-[11px] top-2 w-px bg-line-strong" />

        {releases.map((r, i) => (
          <Reveal key={r.tag_name} delay={i * 0.05}>
            <div className="relative pb-12 pl-12">
              <span
                className="absolute left-0 top-1.5 grid h-[23px] w-[23px] place-items-center rounded-full border-[3px] border-bg bg-green"
                style={{ boxShadow: i === 0 ? "0 0 0 6px var(--green-ring)" : undefined }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <span className="mono-num text-[26px] font-extrabold tracking-[-0.03em]">{r.tag_name}</span>
                <span className={`pill ${i === 0 ? "bg-green text-on-green" : "bg-surface-3 text-ink-2"}`}>
                  {i === 0 ? "Latest" : r.prerelease ? "Pre-release" : "Released"}
                </span>
                <span className="text-[13px] text-ink-3">{since(r.published_at)}</span>
                <span className="pill bg-surface-3 text-ink-2">
                  {compact(r.assets.reduce((n, a) => n + (a.download_count || 0), 0))} downloads
                </span>
              </div>
              <pre className="card mt-4 overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.75] whitespace-pre-wrap text-ink-2">
                {r.body.trim()}
              </pre>
            </div>
          </Reveal>
        ))}

        {!releases.length && (
          <Reveal>
            <div className="card p-7">
              <div className="overline">In development</div>
              <p className="mt-3 text-[14px] text-ink-2">
                Release notes appear here automatically the moment CI publishes a build. Nothing is
                listed before it ships.
              </p>
              {bundle?.latest && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="pill bg-green text-on-green">{bundle.latest.tag_name}</span>
                  <span className="text-[13px] text-ink-3">
                    Published {since(bundle.latest.published_at)} ·{" "}
                    {compact(bundle.totalDownloads)} downloads
                  </span>
                  <a
                    href={bundle.latest.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline btn-sm"
                  >
                    View on GitHub
                  </a>
                </div>
              )}
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}