import { useMemo, useState, type CSSProperties } from "react";
import { canRun, usableGb, QUANT_LABEL, verdictLabelShort } from "@/lib/compute";
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
// Inline lucide icons (the React island can't use astro-icon); these mirror the
// circle-check / circle-alert / circle-x / circle-help marks in VerdictBadge.astro.
function VerdictIcon({ verdict, size = 15 }: { verdict: Verdict; size?: number }) {
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

// Custom dropdown chevron: native <select> arrows render inconsistently and
// sit misaligned against our padding, so we hide the native one (appearance-none)
// and position our own, vertically centered against the control.
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
  // deviceMemory is coarse (caps at 8). Use it as a floor.
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

export default function Detector() {
  const [deviceId, setDeviceId] = useState("apple-m4-16gb");
  const [modelId, setModelId] = useState("llama-3.1-8b");
  const [detected, setDetected] = useState(false);

  const device = devices.find((d) => d.id === deviceId)!;
  const model = models.find((m) => m.id === modelId)!;
  const result = useMemo(() => canRun(model, device), [model, device]);
  const usable = usableGb(device);
  const platform = devicePlatform(device);
  const tool = getTool(platform);
  const canOllama =
    (platform === "mac" || platform === "windows" || platform === "linux") && model.ollama_tag;

  const needGb = result.neededGb ?? result.estimate?.totalGb ?? 0;
  const max = Math.max(needGb, usable) * 1.08;
  const needPct = Math.min(100, (needGb / max) * 100);
  const usablePct = Math.min(100, (usable / max) * 100);

  function detect() {
    setDeviceId(guessDeviceId());
    setDetected(true);
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Your device
          </span>
          <div className="relative">
            <select
              id="detector-device"
              name="device"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {sortedDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Model to run
          </span>
          <div className="relative">
            <select
              id="detector-model"
              name="model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {sortedModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.params_b}B)
                </option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={detect}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Auto-detect my device
        </button>
        {detected && (
          <span className="text-xs text-muted-foreground">
            Detected approximately, adjust if needed.
          </span>
        )}
      </div>

      <div className="mt-5 border-t border-border/60 pt-5" aria-live="polite" aria-atomic="true">
        <div
          key={result.verdict}
          className="verdict-word flex items-center gap-3 font-mono text-5xl font-bold leading-none tracking-tight sm:text-6xl"
          style={{ color: VERDICT_TEXT[result.verdict] }}
        >
          <VerdictIcon verdict={result.verdict} size={42} />
          {verdictLabelShort(result.verdict)}
        </div>

        {/* Fit gauge: how much of the device's usable memory this model needs,
            with a threshold mark at the usable ceiling. */}
        <div className="mt-7">
          <div
            className="gauge"
            role="img"
            aria-label={`Memory: needs ${needGb} GB, device has ${usable} GB usable`}
          >
            <div
              className="gauge-fill bar-fill"
              style={{
                transform: `scaleX(${needPct / 100})`,
                background: `color-mix(in oklch, ${result.verdict === "no" ? "var(--color-verdict-no)" : "var(--color-verdict-yes)"} 88%, transparent)`,
              }}
            />
            <div
              className="gauge-mark"
              data-label={`usable ${usable} GB`}
              style={{ "--at": `${usablePct}%` } as CSSProperties}
              aria-hidden="true"
            />
          </div>
          <div className="mt-2.5 flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
            <span>
              needs <span className="text-foreground">{result.estimate?.totalGb} GB</span>
            </span>
            <span>
              usable <span className="text-foreground">{usable} GB</span>
            </span>
          </div>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{result.reason}</p>

        {result.verdict !== "no" && canOllama && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm">
            <span className="text-[var(--color-brand)]">$</span>
            <code className="flex-1 overflow-x-auto">ollama run {model.ollama_tag}</code>
          </div>
        )}
        {tool && (
          <p className="mt-3 text-xs text-muted-foreground">
            Best on {platformLabel(platform)}:{" "}
            <strong className="text-foreground">{tool.beginner.name}</strong>
            {result.quant ? ` · ${QUANT_LABEL[result.quant]} recommended` : ""}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <a
            href={`/can-i-run/${model.id}/${device.id}`}
            className="text-sm font-medium text-[var(--color-brand)] hover:underline"
          >
            See the full breakdown <span aria-hidden="true">→</span>
          </a>
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
