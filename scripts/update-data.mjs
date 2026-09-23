#!/usr/bin/env node
/*
  Refreshes model on-disk sizes from primary sources, on a schedule.

  Sources (validated):
  - Ollama OCI registry: https://registry.ollama.ai/v2/library/<model>/manifests/<tag>
    -> layers[mediaType includes "image.model"].size gives the default-quant bytes.
  - HuggingFace Hub API: https://huggingface.co/api/models/<repo>?blobs=true
    -> siblings[].lfs.size gives exact per-quant GGUF file sizes (when a model
       row carries an optional `hf_repo`).

  Conservative by design: it refreshes `ollama_default_gb`, but only overwrites
  q4_k_m_gb / q8_0_gb when an authoritative
  HuggingFace file size is found, so curated values are never clobbered by a
  differently-quantised default tag.

  Scope: this refreshes the TEXT models in models.json only. The image, video and
  audio datasets ({image,video,audio}-models.json) are hand-curated from vendor
  cards + GGUF repos (their VRAM anchors are not a single auto-fetchable number),
  so they are intentionally not touched here and are refreshed manually.
*/
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "src", "data");
const GIB = 1024 ** 3;
const HF_TOKEN = process.env.HF_TOKEN || "";

const round2 = (n) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

async function ollamaDefaultGb(ollamaTag) {
  const [lib, tag = "latest"] = ollamaTag.split(":");
  const url = `https://registry.ollama.ai/v2/library/${lib}/manifests/${tag}`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.docker.distribution.manifest.v2+json" },
  });
  if (!res.ok) throw new Error(`ollama ${ollamaTag}: HTTP ${res.status}`);
  const manifest = await res.json();
  const layer = (manifest.layers || []).find((l) => /image\.model/.test(l.mediaType || ""));
  if (!layer?.size) throw new Error(`ollama ${ollamaTag}: no model layer`);
  return round2(layer.size / GIB);
}

// A Hub repo can contain a plain GGUF, a sharded copy of it, and alternate
// exports (MTP drafts, imatrix builds, etc.). Only use one complete artifact.
// Returning null on ambiguity preserves the curated value for review.
export function completeGgufBytes(files, matcher, { excludeAuxiliary = true } = {}) {
  const candidates = files.filter(
    (f) =>
      f.size > 0 &&
      /\.gguf$/i.test(f.name) &&
      matcher.test(f.name) &&
      (!excludeAuxiliary || !/(?:^|[\/_.-])(mmproj|mtp|draft|embedding|imatrix)(?:$|[\/_.-])/i.test(f.name)),
  );
  const groups = new Map();
  for (const file of candidates) {
    const shard = file.name.match(/-(\d+)-of-(\d+)(?=\.gguf$)/i);
    const key = file.name.replace(/-(\d+)-of-(\d+)(?=\.gguf$)/i, "");
    const group = groups.get(key) ?? { plain: [], shards: new Map(), total: null };
    if (shard) {
      const index = Number(shard[1]);
      const total = Number(shard[2]);
      group.total ??= total;
      if (group.total !== total || group.shards.has(index)) continue;
      group.shards.set(index, file.size);
    } else {
      group.plain.push(file.size);
    }
    groups.set(key, group);
  }

  const complete = [];
  for (const group of groups.values()) {
    if (group.plain.length === 1 && group.shards.size === 0) complete.push(group.plain[0]);
    if (
      group.plain.length === 0 &&
      group.total != null &&
      group.shards.size === group.total &&
      [...group.shards.keys()].every((index) => index >= 1 && index <= group.total)
    )
      complete.push([...group.shards.values()].reduce((sum, bytes) => sum + bytes, 0));
  }
  return complete.length === 1 ? complete[0] : null;
}

const exactQuant = (quant) => new RegExp(`(?:^|[-_.])${quant}(?=$|[-_.])`, "i");

export async function hfQuantSizes(repo) {
  const url = `https://huggingface.co/api/models/${repo}?blobs=true`;
  const headers = HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`hf ${repo}: HTTP ${res.status}`);
  const info = await res.json();
  const files = (info.siblings || []).map((s) => ({
    name: s.rfilename,
    size: s.lfs?.size ?? s.size ?? 0,
  }));
  const quantGb = (quant) => {
    const bytes = completeGgufBytes(files, exactQuant(quant));
    return bytes == null ? null : round2(bytes / GIB);
  };
  // mmproj = the VLM vision projector, shipped fp16 alongside the LLM GGUF.
  const mmprojBytes = completeGgufBytes(files, /mmproj.*(?:f16|fp16)|(?:f16|fp16).*mmproj/i, {
    excludeAuxiliary: false,
  });
  return {
    q4_k_m_gb: quantGb("Q4_K_M"),
    q8_0_gb: quantGb("Q8_0"),
    mxfp4_gb: quantGb("mxfp4"), // native 4-bit format for gpt-oss et al (no Q4_K_M file)
    mmproj_gb: mmprojBytes == null ? null : round2(mmprojBytes / GIB),
  };
}

