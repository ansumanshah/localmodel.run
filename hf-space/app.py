"""
localmodel.run — Can I Run It? (HuggingFace Space)

A faithful Python port of compute.ts from localmodel.run.
Every formula mirrors the TypeScript source exactly.
"""

import json
import math
import os
from pathlib import Path

# Gradio is only needed to serve the UI. Guard the import so the pure verdict
# math stays importable (and differential-testable against compute.ts) in
# environments without gradio installed.
try:
    import gradio as gr

    _HAS_GRADIO = True
except ImportError:  # pragma: no cover
    _HAS_GRADIO = False

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

_DIR = Path(__file__).parent

with open(_DIR / "models.json", encoding="utf-8") as f:
    ALL_MODELS = json.load(f)

with open(_DIR / "devices.json", encoding="utf-8") as f:
    ALL_DEVICES = json.load(f)

# Only text models (skip image/video/audio rows that lack params_b)
MODELS = [m for m in ALL_MODELS if m.get("params_b") is not None]
DEVICES = ALL_DEVICES  # all device rows have memory_gb

# ---------------------------------------------------------------------------
# Constants — mirrors compute.ts exactly
# ---------------------------------------------------------------------------

# Effective bits-per-weight for common GGUF quants.
# Source: llama.cpp quantize README benchmark table.
# mirrors compute.ts: const BPW
BPW: dict[str, float] = {
    "q4_k_m": 4.89,
    "q8_0": 8.5,
    "fp16": 16.0,
}

QUANT_LABEL: dict[str, str] = {
    "q4_k_m": "Q4_K_M",
    "q8_0": "Q8_0",
    "fp16": "FP16",
}

# mirrors compute.ts: const OVERHEAD_GB
OVERHEAD_GB = 0.8

# mirrors compute.ts: const KV_GB_PER_KTOK
KV_GB_PER_KTOK = 0.06

# mirrors compute.ts: export const DEFAULT_CONTEXT_K
DEFAULT_CONTEXT_K = 4


# ---------------------------------------------------------------------------
# Core math — mirrors compute.ts function by function
# ---------------------------------------------------------------------------

def round1(n: float) -> float:
    """mirrors compute.ts: Math.round(n*10)/10.

    JS Math.round rounds half UP (toward +Infinity); Python's built-in round()
    uses banker's rounding (half to even), which diverges on exact .x5 values
    (e.g. 18.65 -> JS 18.7 vs Python 18.6). math.floor(x + 0.5) reproduces
    Math.round exactly for the value range here, so the Space never disagrees
    with the site it links to.
    """
    return math.floor(n * 10 + 0.5) / 10


def weights_gb(model: dict, quant: str) -> float:
    """
    Weights-only memory for a model at a quant (GB).
    Prefers measured on-disk sizes; falls back to bits-per-weight formula.
    mirrors compute.ts: export function weightsGb
    """
    if quant == "q4_k_m" and model.get("q4_k_m_gb"):
        return model["q4_k_m_gb"]
    if quant == "q8_0" and model.get("q8_0_gb"):
        return model["q8_0_gb"]
    if quant == "fp16" and model.get("fp16_gb"):
        return model["fp16_gb"]
    return round1((model["params_b"] * BPW[quant]) / 8)


def kv_cache_gb(model: dict, context_k: float) -> float:
    """
    Approx KV-cache memory at a context length (GB), GQA-adjusted, sublinear.
    mirrors compute.ts: export function kvCacheGb
    formula: KV_GB_PER_KTOK * sqrt(params_b) * contextK
    """
    return round1(KV_GB_PER_KTOK * math.sqrt(model["params_b"]) * context_k)


def estimate_memory(model: dict, quant: str, context_k: float = DEFAULT_CONTEXT_K) -> dict:
    """
    Full memory estimate including weights + KV + overhead.
    mirrors compute.ts: export function estimateMemory
    """
    w = weights_gb(model, quant)
    kv = kv_cache_gb(model, context_k)
    return {
        "quant": quant,
        "weights_gb": w,
        "kv_gb": kv,
        "overhead_gb": OVERHEAD_GB,
        "total_gb": round1(w + kv + OVERHEAD_GB),
    }


