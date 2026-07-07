---
title: Can I Run It Locally?
emoji: 🎛️
colorFrom: indigo
colorTo: purple
sdk: gradio
app_file: app.py
pinned: false
license: apache-2.0
short_description: Which LLM quant fits your Mac, PC, phone or GPU?
---

# Can I Run It Locally?

Most VRAM calculators ask you to type your GPU's GB and compute a size from a model's config.
This one answers for your **actual device** — Mac (unified memory), PC, iPhone, Android, or a
discrete GPU — using **measured GGUF file sizes** where they exist, and shows **which quant fits
that device**, not a single generic number.

Pick a **model** (Llama, Qwen, DeepSeek, Gemma, Mistral, Phi, GLM, Kimi, and more) and a **device**:

- A clear **yes / tight / no** verdict at the Q4_K_M baseline
- The two numbers that decide it: **needed GB vs. usable GB** on that device
- A **per-quant fit table** — Q2_K → FP16, each with its size and whether it runs on your device (✅ / ⚠️ / ❌), measured sizes marked apart from bits-per-weight estimates
- A **context-length slider** that grows the KV cache in real time
- A direct link to the **full breakdown page** on [localmodel.run](https://localmodel.run)

## How the math works

The memory estimate follows the [localmodel.run methodology](https://localmodel.run/methodology):

```
total = weights_gb + kv_cache_gb + 0.8 GB overhead
```

- **Weights:** measured GGUF sizes (from HuggingFace/Ollama) where available; otherwise `params_b × BPW / 8`
- **KV cache:** `0.06 × √params_b × context_k` GB — GQA-adjusted, sublinear in model size
- **Overhead:** 0.8 GB fixed (compute buffers + runtime)
- **Usable memory:** device-specific (Mac: `usable_memory_gb` from recommendedMaxWorkingSetSize; discrete GPU: `memory_gb - 1`; CPU RAM: 60%)
- **Tight threshold:** headroom < max(1 GB, 10% of usable)

This is a faithful Python port of [`compute.ts`](https://github.com/ansumanshah/localmodel.run) — same constants, same formulas, same thresholds.

> The `models.json` and `devices.json` bundled with this Space are a snapshot of the main catalog, refreshed with `scripts/sync-hf-space.mjs`. The live site is always current.

## Full directory

Browse the full, growing catalog at **[localmodel.run](https://localmodel.run)**:

- [Model pages](https://localmodel.run/models) with memory breakdown + context-length speed curve
- [Device pages](https://localmodel.run/devices) with all models ranked by fit
- [/compare](https://localmodel.run/compare) — full matrix
- [/best-llm-for-ram](https://localmodel.run/best-llm-for-ram/16) — top models by RAM budget
- [/leaderboard](https://localmodel.run/leaderboard) — ranked by Aider / BFCL / LMArena Elo with hardware fit
