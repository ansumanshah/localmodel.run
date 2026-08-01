/**
 * Measure ONNX weight sizes for browser-runnable models straight from the
 * HuggingFace API (exact bytes, never estimates). Prints a per-variant table
 * and writes scripts/browser-model-sizes.json for catalog authoring.
 *
 *   bun run scripts/verify-browser-models.ts
 */

type TreeEntry = { type: string; size: number; path: string };

const CANDIDATES: { repo: string; note?: string }[] = [
  // text generation
  { repo: "onnx-community/Qwen2.5-0.5B-Instruct" },
  { repo: "HuggingFaceTB/SmolLM2-135M-Instruct" },
  { repo: "HuggingFaceTB/SmolLM2-360M-Instruct" },
  { repo: "onnx-community/SmolLM2-135M-Instruct" },
  { repo: "onnx-community/SmolLM2-360M-Instruct" },
  { repo: "onnx-community/Llama-3.2-1B-Instruct" },
  { repo: "onnx-community/gemma-3-270m-it-ONNX" },
  // vision-language
  { repo: "HuggingFaceTB/SmolVLM-256M-Instruct" },
  { repo: "onnx-community/SmolVLM-256M-Instruct" },
  { repo: "onnx-community/Florence-2-base-ft" },
  // speech to text
  { repo: "onnx-community/whisper-tiny" },
  { repo: "onnx-community/whisper-base" },
  { repo: "onnx-community/whisper-small" },
  { repo: "onnx-community/moonshine-base-ONNX" },
  // text to speech
  { repo: "onnx-community/Kokoro-82M-v1.0-ONNX" },
  // embeddings
  { repo: "Xenova/all-MiniLM-L6-v2" },
  { repo: "Xenova/bge-small-en-v1.5" },
  { repo: "onnx-community/embeddinggemma-300m-ONNX" },
  { repo: "Xenova/nomic-embed-text-v1.5" },
  // vision
  { repo: "Xenova/clip-vit-base-patch32" },
  { repo: "briaai/RMBG-1.4" },
  { repo: "Xenova/modnet" },
  { repo: "onnx-community/depth-anything-v2-small" },
  { repo: "Xenova/depth-anything-small-hf" },
  { repo: "Xenova/slimsam-77-uniform" },
  { repo: "Xenova/trocr-small-printed" },
  // expansion 2026-08-01: all browser-first models regardless of size
  { repo: "onnx-community/Qwen3-0.6B-ONNX" },
  { repo: "onnx-community/Qwen2.5-1.5B-Instruct" },
  { repo: "onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX" },
  { repo: "onnx-community/gemma-3-1b-it-ONNX" },
  { repo: "onnx-community/LFM2.5-350M-ONNX" },
  { repo: "onnx-community/granite-4.0-350m-ONNX-web" },
  { repo: "onnx-community/Bonsai-1.7B-ONNX" },
  { repo: "onnx-community/Phi-3.5-mini-instruct-onnx-web" },
  { repo: "onnx-community/gemma-4-E2B-it-ONNX" },
  { repo: "onnx-community/gemma-4-E2B-it-qat-mobile-ONNX" },
  { repo: "onnx-community/gemma-4-E4B-it-ONNX" },
  { repo: "onnx-community/Qwen3.5-0.8B-ONNX" },
  { repo: "onnx-community/Janus-Pro-1B-ONNX" },
  { repo: "onnx-community/granite-docling-258M-ONNX" },
  { repo: "onnx-community/Florence-2-large-ft" },
  { repo: "onnx-community/whisper-large-v3-turbo" },
  { repo: "onnx-community/moonshine-tiny-ONNX" },
  { repo: "onnx-community/Voxtral-Mini-4B-Realtime-2602-ONNX" },
  { repo: "onnx-community/nemotron-3.5-asr-streaming-0.6b-onnx-int4" },
  { repo: "onnx-community/pyannote-segmentation-3.0" },
  { repo: "onnx-community/Supertonic-TTS-2-ONNX" },
  { repo: "onnx-community/chatterbox-multilingual-ONNX" },
  { repo: "onnx-community/gte-multilingual-base" },
  { repo: "onnx-community/bge-reranker-v2-m3-ONNX" },
  { repo: "onnx-community/Qwen3-Embedding-0.6B-ONNX" },
  { repo: "onnx-community/bge-m3-ONNX" },
  { repo: "onnx-community/voyage-4-nano-ONNX" },
  { repo: "onnx-community/siglip2-base-patch16-224-ONNX" },
  { repo: "onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX" },
  { repo: "onnx-community/grounding-dino-tiny-ONNX" },
  { repo: "onnx-community/sam2.1-hiera-tiny-ONNX" },
  { repo: "onnx-community/BiRefNet_lite-ONNX" },
  { repo: "onnx-community/BEN2-ONNX" },
  { repo: "onnx-community/ormbg-ONNX" },
  { repo: "onnx-community/punctuate-all-ONNX" },
  { repo: "onnx-community/gliner_small-v2.1" },
  { repo: "onnx-community/piiranha-v1-detect-personal-information-ONNX" },
];

