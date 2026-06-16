import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
    const path = fileURLToPath(new URL("../../package.json", import.meta.url));
    return (JSON.parse(readFileSync(path, "utf8")).version as string) || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Semver from package.json — the version users see.
export const BUILD_VERSION = pkgVersion();
// CI exposes the commit as GITHUB_SHA; locally we read git directly.
export const BUILD_COMMIT = (process.env.GITHUB_SHA ?? "").slice(0, 7) || gitShortSha();
export const BUILD_TIME = new Date().toISOString();
export const BUILD_DATE = BUILD_TIME.slice(0, 10);
