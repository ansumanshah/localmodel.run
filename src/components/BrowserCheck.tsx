import { useEffect, useRef, useState, type CSSProperties } from "react";
import { fit, probe, refresh } from "localfit";
import type { Env, FitPlan, Verdict } from "localfit";
import { formatBytes, type CatalogEntry } from "@/lib/browser-check";

interface Props {
  /** The full 54-model catalog, id/name/task/headline bytes only (see
   *  src/lib/browser-check.ts CatalogEntry). Passed in from the Astro page,
   *  never fetched: this island scores it locally via localfit's fit(). */
  catalog: CatalogEntry[];
  /** Absolute URL of this page, for the share card footer and the copied
   *  Markdown (computed at build time from Astro.site, not hardcoded). */
  pageUrl: string;
}

// ── Probe state ──────────────────────────────────────────────────────────

interface ReadyPhase {
  name: "ready";
  env: Env;
  // Two signals localfit's Env does not carry (fit() never reads them), read
  // directly here because the brief asks for them by name.
  crossOriginIsolated: boolean | null;
  hardwareConcurrency: number | null;
}
type Phase =
  | { name: "checking" }
  | { name: "unsupported" }
  | { name: "error"; message: string }
  | ReadyPhase;

interface ScanResult {
  id: string;
  name: string;
  verdict: Verdict;
  backend: "webgpu" | "wasm";
  downloadBytes: number;
}
type ScanState =
  | { name: "idle" }
  | { name: "scanning" }
  | { name: "done"; results: ScanResult[] }
  | { name: "error"; message: string };

type StorageState =
  | { name: "loading" }
  | { name: "unavailable" }
  | { name: "ready"; usageBytes: number; quotaBytes: number };

interface ScanSummary {
  total: number;
  runnable: number;
  webgpuCount: number;
  wasmCount: number;
  tooBigCount: number;
  unknownCount: number;
  smallestRunnable: ScanResult[];
}

function summarizeScan(results: ScanResult[]): ScanSummary {
  let webgpuCount = 0;
  let wasmCount = 0;
  let tooBigCount = 0;
  let unknownCount = 0;
  for (const r of results) {
    if (r.verdict === "unknown") unknownCount++;
    else if (r.verdict === "no") tooBigCount++;
    else if (r.backend === "webgpu") webgpuCount++;
    else wasmCount++;
  }
  const smallestRunnable = results
    .filter((r) => r.verdict === "yes" || r.verdict === "tight")
    .sort((a, b) => a.downloadBytes - b.downloadBytes)
    .slice(0, 3);
  return {
    total: results.length,
    runnable: webgpuCount + wasmCount,
    webgpuCount,
    wasmCount,
    tooBigCount,
    unknownCount,
    smallestRunnable,
  };
}

function fmtTri(v: boolean | null): string {
  return v == null ? "unknown" : v ? "yes" : "no";
}

function adapterLabel(info: Env["webgpu"]["adapterInfo"]): string {
  if (!info) return "not exposed by this browser";
  const bits = [info.vendor, info.architecture, info.device].filter(
    (b): b is string => !!b && b.length > 0,
  );
  return bits.length > 0 ? bits.join(" / ") : "exposed, but blank (privacy-limited)";
}

function deviceMemoryLabel(gb: number | null): string {
  if (gb == null) return "unknown (non-Chromium)";
  return gb === 8 ? "8 GB (capped, could be more)" : `${gb} GB`;
}

const VERDICT_FG: Record<"yes" | "no", string> = {
  yes: "var(--verdict-yes-fg)",
  no: "var(--verdict-no-fg)",
};

function StatusIcon({ kind }: { kind: "yes" | "tight" | "no" | "unknown" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      {kind === "yes" && <path d="m9 12 2 2 4-4" />}
      {kind === "tight" && <path d="M12 8v4M12 16h.01" />}
      {kind === "no" && <path d="m15 9-6 6M9 9l6 6" />}
      {kind === "unknown" && <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />}
    </svg>
  );
}

function ReadoutTile({ k, v }: { k: string; v: string }) {
  return (
    <div className="readout surface-lite">
      <span className="k">{k}</span>
      <span className="v">
        <span className="num">{v}</span>
      </span>
    </div>
  );
}

