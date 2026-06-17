#!/usr/bin/env node
/**
 * Semantic-only adversarial check: numbers, gating, FAQ, membership, null rendering.
 * Static assets / CSS links excluded from link check (those exist as non-HTML files).
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const models = JSON.parse(readFileSync(join(ROOT, 'src/data/models.json'), 'utf8'));
const devices = JSON.parse(readFileSync(join(ROOT, 'src/data/devices.json'), 'utf8'));
const DIST_FAMILY = join(ROOT, 'dist/family');

const findings = [];
function report(severity, title, evidence, file, fix) {
  findings.push({ severity, title, evidence, file, fix });
}

// --- Reproduce families.ts ---
function familySlug(family) {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const byFamily = new Map();
for (const m of models) {
  const arr = byFamily.get(m.family) ?? [];
  arr.push(m);
  byFamily.set(m.family, arr);
}
const allFamilies = [];
for (const [name, members] of byFamily) {
  allFamilies.push({ name, slug: familySlug(name), members: [...members].sort((a, b) => a.params_b - b.params_b) });
}
const qualifyingFamilies = allFamilies.filter(f => f.members.length >= 3);
const nonQualifyingFamilies = allFamilies.filter(f => f.members.length < 3);

// --- Reproduce compute.ts ---
const BPW = { q4_k_m: 4.89, q8_0: 8.5, fp16: 16 };
const OVERHEAD_GB = 0.8;
const KV_GB_PER_KTOK = 0.06;
const DEFAULT_CONTEXT_K = 4;
function round1(n) { return Math.round(n * 10) / 10; }
function usableGb(device) {
  if (device.usable_memory_gb != null) return device.usable_memory_gb;
  if (device.memory_type === 'unified' && device.category === 'mac') return round1(device.memory_gb * 0.7);
  if (device.memory_type === 'vram') return round1(device.memory_gb - 1);
  return round1(device.memory_gb * 0.6);
}
function weightsGb(model, quant) {
  if (quant === 'q4_k_m' && model.q4_k_m_gb) return model.q4_k_m_gb;
  if (quant === 'q8_0' && model.q8_0_gb) return model.q8_0_gb;
  if (quant === 'fp16' && model.fp16_gb) return model.fp16_gb;
  return round1((model.params_b * BPW[quant]) / 8);
}
function kvCacheGb(model, contextK) {
  return round1(KV_GB_PER_KTOK * Math.sqrt(model.params_b) * contextK);
}
function estimateMemory(model, quant, contextK = DEFAULT_CONTEXT_K) {
  const w = weightsGb(model, quant);
  const kv = kvCacheGb(model, contextK);
  return { weightsGb: w, kvGb: kv, overheadGb: OVERHEAD_GB, totalGb: round1(w + kv + OVERHEAD_GB) };
}
function canRun(model, device, contextK = DEFAULT_CONTEXT_K) {
  const usable = usableGb(device);
  const q4 = estimateMemory(model, 'q4_k_m', contextK);
  if (q4.totalGb > usable) return { verdict: 'no', needed: q4.totalGb, usable };
  const headroom = round1(usable - q4.totalGb);
  const tight = headroom < Math.max(1, usable * 0.1);
  return { verdict: tight ? 'tight' : 'yes', needed: q4.totalGb, usable, headroom };
}

// --- Reproduce budgets.ts ---
const BUDGETS = [8, 16, 24, 32];
const DESKTOP_CATS = new Set(['mac', 'nvidia', 'amd', 'intel', 'laptop']);
const TYPE_ORDER = ['unified', 'vram', 'ram'];
const CAT_PREF = { mac: 0, nvidia: 1, amd: 2, intel: 3, laptop: 4 };
function interpretationsFor(size) {
  const pool = devices.filter(d => d.memory_gb === size && DESKTOP_CATS.has(d.category));
  const out = [];
  for (const t of TYPE_ORDER) {
    const cands = pool
      .filter(d => d.memory_type === t)
      .sort((a, b) =>
        (b.usable_memory_gb ?? 0) - (a.usable_memory_gb ?? 0) ||
        (CAT_PREF[a.category] ?? 9) - (CAT_PREF[b.category] ?? 9) ||
        (a.id < b.id ? 1 : -1)
      );
    if (cands[0]) out.push({ type: t, device: cands[0], usable: cands[0].usable_memory_gb ?? 0 });
  }
  return out;
}
function mostGenerousFor(size) {
  const interps = interpretationsFor(size);
  return interps.reduce((a, b) => (a == null || b.usable > a.usable ? b : a), undefined);
}

function htmlText(f) { return existsSync(f) ? readFileSync(f, 'utf8') : ''; }

// Print anchor device info for context
console.log('=== Budget Anchor Devices ===');
for (const gb of BUDGETS) {
  const a = mostGenerousFor(gb);
  console.log(`  ${gb}GB -> ${a ? `${a.device.id} (usable=${a.usable}GB, type=${a.device.memory_type})` : 'NONE'}`);
}
console.log();

// ===========================================================================
// CHECK A: Membership -- < 3 members should have no page; >= 3 should have page
// ===========================================================================
const distFiles = existsSync(DIST_FAMILY) ? readdirSync(DIST_FAMILY).filter(f => f.endsWith('.html')) : [];
const distSlugs = new Set(distFiles.map(f => f.replace('.html', '')));

console.log('=== Qualifying families ===');
for (const f of qualifyingFamilies) {
  const hasPage = distSlugs.has(f.slug);
  console.log(`  ${f.name} (${f.members.length} members, slug=${f.slug}) -> page: ${hasPage ? 'YES' : 'MISSING'}`);
  if (!hasPage) {
    report('blocker', `Family "${f.name}" has ${f.members.length} members but no page`,
      `dist/family/${f.slug}.html missing`,
      'src/pages/family/[slug].astro',
      'Check getStaticPaths');
  }
}

console.log('\n=== Non-qualifying families (should have no page) ===');
for (const f of nonQualifyingFamilies) {
  const hasPage = distSlugs.has(f.slug);
  if (hasPage) {
    report('blocker', `Family "${f.name}" has ${f.members.length} member(s) but GOT a page`,
      `dist/family/${f.slug}.html exists`,
      `dist/family/${f.slug}.html`,
      'Filter to >= 3 members');
  }
  // Show a few for context
  if (f.members.length === 2) console.log(`  ${f.name} (${f.members.length} members) -> no page: ${!hasPage ? 'OK' : 'WRONG!'}`);
}

console.log();

// ===========================================================================
// CHECK B: Lineup numbers per family -- cross-check HTML vs models.json
// ===========================================================================
console.log('=== Lineup number checks ===\n');
for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) { console.log(`  ${family.name}: NO HTML`); continue; }

  let familyOk = true;

  // Check null rendering
  if (html.includes('Elo null') || html.includes('Elo NaN') || html.includes('Elo undefined')) {
    report('blocker', `${family.name}: arena_elo rendered as null/NaN/undefined`,
      `Found "Elo null/NaN/undefined" in dist HTML`,
      `dist/family/${family.slug}.html`,
      'Guard: {m.arena_elo ? <Elo {m.arena_elo}> : null}');
    familyOk = false;
  }
  if (html.includes('~null') || html.includes('~undefined') || html.includes('~NaN')) {
    report('blocker', `${family.name}: null numeric field rendered literally`,
      `Found "~null", "~undefined", or "~NaN" in dist HTML`,
      `dist/family/${family.slug}.html`,
      'Guard q4_k_m_gb and min_ram_q4_gb before rendering');
    familyOk = false;
  }

  // Per-member number checks
  for (const m of family.members) {
    // params_b must appear
    if (!html.includes(`${m.params_b}B`)) {
      report('high', `${family.name}: member "${m.name}" params_b=${m.params_b}B not found in HTML`,
        `Expected "${m.params_b}B" not found in ${family.slug}.html`,
        `dist/family/${family.slug}.html`,
        'Verify member is in lineup list');
      familyOk = false;
    }

    // q4_k_m_gb: if present in data, must appear in HTML
    if (m.q4_k_m_gb != null) {
      if (!html.includes(`${m.q4_k_m_gb} GB`)) {
        report('high', `${family.name}: member "${m.name}" q4_k_m_gb=${m.q4_k_m_gb} not found`,
          `Expected "${m.q4_k_m_gb} GB" in lineup row for ${m.name}`,
          `dist/family/${family.slug}.html`,
          'Check template: m.q4_k_m_gb ? <>~{m.q4_k_m_gb} GB Q4_K_M</> : null');
        familyOk = false;
      }
    }

    // arena_elo: if present and truthy, must appear
    if (m.arena_elo != null && m.arena_elo > 0) {
      if (!html.includes(`Elo ${m.arena_elo}`)) {
        report('high', `${family.name}: member "${m.name}" arena_elo=${m.arena_elo} not found`,
          `Expected "Elo ${m.arena_elo}" in lineup row for ${m.name}`,
          `dist/family/${family.slug}.html`,
          'Check template renders arena_elo when truthy');
        familyOk = false;
      }
    }
  }

  if (familyOk) console.log(`  ${family.name}: lineup OK`);
}

// ===========================================================================
// CHECK C: Hardware gating -- recompute and verify page content
// ===========================================================================
console.log('\n=== Hardware gating checks ===\n');
for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;

  let gatOk = true;
  for (const gb of BUDGETS) {
    const anchor = mostGenerousFor(gb);
    if (!anchor) {
      report('medium', `No anchor device for ${gb}GB budget`,
        `mostGenerousFor(${gb}) returned undefined`,
        'src/data/devices.json',
        'Add a device entry');
      continue;
    }

    let expectedFit = null;   // largest member with verdict != 'no'
    let expectedComfy = null; // largest member with verdict == 'yes'
    for (const m of family.members) {
      const result = canRun(m, anchor.device);
      if (result.verdict !== 'no') expectedFit = m;
      if (result.verdict === 'yes') expectedComfy = m;
    }

    // The gating section has a block for each budget
    // Find the budget mention and check nearby content
    // The template renders: {g.gb}GB as a link + fit model name + comfy model name

    // Look for expected fit name in HTML
    if (expectedFit) {
      if (!html.includes(expectedFit.name)) {
        report('high', `${family.name}: ${gb}GB gating - largest-that-fits "${expectedFit.name}" not in HTML`,
          `canRun(${expectedFit.id}, ${anchor.device.id}) verdict=${canRun(expectedFit, anchor.device).verdict}. Expected "${expectedFit.name}" (${expectedFit.params_b}B) but not found in page.`,
          `dist/family/${family.slug}.html`,
          'Verify gating loop and fit variable');
        gatOk = false;
      }

      // If comfy != fit, check comfy is shown near the budget
      if (expectedComfy && expectedComfy.id !== expectedFit.id) {
        // The comfy model's name should appear after "Comfortable up to" near that budget
        const comfyPattern = `Comfortable up to ${expectedComfy.name}`;
        if (!html.includes(comfyPattern)) {
          // Could just be that comfy name doesn't appear nearby; let's check if name is at least present
          // The template: g.comfy && g.comfy.id !== g.fit.id ? <>Comfortable up to {g.comfy.name}...</>
          report('medium', `${family.name}: ${gb}GB gating - comfortable "${expectedComfy.name}" not shown`,
            `Expected "Comfortable up to ${expectedComfy.name}" in page. comfy=${expectedComfy.id} fit=${expectedFit.id}`,
            `dist/family/${family.slug}.html`,
            'Check comfy branch in template');
          gatOk = false;
        }
      }
    } else {
      // Nothing fits -- check no-fit message
      const noFitMsg = `No ${family.name} size fits ${gb}GB`;
      if (!html.includes(noFitMsg)) {
        report('low', `${family.name}: ${gb}GB - nothing fits but no-fit message absent`,
          `Expected "${noFitMsg}" in HTML`,
          `dist/family/${family.slug}.html`,
          'Check no-fit branch in template');
        gatOk = false;
      }
    }
  }

  if (gatOk) console.log(`  ${family.name}: gating OK`);
}

// ===========================================================================
// CHECK D: FAQ smallest/largest claims
// ===========================================================================
console.log('\n=== FAQ checks ===\n');
for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;

  const smallest = family.members[0];
  const largest = family.members[family.members.length - 1];
  let faqOk = true;

  // Smallest FAQ
  const smallQ = `What is the smallest ${family.name} model?`;
  if (!html.includes(smallQ)) {
    report('low', `${family.name}: FAQ "smallest" question missing`, `"${smallQ}" not found`, `dist/family/${family.slug}.html`, 'Check FAQ array in template');
  } else {
    const idx = html.indexOf(smallQ);
    const window = html.substring(idx, idx + 800);
    if (!window.includes(smallest.name)) {
      report('high', `${family.name}: FAQ smallest wrong - expected "${smallest.name}"`,
        `FAQ window (800 chars): ${window.replace(/<[^>]+>/g, '').substring(0, 300)}`,
        `dist/family/${family.slug}.html`,
        `Smallest should be ${smallest.name} (${smallest.params_b}B)`);
      faqOk = false;
    }
    // Check q4_k_m_gb in FAQ answer
    if (smallest.q4_k_m_gb != null && !window.includes(`${smallest.q4_k_m_gb}`)) {
      report('medium', `${family.name}: FAQ smallest q4_k_m_gb=${smallest.q4_k_m_gb} missing from answer`,
        `FAQ smallest answer window: ${window.replace(/<[^>]+>/g, '').substring(0, 300)}`,
        `dist/family/${family.slug}.html`,
        'Check FAQ template uses smallest.q4_k_m_gb');
      faqOk = false;
    }
    // Check min_ram_q4_gb
    if (smallest.min_ram_q4_gb != null && !window.includes(`${smallest.min_ram_q4_gb}`)) {
      report('medium', `${family.name}: FAQ smallest min_ram_q4_gb=${smallest.min_ram_q4_gb} missing`,
        `Not found in FAQ smallest answer window`,
        `dist/family/${family.slug}.html`,
        'Check FAQ template uses smallest.min_ram_q4_gb');
      faqOk = false;
    }
  }

  // Largest FAQ
  const largestQ = `What is the largest ${family.name} model`;
  if (!html.includes(largestQ)) {
    report('low', `${family.name}: FAQ "largest" question missing`, `"${largestQ}" not found`, `dist/family/${family.slug}.html`, 'Check FAQ array in template');
  } else {
    const idx = html.indexOf(largestQ);
    const window = html.substring(idx, idx + 800);
    if (!window.includes(largest.name)) {
      report('high', `${family.name}: FAQ largest wrong - expected "${largest.name}"`,
        `FAQ window (800 chars): ${window.replace(/<[^>]+>/g, '').substring(0, 300)}`,
        `dist/family/${family.slug}.html`,
        `Largest should be ${largest.name} (${largest.params_b}B)`);
      faqOk = false;
    }
    if (largest.q4_k_m_gb != null && !window.includes(`${largest.q4_k_m_gb}`)) {
      report('medium', `${family.name}: FAQ largest q4_k_m_gb=${largest.q4_k_m_gb} missing from answer`,
        `Not found in FAQ largest answer window`,
        `dist/family/${family.slug}.html`,
        'Check FAQ template uses largest.q4_k_m_gb');
      faqOk = false;
    }
    if (largest.min_ram_q4_gb != null && !window.includes(`${largest.min_ram_q4_gb}`)) {
      report('medium', `${family.name}: FAQ largest min_ram_q4_gb=${largest.min_ram_q4_gb} missing`,
        `Not found in FAQ largest answer window`,
        `dist/family/${family.slug}.html`,
        'Check FAQ template uses largest.min_ram_q4_gb');
      faqOk = false;
    }
  }

  if (faqOk) console.log(`  ${family.name}: FAQ OK`);
}

// ===========================================================================
// CHECK E: Internal links to /model/* and /can-i-run/* resolve in dist
// ===========================================================================
console.log('\n=== Internal link checks (model/* and can-i-run/* only) ===\n');
const DIST_ROOT = join(ROOT, 'dist');

function distPageExists(relPath) {
  // relPath like /model/llama-3.1-8b or /can-i-run/foo/bar
  const asHtml = join(DIST_ROOT, relPath + '.html');
  const asIndex = join(DIST_ROOT, relPath, 'index.html');
  const asFile = join(DIST_ROOT, relPath.replace(/^\//, ''));
  return existsSync(asHtml) || existsSync(asIndex) || existsSync(asFile);
}

for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;

  // Extract /model/* and /can-i-run/* links
  const re = /href="(\/(?:model|can-i-run|family|best-llm-for-ram)[^"#?]*)"/g;
  let m;
  const broken = [];
  while ((m = re.exec(html)) !== null) {
    const link = m[1];
    if (!distPageExists(link)) {
      broken.push(link);
    }
  }

  if (broken.length) {
    for (const b of broken) {
      report('high', `${family.name}: broken internal link "${b}"`,
        `href="${b}" in ${family.slug}.html - no dist page found`,
        `dist/family/${family.slug}.html`,
        'Verify model IDs in lineup and gating match actual model IDs in models.json');
    }
  } else {
    console.log(`  ${family.name}: all internal links OK`);
  }
}

// ===========================================================================
// CHECK F: Em-dash and slop words
// ===========================================================================
console.log('\n=== Style checks ===\n');
const EM_DASH_PATTERNS = ['—', '&mdash;', '&#8212;'];
const SLOP_WORDS = ['delve', 'leverage', 'robust', 'seamless', 'journey', 'unlock', 'game-changer'];

for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;
  let styleOk = true;

  for (const pat of EM_DASH_PATTERNS) {
    if (html.includes(pat)) {
      const idx = html.indexOf(pat);
      // Get text context (strip tags)
      const ctx = html.substring(Math.max(0, idx - 80), idx + 80)
        .replace(/<[^>]+>/g, '').trim();
      report('medium', `${family.name}: em-dash "${pat}" found`,
        `Context: ...${ctx}...`,
        `dist/family/${family.slug}.html`,
        'Remove em-dash from template copy');
      styleOk = false;
    }
  }

  // Only check in visible text content, not script/style/JSON-LD
  // Strip script and style blocks first
  const visibleHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  for (const slop of SLOP_WORDS) {
    if (visibleHtml.toLowerCase().includes(slop.toLowerCase())) {
      const idx = visibleHtml.toLowerCase().indexOf(slop.toLowerCase());
      const ctx = visibleHtml.substring(Math.max(0, idx - 40), idx + 60)
        .replace(/<[^>]+>/g, '').trim();
      report('low', `${family.name}: slop word "${slop}" in visible content`,
        `Context: ...${ctx}...`,
        `dist/family/${family.slug}.html`,
        `Replace "${slop}" with plainer language`);
      styleOk = false;
    }
  }

  if (styleOk) console.log(`  ${family.name}: style OK`);
}

// ===========================================================================
// CHECK G: Family member miscategorisation
// Cross-check: do any models have a family field that would produce a
// different slug from the family they appear under?
// (The template pulls from the family field directly, so this is about
//  whether the family field in data is self-consistent)
// ===========================================================================
console.log('\n=== Miscategorisation checks ===\n');
// For each qualifying family, verify all members have the same family field
for (const family of qualifyingFamilies) {
  const uniqueFamilies = [...new Set(family.members.map(m => m.family))];
  if (uniqueFamilies.length !== 1 || uniqueFamilies[0] !== family.name) {
    report('blocker', `${family.name}: members have mismatched family fields`,
      `Members have family values: ${uniqueFamilies.join(', ')}`,
      'src/data/models.json',
      'Ensure all family members have exactly family="' + family.name + '"');
  } else {
    console.log(`  ${family.name}: family field consistent (all ${family.members.length} members)`);
  }
}

// ===========================================================================
// CHECK H: sizeRange stat-grid consistency
// The page shows "Smallest: {smallest.params_b}B" and "Largest: {largest.params_b}B"
// These should match the actual min/max params_b in the family
// ===========================================================================
console.log('\n=== Stat grid checks ===\n');
for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;

  const smallest = family.members[0];
  const largest = family.members[family.members.length - 1];

  // The stat grid renders: {smallest.params_b}B and {largest.params_b}B
  // with labels "Smallest" and "Largest"
  const smallestLabel = `Smallest`;
  const largestLabel = `Largest`;

  // Find the stat block
  const smallIdx = html.indexOf(smallestLabel);
  const largeIdx = html.indexOf(largestLabel);

  if (smallIdx >= 0) {
    const ctx = html.substring(smallIdx, smallIdx + 200).replace(/<[^>]+>/g, '').trim();
    if (!ctx.includes(`${smallest.params_b}B`)) {
      report('high', `${family.name}: stat-grid "Smallest" value wrong`,
        `Expected ${smallest.params_b}B. Context: ${ctx.substring(0, 100)}`,
        `dist/family/${family.slug}.html`,
        `Smallest member by params_b is ${smallest.name}=${smallest.params_b}B`);
    } else {
      console.log(`  ${family.name}: smallest=${smallest.params_b}B OK`);
    }
  }
  if (largeIdx >= 0) {
    const ctx = html.substring(largeIdx, largeIdx + 200).replace(/<[^>]+>/g, '').trim();
    if (!ctx.includes(`${largest.params_b}B`)) {
      report('high', `${family.name}: stat-grid "Largest" value wrong`,
        `Expected ${largest.params_b}B. Context: ${ctx.substring(0, 100)}`,
        `dist/family/${family.slug}.html`,
        `Largest member by params_b is ${largest.name}=${largest.params_b}B`);
    }
  }
}

// ===========================================================================
// Print detailed ground truth for manual verification
// ===========================================================================
console.log('\n=== Ground truth: gating per family per budget ===\n');
for (const family of qualifyingFamilies) {
  console.log(`${family.name} (${family.members.map(m => `${m.params_b}B`).join(', ')}):`);
  for (const gb of BUDGETS) {
    const anchor = mostGenerousFor(gb);
    if (!anchor) { console.log(`  ${gb}GB: no anchor`); continue; }
    let fit = null, comfy = null;
    for (const m of family.members) {
      const r = canRun(m, anchor.device);
      if (r.verdict !== 'no') fit = m;
      if (r.verdict === 'yes') comfy = m;
    }
    const detail = fit
      ? `fit=${fit.name}(${fit.params_b}B) comfy=${comfy ? comfy.name + '(' + comfy.params_b + 'B)' : 'none'}`
      : `nothing fits`;
    console.log(`  ${gb}GB [${anchor.device.id}, usable=${anchor.usable}GB]: ${detail}`);
  }
  console.log();
}

// ===========================================================================
// Summary
// ===========================================================================
console.log('\n=== Final Findings ===\n');
const bySev = { blocker: [], high: [], medium: [], low: [] };
for (const f of findings) bySev[f.severity].push(f);
let total = 0;
for (const [sev, list] of Object.entries(bySev)) {
  if (list.length) {
    console.log(`--- ${sev.toUpperCase()} (${list.length}) ---`);
    for (const f of list) {
      console.log(`  [${sev}] ${f.title}`);
      console.log(`    evidence: ${f.evidence}`);
      console.log(`    file: ${f.file}`);
      if (f.fix) console.log(`    fix: ${f.fix}`);
      console.log();
    }
    total += list.length;
  }
}
if (total === 0) console.log('No real defects found.');
else console.log(`Total findings: ${total}`);
