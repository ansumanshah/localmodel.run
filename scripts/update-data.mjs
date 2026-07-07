#!/usr/bin/env node
/*
  Refreshes model on-disk sizes from primary sources, on a schedule.

  Sources (validated):
  - Ollama OCI registry: https://registry.ollama.ai/v2/library/<model>/manifests/<tag>
    -> layers[mediaType includes "image.model"].size gives the default-quant bytes.
  - HuggingFace Hub API: https://huggingface.co/api/models/<repo>?blobs=true
    -> siblings[].lfs.size gives exact per-quant GGUF file sizes (when a model
       row carries an optional `hf_repo`).

  Conservative by design: it always refreshes `ollama_default_gb` and the
  validated date, but only overwrites q4_k_m_gb / q8_0_gb when an authoritative
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

async function hfQuantSizes(repo) {
  const url = `https://huggingface.co/api/models/${repo}?blobs=true`;
  const headers = HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`hf ${repo}: HTTP ${res.status}`);
  const info = await res.json();
  const files = (info.siblings || []).map((s) => ({
    name: s.rfilename,
    size: s.lfs?.size ?? s.size ?? 0,
  }));
  const sumQuant = (re) => {
    const matched = files.filter((f) => re.test(f.name) && /\.gguf$/i.test(f.name));
    if (!matched.length) return null;
    const bytes = matched.reduce((a, f) => a + f.size, 0); // handle split files
    return round2(bytes / GIB);
  };
  // mmproj = the VLM vision projector, shipped fp16 alongside the LLM GGUF.
  const mmproj = files.filter((f) => /mmproj/i.test(f.name) && /(f16|fp16)/i.test(f.name) && /\.gguf$/i.test(f.name));
  return {
    q4_k_m_gb: sumQuant(/Q4_K_M/i),
    q8_0_gb: sumQuant(/Q8_0/i),
    mxfp4_gb: sumQuant(/mxfp4/i), // native 4-bit format for gpt-oss et al (no Q4_K_M file)
    mmproj_gb: mmproj.length ? round2(mmproj.reduce((a, f) => a + f.size, 0) / GIB) : null,
  };
}

async function main() {
  const models = JSON.parse(await readFile(join(DATA, "models.json"), "utf8"));
  const meta = JSON.parse(await readFile(join(DATA, "meta.json"), "utf8"));

  let okOllama = 0;
  let okHf = 0;
  const drift = []; // size moves worth a human glance before the cron commit deploys
  for (const m of models) {
    if (m.ollama_tag) {
      try {
        m.ollama_default_gb = await ollamaDefaultGb(m.ollama_tag);
        okOllama++;
      } catch (e) {
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

  meta.updated = today();
  meta.generated_by = "cron refresh (Ollama registry + HuggingFace Hub API)";

  await writeFile(join(DATA, "models.json"), JSON.stringify(models, null, 2) + "\n");
  await writeFile(join(DATA, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(`Refreshed ${okOllama} Ollama sizes, ${okHf} HF repos. Dated ${meta.updated}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