async function main() {
  const previousModels = await readFile(join(DATA, "models.json"), "utf8");
  const models = JSON.parse(previousModels);
  const meta = JSON.parse(await readFile(join(DATA, "meta.json"), "utf8"));

  let okOllama = 0;
  let okHf = 0;
  let failedSources = 0;
  const drift = []; // size moves worth a human glance before the cron commit deploys
  for (const m of models) {
    if (m.ollama_tag) {
      try {
        m.ollama_default_gb = await ollamaDefaultGb(m.ollama_tag);
        okOllama++;
      } catch (e) {
        failedSources++;
        console.warn("  [ollama]", e instanceof Error ? e.message : e);
      }
    }
    if (m.hf_repo) {
      try {
        const sizes = await hfQuantSizes(m.hf_repo);
        // gpt-oss and friends ship native MXFP4 with no Q4_K_M file; use it for the 4-bit slot.
        let q4 = sizes.q4_k_m_gb ?? sizes.mxfp4_gb;
        let q8 = sizes.q8_0_gb;
        // VLM rows fold the fp16 vision projector into the loaded footprint (matches the row's stored total).
        if (m.subtype === "vlm" && sizes.mmproj_gb) {
          if (q4) q4 = round2(q4 + sizes.mmproj_gb);
          if (q8) q8 = round2(q8 + sizes.mmproj_gb);
        }
        // Drift guard: a bad HF filename match can 10x a size and silently flip
        // verdicts across thousands of pair pages. A normal re-quant moves ~2-5%;
        // flag a >15% move so a human eyeballs it before this commit deploys.
        if (q4 && m.q4_k_m_gb) {
          const delta = Math.abs(q4 - m.q4_k_m_gb) / m.q4_k_m_gb;
          if (delta > 0.15)
            drift.push(`${m.id}: q4_k_m_gb ${m.q4_k_m_gb} -> ${q4} GB (${Math.round(delta * 100)}% change)`);
        }
        if (q4) m.q4_k_m_gb = q4;
        if (q8) m.q8_0_gb = q8;
        okHf++;
      } catch (e) {
        failedSources++;
        console.warn("  [hf]", e instanceof Error ? e.message : e);
      }
    }
    if (m.hf_id) {
      try {
        const headers = HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {};
        const res = await fetch(
          `https://huggingface.co/api/models/${m.hf_id}?expand[]=downloads&expand[]=likes`,
          { headers },
        );
        if (res.ok) {
          const j = await res.json();
          if (typeof j.downloads === "number") m.hf_downloads = j.downloads;
          if (typeof j.likes === "number") m.hf_likes = j.likes;
        }
      } catch (e) {
        console.warn("  [hf-stats]", e instanceof Error ? e.message : e);
      }
    }
  }

  // The ollama default tag and our Q4 anchor should track each other; a >2 GB
  // gap usually means the ollama tag was re-quantized to a different bit-width.
  for (const m of models) {
    if (m.ollama_default_gb && m.q4_k_m_gb && Math.abs(m.ollama_default_gb - m.q4_k_m_gb) > 2)
      drift.push(
        `${m.id}: ollama_default_gb ${m.ollama_default_gb} vs q4_k_m_gb ${m.q4_k_m_gb} GB diverge >2 GB (re-quantized tag?)`,
      );
  }
  if (drift.length) {
    console.log(`::group::Data drift (${drift.length}) — review before this commit deploys`);
    for (const d of drift) console.log(`::warning title=data drift::${d}`);
    console.log("::endgroup::");
  }

  const nextModels = JSON.stringify(models, null, 2) + "\n";
  // This is the catalog-change date, not a claim that every upstream source
  // answered. Failed sources retain their previous values and are logged.
  if (nextModels !== previousModels) meta.updated = today();
  meta.generated_by = failedSources
    ? "partial cron refresh (Ollama registry + HuggingFace Hub API)"
    : "cron refresh (Ollama registry + HuggingFace Hub API)";

  await writeFile(join(DATA, "models.json"), nextModels);
  await writeFile(join(DATA, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(
    `Refreshed ${okOllama} Ollama sizes, ${okHf} HF repos; ${failedSources} source failures. ` +
      `Catalog change date: ${meta.updated}.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
