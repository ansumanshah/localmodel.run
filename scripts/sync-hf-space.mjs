/*
  Sync the Hugging Face Space's data snapshot from the canonical src/data catalog.

  hf-space/app.py is a Python port of the memory engine (mirrors src/lib/compute.ts)
  and reads its own copy of the model + device data. That copy is a snapshot, so it
  drifts as the main catalog grows. Run this before deploying or refreshing the Space
  so its numbers match the live site:

    node scripts/sync-hf-space.mjs   (or: bun run sync:hf-space)
*/
import { copyFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
for (const f of ["models.json", "devices.json"]) {
  copyFileSync(join(root, "src/data", f), join(root, "hf-space", f));
  console.log(`synced hf-space/${f} <- src/data/${f}`);
}