// ── Markdown export ──────────────────────────────────────────────────────

function buildMarkdown(
  phase: ReadyPhase,
  storage: StorageState,
  summary: ScanSummary | null,
  pageUrl: string,
): string {
  const lines: string[] = [];
  lines.push("**Browser capability report**");
  lines.push("");
  lines.push(`- WebGPU: ${phase.env.webgpu.supported ? "available" : "not available"}`);
  if (phase.env.webgpu.supported)
    lines.push(`- GPU adapter: ${adapterLabel(phase.env.webgpu.adapterInfo)}`);
  lines.push(`- shader-f16: ${fmtTri(phase.env.webgpu.shaderF16)}`);
  if (phase.env.webgpu.maxBufferSize != null)
    lines.push(`- Max buffer size (per buffer): ${formatBytes(phase.env.webgpu.maxBufferSize)}`);
  lines.push(`- WASM SIMD: ${phase.env.wasm.simd ? "yes" : "no"}`);
  lines.push(`- WASM threads: ${phase.env.wasm.threads ? "yes" : "no"}`);
  lines.push(`- Cross-origin isolated: ${fmtTri(phase.crossOriginIsolated)}`);
  lines.push(`- CPU threads (hardwareConcurrency): ${phase.hardwareConcurrency ?? "unknown"}`);
  lines.push(`- Device memory: ${deviceMemoryLabel(phase.env.memory.deviceMemoryGb)}`);
  lines.push(`- Secure context: ${phase.env.platform.isSecureContext ? "yes" : "no"}`);
  if (storage.name === "ready")
    lines.push(
      `- Storage used: ${formatBytes(storage.usageBytes)} of ${formatBytes(storage.quotaBytes)} quota`,
    );
  if (summary) {
    lines.push("");
    lines.push(
      `**${summary.runnable} of ${summary.total} models run in this browser** (${summary.webgpuCount} over WebGPU, ${summary.wasmCount} over WASM, ${summary.tooBigCount} too large).`,
    );
  }
  lines.push("");
  lines.push(`Measured live in this browser, not estimated. Full report: ${pageUrl}`);
  return lines.join("\n");
}

// ── PNG share card ───────────────────────────────────────────────────────
// Same instrument plate style as the Rig Score card (RigCard.astro) and the
// pair-page verdict card (can-i-run/[model]/[device].astro): matte gunmetal
// plate, a whisper of top light, Fjalla One display + JetBrains Mono
// numerals, an inked double-ruled stamp box. Every value drawn onto it comes
// from the same probe/scan state rendered above; nothing is invented for
// the card that is not also visible on the page.

const DISPLAY = '"Fjalla One", "Avenir Next Condensed", "Arial Narrow", sans-serif';
const MONO = '"JetBrains Mono Variable", ui-monospace, Menlo, monospace';
const STAMP_COLOR: Record<"yes" | "no", string> = { yes: "#8fbf88", no: "#e08579" };

interface CardData {
  webgpuSupported: boolean;
  adapter: string | null;
  shaderF16: boolean | null;
  maxBufferSize: number | null;
  simd: boolean;
  threads: boolean;
  deviceMemoryLabel: string;
  runnable: number;
  total: number;
  webgpuCount: number;
  wasmCount: number;
  tooBigCount: number;
  pageUrl: string;
}

function roundedRect(
  x: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  rad: number,
) {
  x.beginPath();
  x.moveTo(rx + rad, ry);
  x.arcTo(rx + rw, ry, rx + rw, ry + rh, rad);
  x.arcTo(rx + rw, ry + rh, rx, ry + rh, rad);
  x.arcTo(rx, ry + rh, rx, ry, rad);
  x.arcTo(rx, ry, rx + rw, ry, rad);
  x.closePath();
}

