import { useMemo, useState, type CSSProperties } from "react";
import {
  canRun,
  usableGb,
  QUANT_LABEL,
  verdictLabel,
  DEFAULT_CONTEXT_K,
  type SpeedClass,
} from "@/lib/compute";
import { models, devices, devicePlatform, getTool, platformLabel } from "@/lib/data";
import type { Verdict } from "@/data/types";

const sortedDevices = [...devices].sort((a, b) => {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.memory_gb - b.memory_gb;
});
const sortedModels = [...models].sort((a, b) => a.params_b - b.params_b);

// The WCAG-AA-tuned --verdict-*-fg token for the verdict text (matches
// VerdictBadge.astro, which keeps the verdict readable in light mode).
const VERDICT_TEXT: Record<Verdict, string> = {
  yes: "var(--verdict-yes-fg)",
  tight: "var(--verdict-tight-fg)",
  no: "var(--verdict-no-fg)",
  unknown: "var(--muted-foreground)",
};
const VERDICT_COLOR: Record<Verdict, string> = {
  yes: "var(--color-verdict-yes)",
  tight: "var(--color-verdict-tight)",
  no: "var(--color-verdict-no)",
  unknown: "var(--muted-foreground)",
};
// Qualitative speed, NOT a tok/s number. The site has no sourced per-device
// throughput (it's a documented, deferred data item), and the project rule is
// never to show a guessed figure — so the engine's SpeedClass is the honest
// readout next to the verdict.
const SPEED_LABEL: Record<SpeedClass, string> = {
  fast: "fast",
  ok: "runs",
  slow: "slow",
  none: "",
};

