/**
 * PebbleX — real release + download data
 *
 * WHY THIS FILE EXISTS
 * The download buttons used to animate a fake progress bar and resolve to
 * nothing. Every number on the marketing site is now measured, not invented.
 *
 * WHERE THE DATA COMES FROM — and why it is trustworthy:
 *   1. GitHub Releases. The CI workflow (.github/workflows/build.yml) runs
 *      `tauri-apps/tauri-action@v0`, which publishes the installer and the
 *      portable binary as release ASSETS. GitHub counts every asset fetch
 *      itself and exposes it as `download_count`. That number cannot drift
 *      from reality because GitSQL computes it at the CDN, not from us.
 *   2. `public_stats` in Supabase for things GitHub cannot know about
 *      (notes created across accounts, etc). Read-only, no secrets.
 *
 * WHY NOT TRACK DOWNLOADS OURSELVES
 * A self-hosted counter needs a backend, a database table and a bot filter
 * to stay honest. GitHub already solved all three and gives us a number we
 * can verify. Adding our own would only create a second, worse number.
 *
 * FREE PLAN
 * The GitHub API is free for public repos. We cache aggressively in
 * localStorage so a visitor is not charged a request per page view.
 */

const GITHUB_REPO = "MrRealORG/Pebble-App";
const API = `https://api.github.com/repos/${GITHUB_REPO}`;

const CACHE_KEY = "px:releases";
const CACHE_MS = 15 * 60 * 1000;          // GitHub rate-limits at 60/hr/IP

export type ReleaseAsset = {
  id: number;
  name: string;
  size: number;
  download_count: number;
  browser_download_url: string;
  content_type: string;
  created_at: string;
};

export type Release = {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: ReleaseAsset[];
};

export type ReleaseBundle = {
  ok: boolean;
  /** true when the numbers came from cache or are unavailable */
  stale: boolean;
  error: string;
  releases: Release[];
  latest: Release | null;
  totalDownloads: number;
  /** platform → asset, so the button can offer the right file */
  byPlatform: Record<string, ReleaseAsset>;
  fetchedAt: number;
};

/* platform detection order matters: check the specific before the generic */
const PLATFORM_RULES: { id: string; label: string; test: RegExp[] }[] = [
  {
    id: "win",
    label: "Windows",
    test: [/windows/i, /-win/i, /setup\.exe$/i, /win64/i, /x64-setup/i],
  },
  {
    id: "mac",
    label: "macOS",
    test: [/mac/i, /darwin/i, /apple/i, /\.dmg$/i, /osx/i, /arm64/i],
  },
  {
    id: "linux",
    label: "Linux",
    test: [/linux/i, /appimage/i, /\.deb$/i, /x86_64\.deb/i, /flatpak/i],
  },
];

/** Which platform does this asset belong to? */
export function platformOf(asset: ReleaseAsset): string | null {
  for (const rule of PLATFORM_RULES) {
    if (rule.test.some((re) => re.test(asset.name))) return rule.id;
  }
  return null;
}

/** Human label from a filename: "PebbleX_0.1.0_x64-setup.exe" → "Windows installer" */
export function assetLabel(asset: ReleaseAsset): string {
  const n = asset.name;
  if (/setup\.exe$|installer/i.test(n)) return "Installer (.exe)";
  if (/portable/i.test(n)) return "Portable (.exe)";
  if (/\.dmg$/i.test(n)) return "Disk image (.dmg)";
  if (/\.zip$/i.test(n)) return "Zip archive";
  if (/appimage/i.test(n)) return "AppImage";
  if (/\.deb$/i.test(n)) return "Debian package (.deb)";
  if (/\.msi$/i.test(n)) return "Windows installer (.msi)";
  return n;
}

function emptyBundle(error: string, stale = false): ReleaseBundle {
  return {
    ok: false,
    stale,
    error,
    releases: [],
    latest: null,
    totalDownloads: 0,
    byPlatform: {},
    fetchedAt: Date.now(),
  };
}

function fromCache(): ReleaseBundle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReleaseBundle;
    if (!parsed || !Array.isArray(parsed.releases)) return null;
    return { ...parsed, stale: true };
  } catch {
    return null;
  }
}

