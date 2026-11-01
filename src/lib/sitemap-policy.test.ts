import { test, expect, describe } from "bun:test";
import { devices, models, imageModels } from "@/lib/data";
import { featuredTextModelIds, inSitemap, TOP_DOWNLOADS } from "@/lib/sitemap-policy";

// The sitemap trim decides which pair pages Google is asked to crawl. These pin
// that it only ever removes text-model pair pages, and that the kept set is the
// recent-or-popular rule, evaluated against the catalog date.

describe("featuredTextModelIds", () => {
  const rows = [
    { id: "old-popular", release: "2024-01", hf_downloads: 9_000_000 },
    { id: "old-unpopular", release: "2024-01", hf_downloads: 10 },
    { id: "new-month", release: "2026-09", hf_downloads: 0 },
    { id: "new-day", release: "2026-05-01", hf_downloads: null },
    { id: "just-too-old", release: "2026-04-28", hf_downloads: 0 },
  ];
  // Pad with popular filler so "old-unpopular" falls outside the top N.
  const filler = Array.from({ length: TOP_DOWNLOADS }, (_, i) => ({
    id: `filler-${i}`,
    release: "2023-01",
    hf_downloads: 1_000_000 + i,
  }));
  const ids = featuredTextModelIds([...rows, ...filler], "2026-10-28");

  test("keeps recent releases by month or day", () => {
    expect(ids.has("new-month")).toBe(true);
    expect(ids.has("new-day")).toBe(true);
    expect(ids.has("just-too-old")).toBe(false);
  });

  test("keeps the most downloaded, drops old long-tail models", () => {
    expect(ids.has("old-popular")).toBe(true);
    expect(ids.has("old-unpopular")).toBe(false);
  });
});

describe("inSitemap", () => {
  test("non-pair pages are always listed", () => {
    for (const p of ["/", "/can-i-run", `/can-i-run/${models[0].id}`, `/best-llm-for/${devices[0].id}`])
      expect(inSitemap(p)).toBe(true);
  });

  test("guided-setup result pages stay out", () => {
    expect(inSitemap("/start/result/worked")).toBe(false);
  });

  test("multimodal pair pages are never trimmed", () => {
    expect(inSitemap(`/can-i-run/${imageModels[0].id}/${devices[0].id}`)).toBe(true);
  });

  test("text pair pages are trimmed to a strict, non-empty subset", () => {
    const listed = models.filter((m) => inSitemap(`/can-i-run/${m.id}/${devices[0].id}`));
    expect(listed.length).toBeGreaterThanOrEqual(TOP_DOWNLOADS);
    expect(listed.length).toBeLessThan(models.length);
  });
});
