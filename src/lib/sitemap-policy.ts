import models from "../data/models.json";
import meta from "../data/meta.json";

// Which model x device pair pages the sitemap advertises. Every pair page still
// builds and stays linked; this only decides what we ASK Google to crawl.
//
// Why: on 2026-10-02 Search Console showed 77 indexed vs 1,023 "crawled,
// currently not indexed", with ~7,400 of ~8,500 sitemap URLs being pair pages.
// Listing every pair dilutes crawl demand across near-identical URLs. Pair
// traffic (Cloudflare RUM, Aug to Oct 2026) concentrates on recent releases and
// widely downloaded models, so those are the pairs we keep in the sitemap.
//
// Image, video and audio models are few and their pairs only exist where the
// model actually runs, so all of their pairs stay listed.

/** A text model counts as recent if released within this many days of the
 *  catalog's last data update (meta.updated, not the build clock). */
export const RECENT_DAYS = 180;
/** Plus the most downloaded text models on Hugging Face. */
export const TOP_DOWNLOADS = 25;

interface Row {
  id: string;
  release?: string;
  hf_downloads?: number | null;
}

function releaseTime(release: string | undefined): number | null {
  if (!release) return null;
  // Catalog dates are "YYYY-MM" or "YYYY-MM-DD"; a bare month means its first day.
  const t = Date.parse(release.length === 7 ? `${release}-01` : release);
  return Number.isNaN(t) ? null : t;
}

export function featuredTextModelIds(rows: Row[], updated: string): Set<string> {
  const cutoff = Date.parse(updated) - RECENT_DAYS * 86_400_000;
  const recent = rows.filter((m) => (releaseTime(m.release) ?? -Infinity) >= cutoff);
  const popular = [...rows]
    .sort((a, b) => (b.hf_downloads ?? 0) - (a.hf_downloads ?? 0))
    .slice(0, TOP_DOWNLOADS);
  return new Set([...recent, ...popular].map((m) => m.id));
}

const textIds = new Set((models as Row[]).map((m) => m.id));
const featured = featuredTextModelIds(models as Row[], meta.updated);

/** Sitemap filter for a URL pathname. Only text-model pair pages are trimmed. */
export function inSitemap(pathname: string): boolean {
  if (pathname.startsWith("/start/result/")) return false;
  const pair = /^\/can-i-run\/([^/]+)\/[^/]+$/.exec(pathname);
  if (!pair) return true;
  const model = pair[1];
  return !textIds.has(model) || featured.has(model);
}
