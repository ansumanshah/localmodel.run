import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Build identity, resolved once at build time. The footer shows the
// package.json version (human-friendly); the commit + date stay as a hover
// tooltip and at /version.json so the exact deploy is still inspectable.

function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function pkgVersion(): string {
  try {
    // cwd is the repo root during `astro build` (locally and on CF Pages),
    // so this resolves correctly even after Vite bundles this module.
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    return (JSON.parse(raw).version as string) || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Format an ISO date ("2026-06-17") as "17 June 2026". Parsed from the string
// parts so it is timezone-safe (no Date() drift across UTC boundaries).
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export function humanDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Semver from package.json — the version users see.
export const BUILD_VERSION = pkgVersion();
// CI exposes the commit as GITHUB_SHA; locally we read git directly.
export const BUILD_COMMIT = (process.env.GITHUB_SHA ?? "").slice(0, 7) || gitShortSha();
export const BUILD_TIME = new Date().toISOString();
export const BUILD_DATE = BUILD_TIME.slice(0, 10);
