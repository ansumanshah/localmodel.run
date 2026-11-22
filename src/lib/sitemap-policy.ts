// Which pages we ask Google to index. Model x device pair pages
// (/can-i-run/<model>/<device>) still build, stay linked and serve visitors, but
// carry a Google-only noindex,follow (meta name="googlebot") and stay out of the
// sitemap. Bing still indexes them through IndexNow (scripts/indexnow.mjs) and
// sends ~20x Google's referrals (CF RUM, Nov 2026).
//
// Why: Search Console on 2026-11-22 showed 8 indexed pages, down from ~550 in
// late August, with 4,231 "discovered, not indexed" and 1,093 "crawled, not
// indexed". No manual action. The dropped URLs were almost all pair pages (e.g.
// llama-3.3-70b on an 8 GB M1), ~8,900 near-template pages against ~1,200 hub
// pages. Trimming the sitemap to recent models (Oct 2026) did not stop the slide,
// so the pairs leave the index entirely and their numbers live on the indexable
// /can-i-run/<model>, /model, /best-llm-for and /compare pages instead.

const PAIR = /^\/can-i-run\/[^/]+\/[^/]+$/;

/** True for a model x device pair page pathname (no trailing slash). */
export function isPairPage(pathname: string): boolean {
  return PAIR.test(pathname);
}

/** Sitemap filter for a URL pathname. */
export function inSitemap(pathname: string): boolean {
  return !pathname.startsWith("/start/result/") && !isPairPage(pathname);
}
