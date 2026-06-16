// Structured-data builders. Emitting rich, accurate JSON-LD is what surfaces
// pages in Google rich results AND makes the facts easy for ChatGPT / Gemini /
// Claude to lift and cite. Keep every claim consistent with the visible page.

const SITE_NAME = "localmodel.run";

// A JSON-LD object is plain JSON (no `undefined`); these builders only ever
// emit JSON-serializable values, so this models them precisely without `any`.
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonLd = { [key: string]: JsonValue };

// Author / publisher identity. A named human author is the strongest E-E-A-T
// signal for technical advice content; the site is a solo build.
const AUTHOR = { name: "Ansuman Shah", url: "https://github.com/ansumanshah" };
const SAME_AS = ["https://github.com/ansumanshah", "https://x.com/AnsumanShah"];

const personAuthor: JsonLd = { "@type": "Person", name: AUTHOR.name, url: AUTHOR.url };

function orgEntity(origin: string): JsonLd {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: origin,
    logo: { "@type": "ImageObject", url: new URL("/favicon.svg", origin).href },
    sameAs: SAME_AS,
  };
}

/** Publisher entity, emitted once per page sitewide. Seeds the Knowledge Graph. */
export function organizationLd(origin: string): JsonLd {
  return { "@context": "https://schema.org", ...orgEntity(origin) };
}

/** WebSite entity, emitted sitewide. (No SearchAction: the site has no query
 *  search endpoint, so claiming one would be invalid structured data.) */
export function websiteLd(origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: origin,
    publisher: orgEntity(origin),
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbLd(items: BreadcrumbItem[], origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: new URL(it.url, origin).href,
    })),
  };
}

export interface FaqItem {
  q: string;
  a: string;
}

export function faqLd(items: FaqItem[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

export function techArticleLd(opts: {
  headline: string;
  description: string;
  url: string;
  origin: string;
  dateModified: string;
  datePublished?: string; // stable launch/publish date; falls back to dateModified
  sources?: string[];
  speakableSelector?: string[]; // CSS selectors of the most citable passages
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: opts.headline,
    description: opts.description,
    url: new URL(opts.url, opts.origin).href,
    datePublished: opts.datePublished ?? opts.dateModified,
    dateModified: opts.dateModified,
    inLanguage: "en",
    isAccessibleForFree: true,
    author: personAuthor,
    publisher: orgEntity(opts.origin),
    ...(opts.speakableSelector?.length
      ? { speakable: { "@type": "SpeakableSpecification", cssSelector: opts.speakableSelector } }
      : {}),
    ...(opts.sources?.length
      ? { citation: opts.sources.map((url) => ({ "@type": "CreativeWork", url })) }
      : {}),
  };
}

export function itemListLd(opts: {
  name: string;
  items: { name: string; url: string }[];
  origin: string;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: opts.name,
    numberOfItems: opts.items.length,
    itemListElement: opts.items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Thing",
        "@id": new URL(it.url, opts.origin).href,
        name: it.name,
      },
    })),
  };
}

export function howToLd(opts: {
  name: string;
  description: string;
  url: string;
  origin: string;
  steps: { name: string; text: string }[];
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: opts.name,
    description: opts.description,
    url: new URL(opts.url, opts.origin).href,
    step: opts.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

export function softwareAppLd(origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: origin,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "AITool",
    operatingSystem: "macOS, Windows, Linux, iOS, Android",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    creator: personAuthor,
    featureList: [
      "Hardware compatibility check for local AI models (LLMs, image, video, audio)",
      "Memory requirement calculator with KV cache",
      "Per-platform tool recommendations",
      "Rig score grading across all tracked devices",
    ],
    screenshot: new URL("/og/home.png", origin).href,
    description:
      "Check whether your computer or phone can run a given local AI model (LLM, image, video, or audio), and which tool to use, per platform.",
  };
}

export function datasetLd(opts: {
  origin: string;
  dateModified: string;
  sources: string[];
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Local AI model hardware-requirement dataset",
    description:
      "Validated memory requirements and per-device runnability for local AI models: text LLMs (GGUF quant sizes), plus image, video and audio models (sourced peak-VRAM anchors).",
    url: new URL("/methodology", opts.origin).href,
    dateModified: opts.dateModified,
    isAccessibleForFree: true,
    creator: orgEntity(opts.origin),
    citation: opts.sources.slice(0, 25).map((url) => ({ "@type": "CreativeWork", url })),
    // Declare the agent-readable endpoints so AI crawlers can discover them via
    // structured data, not just the <link rel=alternate> headers.
    distribution: [
      { "@type": "DataDownload", name: "llms.txt", encodingFormat: "text/plain", contentUrl: new URL("/llms.txt", opts.origin).href },
      { "@type": "DataDownload", name: "llms-full.txt", encodingFormat: "text/plain", contentUrl: new URL("/llms-full.txt", opts.origin).href },
      { "@type": "DataDownload", name: "JSON API catalog", encodingFormat: "application/json", contentUrl: new URL("/api/index.json", opts.origin).href },
      { "@type": "DataDownload", name: "Agent card", encodingFormat: "application/json", contentUrl: new URL("/.well-known/agent.json", opts.origin).href },
    ],
  };
}

export function truncate(s: string, n = 158): string {
  if (s.length <= n) return s;
  // Cut at the last word boundary before the limit (never mid-word), and drop
  // any trailing punctuation/space before the ellipsis so the result reads clean.
  const slice = s.slice(0, n - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > n * 0.6 ? slice.slice(0, lastSpace) : slice;
  return base.replace(/[\s,;:.–—]+$/, "") + "…";
}

/**
 * Serialize a JSON-LD object for embedding in a <script type="application/ld+json">
 * via set:html. Escapes <, > and & so a string value can never close the script
 * element (</script>) or open an HTML entity. Valid JSON; parsers expand it back.
 */
export function safeJsonLd(obj: JsonLd): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
