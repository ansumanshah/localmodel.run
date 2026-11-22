import { test, expect, describe } from "bun:test";
import { devices, models, imageModels } from "@/lib/data";
import { inSitemap, isPairPage } from "@/lib/sitemap-policy";

// Pins the index policy: pair pages (model x device) are noindex and unlisted,
// every hub page stays listed.

describe("inSitemap", () => {
  test("hub pages are listed", () => {
    for (const p of [
      "/",
      "/can-i-run",
      `/can-i-run/${models[0].id}`,
      `/best-llm-for/${devices[0].id}`,
      "/compare/gemma-4-vs-qwen-3.6",
    ])
      expect(inSitemap(p)).toBe(true);
  });

  test("guided-setup result pages stay out", () => {
    expect(inSitemap("/start/result/worked")).toBe(false);
  });

  test("every pair page stays out, text and multimodal", () => {
    for (const id of [models[0].id, imageModels[0].id]) {
      const p = `/can-i-run/${id}/${devices[0].id}`;
      expect(isPairPage(p)).toBe(true);
      expect(inSitemap(p)).toBe(false);
    }
  });

  test("a model hub is not a pair page", () => {
    expect(isPairPage(`/can-i-run/${models[0].id}`)).toBe(false);
  });
});