// Inline lucide icons (the React island can't use astro-icon); these mirror the
// circle-check / circle-alert / circle-x / circle-help marks in VerdictBadge.astro.
function VerdictIcon({ verdict, size = 22 }: { verdict: Verdict; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      {verdict === "yes" && <path d="m9 12 2 2 4-4" />}
      {verdict === "tight" && (
        <>
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </>
      )}
      {verdict === "no" && (
        <>
          <path d="m15 9-6 6" />
          <path d="m9 9 6 6" />
        </>
      )}
      {verdict === "unknown" && (
        <>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </>
      )}
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function guessDeviceId(): string {
  const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const isMac = /Mac/.test(navigator.userAgent);
  const isMobile = /iPhone|iPad|Android/.test(navigator.userAgent);
  if (isMobile) {
    if (/iPhone/.test(navigator.userAgent)) return "iphone-16-pro";
    if (/iPad/.test(navigator.userAgent)) return "ipad-pro-m4-16gb";
    return "android-generic-12gb";
  }
  const gb = typeof dm === "number" ? dm : 16;
  if (isMac) {
    if (gb <= 8) return "apple-m1-8gb";
    if (gb <= 16) return "apple-m4-16gb";
    return "apple-m4-pro-48gb";
  }
  if (gb <= 8) return "laptop-8gb";
  if (gb <= 16) return "laptop-16gb";
  return "laptop-32gb";
}

const fmtCtx = (k: number) => (k >= 1000 ? `${k / 1000}M` : `${k}k`);

// Glass field: a styled native <select> (accessible, id-based, the source of
// truth) faced as a .gfield with the selected label shown and a custom chevron.
function GlassField({
  label,
  value,
  displayValue,
  onChange,
  options,
}: {
  label: string;
  value: string;
  displayValue: string;
  onChange: (id: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="gfield-label">{label}</span>
      <div className="gfield">
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="truncate">{displayValue}</span>
        <ChevronDown />
      </div>
    </label>
  );
}

export default function Detector() {
  const [deviceId, setDeviceId] = useState("apple-m4-16gb");
  const [modelId, setModelId] = useState("llama-3.1-8b");
  const [ctxK, setCtxK] = useState(DEFAULT_CONTEXT_K);
  const [detected, setDetected] = useState(false);

  const device = devices.find((d) => d.id === deviceId)!;
  const model = models.find((m) => m.id === modelId)!;
  const maxCtxK = model.default_context_k ?? 128;
  const effCtxK = Math.min(ctxK, maxCtxK);

  const result = useMemo(() => canRun(model, device, effCtxK), [model, device, effCtxK]);
  const usable = usableGb(device);
  const platform = devicePlatform(device);
  const tool = getTool(platform);
  const canOllama =
    (platform === "mac" || platform === "windows" || platform === "linux") && model.ollama_tag;

  const needGb = result.estimate?.totalGb ?? 0;
  // Match the gauge track formula: a little headroom past the larger of
  // need/usable so the fill and the usable-threshold mark both sit on-track.
  const trackMax = Math.max(needGb, usable) * 1.14;
  const fillScale = Math.min(1, needGb / trackMax);
  const markAt = Math.min(100, (usable / trackMax) * 100);
  const speed = SPEED_LABEL[result.speed];
  const cmd = canOllama ? `ollama run ${model.ollama_tag}` : null;
  const vc = result.verdict === "no" ? VERDICT_COLOR.no : VERDICT_COLOR[result.verdict];

  function detect() {
    setDeviceId(guessDeviceId());
    setDetected(true);
  }

  return (
    <div className="det-body">
      <div className="det-selects">
        <GlassField
          label="Model"
          value={modelId}
          displayValue={model.name}
          onChange={setModelId}
          options={sortedModels.map((m) => ({ id: m.id, label: `${m.name} (${m.params_b}B)` }))}
        />
        <GlassField
          label="Device"
          value={deviceId}
          displayValue={device.name}
          onChange={setDeviceId}
          options={sortedDevices.map((d) => ({ id: d.id, label: d.name }))}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={detect} className="gbtn text-xs">
          Auto-detect my device
        </button>
        {detected && (
          <span className="text-xs text-muted-foreground">
            Detected approximately, adjust if needed.
          </span>
        )}
      </div>

      <div className="det-result" aria-live="polite" aria-atomic="true">
        <div
          key={result.verdict}
          className="verdict-hero"
          data-v={result.verdict}
          style={{ color: VERDICT_TEXT[result.verdict] }}
        >
          <VerdictIcon verdict={result.verdict} size={22} />
          <span>{verdictLabel(result.verdict)}</span>
          {speed && <span className="tok">{speed}</span>}
        </div>

        {/* Graduated fit gauge: how much usable memory this model needs, with
            a threshold mark at the usable ceiling. */}
        <div
          className="gauge lens mt-4"
          role="img"
          aria-label={`Memory: needs ${needGb} GB, device has ${usable} GB usable`}
        >
          <div
            className="gauge-fill bar-fill"
            style={
              {
                transform: `scaleX(${fillScale})`,
                background: `color-mix(in oklch, ${vc} 88%, transparent)`,
                "--vc": vc,
              } as CSSProperties
            }
          />
          <div
            className="gauge-mark"
            data-label={`usable ${usable} GB`}
            style={{ "--at": `${markAt}%` } as CSSProperties}
            aria-hidden="true"
          />
        </div>
        <div className="read">
          <span>
            needs <b className="num">{needGb} GB</b>
          </span>
          <span>
            usable <b className="num">{usable} GB</b>
          </span>
        </div>

        {/* Context-length slider: KV cache grows with context, so a long context
            can flip a tight fit to no. Defensible (kvCacheGb is sourced). */}
        <div className="ctx-control">
          <div className="ctx-head">
            <label htmlFor="det-ctx">Context length</label>
            <span className="ctx-val">{fmtCtx(effCtxK)}</span>
          </div>
          <input
            type="range"
            id="det-ctx"
            min={1}
            max={maxCtxK}
            step={1}
            value={effCtxK}
            onChange={(e) => setCtxK(parseInt(e.target.value, 10))}
            aria-label="Context length in thousands of tokens"
          />
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{result.reason}</p>

        <div className="det-cta">
          <a href={`/can-i-run/${model.id}/${device.id}`} className="gbtn gbtn--primary magnetic">
            See the full breakdown
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
          {cmd && (
            <div className="cmd-chip" data-cmd={cmd}>
              <span className="d">$</span>
              <span className="cmd-text">{cmd}</span>
              <button type="button" className="copy" aria-label="Copy command">
                copy
              </button>
            </div>
          )}
        </div>

        {tool && (
          <p className="mt-3 text-xs text-muted-foreground">
            Best on {platformLabel(platform)}:{" "}
            <strong className="text-foreground">{tool.beginner.name}</strong>
            {result.quant ? ` · ${QUANT_LABEL[result.quant]} recommended` : ""}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <a
            href={`/rig/${device.id}`}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Get my Rig Score <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
