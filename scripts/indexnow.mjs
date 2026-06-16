#!/usr/bin/env node
// Submit every sitemap URL to IndexNow so Bing, Yandex, Seznam and Naver
// discover new/changed pages immediately instead of waiting for organic crawl.
// (ChatGPT Search + Copilot read the Bing index, so this is the fastest path
// to AI-engine discovery.) Google does not consume IndexNow; it relies on the
// sitemap + GSC. Run: `bun run indexnow` (or `node scripts/indexnow.mjs`).
const HOST = "localmodel.run";
const KEY = "c30d7513e2b133d69c5383720ca87eba";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const SITEMAP_INDEX = `https://${HOST}/sitemap-index.xml`;

async function locs(url) {
  const res = await fetch(url, { headers: { "User-Agent": "localmodel-run-indexnow" } });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

const children = await locs(SITEMAP_INDEX);
const all = [];
for (const child of children) all.push(...(await locs(child)));
const urls = [...new Set(all)].filter((u) => u.startsWith(`https://${HOST}`));
console.log(`Submitting ${urls.length} URLs to IndexNow…`);

// IndexNow accepts up to 10,000 URLs per request.
for (let i = 0; i < urls.length; i += 10000) {
  const batch = urls.slice(i, i + 10000);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: batch }),
  });
  console.log(`Batch ${Math.floor(i / 10000) + 1} (${batch.length} URLs): HTTP ${res.status}`);
}
console.log("Done.");
