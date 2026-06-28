// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import tailwindcss from "@tailwindcss/vite";
// Tailwind v4 runs via the @tailwindcss/vite plugin. Under Astro 7 (Vite 8 /
// Rolldown) the old PostCSS path broke: postcss-import could not resolve
// `@import "tailwindcss"`. The Vite plugin is the recommended v4 setup and
// resolves it natively. `@import "tailwindcss"` stays in global.css.

// Canonical production origin. Override via SITE_URL at build time (Cloudflare Pages).
const SITE = process.env.SITE_URL || "https://localmodel.run";

// https://astro.build
export default defineConfig({
  site: SITE,
  output: "static",
  trailingSlash: "never",
  // Astro 7 changed the compressHTML default from `true` (HTML-aware) to `'jsx'`
  // (strips more whitespace). Pin `true` to keep the v6 output exactly, important
  // for the whitespace-sensitive <code>/command blocks. Revisit after visual QA.
  compressHTML: true,
  vite: { plugins: [tailwindcss()] },
  // `file` (page.html) over `directory` (page/index.html): on Cloudflare Pages
  // this serves the no-trailing-slash URL directly (200), so the sitemap and
  // canonical (both trailingSlash:"never") match the served URL with no 308 hop.
  // `concurrency` renders static routes in parallel (default is 1). Measured
  // ~9% off the wall time here (25.3s -> 23.2s); the bulk is the 135 OG PNG
  // endpoints (satori + resvg WASM), which are I/O/WASM-bound and don't fully
  // parallelise. Zero-risk win; the bigger lever would be caching dist/og/.
  build: { format: "file", inlineStylesheets: "auto", concurrency: 10 },
  // Prefetch links on hover/focus so the view-transition navigations feel
  // instant. Pairs with <ClientRouter /> in Base.astro.
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  // i18n architecture. English is the default (no prefix); Spanish is the proof
  // locale at /es/. Programmatic model x device pages stay English-only until
  // English is indexed (avoids thin auto-translated pages). Add a locale later
  // by adding strings to src/i18n/ui.ts and a page under src/pages/<locale>/.
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es"],
    routing: { prefixDefaultLocale: false, redirectToDefaultLocale: false },
  },
  integrations: [
    icon(),
    react(),
    sitemap({
      changefreq: "weekly",
      priority: 0.7,
      lastmod: new Date(),
      i18n: {
        defaultLocale: "en",
        locales: { en: "en-US", es: "es-ES" },
      },
    }),
  ],
});