def usable_gb(device: dict) -> float:
    """
    Usable memory for weights on a device (after OS/headroom).
    mirrors compute.ts: export function usableGb

    Priority order:
    1. usable_memory_gb if explicitly set in data (all Mac rows set this)
    2. unified/mac fallback: 70% of memory_gb
    3. vram: memory_gb - 1
    4. CPU RAM: 60% of memory_gb
    """
    if device.get("usable_memory_gb") is not None:
        return device["usable_memory_gb"]
    # mirrors compute.ts: if (device.memory_type === "unified" && device.category === "mac")
    if device.get("memory_type") == "unified" and device.get("category") == "mac":
        return round1(device["memory_gb"] * 0.7)
    if device.get("memory_type") == "vram":
        return round1(device["memory_gb"] - 1)
    return round1(device["memory_gb"] * 0.6)  # CPU RAM


def speed_class(model: dict, device: dict) -> str:
    """
    Qualitative generation speed label.
    mirrors compute.ts: function speedClass
    """
    # For MoE, use active params for speed estimation; otherwise use total params.
    eff_b = (
        model["active_params_b"]
        if model.get("is_moe") and model.get("active_params_b")
        else model["params_b"]
    )
    cat = device.get("category", "")
    mem_type = device.get("memory_type", "")

    if cat in ("iphone", "android"):
        return "ok" if eff_b <= 4 else "slow"
    if mem_type == "ram":
        return "ok" if eff_b <= 8 else "slow"  # CPU-only laptop
    if cat == "mac":
        return "fast" if eff_b <= 32 else "ok"
    # discrete GPU
    return "fast" if eff_b <= 34 else "ok"


def can_run(model: dict, device: dict, context_k: float = DEFAULT_CONTEXT_K) -> dict:
    """
    Main verdict: can this device run this model?
    mirrors compute.ts: export function canRun

    Returns a dict matching the RunResult interface shape.
    """
    usable = usable_gb(device)
    q4 = estimate_memory(model, "q4_k_m", context_k)
    spd = speed_class(model, device)

    if q4["total_gb"] > usable:
        return {
            "verdict": "no",
            "quant": None,
            "estimate": q4,
            "upgrade_quant": None,
            "usable_gb": usable,
            "headroom_gb": round1(usable - q4["total_gb"]),
            "speed": "none",
            "reason": (
                f"Needs ~{q4['total_gb']} GB even at Q4_K_M, "
                f"but only ~{usable} GB is usable."
            ),
        }

    # Best higher-quality quant that still fits.
    # mirrors compute.ts: for (const q of ["fp16", "q8_0"] as Quant[])
    upgrade: str | None = None
    for q in ["fp16", "q8_0"]:
        if estimate_memory(model, q, context_k)["total_gb"] <= usable:
            upgrade = q
            break

    headroom = round1(usable - q4["total_gb"])
    # mirrors compute.ts: const tight = headroom < Math.max(1, usable * 0.1)
    tight = headroom < max(1.0, usable * 0.1)

    if tight:
        reason = (
            f"Fits at Q4_K_M (~{q4['total_gb']} GB of ~{usable} GB usable) "
            f"but with little headroom, close other apps."
        )
    else:
        upgrade_note = (
            f" You have room for {QUANT_LABEL[upgrade]} for higher quality"
            if upgrade
            else ""
        )
        reason = (
            f"Runs at Q4_K_M using ~{q4['total_gb']} GB of ~{usable} GB usable"
            f"{upgrade_note}."
        )

    return {
        "verdict": "tight" if tight else "yes",
        "quant": "q4_k_m",
        "estimate": q4,
        "upgrade_quant": upgrade,
        "usable_gb": usable,
        "headroom_gb": headroom,
        "speed": spd,
        "reason": reason,
    }


# ---------------------------------------------------------------------------
# Gradio UI helpers
# ---------------------------------------------------------------------------

VERDICT_EMOJI = {"yes": "✅", "tight": "⚠️", "no": "❌"}
VERDICT_LABEL = {
    "yes": "Yes, it runs",
    "tight": "Yes, but tight",
    "no": "No, not enough memory",
}
SPEED_LABEL = {
    "fast": "fast",
    "ok": "ok",
    "slow": "slow",
    "none": "n/a",
}

