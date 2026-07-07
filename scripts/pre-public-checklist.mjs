/*
  Pre-public / OSS-release gate. Run before flipping the repo public (e.g. for a
  Show HN) so nothing private or secret ships:

    node scripts/pre-public-checklist.mjs   (or: bun run check:public)

  A competitor's HN launch tanked partly because users found an AI-authored
  marketing file in its git history. This asserts: no env/secret files tracked,
  no private agent notes tracked, the right dirs are gitignored, and no obvious
  secret token patterns sit in tracked content. Exits 1 on any hard failure.

  NOTE (manual, can't be scripted from here): before going public, swap the
  GitHub Actions CLOUDFLARE_API_TOKEN secret for a Cache-Purge-only token
  (Cloudflare dashboard: My Profile > API Tokens > Create Token > Zone: Cache
  Purge only) so a CI leak can't touch DNS.
*/
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const fail = [];
const warn = [];

const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const tracked = git("ls-files").split("\n").filter(Boolean);

// 1. Paths that must never be tracked in an OSS repo.
const FORBIDDEN = [
  /^\.env$/,
  /^\.env\..+/,
  /^\.claude\//,
  /^\.agents\//,
  /^\.research\//,
  /^\.design-sync\//,
  /(^|\/)skills-lock\.json$/,
  /(^|\/)(BRIEFING|HANDOFF|handoff|todo|TODO)\.md$/,
];
for (const f of tracked) {
  if (FORBIDDEN.some((re) => re.test(f))) fail.push(`tracked file should be private/gitignored: ${f}`);
}

// 2. The private dirs must actually be gitignored (so they can't re-enter).
// .research and .design-sync now live under .claude/ (covered by the .claude/
// ignore); the FORBIDDEN entries above still guard against a root copy of either
// reappearing and getting tracked.
for (const dir of [".claude", ".agents"]) {
  try {
    git(`check-ignore ${dir}/x`);
  } catch {
    warn.push(`${dir}/ is not gitignored (add it so private notes never get committed)`);
  }
}

// 3. Obvious secret patterns in tracked text content.
const SECRET = [
  { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub PAT", re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: "GitHub fine-grained PAT", re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "generic assigned secret", re: /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i },
];
for (const f of tracked) {
  if (/\.(png|jpg|jpeg|woff2?|ico|svg|gif|webp|pdf|lock)$/i.test(f)) continue;
  let body;
  try {
    if (statSync(f).size > 512 * 1024) continue; // skip large data blobs
    body = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const s of SECRET) {
    if (s.re.test(body)) fail.push(`possible ${s.name} in ${f}`);
  }
}

// ---- Report -------------------------------------------------------------
console.log(`\nPre-public checklist — ${tracked.length} tracked files scanned\n`);
for (const w of warn) console.log(`!  ${w}`);
for (const f of fail) console.log(`✗  ${f}`);

if (fail.length === 0 && warn.length === 0) {
  console.log("✓ Clean: no private files, secrets, or missing ignores.\n");
} else {
  console.log("");
}
console.log("Reminder: swap the CI CLOUDFLARE_API_TOKEN for a Cache-Purge-only token before going public.\n");

process.exit(fail.length > 0 ? 1 : 0);