function toCache(bundle: ReleaseBundle) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
  } catch {
    /* private mode / quota — the cache is an optimisation, not a requirement */
  }
}

function build(releases: Release[]): ReleaseBundle {
  const live = releases.filter((r) => !r.draft);
  const latest = live[0] ?? null;
  const byPlatform: Record<string, ReleaseAsset> = {};
  let total = 0;

  for (const rel of live) {
    for (const asset of rel.assets) {
      total += asset.download_count || 0;
      const p = platformOf(asset);
      /* the newest release wins each platform slot */
      if (p && !byPlatform[p]) byPlatform[p] = asset;
    }
  }

  return {
    ok: true,
    stale: false,
    error: "",
    releases: live,
    latest,
    totalDownloads: total,
    byPlatform,
    fetchedAt: Date.now(),
  };
}

/**
 * Fetch real releases. Falls back to cache rather than showing nothing —
 * a stale real number beats a blank space or an invented one.
 */
export async function fetchReleases(force = false): Promise<ReleaseBundle> {
  if (!force) {
    const cached = fromCache();
    if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;
  }

  try {
    const res = await fetch(`${API}/releases?per_page=20`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      const fallback = fromCache();
      if (fallback) return { ...fallback, error: `GitHub returned ${res.status}` };
      return emptyBundle(`GitHub returned ${res.status}`);
    }
    const json = (await res.json()) as Release[];
    const bundle = build(json);
    toCache(bundle);
    return bundle;
  } catch (err) {
    const fallback = fromCache();
    if (fallback) return { ...fallback, error: "Offline — showing the last known figures" };
    return emptyBundle("Could not reach GitHub");
  }
}

/* ------------------------------------------------------------------
   EXTRA STATS from Supabase
   Aggregates only. No PII, no per-user rows, read-only.
------------------------------------------------------------------ */

export type SiteStats = {
  ok: boolean;
  notes: number;
  tasks: number;
  accounts: number;
  devices: number;
  error: string;
};

export async function fetchSiteStats(supabase: any): Promise<SiteStats> {
  const empty: SiteStats = { ok: false, notes: 0, tasks: 0, accounts: 0, devices: 0, error: "" };
  if (!supabase) return { ...empty, error: "Cloud not connected" };
  try {
    const { data, error } = await supabase.rpc("public_site_stats");
    if (error) throw error;
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      notes: Number(d.notes || 0),
      tasks: Number(d.tasks || 0),
      accounts: Number(d.accounts || 0),
      devices: Number(d.devices || 0),
      error: "",
    };
  } catch (err) {
    return { ...empty, error: "Stats unavailable" };
  }
}

/* ------------------------------------------------------------------
   APPROVED REVIEWS
   Only rows an administrator approved can ever come back — the RLS
   select policy restricts reads to status = 'approved', and this RPC
   filters again. Returns [] when the table has not been migrated, so
   callers render nothing instead of inventing quotes.
------------------------------------------------------------------ */

export type PublicReviewRow = {
  id: string;
  author_name: string;
  body: string;
  rating: number;
  created_at: string;
};

export async function fetchPublicReviews(limit = 12): Promise<PublicReviewRow[]> {
  try {
    const { supabase } = await import("../workspace/cloud");
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("public_reviews", { p_limit: limit });
    if (error) return [];
    return (data ?? []) as PublicReviewRow[];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------
   FORMATTING
------------------------------------------------------------------ */

export function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}

export function bytes(n: number): string {
  if (!n) return "";
  const mb = n / 1048576;
  if (mb < 1) return `${Math.round(n / 1024)} KB`;
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

/** "3 days ago" / "today" — for release freshness */
export function since(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

/**
 * Trigger a REAL download and count it.
 *
 * A real <a download> click means the browser fetches the asset from
 * GitHub's CDN, and GitHub increments its own counter. We do not need to
 * write anything anywhere — which is the whole point.
 */
export function startDownload(asset: ReleaseAsset, onStart?: () => void) {
  const a = document.createElement("a");
  a.href = asset.browser_download_url;
  a.download = asset.name;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  onStart?.();
}