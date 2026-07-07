// Bump the package.json patch version, in place, touching only the version line
// (a targeted string replace, so inline arrays like `keywords` stay formatted and
// the diff is one line). Wired as the .githooks/pre-commit hook so every commit
// carries a version bump: the footer and /version.json read package.json, so the
// live version tracks each shipped change. Run manually: `node scripts/bump-version.mjs`.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../package.json", import.meta.url);
const src = readFileSync(path, "utf8");

const m = src.match(/("version":\s*")(\d+)\.(\d+)\.(\d+)(")/);
if (!m) {
  console.error("bump-version: could not find a x.y.z version field in package.json");
  process.exit(1);
}

const [maj, min, patch] = [m[2], m[3], String(Number(m[4]) + 1)];
const next = `${maj}.${min}.${patch}`;
writeFileSync(path, src.replace(m[0], `${m[1]}${next}${m[5]}`));
console.log(`version -> ${next}`);
