// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
// Tailwind v4 runs via PostCSS (postcss.config.mjs) rather than the Vite plugin,
// which is currently incompatible with Astro 6's rolldown-vite resolver.

// Canonical production origin. Override via SITE_URL at build time (Cloudflare Pages).
const SITE = process.env.SITE_URL || "https://localmodel.run";

// https://astro.build
export default defineConfig({
  site: SITE,
  output: "static",
  trailingSlash: "never",
  build: { format: "directory", inlineStylesheets: "auto" },
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
