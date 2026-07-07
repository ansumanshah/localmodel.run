"""
localmodel.run — Can I Run It Locally? (HuggingFace Space)

A faithful Python port of compute.ts from localmodel.run. Every formula mirrors
the TypeScript source. The wedge vs. other VRAM calculators: this answers for a
real DEVICE (Mac, PC, iPhone, Android — not just "type your GPU GB"), uses
MEASURED GGUF file sizes where they exist, and shows which quant fits YOUR
device, not a generic number.
"""

import json
import math
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

# Effective bits-per-weight per GGUF quant, from the llama.cpp quantize README
# benchmark table. mirrors compute.ts: BPW + QUANT_LADDER.
QUANT_LADDER = [
    {"key": "q2_k", "label": "Q2_K", "bpw": 3.35},
    {"key": "q3_k_m", "label": "Q3_K_M", "bpw": 3.91},
    {"key": "q4_k_m", "label": "Q4_K_M", "bpw": 4.89},
    {"key": "q5_k_m", "label": "Q5_K_M", "bpw": 5.7},
    {"key": "q6_k", "label": "Q6_K", "bpw": 6.56},
    {"key": "q8_0", "label": "Q8_0", "bpw": 8.5},
    {"key": "fp16", "label": "FP16", "bpw": 16.0},
]
BPW = {q["key"]: q["bpw"] for q in QUANT_LADDER}
QUANT_LABEL = {q["key"]: q["label"] for q in QUANT_LADDER}
# Quants for which the dataset carries a MEASURED on-disk GGUF size.
MEASURED_FIELD = {"q4_k_m": "q4_k_m_gb", "q8_0": "q8_0_gb", "fp16": "fp16_gb"}

OVERHEAD_GB = 0.8  # mirrors compute.ts: OVERHEAD_GB
KV_GB_PER_KTOK = 0.06  # mirrors compute.ts: KV_GB_PER_KTOK
DEFAULT_CONTEXT_K = 4  # mirrors compute.ts: DEFAULT_CONTEXT_K


# ---------------------------------------------------------------------------
# Core math — mirrors compute.ts function by function
# ---------------------------------------------------------------------------

def round1(n: float) -> float:
    """mirrors compute.ts Math.round(n*10)/10 (half-up, not banker's rounding)."""
    return math.floor(n * 10 + 0.5) / 10


def is_measured(model: dict, quant: str) -> bool:
    field = MEASURED_FIELD.get(quant)
    return bool(field and model.get(field))


def weights_gb(model: dict, quant: str) -> float:
    """Weights-only memory at a quant (GB). Measured on-disk size where the
    dataset has it; otherwise the bits-per-weight formula. mirrors compute.ts."""
    field = MEASURED_FIELD.get(quant)
    if field and model.get(field):
        return model[field]
    return round1((model["params_b"] * BPW[quant]) / 8)


def kv_cache_gb(model: dict, context_k: float) -> float:
    """KV-cache memory at a context length (GB), GQA-adjusted, sublinear.
    mirrors compute.ts: KV_GB_PER_KTOK * sqrt(params_b) * contextK."""
    return round1(KV_GB_PER_KTOK * math.sqrt(model["params_b"]) * context_k)


def total_gb(model: dict, quant: str, context_k: float) -> float:
    """Full estimate: weights + KV + fixed overhead. mirrors estimateMemory."""
    return round1(weights_gb(model, quant) + kv_cache_gb(model, context_k) + OVERHEAD_GB)


def usable_gb(device: dict) -> float:
    """Usable memory for weights after OS/headroom. mirrors compute.ts usableGb.
    1. usable_memory_gb if set (Macs)  2. unified/mac -> 70%  3. vram -> -1GB
    4. CPU RAM -> 60%."""
    if device.get("usable_memory_gb") is not None:
        return device["usable_memory_gb"]
    if device.get("memory_type") == "unified" and device.get("category") == "mac":
        return round1(device["memory_gb"] * 0.7)
    if device.get("memory_type") == "vram":
        return round1(device["memory_gb"] - 1)
    return round1(device["memory_gb"] * 0.6)  # CPU RAM


def verdict_at(total: float, usable: float) -> str:
    """yes / tight / no for a memory total against usable. mirrors the canRun
    threshold: tight when headroom < max(1 GB, 10% of usable)."""
    if total > usable:
        return "no"
    if (usable - total) < max(1.0, usable * 0.1):
        return "tight"
    return "yes"


def speed_class(model: dict, device: dict) -> str:
    """Qualitative generation speed. mirrors compute.ts speedClass."""
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
        return "ok" if eff_b <= 8 else "slow"
    if cat == "mac":
        return "fast" if eff_b <= 32 else "ok"
    return "fast" if eff_b <= 34 else "ok"  # discrete GPU


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

