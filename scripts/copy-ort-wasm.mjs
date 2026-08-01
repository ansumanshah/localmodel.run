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

import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));

// Both packages seal package.json behind their exports maps, so resolve the
// main entry (which lives in dist/) and take its directory. onnxruntime-web
// resolves THROUGH @huggingface/transformers (not from the root, and it is
// deliberately not a direct dependency): the copied runtime must be the exact
// version the bundled transformers loads at runtime, and a root-level pin
// could silently diverge from transformers' own after a dependency bump.
const transformersRequire = createRequire(require.resolve("@huggingface/transformers"));
const ortV4Dist = dirname(transformersRequire.resolve("onnxruntime-web"));
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

// CF Pages hard-fails any deploy containing a file over 25 MiB, AFTER a
// successful build (same failure class as the 20k file-count gate). The
// biggest runtime is ~22.5 MiB today and these grow with ORT releases, so
// trip here at build time instead of at deploy time.
const CF_PAGES_FILE_LIMIT = 25 * 1024 * 1024;

for (const { from, to, file } of COPIES) {
  const src = join(from, file);
  const { size } = await stat(src); // throws if the source is gone
  if (size > CF_PAGES_FILE_LIMIT) {
    throw new Error(
      `${file} is ${size} bytes, over Cloudflare Pages' ${CF_PAGES_FILE_LIMIT}-byte per-file limit; the deploy would fail after a green build.`,
    );
  }
  const dest = join(root, "public/ort", to);
  await mkdir(dest, { recursive: true });
  await copyFile(src, join(dest, file));
}
console.log(`Copied ${COPIES.length} ORT runtime files to public/ort/`);
