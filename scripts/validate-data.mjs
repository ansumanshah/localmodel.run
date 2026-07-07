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

warnings.forEach((w) => console.warn("WARN:", w));
if (errors.length) {
  errors.forEach((e) => console.error("ERROR:", e));
  process.exit(1);
}
console.log(
  `OK: ${textModels.length} text + ${imageModels.length} image + ${videoModels.length} video + ${audioModels.length} audio models, ${devices.length} devices valid (${warnings.length} warnings).`,
);
