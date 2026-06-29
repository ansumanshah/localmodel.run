// Mobile render audit. Loads the built site at a phone viewport (iPhone 13,
// 390px) in headless Chromium and fails on any horizontal overflow, leaked
// desktop nav, console/page error, non-200, or blank render. This is the gate
// that would have caught the sitewide mobile header bug (a component CSS
// `display` rule beating Tailwind's `.hidden`) before it shipped.
//
// Usage:  bun run preview &   # serve ./dist on :4321
//         bun scripts/mobile-audit.mjs
// Env knobs: BASE_URL, DIST_DIR, PAIR_CAP (pair-page sample), BIG_CAP
//   (per high-cardinality route), CONCURRENCY. CI uses small caps for speed;
//   crank them for an exhaustive local sweep (PAIR_CAP=300 BIG_CAP=999 ...).

import { chromium, devices } from "playwright";
import { readdirSync, statSync, mkdirSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:4321";
const DIST = resolve(process.env.DIST_DIR ?? "dist");
const PAIR_CAP = Number(process.env.PAIR_CAP ?? 60);
const BIG_CAP = Number(process.env.BIG_CAP ?? 40);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const SHOT = resolve("playwright-failures");

// Viewport: default iPhone 13 (390px). Override with VIEWPORT="360x800" to test
// narrower floors (360 = mainstream Android, 320 = conservative minimum).
const _dev = devices["iPhone 13"];
const _vp = process.env.VIEWPORT;
const CTX_OPTS = _vp
  ? (() => {
      const [w, h] = _vp.split("x").map(Number);
      const size = { width: w, height: h || 800 };
      return { ..._dev, viewport: size, screen: size };
    })()
  : _dev;
const WIDTH_LABEL = _vp ? `${_vp.split("x")[0]}px` : "390px (iPhone 13)";

// Non-viewport assets: SVG badges, OG PNGs, JSON APIs, markdown alternates.
const EXCLUDE = /^\/(_astro|og|api|badge)\b/;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

function enumerateUrls() {
  const urls = walk(DIST)
    .map((f) => "/" + relative(DIST, f).replace(/index\.html$/, "").replace(/\.html$/, ""))
    .map((u) => (u.length > 1 ? u.replace(/\/$/, "") : u))
    .filter((u) => !EXCLUDE.test(u));

  const groups = {};
  for (const u of urls) {
    const segs = u.split("/").filter(Boolean);
    (groups[(segs[0] || "(root)") + ":" + segs.length] ||= []).push(u);
  }

  // Sample bias: longest slugs (highest content-overflow risk) + shortest + a spread.
  const sample = (arr, cap) => {
    if (arr.length <= cap) return arr;
    const byLen = [...arr].sort((a, b) => b.length - a.length);
    const longest = byLen.slice(0, Math.ceil(cap * 0.4));
    const shortest = byLen.slice(-Math.ceil(cap * 0.2));
    const rest = arr.filter((u) => !longest.includes(u) && !shortest.includes(u));
    const want = cap - longest.length - shortest.length;
    const step = Math.max(1, Math.floor(rest.length / want));
    const spread = [];
    for (let i = 0; i < rest.length && spread.length < want; i += step) spread.push(rest[i]);
    return [...new Set([...longest, ...shortest, ...spread])];
  };

  const out = [];
  for (const [key, arr] of Object.entries(groups)) {
    const cap = key === "can-i-run:3" ? PAIR_CAP : arr.length <= 40 ? arr.length : BIG_CAP;
    out.push(...sample(arr, cap));
  }
  return { urls: [...new Set(out)].sort(), total: urls.length, shapes: Object.keys(groups).length };
}

async function checkPage(browser, url) {
  const ctx = await browser.newContext({ ...CTX_OPTS });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 160)));
  const r = { url, ok: false, status: 0, overflow: null, navHidden: null, bodyLen: 0, worst: null, errors };
  try {
    const resp = await page.goto(BASE + url, { waitUntil: "load", timeout: 25000 });
    r.status = resp ? resp.status() : 0;
    const d = await page.evaluate(() => {
      const el = document.documentElement, vw = el.clientWidth;
      let worst = null, max = vw;
      for (const node of document.querySelectorAll("body *")) {
        const rc = node.getBoundingClientRect();
        if (rc.right > max + 1) {
          let p = node.parentElement, clipped = false;
          while (p && p !== el) {
            if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(p).overflowX)) { clipped = true; break; }
            p = p.parentElement;
          }
          if (!clipped) { max = rc.right; worst = { tag: node.tagName.toLowerCase(), cls: (node.className || "").toString().slice(0, 48), right: Math.round(rc.right) }; }
        }
      }
      const nav = document.querySelector(".gh-nav");
      return { sw: el.scrollWidth, cw: vw, navDisplay: nav ? getComputedStyle(nav).display : "none", bodyLen: document.body.innerText.length, worst };
    });
    r.overflow = d.sw - d.cw;
    r.navHidden = d.navDisplay === "none";
    r.bodyLen = d.bodyLen;
    r.worst = d.worst;
    r.ok = r.status === 200 && r.overflow <= 1 && r.navHidden && r.bodyLen > 200 && errors.length === 0;
    if (!r.ok && r.overflow > 1) {
      mkdirSync(SHOT, { recursive: true });
      await page.screenshot({ path: join(SHOT, url.replace(/\//g, "_").slice(0, 90) + ".png") });
    }
  } catch (e) {
    r.errors = [String(e).slice(0, 180), ...errors];
  }
  await ctx.close();
  return r;
}

// The page-load audit never opens the hamburger, so a dropdown that only breaks
// once expanded slips through (it did: `.glass-lite`'s position tied Tailwind's
// `.absolute`, and the aurora content-lift rule flattened the header's z-index —
// the open panel fell behind the hero and overflowed the viewport). This opens
// the menu and asserts it's a real full-width, on-top, clickable, non-overflowing
// dropdown. The header is one shared component, so a few representative pages cover it.
async function checkMobileMenu(browser, url) {
  const ctx = await browser.newContext({ ...CTX_OPTS });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 160)));
  const out = { url, ok: false, reason: null, errors };
  try {
    await page.goto(BASE + url, { waitUntil: "load", timeout: 25000 });
    const btn = await page.$("#mobile-menu-btn");
    if (!btn) { out.reason = "no #mobile-menu-btn at mobile width"; await ctx.close(); return out; }
    await btn.click();
    const d = await page.evaluate(() => {
      const nav = document.getElementById("mobile-nav");
      if (!nav) return { reason: "no #mobile-nav" };
      const cs = getComputedStyle(nav);
      const r = nav.getBoundingClientRect();
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const links = [...nav.querySelectorAll("a")];
      // every in-view link's centre must hit-test to itself (i.e. nothing paints over it)
      const covered = links.find((a) => {
        const b = a.getBoundingClientRect(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        if (cy < 0 || cy > vh || cx < 0 || cx > vw) return false;
        const t = document.elementFromPoint(cx, cy);
        return !(t && t.closest("#mobile-nav a") === a);
      });
      return {
        display: cs.display, position: cs.position,
        width: Math.round(r.width), rightEdge: Math.round(r.right), vw,
        overflowsRight: r.right > vw + 1, fullWidthish: r.width >= vw * 0.5,
        linkCount: links.length,
        coveredLink: covered ? covered.textContent.trim() : null,
      };
    });
    if (d.reason) { out.reason = d.reason; await ctx.close(); return out; }
    if (d.display === "none") out.reason = "panel did not open (display:none after click)";
    else if (d.position !== "absolute") out.reason = `panel position is ${d.position}, not absolute`;
    else if (d.overflowsRight) out.reason = `panel overflows right edge (right=${d.rightEdge} > vw=${d.vw})`;
    else if (!d.fullWidthish) out.reason = `panel is a narrow strip (${d.width}px of ${d.vw}px)`;
    else if (d.coveredLink) out.reason = `link "${d.coveredLink}" is painted over (stacking)`;
    else if (d.linkCount < 1) out.reason = "panel has no links";
    else if (errors.length) out.reason = "console error: " + errors[0];
    else out.ok = true;
    out.detail = d;
  } catch (e) {
    out.reason = String(e).slice(0, 180);
  }
  await ctx.close();
  return out;
}