function fitText(
  x: CanvasRenderingContext2D,
  text: string,
  weight: string,
  family: string,
  startPx: number,
  minPx: number,
  maxWidth: number,
): number {
  let px = startPx;
  x.font = `${weight} ${px}px ${family}`;
  while (px > minPx && x.measureText(text).width > maxWidth) {
    px -= 2;
    x.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

async function drawReportCard(canvas: HTMLCanvasElement, d: CardData): Promise<void> {
  await document.fonts?.ready;
  const W = 1200;
  const H = 630;
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const x = canvas.getContext("2d");
  if (!x) return;
  x.setTransform(scale, 0, 0, scale, 0, 0);

  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1c1f24");
  g.addColorStop(1, "#15171a");
  roundedRect(x, 0, 0, W, H, 16);
  x.fillStyle = g;
  x.fill();
  const sh = x.createLinearGradient(0, 0, 0, H * 0.3);
  sh.addColorStop(0, "rgba(237,239,242,0.06)");
  sh.addColorStop(1, "rgba(237,239,242,0)");
  roundedRect(x, 0, 0, W, H, 16);
  x.fillStyle = sh;
  x.fill();

  const pad = 64;
  x.textBaseline = "alphabetic";

  // Header
  x.fillStyle = "rgba(255,255,255,0.72)";
  x.font = "600 22px " + MONO;
  x.fillText("BROWSER CAPABILITY REPORT", pad, pad + 8);
  const brand = "localmodel.run";
  x.fillText(brand, W - pad - x.measureText(brand).width, pad + 8);

  // Stamp
  const stampColor = d.webgpuSupported ? STAMP_COLOR.yes : STAMP_COLOR.no;
  const stampText = d.webgpuSupported ? "WEBGPU AVAILABLE" : "NO WEBGPU";
  x.font = "400 44px " + DISPLAY;
  const stW = x.measureText(stampText).width;
  const stX = pad;
  const stY = pad + 48;
  const boxW = stW + 56;
  const boxH = 82;
  x.strokeStyle = stampColor;
  x.lineWidth = 3;
  x.strokeRect(stX, stY, boxW, boxH);
  x.lineWidth = 1.5;
  x.strokeRect(stX + 6, stY + 6, boxW - 12, boxH - 12);
  x.fillStyle = stampColor;
  x.fillText(stampText, stX + 28, stY + boxH / 2 + 16);

  const leftColW = W * 0.56 - pad;

  // Big runnable/total line
  const bigY = stY + boxH + 78;
  const bigText = `${d.runnable} OF ${d.total} MODELS RUN HERE`;
  const bigPx = fitText(x, bigText, "700", MONO, 46, 24, leftColW);
  x.fillStyle = "#fff";
  x.font = `700 ${bigPx}px ${MONO}`;
  x.fillText(bigText, pad, bigY);

  // Breakdown
  const breakdownY = bigY + 40;
  const breakdown = `${d.webgpuCount} WebGPU · ${d.wasmCount} WASM · ${d.tooBigCount} too large`;
  const bdPx = fitText(x, breakdown, "500", MONO, 26, 16, leftColW);
  x.fillStyle = "rgba(255,255,255,0.75)";
  x.font = `500 ${bdPx}px ${MONO}`;
  x.fillText(breakdown, pad, breakdownY);

  // Adapter line, when the browser exposes one
  if (d.webgpuSupported && d.adapter) {
    const adY = breakdownY + 34;
    const adPx = fitText(x, d.adapter, "400", "system-ui, sans-serif", 22, 14, leftColW);
    x.fillStyle = "rgba(255,255,255,0.55)";
    x.font = `400 ${adPx}px system-ui, sans-serif`;
    x.fillText(d.adapter, pad, adY);
  }

  // Right column: measured limits
  const rightX = pad + leftColW + 40;
  const rightW = W - pad - rightX;
  const limitLines = [
    `shader-f16 ${fmtTri(d.shaderF16)}`,
    `max buffer ${d.maxBufferSize != null ? formatBytes(d.maxBufferSize) : "unknown"} (per buffer)`,
    `SIMD ${d.simd ? "yes" : "no"} · threads ${d.threads ? "yes" : "no"}`,
    `device memory ${d.deviceMemoryLabel}`,
  ];
  x.fillStyle = "rgba(255,255,255,0.68)";
  let ly = stY + 26;
  for (const line of limitLines) {
    const lpx = fitText(x, line, "400", MONO, 23, 14, rightW);
    x.font = `400 ${lpx}px ${MONO}`;
    x.fillText(line, rightX, ly);
    ly += 34;
  }

  // Footer
  x.strokeStyle = "rgba(255,255,255,0.2)";
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(pad, H - 88);
  x.lineTo(W - pad, H - 88);
  x.stroke();
  x.fillStyle = "rgba(255,255,255,0.7)";
  const urlPx = fitText(x, d.pageUrl, "500", MONO, 24, 14, W - pad * 2);
  x.font = `500 ${urlPx}px ${MONO}`;
  x.fillText(d.pageUrl, pad, H - 44);

  canvas.dataset.drawn = "1";
}

// ── Component ─────────────────────────────────────────────────────────────

export default function BrowserCheck({ catalog, pageUrl }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: "checking" });
  const [scan, setScan] = useState<ScanState>({ name: "idle" });
  const [storage, setStorage] = useState<StorageState>({ name: "loading" });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Probe the browser. refresh() first, same call order as the /browser
  // playground island (src/components/playground/Playground.tsx): localfit's
  // bundled snapshot ships with the package and can lag a catalog
  // correction, so refresh() pulls the live catalog (same origin as this
  // page's data) before fit() reads current numbers. refresh() already
  // silently keeps the snapshot on any failure; the catch here only guards
  // against an unexpected thrown (not rejected) error from a locked-down
  // browser (e.g. fetch blocked entirely).
  useEffect(() => {
    let alive = true;
    if (typeof WebAssembly === "undefined") {
      setPhase({ name: "unsupported" });
      return;
    }
    (async () => {
      try {
        await refresh();
      } catch {
        // ignored: refresh() keeps whatever snapshot it already had
      }
      const env = await probe();
      const crossOriginIsolatedValue =
        typeof self !== "undefined" && "crossOriginIsolated" in self
          ? Boolean((self as typeof self & { crossOriginIsolated?: boolean }).crossOriginIsolated)
          : null;
      const hardwareConcurrencyValue =
        typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
          ? navigator.hardwareConcurrency
          : null;
      if (!alive) return;
      setPhase({
        name: "ready",
        env,
        crossOriginIsolated: crossOriginIsolatedValue,
        hardwareConcurrency: hardwareConcurrencyValue,
      });
    })().catch((err: unknown) => {
      if (!alive) return;
      setPhase({ name: "error", message: err instanceof Error ? err.message : String(err) });
    });
    return () => {
      alive = false;
    };
  }, []);

  // Storage quota estimate: independent of the WebGPU/WASM probe, resolves
  // (or is simply unavailable) on its own schedule.
  useEffect(() => {
    let alive = true;
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      setStorage({ name: "unavailable" });
      return;
    }
    navigator.storage
      .estimate()
      .then((r) => {
        if (!alive) return;
        if (typeof r.usage !== "number" || typeof r.quota !== "number") {
          setStorage({ name: "unavailable" });
          return;
        }
        setStorage({ name: "ready", usageBytes: r.usage, quotaBytes: r.quota });
      })
      .catch(() => {
        if (alive) setStorage({ name: "unavailable" });
      });
    return () => {
      alive = false;
    };
  }, []);

  // Score the whole catalog once the browser is probed: one fit() call per
  // model, against the same probed Env (no re-probing per model).
  useEffect(() => {
    if (phase.name !== "ready") return;
    let alive = true;
    setScan({ name: "scanning" });
    (async () => {
      const out: ScanResult[] = [];
      for (const m of catalog) {
        let plan: FitPlan;
        try {
          plan = await fit(m.id, { env: phase.env });
        } catch {
          out.push({
            id: m.id,
            name: m.name,
            verdict: "unknown",
            backend: "wasm",
            downloadBytes: m.headlineWasmBytes,
          });
          continue;
        }
        out.push({
          id: m.id,
          name: m.name,
          verdict: plan.verdict,
          backend: plan.backend,
          downloadBytes: plan.downloadBytes,
        });
      }
      return out;
    })().then(
      (out) => {
        if (alive) setScan({ name: "done", results: out });
      },
      (err: unknown) => {
        if (alive)
          setScan({ name: "error", message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => {
      alive = false;
    };
  }, [phase, catalog]);

  const summary = scan.name === "done" ? summarizeScan(scan.results) : null;

  // Shared by the auto-draw effect below and the Download button, so a click
  // always exports the latest state instead of racing the effect's draw.
  function cardData(readyPhase: ReadyPhase, s: ScanSummary): CardData {
    return {
      webgpuSupported: readyPhase.env.webgpu.supported,
      adapter: readyPhase.env.webgpu.adapterInfo
        ? adapterLabel(readyPhase.env.webgpu.adapterInfo)
        : null,
      shaderF16: readyPhase.env.webgpu.shaderF16,
      maxBufferSize: readyPhase.env.webgpu.maxBufferSize,
      simd: readyPhase.env.wasm.simd,
      threads: readyPhase.env.wasm.threads,
      deviceMemoryLabel: deviceMemoryLabel(readyPhase.env.memory.deviceMemoryGb),
      runnable: s.runnable,
      total: s.total,
      webgpuCount: s.webgpuCount,
      wasmCount: s.wasmCount,
      tooBigCount: s.tooBigCount,
      pageUrl: pageUrl.replace(/^https?:\/\//, ""),
    };
  }

  // Draw the share card as soon as there is a full catalog summary to put on
  // it. Storage quota is not part of the card (it would not fit the layout
  // cleanly); it still appears in the readout grid and the Markdown export.
  useEffect(() => {
    if (phase.name !== "ready" || !summary) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawReportCard(canvas, cardData(phase, summary)).catch(() => {
      // A failed draw just leaves the canvas blank; the Download button below
      // re-attempts on click, and Copy as Markdown does not depend on it.
    });
  }, [phase, summary, pageUrl]);

  function handleDownload() {
    if (phase.name !== "ready" || !summary) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    Promise.resolve(drawReportCard(canvas, cardData(phase, summary))).then(() => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "browser-capability-report.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, "image/png");
    });
  }

  return (
    <div className="panel-hero">
      <div className="panel-head">
        <span className="panel-label">Live check</span>
        <span className="panel-label">this browser</span>
      </div>
      <div className="p-5">
        {phase.name === "checking" && (
          <p className="text-sm text-muted-foreground">
            Probing this browser&rsquo;s capabilities&hellip;
          </p>
        )}

        {phase.name === "unsupported" && (
          <>
            <span className="verdict-stamp" data-v="no" style={{ color: VERDICT_FG.no }}>
              <StatusIcon kind="no" />
              <span>Can&rsquo;t run AI here</span>
            </span>
            <p className="mt-3 text-sm text-muted-foreground">
              This browser does not support WebAssembly, the baseline every in-browser AI runtime
              needs. Neither WebGPU nor a CPU fallback is available here.
            </p>
          </>
        )}

        {phase.name === "error" && (
          <>
            <span className="verdict-stamp" data-v="no" style={{ color: VERDICT_FG.no }}>
              <StatusIcon kind="no" />
              <span>Check failed</span>
            </span>
            <p className="mt-3 text-sm text-muted-foreground">
              The capability probe threw an error instead of returning a result: {phase.message}
            </p>
            <button
              type="button"
              className="btn mt-3 text-xs"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </>
        )}

        {phase.name === "ready" && (
          <>
            <span className="sr-only" role="status">
              Browser capability check complete
            </span>
            <span
              className="verdict-stamp"
              data-v={phase.env.webgpu.supported ? "yes" : "no"}
              style={{ color: phase.env.webgpu.supported ? VERDICT_FG.yes : VERDICT_FG.no }}
            >
              <StatusIcon kind={phase.env.webgpu.supported ? "yes" : "no"} />
              <span>{phase.env.webgpu.supported ? "WebGPU available" : "No WebGPU"}</span>
            </span>
            {!phase.env.webgpu.supported && (
              <p className="mt-2 text-sm text-muted-foreground">
                Every model below falls back to WebAssembly on CPU here: slower to load and run, but
                nothing is blocked outright.
              </p>
            )}

            <div className="readout-grid mt-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              <ReadoutTile k="GPU adapter" v={adapterLabel(phase.env.webgpu.adapterInfo)} />
              <ReadoutTile k="shader-f16" v={fmtTri(phase.env.webgpu.shaderF16)} />
              <ReadoutTile
                k="Max buffer size"
                v={
                  phase.env.webgpu.maxBufferSize != null
                    ? formatBytes(phase.env.webgpu.maxBufferSize)
                    : "unknown"
                }
              />
              <ReadoutTile
                k="Max storage buffer"
                v={
                  phase.env.webgpu.maxStorageBufferBindingSize != null
                    ? formatBytes(phase.env.webgpu.maxStorageBufferBindingSize)
                    : "unknown"
                }
              />
              <ReadoutTile k="WASM SIMD" v={phase.env.wasm.simd ? "yes" : "no"} />
              <ReadoutTile k="WASM threads" v={phase.env.wasm.threads ? "yes" : "no"} />
              <ReadoutTile k="Cross-origin isolated" v={fmtTri(phase.crossOriginIsolated)} />
              <ReadoutTile
                k="CPU threads"
                v={
                  phase.hardwareConcurrency != null ? String(phase.hardwareConcurrency) : "unknown"
                }
              />
              <ReadoutTile
                k="Device memory"
                v={deviceMemoryLabel(phase.env.memory.deviceMemoryGb)}
              />
              <ReadoutTile
                k="JS heap limit"
                v={
                  phase.env.memory.jsHeapSizeLimitBytes != null
                    ? formatBytes(phase.env.memory.jsHeapSizeLimitBytes)
                    : "unknown"
                }
              />
              <ReadoutTile
                k="Storage quota"
                v={
                  storage.name === "ready"
                    ? `${formatBytes(storage.usageBytes)} / ${formatBytes(storage.quotaBytes)}`
                    : storage.name === "loading"
                      ? "checking…"
                      : "unknown"
                }
              />
              <ReadoutTile
                k="Secure context"
                v={phase.env.platform.isSecureContext ? "yes" : "no"}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Max buffer size is a per-buffer ceiling, not a total budget: a single file larger than
              it fails to load even when your GPU has plenty of memory overall.
              {phase.env.memory.deviceMemoryGb === 8 &&
                " Device memory is capped at 8 GB by the browser's spec, for fingerprinting resistance: this device could have exactly 8 GB, or considerably more."}
            </p>

            <div className="wire mt-5" aria-hidden="true"></div>

            <div className="mt-4">
              {scan.name === "scanning" && (
                <p className="text-sm text-muted-foreground">
                  Checking all {catalog.length} models against this browser&hellip;
                </p>
              )}
              {scan.name === "error" && (
                <p className="text-sm text-muted-foreground">
                  Could not run the catalog check: {scan.message}
                </p>
              )}
              {scan.name === "done" && summary && (
                <>
                  <p className="text-2xl font-semibold">
                    <span className="num text-[var(--brand-ink)]">{summary.runnable}</span> of{" "}
                    <span className="num">{summary.total}</span> models run here
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="num">{summary.webgpuCount}</span> over WebGPU &middot;{" "}
                    <span className="num">{summary.wasmCount}</span> fall back to WASM &middot;{" "}
                    <span className="num">{summary.tooBigCount}</span> too large for this browser
                    {summary.unknownCount > 0 && (
                      <>
                        {" "}
                        &middot; <span className="num">{summary.unknownCount}</span> unknown
                      </>
                    )}
                  </p>
                  {summary.smallestRunnable.length > 0 && (
                    <div className="mt-3">
                      <p className="stat-label">Smallest that runs here</p>
                      <ul className="mt-1.5 space-y-1">
                        {summary.smallestRunnable.map((r) => (
                          <li key={r.id}>
                            <a
                              href={`/browser/${r.id}`}
                              className="text-sm underline hover:text-[var(--brand-ink)]"
                            >
                              {r.name}
                            </a>
                            <span className="num ml-1.5 text-xs text-muted-foreground">
                              {formatBytes(r.downloadBytes)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="wire mt-5" aria-hidden="true"></div>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
              <canvas
                ref={canvasRef}
                width={2400}
                height={1260}
                className="block w-full rounded-md border border-border sm:w-3/5 sm:shrink-0"
                style={{ aspectRatio: "1200/630", background: "#15171a" } as CSSProperties}
                role="img"
                aria-label="Shareable browser capability report card"
              ></canvas>
              <div className="flex flex-1 flex-wrap gap-2.5">
                <button
                  type="button"
                  className="btn disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleDownload}
                  disabled={!summary}
                >
                  Download report card (PNG)
                </button>
                {summary && (
                  <button
                    type="button"
                    className="btn"
                    data-copy={buildMarkdown(phase, storage, summary, pageUrl)}
                  >
                    Copy as Markdown
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              The card and the Markdown both contain only the values measured above, nothing else.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
