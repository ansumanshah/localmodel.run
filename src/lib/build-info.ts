import { execSync } from "node:child_process";

// Build identity, resolved once at build time. Lets us confirm which commit is
// actually live (visible in the footer + machine-readable at /version.json).

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

// CI exposes the commit as GITHUB_SHA; locally we read git directly.
export const BUILD_COMMIT = (process.env.GITHUB_SHA ?? "").slice(0, 7) || gitShortSha();
export const BUILD_TIME = new Date().toISOString();
export const BUILD_DATE = BUILD_TIME.slice(0, 10);
