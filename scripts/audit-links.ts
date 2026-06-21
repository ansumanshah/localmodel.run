#!/usr/bin/env bun
/**
 * In-repo SEO link audit — the OSS substitute for Screaming Frog on a static site.
 *
 * Reads the built `dist/` directly (no live server, no crawler, no rate limits),
 * builds the internal link graph, and reports the two things a crawler is for:
 *   1. Broken internal links  — an <a href> that points to a page/asset that was
 *      never built. This is a real defect, so it exits 1 (fails CI).
 *   2. Orphan pages           — a built HTML page that no other page links to.
 *      Informational (the link mesh's blind spots); never fails the build.
 *
 * Because it parses the exact files Cloudflare will serve, it is strictly more
 * accurate than crawling the live site, and it gives the orphan report that
 * lychee / linkinator / Unlighthouse do not. Runs in a few seconds.
 *
 *   bun run build && bun scripts/audit-links.ts
 *   (or: bun run audit:links)
 */
import { Glob } from "bun";
import { existsSync } from "node:fs";

const DIST = "dist";

if (!existsSync(DIST)) {
  console.error(`No ${DIST}/ directory. Run \`bun run build\` first.`);
  process.exit(2);
}

// Pages we never expect inbound internal links for (entry points / error route).
const ORPHAN_ALLOWLIST = new Set(["/", "/404"]);

// dist/about.html -> /about ; dist/index.html -> / ; dist/model/x.html -> /model/x
function htmlFileToUrl(rel: string): string {
  let u = "/" + rel;
  if (u.endsWith("/index.html")) u = u.slice(0, -"/index.html".length) || "/";
  else if (u.endsWith(".html")) u = u.slice(0, -".html".length);
  return u === "" ? "/" : u;
}

// Internal links only; strip #fragment and ?query; normalise trailing slash.
function normalizeHref(href: string): string | null {
  if (!href || !href.startsWith("/") || href.startsWith("//")) return null;
  let h = href.split("#")[0].split("?")[0];
  if (h === "") return null;
  if (h.length > 1 && h.endsWith("/")) h = h.slice(0, -1);
  return h;
}

// Two authoritative sets from the build output:
//   pageSet  = every served HTML page URL
//   assetSet = every non-HTML file URL (og PNGs, .md twins, .json API, sitemap, etc.)
const pageSet = new Set<string>();
const assetSet = new Set<string>();
const htmlFiles: string[] = [];

// `dot: true` so dot-dirs like /.well-known/ count as real assets, not broken links.
for await (const rel of new Glob("**/*").scan({ cwd: DIST, onlyFiles: true, dot: true })) {
  if (rel.endsWith(".html")) {
    htmlFiles.push(rel);
    pageSet.add(htmlFileToUrl(rel));
  } else {
    assetSet.add("/" + rel);
  }
}

// Walk every page, extract internal <a href>, build the graph.
const linkedSet = new Set<string>(); // every internal URL that is linked to from somewhere
const brokenBySource = new Map<string, Set<string>>(); // source page -> broken targets

for (const rel of htmlFiles) {
  const from = htmlFileToUrl(rel);
  const html = await Bun.file(`${DIST}/${rel}`).text();
  const hrefs: string[] = [];

  new HTMLRewriter()
    .on("a[href]", {
      element(el) {
        const n = normalizeHref(el.getAttribute("href") ?? "");
        if (n) hrefs.push(n);
      },
    })
    .transform(html);

  for (const h of hrefs) {
    linkedSet.add(h);
    if (!pageSet.has(h) && !assetSet.has(h)) {
      if (!brokenBySource.has(from)) brokenBySource.set(from, new Set());
      brokenBySource.get(from)!.add(h);
    }
  }
}

// Orphans: a built page nothing links to (excluding entry points).
const orphans = [...pageSet].filter((u) => !linkedSet.has(u) && !ORPHAN_ALLOWLIST.has(u)).sort();

// Broken: unique broken targets, with how many pages reference each.
const brokenTargets = new Map<string, number>();
for (const targets of brokenBySource.values()) {
  for (const t of targets) brokenTargets.set(t, (brokenTargets.get(t) ?? 0) + 1);
}

// ---- Report -------------------------------------------------------------
const SHOW = 40;
console.log(`\nLink audit — ${pageSet.size} pages, ${assetSet.size} assets, ${linkedSet.size} distinct internal links\n`);

if (brokenTargets.size === 0) {
  console.log("✓ No broken internal links.");
} else {
  console.log(`✗ ${brokenTargets.size} broken internal link target(s):`);
  const sorted = [...brokenTargets.entries()].sort((a, b) => b[1] - a[1]);
  for (const [target, count] of sorted.slice(0, SHOW)) {
    const oneSource = [...brokenBySource].find(([, s]) => s.has(target))?.[0];
    console.log(`   ${target}  (from ${count} page${count > 1 ? "s" : ""}, e.g. ${oneSource})`);
  }
  if (sorted.length > SHOW) console.log(`   …and ${sorted.length - SHOW} more`);
}

console.log("");
if (orphans.length === 0) {
  console.log("✓ No orphan pages (every page has an inbound internal link).");
} else {
  console.log(`! ${orphans.length} orphan page(s) — built but not linked from anywhere:`);
  for (const o of orphans.slice(0, SHOW)) console.log(`   ${o}`);
  if (orphans.length > SHOW) console.log(`   …and ${orphans.length - SHOW} more`);
}
console.log("");

// Broken links are a hard failure; orphans are informational.
process.exit(brokenTargets.size > 0 ? 1 : 0);
