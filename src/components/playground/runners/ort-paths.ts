import { env } from "@huggingface/transformers";

// Point both transformers.js instances at the self-hosted ORT runtimes in
// /ort/ (copied from node_modules by scripts/copy-ort-wasm.mjs) instead of
// their cdn.jsdelivr.net defaults. jsdelivr is blocked in some regions and
// is one more third party in the /browser/* CSP; self-hosting removes both.

// Mirrors transformers.js's own isSafari(): its runtime loads the plain wasm
// build on Safari and the asyncify build everywhere else, so the same fork
// has to pick between the same two self-hosted pairs.
function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isAppleVendor = (navigator.vendor || "").includes("Apple");
  const notOtherBrowser =
    !/CriOS|FxiOS|EdgiOS|OPiOS|mercury|brave/i.test(ua) &&
    !ua.includes("Chrome") &&
    !ua.includes("Android");
  return isAppleVendor && notOtherBrowser;
}

/** Call before every transformers.js v4 model load (chat/asr/rmbg/embed/vlm). */
export function useSelfHostedOrt(device: "webgpu" | "wasm"): void {
  const wasm = env.backends.onnx?.wasm;
  if (!wasm) return; // non-browser build context; nothing to point anywhere
  // Overwrites, not set-if-unset: transformers.js assigns its jsdelivr
  // default at module load, so an unset check would never fire. Assigning
  // the same paths again on later calls is harmless.
  const base = "/ort/v4/";
  wasm.wasmPaths = isSafari()
    ? { mjs: `${base}ort-wasm-simd-threaded.mjs`, wasm: `${base}ort-wasm-simd-threaded.wasm` }
    : {
        mjs: `${base}ort-wasm-simd-threaded.asyncify.mjs`,
        wasm: `${base}ort-wasm-simd-threaded.asyncify.wasm`,
      };
  // On the WASM fallback, run inference in ORT's own worker so a long forward
  // pass cannot freeze the page. transformers.js defaults this to false
  // because it is unnecessary for WebGPU (and proxy+WebGPU has known issues).
  // Per-call, NOT once-only: ClientRouter soft navigations keep this module
  // alive across playground pages, and the next page's resolved backend can
  // differ, so the flag must track the load actually being made.
  // (kokoro-js's bundled transformers 3.x does not expose this flag; its
  // WASM fallback stays on the main thread.)
  wasm.proxy = device === "wasm";
}

/** Prefix for kokoro-js's bundled transformers 3.x (its runtime appends the jsep filenames). */
export const KOKORO_ORT_PREFIX = "/ort/kokoro/";