// suffix → variant label (order matters: longest match first)
const VARIANT_SUFFIXES: [string, string][] = [
  ["_quantized", "q8"],
  ["_uint8", "uint8"],
  ["_int8", "q8"],
  ["_bnb4", "bnb4"],
  ["_q4f16", "q4f16"],
  ["_q4", "q4"],
  ["_fp16", "fp16"],
];

function classify(path: string): { part: string; variant: string } | null {
  const m = path.match(/^onnx\/(.+?)\.onnx(_data)?$/) ?? path.match(/^(.+?)\.onnx(_data)?$/);
  if (!m) return null;
  let base = m[1];
  let variant = "fp32";
  for (const [suffix, label] of VARIANT_SUFFIXES) {
    if (base.endsWith(suffix)) {
      variant = label;
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return { part: base, variant };
}

async function fetchTree(repo: string): Promise<TreeEntry[] | null> {
  const url = `https://huggingface.co/api/models/${repo}/tree/main?recursive=true`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as TreeEntry[];
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

// Alternate-build markers: a part whose name contains one of these is an
// alternate export of the base part with the marker removed (same logical
// component, different internal implementation, e.g. embeddinggemma's
// "model_no_gather" vs "model"), not an additional required file. Only
// dropped when the base part exists alongside it in the same variant, so a
// repo that ships ONLY the alternate build still counts it.
const ALTERNATE_MARKERS = ["_no_gather"];

function alternateBaseOf(name: string): string | null {
  for (const marker of ALTERNATE_MARKERS) {
    const idx = name.indexOf(marker);
    if (idx !== -1) return name.slice(0, idx) + name.slice(idx + marker.length);
  }
  return null;
}

const out: Record<string, Record<string, { bytes: number; files: string[] }>> = {};

for (const { repo } of CANDIDATES) {
  const tree = await fetchTree(repo);
  if (!tree) {
    console.log(`✗ ${repo}: NOT FOUND`);
    continue;
  }
  // group onnx files by variant
  const byVariant = new Map<string, Map<string, { size: number; path: string }>>();
  for (const e of tree) {
    if (e.type !== "file" || !/\.onnx(_data)?$/.test(e.path)) continue;
    const c = classify(e.path);
    if (!c) continue;
    const vm = byVariant.get(c.variant) ?? new Map();
    // accumulate .onnx + .onnx_data of the same part
    const prev = vm.get(c.part);
    vm.set(c.part, { size: (prev?.size ?? 0) + e.size, path: e.path });
    byVariant.set(c.variant, vm);
  }
  if (byVariant.size === 0) {
    console.log(`✗ ${repo}: no .onnx files`);
    continue;
  }
  out[repo] = {};
  console.log(`\n■ ${repo}`);
  for (const [variant, parts] of [...byVariant.entries()].sort()) {
    // prefer merged decoder over split decoder(+with_past) when both exist
    const names = [...parts.keys()];
    const drop = new Set<string>();
    for (const n of names) {
      if (n.endsWith("_merged")) {
        const plain = n.slice(0, -"_merged".length);
        drop.add(plain);
        drop.add(`${plain}_with_past`);
      }
      const altBase = alternateBaseOf(n);
      if (altBase && names.includes(altBase)) {
        // n is an alternate export of altBase (same component, different
        // internal build), not a distinct required part; keep the base.
        drop.add(n);
      }
    }
    let total = 0;
    const files: string[] = [];
    for (const [n, f] of parts) {
      if (drop.has(n)) continue;
      total += f.size;
      files.push(n);
    }
    out[repo][variant] = { bytes: total, files };
    console.log(`  ${variant.padEnd(6)} ${mb(total).padStart(8)} MB  (${files.join(", ")})`);
  }
}

await Bun.write(
  new URL("./browser-model-sizes.json", import.meta.url).pathname,
  JSON.stringify(out, null, 2),
);
console.log("\nWrote scripts/browser-model-sizes.json");
