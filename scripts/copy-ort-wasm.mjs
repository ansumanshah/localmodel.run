// Copies the onnxruntime WASM runtimes the playground needs into public/ort/
// so /browser pages never load them from cdn.jsdelivr.net (blocked in some
// regions, and one less third-party in the CSP). Runs before astro build/dev;
// public/ort/ is gitignored, so the copies always match the installed deps.
//
// Two directories because two independent transformers.js instances run on
// the site, each pinning a different onnxruntime-web:
//   /ort/v4/     - the site's @huggingface/transformers 4.x (chat, asr, rmbg,
//                  embed, vlm). Its runtime picks the asyncify build, or the
//                  plain build on Safari; both pairs are copied.
//   /ort/kokoro/ - kokoro-js's bundled transformers 3.x (tts), which ships
//                  its own jsep pair inside its dist folder.
//
// HARD-FAILS if any source file is missing: the runners point at these paths
// unconditionally, so a silently skipped copy would 404 the playground.

import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

// Both packages seal package.json behind their exports maps, so resolve the
// main entry (which lives in dist/) and take its directory.
const ortV4Dist = dirname(require.resolve("onnxruntime-web"));
// kokoro-js's nested transformers; resolve through kokoro-js so a hoisting
// change breaks loudly here instead of silently resolving the wrong version.
const kokoroRequire = createRequire(require.resolve("kokoro-js"));
const kokoroTransformersDist = dirname(kokoroRequire.resolve("@huggingface/transformers"));

const COPIES = [
  { from: ortV4Dist, to: "v4", file: "ort-wasm-simd-threaded.asyncify.mjs" },
  { from: ortV4Dist, to: "v4", file: "ort-wasm-simd-threaded.asyncify.wasm" },
  { from: ortV4Dist, to: "v4", file: "ort-wasm-simd-threaded.mjs" },
  { from: ortV4Dist, to: "v4", file: "ort-wasm-simd-threaded.wasm" },
  { from: kokoroTransformersDist, to: "kokoro", file: "ort-wasm-simd-threaded.jsep.mjs" },
  { from: kokoroTransformersDist, to: "kokoro", file: "ort-wasm-simd-threaded.jsep.wasm" },
];

for (const { from, to, file } of COPIES) {
  const dest = join(root, "public/ort", to);
  await mkdir(dest, { recursive: true });
  await copyFile(join(from, file), join(dest, file)); // throws if the source is gone
}
console.log(`Copied ${COPIES.length} ORT runtime files to public/ort/`);
