---
title: Can I Run It Locally?
emoji: 🔋
colorFrom: indigo
colorTo: purple
sdk: gradio
sdk_version: "4.44.0"
app_file: app.py
pinned: false
license: apache-2.0
short_description: Check if any open LLM fits your hardware — verdict + memory breakdown
---

# Can I Run It Locally?

A fast, offline-capable tool to check whether an open-weight LLM fits on your hardware.

Pick a **model** (Llama, Mistral, Gemma, Qwen, Phi, DeepSeek, and more) and a **device or GPU**, and get:

- A clear **yes / tight / no** verdict
- A memory breakdown: weights + KV cache + runtime overhead vs. usable device memory
- The recommended quantization (Q4_K_M baseline)
- Whether a higher-quality quant (Q8_0 or FP16) also fits
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

## Full directory

Browse all ~138 models × 40 devices at **[localmodel.run](https://localmodel.run)**:

- [Model pages](https://localmodel.run/models) with memory breakdown + context-length speed curve
- [Device pages](https://localmodel.run/devices) with all models ranked by fit
- [/compare](https://localmodel.run/compare) — full matrix
- [/best-llm-for-ram](https://localmodel.run/best-llm-for-ram/16) — top models by RAM budget
- [/leaderboard](https://localmodel.run/leaderboard) — ranked by Aider / BFCL / LMArena Elo with hardware fit
