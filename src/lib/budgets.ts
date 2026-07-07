import { devices } from "@/lib/data";
import type { DeviceRow, MemoryType } from "@/data/types";

// Shared memory-budget anchoring. "16 GB" is not one number: a Mac, a GPU and a
// CPU laptop each expose a different usable pool. Every budget-based surface
// (RAM-budget pages, family hardware-gating) anchors to the SAME real, sourced
// devices through here, so there is one source of truth and no drift.

// Each budget must have at least one REAL sourced desktop device at that exact
// size (interpretationsFor filters on memory_gb === size). 48/64/128/256 are the
// high-memory Mac tiers (Apple's only configs at those sizes); no GPU/CPU rows
// exist there, so those pages render a single unified interpretation.
export const BUDGETS = [8, 16, 24, 32, 48, 64, 128, 256] as const;

const DESKTOP_CATS = new Set(["mac", "nvidia", "amd", "intel", "laptop"]);
const TYPE_ORDER: MemoryType[] = ["unified", "vram", "ram"];
const CAT_PREF: Record<string, number> = { mac: 0, nvidia: 1, amd: 2, intel: 3, laptop: 4 };

export const TYPE_LABEL: Record<MemoryType, string> = {
  unified: "Apple unified memory",
  vram: "GPU VRAM",
  ram: "System RAM (CPU only)",
};
export const TYPE_SHORT: Record<MemoryType, string> = {
  unified: "Mac",
  vram: "GPU",
  ram: "Laptop",
};

export interface Interp {
  type: MemoryType;
  device: DeviceRow;
  usable: number;
}

/** Representative desktop device per memory type at a given size. Highest usable
 *  wins, ties broken by category preference then newest id, so the pick is
 *  stable and survives a cron data refresh without code edits. */
export function interpretationsFor(size: number): Interp[] {
  const pool = devices.filter((d) => d.memory_gb === size && DESKTOP_CATS.has(d.category));
  const out: Interp[] = [];
  for (const t of TYPE_ORDER) {
    const cands = pool
      .filter((d) => d.memory_type === t)
      .sort(
        (a, b) =>
          (b.usable_memory_gb ?? 0) - (a.usable_memory_gb ?? 0) ||
          (CAT_PREF[a.category] ?? 9) - (CAT_PREF[b.category] ?? 9) ||
          (a.id < b.id ? 1 : -1),
      );
    if (cands[0]) out.push({ type: t, device: cands[0], usable: cands[0].usable_memory_gb ?? 0 });
  }
  return out;
}

/** The most capable reading of a size (most usable memory), e.g. the GPU at 16GB. */
export function mostGenerousFor(size: number): Interp | undefined {
  const interps = interpretationsFor(size);
  return interps.reduce<Interp | undefined>(
    (a, b) => (a == null || b.usable > a.usable ? b : a),
    undefined,
  );
}
