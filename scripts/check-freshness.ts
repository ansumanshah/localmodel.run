#!/usr/bin/env bun
/**
 * Catalog freshness check. Fetches Ollama's "newest" library listing and reports
 * model slugs that are NOT in our catalog and NOT on the reviewed-and-skipped
 * ignore list. The weekly workflow feeds the output into a single GitHub issue so
 * new releases surface without auto-editing the dataset (we verify every row by
 * hand against its real GGUF source before adding it).
 *
 * It never invents data and never fails the build: a fetch problem just produces
 * a report that says so and exits 0.
 *
 *   bun scripts/check-freshness.ts            # prints + writes freshness-report.md
 */
import { existsSync } from "node:fs";
import { findNewSlugs, parseSlugLines } from "./freshness-ignore";

const LIBRARY_URL = "https://ollama.com/library?sort=newest";
const MODEL_FILES = [
  "src/data/models.json",
  "src/data/image-models.json",
  "src/data/video-models.json",
  "src/data/audio-models.json",
];
const IGNORE_FILE = "scripts/freshness-ignore.txt";
const BASELINE_FILE = "scripts/freshness-baseline.txt";
const REPORT_FILE = "freshness-report.md";
const MAX_NEW = 25;

// Base slug of an Ollama tag/id: drop the ":quant" suffix, lowercase.
const baseSlug = (s: string): string => s.split(":")[0].trim().toLowerCase();

async function loadTrackedSlugs(): Promise<Set<string>> {
  const tracked = new Set<string>();
  for (const file of MODEL_FILES) {
    if (!existsSync(file)) continue;
    const rows = (await Bun.file(file).json()) as { id?: string; ollama_tag?: string | null }[];
    for (const r of rows) {
      if (r.ollama_tag) tracked.add(baseSlug(r.ollama_tag));
      if (r.id) tracked.add(baseSlug(r.id));
    }
  }
  return tracked;
}

async function loadSlugs(file: string): Promise<Set<string>> {
  if (!existsSync(file)) return new Set();
  return parseSlugLines(await Bun.file(file).text());
}

async function fetchLibrarySlugs(): Promise<string[] | null> {
  try {
    const res = await fetch(LIBRARY_URL, {
      headers: { "user-agent": "localmodel.run-freshness/1.0 (+https://localmodel.run)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const seen = new Set<string>();
    const order: string[] = [];
    // Ollama renders model links as <a href="/library/<slug>">; "newest" sort keeps
    // them in release order, so first-seen preserves recency.
    for (const m of html.matchAll(/\/library\/([a-z0-9][a-z0-9._-]*)/gi)) {
      const slug = m[1].toLowerCase();
      if (!seen.has(slug)) {
        seen.add(slug);
        order.push(slug);
      }
    }
    // ponytail: a short page is likely a challenge or partial response; update this
    // parser if Ollama starts paginating below 50 rather than closing a live issue.
    if (order.length < 50) return null;
    return order;
  } catch {
    return null;
  }
}

const today = new Date().toISOString().slice(0, 10);
const slugs = await fetchLibrarySlugs();

let body: string;
if (slugs == null) {
  body = `_Could not reach the Ollama library on ${today}; nothing to report. The check will retry next week._`;
  console.log("freshness: fetch failed, wrote a no-op report.");
} else {
  const tracked = await loadTrackedSlugs();
  const ignore = await loadSlugs(IGNORE_FILE);
  const baseline = parseSlugLines(await Bun.file(BASELINE_FILE).text());
  const missing = findNewSlugs(slugs, tracked, ignore, baseline, MAX_NEW);

  if (missing.length === 0) {
    body = `_No newly surfaced Ollama slugs as of ${today}. Historical unreviewed slugs remain in the baseline._`;
    console.log("freshness: no newly surfaced slugs.");
  } else {
    const list = missing.map((s) => `- [ ] [\`${s}\`](https://ollama.com/library/${s})`).join("\n");
    body =
      `New slugs in Ollama's [newest listing](${LIBRARY_URL}) absent from the catalog, reviewed skips, and historical baseline as of ${today}.\n\n` +
      `${list}\n\n` +
      `Some may be intentionally out of scope (cloud-only, duplicates, embeddings, fine-tune spam). ` +
      `This is a watchlist, not a TODO: verify each against its real GGUF source before adding, and add anything ` +
      `you've reviewed-and-skipped to \`${IGNORE_FILE}\` so it stops resurfacing.`;
    console.log(`freshness: ${missing.length} untracked model(s) found.`);
  }
}

await Bun.write(REPORT_FILE, body + "\n");
console.log(`Wrote ${REPORT_FILE}.`);