VERDICT_EMOJI = {"yes": "✅", "tight": "⚠️", "no": "❌"}
VERDICT_LABEL = {
    "yes": "Yes, it runs",
    "tight": "Yes, but tight",
    "no": "No, not enough memory",
}
FIT_MARK = {"yes": "✅ runs", "tight": "⚠️ tight", "no": "❌ no"}
SPEED_LABEL = {"fast": "fast", "ok": "usable", "slow": "slow", "none": "n/a"}

# Sort so the long dropdowns are scannable and effectively grouped: models
# cluster by family then ascend by size; devices cluster by category
# (Apple / GPU / phone / laptop) then ascend by memory. The names already carry
# the family/device, so sorting alone reads as grouped in a flat dropdown.
_CAT_ORDER = {"mac": 0, "gpu": 1, "amd": 1, "iphone": 2, "android": 3, "laptop": 4}
_MODELS_SORTED = sorted(MODELS, key=lambda m: (m.get("family", "").lower(), m["params_b"]))
_DEVICES_SORTED = sorted(
    DEVICES, key=lambda d: (_CAT_ORDER.get(d.get("category", ""), 9), d["memory_gb"])
)
MODEL_CHOICES = [m["name"] for m in _MODELS_SORTED]
DEVICE_CHOICES = [d["name"] for d in _DEVICES_SORTED]
_MODEL_BY_NAME = {m["name"]: m for m in MODELS}
_DEVICE_BY_NAME = {d["name"]: d for d in DEVICES}


def check_compatibility(model_name: str, device_name: str, context_k: float) -> str:
    """Gradio handler: verdict + a per-quant fit table for this device."""
    if not model_name or not device_name:
        return "_Select a model and a device to see the verdict._"
    model = _MODEL_BY_NAME.get(model_name)
    device = _DEVICE_BY_NAME.get(device_name)
    if not model or not device:
        return "_Unknown model or device._"

    # Clamp context to the model's trained window (honest: can't ask for more).
    max_ctx = model.get("default_context_k") or 128
    ctx = int(min(context_k or DEFAULT_CONTEXT_K, max_ctx))

    usable = usable_gb(device)
    kv = kv_cache_gb(model, ctx)

    # Baseline verdict at Q4_K_M (the site's canonical recommended quant).
    q4_total = total_gb(model, "q4_k_m", ctx)
    v = verdict_at(q4_total, usable)
    spd = speed_class(model, device) if v != "no" else "none"

    params = (
        f"{model['params_b']}B"
        if model["params_b"] >= 1
        else f"{round(model['params_b'] * 1000)}M"
    )
    if model.get("is_moe") and model.get("active_params_b"):
        params += f" MoE ({model['active_params_b']}B active)"

    # Per-quant fit ladder — the feature no GPU-only calculator has: size at
    # every quant AND whether it fits THIS device. Measured sizes unstarred.
    rows = []
    any_derived = False
    for q in QUANT_LADDER:
        t = total_gb(model, q["key"], ctx)
        fit = verdict_at(t, usable)
        measured = is_measured(model, q["key"])
        if not measured:
            any_derived = True
        star = "" if measured else "\\*"
        rows.append(f"| {q['label']}{star} | ~{t} GB | {FIT_MARK[fit]} |")
    ladder = "\n".join(rows)

    url = f"https://localmodel.run/can-i-run/{model['id']}/{device['id']}"
    footnote = (
        "\n\n\\* estimated from bits-per-weight; unstarred sizes are measured GGUF files."
        if any_derived
        else ""
    )

    return f"""## {VERDICT_EMOJI[v]} {VERDICT_LABEL[v]}

**{model_name}** ({params}) on **{device_name}**

### Needs ~{q4_total} GB &nbsp;·&nbsp; you have ~{usable} GB usable &nbsp;·&nbsp; speed: {SPEED_LABEL[spd]}
Q4_K_M baseline, weights + KV cache ({kv} GB @ {ctx}k) + {OVERHEAD_GB} GB overhead.

### Which quant fits {device_name}?
| Quant | Size (total, {ctx}k ctx) | Fits |
|---|---|---|
{ladder}
{footnote}

**[See the full breakdown → {url}]({url})**

*Uses measured GGUF sizes where available, against realistic usable memory per device
(Apple unified ~70%, discrete GPU minus 1 GB, CPU RAM ~60%). Estimates, not guarantees.
[Methodology](https://localmodel.run/methodology).*
"""


