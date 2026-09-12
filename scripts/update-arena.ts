#!/usr/bin/env bun
/** Refresh the checked-in, revision-pinned LMArena snapshot used by cloud comparison. */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fetchArenaSnapshot } from "../src/lib/arena-snapshot";

const manifestPath = resolve("src/data/cloud-comparison-models.json");
const snapshotPath = resolve("src/data/arena-snapshot.json");

function manifestNames(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("cloud-comparison-models.json must be an array");
  const names = value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry) || typeof entry.arenaName !== "string" || !entry.arenaName.trim())
      throw new Error(`cloud-comparison-models.json row ${index} is missing arenaName`);
    return entry.arenaName;
  });
  if (new Set(names).size !== names.length) throw new Error("cloud-comparison-models.json repeats an arenaName");
  return names;
}

const manifest = JSON.parse(await Bun.file(manifestPath).text()) as unknown;
const snapshot = await fetchArenaSnapshot(manifestNames(manifest));
const destination = dirname(snapshotPath);
const temporaryPath = `${snapshotPath}.${process.pid}.tmp`;

// Write and rename only after the complete remote response has validated. A failed
// import therefore leaves the previous checked-in snapshot untouched.
await mkdir(destination, { recursive: true });
try {
  await writeFile(temporaryPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  await rename(temporaryPath, snapshotPath);
} catch (error) {
  await Bun.file(temporaryPath).delete().catch(() => undefined);
  throw error;
}

console.log(`Wrote ${snapshotPath} (${snapshot.rows.length} selected rows, revision ${snapshot.revision}).`);
