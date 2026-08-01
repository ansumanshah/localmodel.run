#!/usr/bin/env node
// CI gate: fail the build if the dataset has obviously-bad rows.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data");

const readJson = async (name) => {
  const p = join(DATA, name);
  return existsSync(p) ? JSON.parse(await readFile(p, "utf8")) : [];
};

const textModels = await readJson("models.json");
const imageModels = await readJson("image-models.json");
const videoModels = await readJson("video-models.json");
const audioModels = await readJson("audio-models.json");
const devices = await readJson("devices.json");
const browserModels = await readJson("browser-models.json");

const nonText = [...imageModels, ...videoModels, ...audioModels];
const allModels = [...textModels, ...nonText];

const errors = [];
const warnings = [];

const isUrl = (s) => typeof s === "string" && /^https?:\/\//.test(s);

// --- Text models (the validated path; rules unchanged) ---
for (const m of textModels) {
  if (!m.id || !m.name) errors.push(`model missing id/name: ${JSON.stringify(m).slice(0, 60)}`);
  if (!(m.params_b > 0)) errors.push(`${m.id}: params_b must be > 0`);
  if (!Array.isArray(m.sources) || m.sources.length === 0) errors.push(`${m.id}: no sources`);
  if (m.is_moe && !(m.active_params_b > 0)) warnings.push(`${m.id}: MoE without active_params_b`);
  if (m.q4_k_m_gb == null) warnings.push(`${m.id}: no Q4_K_M size`);
  if (m.q4_k_m_gb && m.q4_k_m_gb > m.params_b) warnings.push(`${m.id}: Q4 size > params (suspicious)`);
}

// --- Non-text models: enforce sourcing on the verdict anchor (the rows we
// are least certain about), a runtime gate, and a license. ---
const validClasses = new Set(["mac", "nvidia", "amd", "intel", "laptop", "iphone", "android"]);
const checkAnchor = (id, label, a) => {
  if (!a) return errors.push(`${id}: missing ${label} anchor`);
  if (!(a.gb > 0)) errors.push(`${id}: ${label}.gb must be > 0`);
  if (!isUrl(a.source)) errors.push(`${id}: ${label}.gb has no source URL (every number must be sourced)`);
};
for (const m of nonText) {
  if (!m.id || !m.name) errors.push(`model missing id/name: ${JSON.stringify(m).slice(0, 60)}`);
  if (!(m.params_b > 0)) errors.push(`${m.id}: params_b must be > 0`);
  if (!Array.isArray(m.sources) || m.sources.length === 0) errors.push(`${m.id}: no sources`);
  if (!m.modality || m.modality === "text") errors.push(`${m.id}: non-text file but modality is "${m.modality}"`);
  if (!m.license) errors.push(`${m.id}: non-text model needs a license`);

  const spec = m.image ?? m.video ?? m.audio;
  if (!spec) {
    errors.push(`${m.id}: modality "${m.modality}" but no matching spec`);
    continue;
  }
  checkAnchor(m.id, "recommended", spec.recommended);
  if (!Array.isArray(spec.device_classes) || spec.device_classes.length === 0)
    errors.push(`${m.id}: empty device_classes (runtime gate)`);
  for (const c of spec.device_classes || [])
    if (!validClasses.has(c)) errors.push(`${m.id}: invalid device class "${c}"`);
  if (!Array.isArray(spec.tools) || spec.tools.length === 0)
    warnings.push(`${m.id}: no tools listed`);
  // Component sizes feed the breakdown table; warn if an image/video model has none.
  if ((m.modality === "image" || m.modality === "video") && (!Array.isArray(spec.components) || spec.components.length === 0))
    warnings.push(`${m.id}: no components for the breakdown`);
}

// --- Devices (unchanged) ---
for (const d of devices) {
  if (!(d.memory_gb > 0)) errors.push(`${d.id}: memory_gb must be > 0`);
  if (d.usable_memory_gb != null && d.usable_memory_gb > d.memory_gb)
    errors.push(`${d.id}: usable > total memory`);
  if (!Array.isArray(d.sources) || d.sources.length === 0) errors.push(`${d.id}: no sources`);
}

// --- Unique ids across ALL model arrays ---
const ids = new Set();
for (const m of allModels) {
  if (ids.has(m.id)) errors.push(`duplicate model id: ${m.id}`);
  ids.add(m.id);
}

// --- Browser / ONNX models: sizes come from scripts/browser-model-sizes.json
// (measured, never estimated). Enforce shape + that every headline variant is
// one of the model's own measured variants + every row is sourced. ---
const browserIds = new Set();
for (const m of browserModels) {
  if (!m.id || !m.name) errors.push(`browser model missing id/name: ${JSON.stringify(m).slice(0, 60)}`);
  if (browserIds.has(m.id)) errors.push(`duplicate browser model id: ${m.id}`);
  browserIds.add(m.id);
  if (!m.hf_repo) errors.push(`${m.id}: no hf_repo`);
  if (!m.task) errors.push(`${m.id}: no task`);
  if (!Array.isArray(m.sources) || m.sources.length === 0) errors.push(`${m.id}: no sources`);
  for (const s of m.sources ?? []) if (!s.label || !isUrl(s.url)) errors.push(`${m.id}: bad source entry`);
  if (m.params_m != null && !(m.params_m > 0)) errors.push(`${m.id}: params_m must be > 0 or null`);

  const variants = m.variants ?? {};
  const variantKeys = Object.keys(variants);
  if (variantKeys.length === 0) errors.push(`${m.id}: no variants`);
  for (const [k, v] of Object.entries(variants))
    if (!(Number.isInteger(v) && v > 0)) errors.push(`${m.id}: variant "${k}" bytes must be a positive integer`);

  const head = m.headline ?? {};
  for (const backend of ["webgpu", "wasm"]) {
    const h = head[backend];
    if (!h) {
      errors.push(`${m.id}: missing headline.${backend}`);
      continue;
    }
    if (!(Number.isInteger(h.bytes) && h.bytes > 0)) errors.push(`${m.id}: headline.${backend}.bytes must be a positive integer`);
    if (!h.variant || variants[h.variant] !== h.bytes)
      errors.push(`${m.id}: headline.${backend} (${h.variant}: ${h.bytes}) does not match a measured variant in variants{}`);
  }

  // Cross-variant sanity: a lower-precision quant should never be LARGER than
  // a higher-precision one of the same base weights. Catches summing bugs
  // like counting an alternate export alongside its base file (e.g. the
  // embeddinggemma-300m "model_no_gather" + "model" double-count). Warning,
  // not an error, since a handful of repos legitimately ship non-monotonic
  // sizes (see e.g. kokoro-82m's notes).
  if (variants.q4 != null && variants.q8 != null && variants.q4 > variants.q8)
    warnings.push(`${m.id}: q4 larger than q8 (suspicious)`);
  if (variants.q4f16 != null && variants.fp16 != null && variants.q4f16 > variants.fp16)
    warnings.push(`${m.id}: q4f16 larger than fp16 (suspicious)`);
}

warnings.forEach((w) => console.warn("WARN:", w));
if (errors.length) {
  errors.forEach((e) => console.error("ERROR:", e));
  process.exit(1);
}
console.log(
  `OK: ${textModels.length} text + ${imageModels.length} image + ${videoModels.length} video + ${audioModels.length} audio models, ${devices.length} devices, ${browserModels.length} browser models valid (${warnings.length} warnings).`,
);
