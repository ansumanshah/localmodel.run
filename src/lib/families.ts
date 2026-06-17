import { models } from "@/lib/data";
import type { ModelRow } from "@/data/types";

// Model-family grouping for the /family lineup pages. A "family" is a set of
// models sharing the `family` field (e.g. "Qwen3"); we only build a page when 3+
// sizes are tracked, so the size-laddering narrative is real, not a stub.

function familySlug(family: string): string {
  return family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface Family {
  name: string;
  slug: string;
  members: ModelRow[]; // sorted small -> large
}

export function families(): Family[] {
  const by = new Map<string, ModelRow[]>();
  for (const m of models) {
    const arr = by.get(m.family) ?? [];
    arr.push(m);
    by.set(m.family, arr);
  }
  const out: Family[] = [];
  for (const [name, members] of by) {
    if (members.length < 3) continue;
    out.push({
      name,
      slug: familySlug(name),
      members: [...members].sort((a, b) => a.params_b - b.params_b),
    });
  }
  // Largest families first (most useful pages, most internal-link weight).
  return out.sort((a, b) => b.members.length - a.members.length);
}