async function main() {
  rmSync(SHOT, { recursive: true, force: true });
  const { urls, total, shapes } = enumerateUrls();
  console.log(`Mobile audit @ ${BASE} (${WIDTH_LABEL})`);
  console.log(`${total} HTML pages in ${shapes} route shapes; testing ${urls.length} (every template + sampled parametric).`);

  const browser = await chromium.launch();
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const u = urls[i++];
      results.push(await checkPage(browser, u));
      if (results.length % 50 === 0) console.log(`  ...${results.length}/${urls.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Hamburger / mobile-dropdown check on representative pages (shared header).
  const menuUrls = [
    ...new Set([
      "/",
      urls.find((u) => u.startsWith("/model/")),
      urls.find((u) => u.startsWith("/can-i-run/") && u.split("/").length === 4),
      urls.find((u) => u.startsWith("/leaderboard")),
    ].filter(Boolean)),
  ];
  console.log(`\nChecking mobile hamburger dropdown on ${menuUrls.length} pages...`);
  const menuResults = [];
  for (const u of menuUrls) menuResults.push(await checkMobileMenu(browser, u));
  await browser.close();

  const menuFails = menuResults.filter((m) => !m.ok);
  const fails = results.filter((r) => !r.ok);
  const tally = (pred) => results.filter(pred).length;
  console.log("\n===== MOBILE VALIDATION REPORT =====");
  console.log(`Tested: ${results.length}   PASS: ${results.length - fails.length}   FAIL: ${fails.length}`);
  console.log(`  horizontal overflow:        ${tally((r) => r.overflow != null && r.overflow > 1)}`);
  console.log(`  desktop nav shown on mobile: ${tally((r) => r.navHidden === false)}`);
  console.log(`  console/page errors:         ${tally((r) => r.errors.length > 0)}`);
  console.log(`  non-200 status:              ${tally((r) => r.status !== 200)}`);
  console.log(`  thin/blank body:             ${tally((r) => r.status === 200 && r.bodyLen <= 200)}`);
  console.log(`  hamburger dropdown:          ${menuResults.length - menuFails.length}/${menuResults.length} pages OK`);
  if (fails.length) {
    console.log("\n--- FAILURES ---");
    for (const f of fails.slice(0, 60)) {
      console.log(`  ${f.url}  [status=${f.status}]`);
      if (f.overflow > 1) console.log(`      OVERFLOW +${f.overflow}px  worst=${JSON.stringify(f.worst)}`);
      if (f.navHidden === false) console.log(`      desktop nav not hidden`);
      if (f.bodyLen <= 200) console.log(`      thin body (${f.bodyLen} chars)`);
      if (f.errors.length) console.log(`      ${f.errors.slice(0, 2).join(" | ")}`);
    }
  }
  if (menuFails.length) {
    console.log("\n--- HAMBURGER DROPDOWN FAILURES ---");
    for (const m of menuFails) console.log(`  ${m.url}\n      ${m.reason}`);
  }
  if (fails.length || menuFails.length) {
    process.exitCode = 1;
  } else {
    console.log("\n✓ All sampled pages render cleanly at mobile width; hamburger dropdown OK.");
  }
}

main();