if _HAS_GRADIO:
    # Brand-flavoured theme: calibration blue, warm-neutral (matte) surfaces,
    # JetBrains Mono for the numbers — echoing localmodel.run's "instrument" look.
    THEME = gr.themes.Base(
        primary_hue=gr.themes.colors.blue,
        neutral_hue=gr.themes.colors.stone,
        font=[gr.themes.GoogleFont("Public Sans"), "system-ui", "sans-serif"],
        font_mono=[gr.themes.GoogleFont("JetBrains Mono"), "ui-monospace", "monospace"],
    ).set(
        button_primary_background_fill="#2D5FA8",
        button_primary_background_fill_hover="#1F4E96",
        button_primary_text_color="#ffffff",
        block_radius="4px",
        block_border_width="1px",
    )

    CSS = """
    .gradio-container { max-width: 860px !important; margin: 0 auto !important; }
    #cir-out { border: 1px solid var(--border-color-primary); border-radius: 6px;
               padding: 2px 22px 16px; background: var(--block-background-fill); }
    #cir-out h2 { margin: 0.7rem 0 0.2rem; font-size: 1.5rem; letter-spacing: -0.01em; }
    #cir-out h3 { font-size: 1.02rem; font-weight: 600; margin: 1.1rem 0 0.3rem; }
    #cir-out table { width: 100%; border-collapse: collapse; margin: 0.4rem 0; }
    #cir-out th, #cir-out td { padding: 6px 10px; text-align: left;
        border-bottom: 1px solid var(--border-color-primary); font-variant-numeric: tabular-nums; }
    #cir-out td:nth-child(2) { font-family: var(--font-mono); white-space: nowrap; }
    #cir-out td:last-child { white-space: nowrap; }
    #cir-out a { color: #2D5FA8; font-weight: 600; }
    """

    # The localmodel.run needle-arc mark (matches favicon.svg), self-contained.
    LOGO_SVG = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="34" height="34" '
        'style="border-radius:6px;flex:none">'
        '<rect width="32" height="32" rx="4" fill="#20211f"/>'
        '<path d="M6 24 A 10 10 0 0 1 26 24" fill="none" stroke="#edeae2" stroke-width="2.6" stroke-linecap="round"/>'
        '<line x1="16" y1="24" x2="18.8" y2="15.6" stroke="#7fa8e0" stroke-width="2.8" stroke-linecap="round"/>'
        '<circle cx="16" cy="24" r="2.2" fill="#7fa8e0"/></svg>'
    )

    with gr.Blocks(theme=THEME, css=CSS, title="Can I Run It Locally? — localmodel.run") as demo:
        gr.HTML(
            '<div style="display:flex;align-items:center;gap:12px;margin:2px 0 6px">'
            + LOGO_SVG
            + '<span style="font-size:1.7rem;font-weight:700;letter-spacing:-0.01em">'
            "Can I Run It Locally?</span></div>"
        )
        gr.Markdown(
            """The VRAM check that answers for your **actual device** — Mac, PC, iPhone, Android — not just
"type your GPU's GB." Uses **measured GGUF file sizes** and shows **which quant fits your
device**. Powered by **[localmodel.run](https://localmodel.run)**.
"""
        )

        with gr.Row():
            model_dd = gr.Dropdown(
                choices=MODEL_CHOICES,
                label="Model",
                value="Llama 3.1 8B" if "Llama 3.1 8B" in MODEL_CHOICES else MODEL_CHOICES[0],
                filterable=True,
                scale=1,
            )
            device_dd = gr.Dropdown(
                choices=DEVICE_CHOICES,
                label="Your device  (Mac · PC · GPU · phone)",
                value="Apple M4 (16GB)" if "Apple M4 (16GB)" in DEVICE_CHOICES else DEVICE_CHOICES[0],
                filterable=True,
                scale=1,
            )

        ctx_slider = gr.Slider(
            minimum=1, maximum=128, value=4, step=1,
            label="Context length (k tokens) — grows the KV cache",
        )

        result_md = gr.Markdown(elem_id="cir-out")

        for ev in (model_dd.change, device_dd.change, ctx_slider.change):
            ev(fn=check_compatibility, inputs=[model_dd, device_dd, ctx_slider], outputs=result_md)
        demo.load(fn=check_compatibility, inputs=[model_dd, device_dd, ctx_slider], outputs=result_md)

        gr.Markdown(
            """---
Text LLMs across measured quants and real devices. For image / video / audio models, side-by-side
compares, reverse "what runs on my rig" lookups and embeddable badges, see the full site:
**[localmodel.run](https://localmodel.run)** · [Methodology](https://localmodel.run/methodology) ·
[Compare](https://localmodel.run/compare)
"""
        )

if __name__ == "__main__":
    if not _HAS_GRADIO:
        raise RuntimeError(
            "gradio is not installed — the Space SDK should provide it. "
            "Check the Space build logs for the real install/import error."
        )
    demo.launch()