# Build dropdown choices
MODEL_CHOICES = [m["name"] for m in MODELS]
DEVICE_CHOICES = [d["name"] for d in DEVICES]

_MODEL_BY_NAME = {m["name"]: m for m in MODELS}
_DEVICE_BY_NAME = {d["name"]: d for d in DEVICES}


def check_compatibility(model_name: str, device_name: str) -> str:
    """Gradio handler: returns a markdown string with the verdict."""
    if not model_name or not device_name:
        return "_Select a model and a device to see the verdict._"

    model = _MODEL_BY_NAME.get(model_name)
    device = _DEVICE_BY_NAME.get(device_name)
    if not model or not device:
        return "_Unknown model or device._"

    result = can_run(model, device)
    v = result["verdict"]
    est = result["estimate"]
    usable = result["usable_gb"]
    headroom = result["headroom_gb"]
    spd = result["speed"]
    upgrade = result["upgrade_quant"]

    # Recommended quant
    rec_quant = QUANT_LABEL.get(result["quant"], "Q4_K_M") if result["quant"] else "Q4_K_M"

    # Weights breakdown
    weights = est["weights_gb"]
    kv = est["kv_gb"]
    overhead = est["overhead_gb"]
    total = est["total_gb"]

    emoji = VERDICT_EMOJI[v]
    verdict_text = VERDICT_LABEL[v]

    # Link back to localmodel.run
    model_id = model["id"]
    device_id = device["id"]
    url = f"https://localmodel.run/can-i-run/{model_id}/{device_id}"

    upgrade_line = ""
    if upgrade:
        upgrade_line = f"\n- **Higher quality possible:** {QUANT_LABEL[upgrade]} also fits"

    output = f"""## {emoji} {verdict_text}

**{model_name}** on **{device_name}**

---

### Memory breakdown (Q4_K_M @ 4k context)
| | GB |
|---|---|
| Model weights | {weights} |
| KV cache (4k ctx) | {kv} |
| Runtime overhead | {overhead} |
| **Total needed** | **{total}** |
| **Device usable** | **{usable}** |
| Headroom | {headroom:+.1f} |

---

### Details
- **Recommended quant:** {rec_quant}
- **Generation speed:** {SPEED_LABEL[spd]}{upgrade_line}
- {result["reason"]}

---

**[Full breakdown → {url}]({url})**

*Estimates follow the [localmodel.run methodology](https://localmodel.run/methodology). Math: weights + KV cache (0.06 GB/ktok × √params_b × ctx) + 0.8 GB overhead; tight when headroom < max(1 GB, 10% of usable).*
"""
    return output


# ---------------------------------------------------------------------------
# Gradio app
# ---------------------------------------------------------------------------

if _HAS_GRADIO:
  with gr.Blocks(title="Can I Run It Locally? — localmodel.run") as demo:
    gr.Markdown(
        """# Can I Run It Locally?
Powered by **[localmodel.run](https://localmodel.run)** — the hardware-aware open-model directory.

Pick a model and a device to get an instant memory verdict. Every result links back to the full breakdown page.
        """
    )

    with gr.Row():
        model_dd = gr.Dropdown(
            choices=MODEL_CHOICES,
            label="Model",
            value=MODEL_CHOICES[0] if MODEL_CHOICES else None,
            filterable=True,
        )
        device_dd = gr.Dropdown(
            choices=DEVICE_CHOICES,
            label="Device / GPU",
            value=DEVICE_CHOICES[0] if DEVICE_CHOICES else None,
            filterable=True,
        )

    run_btn = gr.Button("Check", variant="primary")
    result_md = gr.Markdown("_Select a model and a device, then click Check._")

    run_btn.click(
        fn=check_compatibility,
        inputs=[model_dd, device_dd],
        outputs=result_md,
    )
    # Also fire on dropdown change for convenience
    model_dd.change(fn=check_compatibility, inputs=[model_dd, device_dd], outputs=result_md)
    device_dd.change(fn=check_compatibility, inputs=[model_dd, device_dd], outputs=result_md)

    gr.Markdown(
        """---
Built by [localmodel.run](https://localmodel.run) · [Methodology](https://localmodel.run/methodology) · [Compare models](https://localmodel.run/compare)
        """
    )

if __name__ == "__main__":
    demo.launch()
