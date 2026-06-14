import { useMemo, useState } from "react";
import { canRun, usableGb, QUANT_LABEL, verdictLabel } from "@/lib/compute";
import { models, devices, devicePlatform, getTool, platformLabel } from "@/lib/data";
import type { Verdict } from "@/data/types";

const sortedDevices = [...devices].sort((a, b) => {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.memory_gb - b.memory_gb;
});
const sortedModels = [...models].sort((a, b) => a.params_b - b.params_b);

// Vivid color for fill/border; the WCAG-AA-tuned --verdict-*-fg token for text
// (matches VerdictBadge.astro, which keeps the badge readable in light mode).
const VERDICT_COLOR: Record<Verdict, string> = {
  yes: "var(--color-verdict-yes)",
  tight: "var(--color-verdict-tight)",
  no: "var(--color-verdict-no)",
  unknown: "var(--muted-foreground)",
};
const VERDICT_TEXT: Record<Verdict, string> = {
  yes: "var(--verdict-yes-fg)",
  tight: "var(--verdict-tight-fg)",
  no: "var(--verdict-no-fg)",
  unknown: "var(--muted-foreground)",
};
const VERDICT_ICON: Record<Verdict, string> = { yes: "✓", tight: "≈", no: "✕", unknown: "?" };

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
    <div className="rounded-2xl border border-border bg-card/70 p-5 shadow-sm backdrop-blur sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Your device
          </span>
          <select
            id="detector-device"
            name="device"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {sortedDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Model to run
          </span>
          <select
            id="detector-model"
            name="model"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {sortedModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.params_b}B)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={detect}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Auto-detect my device
        </button>
        {detected && (
          <span className="text-xs text-muted-foreground">
            Detected approximately, adjust if needed.
          </span>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-border bg-background p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold"
            style={{
              color: VERDICT_TEXT[result.verdict],
              borderColor: `color-mix(in oklch, ${VERDICT_COLOR[result.verdict]} 40%, transparent)`,
              background: `color-mix(in oklch, ${VERDICT_COLOR[result.verdict]} 12%, transparent)`,
            }}
          >
            <span aria-hidden>{VERDICT_ICON[result.verdict]}</span>
            {verdictLabel(result.verdict)}
          </div>
          <span className="text-xs text-muted-foreground">
            needs ~{result.estimate?.totalGb} GB · usable ~{usable} GB
          </span>
        </div>

        <div className="relative mt-4 h-7 w-full overflow-hidden rounded-md bg-muted">
          <div
            className="h-full rounded-md transition-all"
            style={{
              width: `${needPct}%`,
              background: `color-mix(in oklch, ${result.verdict === "no" ? "var(--color-verdict-no)" : "var(--color-verdict-yes)"} 75%, transparent)`,
            }}
          />
          <div
            className="absolute inset-y-0 w-px bg-foreground/70"
            style={{ left: `${usablePct}%` }}
          />
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
            See the full breakdown →
          </a>
          <a
            href={`/rig/${device.id}`}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Get my Rig Score →
          </a>
        </div>
      </div>
    </div>
  );
}
