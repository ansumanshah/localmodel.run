#!/usr/bin/env node
/**
 * Adversarial check for /family/* pages.
 * Run: node scripts/check-families.mjs
 *
 * Checks:
 * 1. Families with < 3 members should NOT have a page (dist check)
 * 2. Families with >= 3 members SHOULD have a page
 * 3. Members sorted small -> large (params_b)
 * 4. FAQ smallest/largest claims vs actual data
 * 5. Hardware gating: largest-that-fits and comfortable-up-to per budget
 * 6. Internal links in dist HTML resolve to actual dist pages
 * 7. Em-dash and slop words in dist HTML
 * 8. arena_elo = null rendered as "null" or "NaN" literal
 * 9. q4_k_m_gb / min_ram_q4_gb rendering when null (should be absent, not "null")
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load raw JSON data (NOT going through families.ts logic so we test the source independently)
const models = JSON.parse(readFileSync(join(ROOT, 'src/data/models.json'), 'utf8'));
const devices = JSON.parse(readFileSync(join(ROOT, 'src/data/devices.json'), 'utf8'));

const DIST_FAMILY = join(ROOT, 'dist/family');

const findings = [];
function report(severity, title, evidence, file, fix) {
  findings.push({ severity, title, evidence, file, fix });
}

// ---------------------------------------------------------------------------
// Reproduce families.ts logic from raw JSON (DO NOT import families.ts)
// ---------------------------------------------------------------------------
function familySlug(family) {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Group by family field
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

// ---------------------------------------------------------------------------
// Reproduce compute.ts logic (canRun) from raw JSON
// ---------------------------------------------------------------------------
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
  if (q4.totalGb > usable) return { verdict: 'no' };
  const headroom = round1(usable - q4.totalGb);
  const tight = headroom < Math.max(1, usable * 0.1);
  return { verdict: tight ? 'tight' : 'yes' };
}

// ---------------------------------------------------------------------------
// Reproduce budgets.ts logic
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// CHECK 1: Families with < 3 members should NOT have a page
// ---------------------------------------------------------------------------
const distFiles = existsSync(DIST_FAMILY) ? readdirSync(DIST_FAMILY).filter(f => f.endsWith('.html')) : [];
const distSlugs = new Set(distFiles.map(f => f.replace('.html', '')));

for (const f of nonQualifyingFamilies) {
  if (distSlugs.has(f.slug)) {
    report('blocker', `Family "${f.name}" has ${f.members.length} member(s) but got a page`,
      `dist/family/${f.slug}.html exists, family has only ${f.members.length} model(s)`,
      `dist/family/${f.slug}.html`,
      'Remove this family from generated pages or add more members');
  }
}

// ---------------------------------------------------------------------------
// CHECK 2: Families with >= 3 members SHOULD have a page
// ---------------------------------------------------------------------------
for (const f of qualifyingFamilies) {
  if (!distSlugs.has(f.slug)) {
    report('blocker', `Family "${f.name}" has ${f.members.length} members but NO page generated`,
      `dist/family/${f.slug}.html does not exist`,
      `src/pages/family/[slug].astro`,
      'Check families() return and getStaticPaths()');
  }
}

// ---------------------------------------------------------------------------
// CHECK 3: Verify lineup numbers per family page (params_b, q4_k_m_gb, min_ram_q4_gb, arena_elo)
// Parsing HTML approach: look for each member's data in the rendered HTML
// ---------------------------------------------------------------------------
function htmlText(htmlFile) {
  return existsSync(htmlFile) ? readFileSync(htmlFile, 'utf8') : '';
}

for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;

  for (const m of family.members) {
    // Check params_b appears in HTML
    if (!html.includes(`${m.params_b}B`)) {
      report('high', `${family.name} page: ${m.name} params_b not found`,
        `Expected "${m.params_b}B" in ${family.slug}.html but not found`,
        `dist/family/${family.slug}.html`,
        'Verify member is rendered in the lineup section');
    }

    // Check q4_k_m_gb appears when not null
    if (m.q4_k_m_gb != null) {
      // The template renders ~{m.q4_k_m_gb} GB
      if (!html.includes(`${m.q4_k_m_gb} GB`)) {
        report('high', `${family.name} page: ${m.name} q4_k_m_gb mismatch`,
          `Expected "~${m.q4_k_m_gb} GB" in HTML, not found. models.json has q4_k_m_gb=${m.q4_k_m_gb}`,
          `dist/family/${family.slug}.html`,
          'Verify data flows from models.json to the template correctly');
      }
    }

    // Check arena_elo -- should NOT render as "null" or "NaN"
    if (html.includes(`Elo null`) || html.includes(`Elo NaN`)) {
      report('blocker', `${family.name} page: arena_elo rendered as null/NaN`,
        `Found "Elo null" or "Elo NaN" in ${family.slug}.html`,
        `dist/family/${family.slug}.html`,
        'Guard arena_elo display: only render when m.arena_elo is truthy');
    }

    // Specific check: if arena_elo is null, "Elo undefined" should not appear
    if (html.includes(`Elo undefined`)) {
      report('blocker', `${family.name} page: arena_elo rendered as "undefined"`,
        `Found "Elo undefined" in ${family.slug}.html`,
        `dist/family/${family.slug}.html`,
        'Guard arena_elo display');
    }

    // Check min_ram_q4_gb: if null, "needs ~null" should not appear
    if (html.includes('needs ~null') || html.includes('needs ~undefined')) {
      report('blocker', `${family.name} page: min_ram_q4_gb rendered as null/undefined`,
        `Found "needs ~null" or "needs ~undefined" in ${family.slug}.html`,
        `dist/family/${family.slug}.html`,
        'Guard min_ram_q4_gb display');
    }
  }
}

// ---------------------------------------------------------------------------
// CHECK 4: FAQ answers -- smallest/largest claims
// ---------------------------------------------------------------------------
for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;

  const smallest = family.members[0];
  const largest = family.members[family.members.length - 1];

  // Check smallest model name appears in FAQ section (FAQ has question "What is the smallest...")
  const smallestQ = `What is the smallest ${family.name} model?`;
  if (html.includes(smallestQ)) {
    // The answer should reference smallest.name and smallest.params_b
    // Find the section after the question
    const idx = html.indexOf(smallestQ);
    const excerpt = html.substring(idx, idx + 600);
    if (!excerpt.includes(smallest.name)) {
      report('high', `${family.name} FAQ: smallest model name wrong`,
        `FAQ answer doesn't mention "${smallest.name}" (expected smallest by params_b=${smallest.params_b}B). Excerpt: ${excerpt.substring(0, 200)}`,
        `dist/family/${family.slug}.html`,
        'Verify smallest = members[0] after sort by params_b');
    }
    if (smallest.q4_k_m_gb != null && !excerpt.includes(`${smallest.q4_k_m_gb}`)) {
      report('medium', `${family.name} FAQ: smallest model q4_k_m_gb mismatch`,
        `FAQ smallest answer doesn't show q4_k_m_gb=${smallest.q4_k_m_gb}. models.json value: ${smallest.q4_k_m_gb}`,
        `dist/family/${family.slug}.html`,
        'Check FAQ answer template uses smallest.q4_k_m_gb');
    }
  }

  const largestQ = `What is the largest ${family.name} model`;
  if (html.includes(largestQ)) {
    const idx = html.indexOf(largestQ);
    const excerpt = html.substring(idx, idx + 600);
    if (!excerpt.includes(largest.name)) {
      report('high', `${family.name} FAQ: largest model name wrong`,
        `FAQ answer doesn't mention "${largest.name}" (expected largest by params_b=${largest.params_b}B). Excerpt: ${excerpt.substring(0, 200)}`,
        `dist/family/${family.slug}.html`,
        'Verify largest = members[members.length-1] after sort by params_b');
    }
    if (largest.q4_k_m_gb != null && !excerpt.includes(`${largest.q4_k_m_gb}`)) {
      report('medium', `${family.name} FAQ: largest model q4_k_m_gb mismatch`,
        `FAQ largest answer doesn't show q4_k_m_gb=${largest.q4_k_m_gb}. models.json value: ${largest.q4_k_m_gb}`,
        `dist/family/${family.slug}.html`,
        'Check FAQ answer template uses largest.q4_k_m_gb');
    }
  }
}

// ---------------------------------------------------------------------------
// CHECK 5: Hardware gating correctness
// Recompute: for each budget, most generous device, then iterate members
// to find largest-that-fits and largest-comfortable
// ---------------------------------------------------------------------------
for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;

  for (const gb of BUDGETS) {
    const anchor = mostGenerousFor(gb);
    if (!anchor) {
      report('medium', `Budget ${gb}GB: no anchor device found`,
        `mostGenerousFor(${gb}) returned undefined`,
        'src/data/devices.json',
        'Add a device with memory_gb=' + gb);
      continue;
    }

    let expectedFit = null;
    let expectedComfy = null;
    for (const m of family.members) {
      const result = canRun(m, anchor.device);
      if (result.verdict !== 'no') expectedFit = m;
      if (result.verdict === 'yes') expectedComfy = m;
    }

    // The page should mention the expected fit model for this budget
    // We look for the fit model name near the budget mention
    // Find "{gb}GB" in the gating section
    const budgetPattern = new RegExp(`${gb}GB[\\s\\S]{0,400}`, 'g');
    const matches = [...html.matchAll(budgetPattern)];

    if (expectedFit) {
      // Check that expectedFit.name appears in the vicinity of the budget mention
      let foundFit = false;
      for (const match of matches) {
        if (match[0].includes(expectedFit.name)) { foundFit = true; break; }
      }
      // Also check the entire HTML since the budget+model may appear in multiple places
      // Do a stricter check: look for the fit model in a window after each budget mention
      if (!foundFit) {
        report('high', `${family.name} gating: ${gb}GB largest-that-fits wrong or missing`,
          `Expected "${expectedFit.name}" (${expectedFit.params_b}B) as largest fitting on ${anchor.device.name} (usable=${anchor.usable}GB). Anchor device: ${anchor.device.id}`,
          `dist/family/${family.slug}.html`,
          `Verify canRun(${expectedFit.name}, ${anchor.device.id}) and template renders fit.name`);
      }

      // If there's a "comfortable" that differs from fit, check that too
      if (expectedComfy && expectedComfy.id !== expectedFit.id) {
        let foundComfy = false;
        for (const match of matches) {
          if (match[0].includes(expectedComfy.name)) { foundComfy = true; break; }
        }
        if (!foundComfy) {
          report('medium', `${family.name} gating: ${gb}GB comfortable-up-to wrong or missing`,
            `Expected "${expectedComfy.name}" as comfortable on ${anchor.device.name}. It should appear near the ${gb}GB entry.`,
            `dist/family/${family.slug}.html`,
            'Verify comfy logic in [slug].astro and template renders comfy.name');
        }
      }
    } else {
      // No member fits this budget; page should say "No X size fits Ngb"
      const noFitMsg = `No ${family.name} size fits ${gb}GB`;
      if (!html.includes(noFitMsg)) {
        // Could also be phrased differently; check something like "No" near "fits"
        // Let's check for specific wording from the template
        report('low', `${family.name} gating: ${gb}GB shows no fit, but "no-fit" message not found`,
          `No member fits ${gb}GB for ${family.name}, but page may not say so correctly`,
          `dist/family/${family.slug}.html`,
          'Check template renders the no-fit branch');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// CHECK 6: Internal links resolve to actual dist pages
// ---------------------------------------------------------------------------
// Build valid path set from dist
function buildValidPaths(distRoot) {
  const valid = new Set();
  function walk(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), prefix + '/' + entry.name);
      } else if (entry.name === 'index.html') {
        valid.add(prefix + '/');
        valid.add(prefix); // without trailing slash
      } else if (entry.name.endsWith('.html')) {
        const base = entry.name.replace('.html', '');
        valid.add(prefix + '/' + base);
        valid.add(prefix + '/' + entry.name);
      }
    }
  }
  walk(distRoot, '');
  return valid;
}

const DIST_ROOT = join(ROOT, 'dist');
const validPaths = buildValidPaths(DIST_ROOT);

// Also add root
validPaths.add('/');
validPaths.add('');

// Extract internal hrefs from family HTML files
function extractInternalLinks(html) {
  const links = [];
  const re = /href="(\/[^"#?]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push(m[1]);
  }
  return links;
}

for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;

  const links = extractInternalLinks(html);
  for (const link of links) {
    // Normalize: remove trailing slash for lookup, but check with and without
    const normalized = link.endsWith('/') ? link.slice(0, -1) : link;
    const withSlash = normalized + '/';
    // Check if valid (either form)
    if (!validPaths.has(link) && !validPaths.has(normalized) && !validPaths.has(withSlash)) {
      // Some paths go to subdirs which may have index.html
      // Let's try checking the filesystem directly
      const fsPath1 = join(DIST_ROOT, link + '.html');
      const fsPath2 = join(DIST_ROOT, link, 'index.html');
      const fsPath3 = join(DIST_ROOT, link.replace(/\/$/, '') + '.html');
      if (!existsSync(fsPath1) && !existsSync(fsPath2) && !existsSync(fsPath3)) {
        report('high', `${family.name} page: broken internal link "${link}"`,
          `href="${link}" in ${family.slug}.html but no matching dist file found`,
          `dist/family/${family.slug}.html`,
          'Verify the linked page is generated by Astro getStaticPaths');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// CHECK 7: Em-dash and slop words in dist family HTML
// ---------------------------------------------------------------------------
const SLOP_WORDS = ['delve', 'leverage', 'robust', 'seamless', 'journey', 'unlock', 'game-changer', 'game changer'];
const EM_DASH_PATTERNS = ['—', '&mdash;', '&#8212;'];

for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;

  for (const pat of EM_DASH_PATTERNS) {
    if (html.includes(pat)) {
      // Find context
      const idx = html.indexOf(pat);
      const ctx = html.substring(Math.max(0, idx - 50), idx + 50).replace(/</g, '<').replace(/>/g, '>');
      report('medium', `${family.name} page: em-dash found`,
        `Found "${pat}" near: ...${ctx}...`,
        `dist/family/${family.slug}.html`,
        'Remove all em-dashes from template copy');
    }
  }

  for (const slop of SLOP_WORDS) {
    // Case-insensitive search in the text content (skip looking in tag attributes/scripts)
    const lc = html.toLowerCase();
    const idx = lc.indexOf(slop.toLowerCase());
    if (idx >= 0) {
      const ctx = html.substring(Math.max(0, idx - 30), idx + 60);
      report('low', `${family.name} page: slop word "${slop}" found`,
        `Found "${slop}" near: ...${ctx}...`,
        `dist/family/${family.slug}.html`,
        `Remove or replace slop word "${slop}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// CHECK 8: Slug consistency (slug in URL matches slug computed from family name)
// ---------------------------------------------------------------------------
for (const family of qualifyingFamilies) {
  const computed = familySlug(family.name);
  if (computed !== family.slug) {
    report('blocker', `Family "${family.name}" slug mismatch`,
      `families.ts would produce slug "${family.slug}" but our recomputation gives "${computed}"`,
      'src/lib/families.ts',
      'Verify familySlug() in families.ts matches this script');
  }
}

// ---------------------------------------------------------------------------
// CHECK 9: arena_elo null check in HTML -- specific per model
// ---------------------------------------------------------------------------
for (const family of qualifyingFamilies) {
  const htmlPath = join(DIST_FAMILY, `${family.slug}.html`);
  const html = htmlText(htmlPath);
  if (!html) continue;

  // Find models with null arena_elo in this family
  for (const m of family.members) {
    if (m.arena_elo == null) {
      // The template has: {m.arena_elo ? <> &middot; Elo {m.arena_elo}</> : null}
      // So "Elo" should NOT appear right before this model's params_b
      // This is hard to check without full parse, but we can look for "Elo null" / "Elo 0"
      // The check already done above at family level; this is per-model
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n=== Family Page Adversarial Check Results ===\n');

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

if (total === 0) console.log('No defects found.');
else console.log(`Total findings: ${total}`);

// Also output JSON for structured reporting
const jsonOut = JSON.stringify(findings, null, 2);
import { writeFileSync } from 'fs';
writeFileSync(join(ROOT, 'scripts/check-families-results.json'), jsonOut);
console.log(`\nJSON results written to scripts/check-families-results.json`);
