import { useEffect, useRef, useState, type CSSProperties } from "react";
import { fit } from "localfit";
import type { FitPlan } from "localfit";
import { ProgressAggregator, formatBytes } from "./progress";
import type {
  LoadOpts,
  Metric,
  NormalizedProgressEvent,
  Phase,
  PlaygroundModel,
  PlaygroundTask,
  ProgressSnapshot,
  TaskApi,
} from "./types";
import ChatSection from "./sections/Chat";
import AsrSection from "./sections/Asr";
import TtsSection from "./sections/Tts";
import RmbgSection from "./sections/Rmbg";
import EmbedSection from "./sections/Embed";
import VlmSection from "./sections/Vlm";

interface PlaygroundProps {
  model: PlaygroundModel;
  task: PlaygroundTask;
}

// Heavy runtimes load ONLY here, on user action, as separate chunks.
const RUNNERS: Record<PlaygroundTask, () => Promise<{ load(opts: LoadOpts): Promise<TaskApi> }>> = {
  chat: () => import("./runners/chat"),
  asr: () => import("./runners/asr"),
  tts: () => import("./runners/tts"),
  rmbg: () => import("./runners/rmbg"),
  embed: () => import("./runners/embed"),
  vlm: () => import("./runners/vlm"),
};

const STAMP: Record<string, { word: string; fg: string; icon: "yes" | "tight" | "no" | "unknown" }> = {
  yes: { word: "Ready to run", fg: "var(--verdict-yes-fg)", icon: "yes" },
  tight: { word: "Tight fit", fg: "var(--verdict-tight-fg)", icon: "tight" },
  no: { word: "Can't run here", fg: "var(--verdict-no-fg)", icon: "no" },
  unknown: { word: "Fit unknown", fg: "var(--muted-foreground)", icon: "unknown" },
};

function StampIcon({ kind }: { kind: "yes" | "tight" | "no" | "unknown" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      {kind === "yes" && <path d="m9 12 2 2 4-4" />}
      {kind === "tight" && <path d="M12 8v4M12 16h.01" />}
      {kind === "no" && <path d="m15 9-6 6M9 9l6 6" />}
      {kind === "unknown" && <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />}
    </svg>
  );
}

export default function Playground({ model, task }: PlaygroundProps) {
  const [plan, setPlan] = useState<FitPlan | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [api, setApi] = useState<TaskApi | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState<ProgressSnapshot | null>(null);
  const aggRef = useRef<ProgressAggregator | null>(null);
  const lastPaintRef = useRef(0);

  // Probe runs client-side only; the SSR'd island shows the static idle shell.
  useEffect(() => {
    let alive = true;
    fit(model.id).then(
      (p) => alive && setPlan(p),
      () => alive && setPlan(null),
    );
    return () => {
      alive = false;
    };
  }, [model.id]);

  // localfit's probe decides backend and verdict; the variant and its bytes
  // come from the page's own measured run config (which names the
  // in-browser-verified build, and is always as fresh as the page itself).
  const backend = plan?.backend ?? "webgpu";
  const run = model.run[backend];
  const dtype = run.variant;
  const promisedBytes = run.bytes;

  // Time-based throttle, NOT requestAnimationFrame: Chrome stops firing rAF
  // callbacks while the tab or window is occluded, which froze the bar at
  // 0 MB for anyone who switched away during a download.
  function onProgress(e: NormalizedProgressEvent) {
    aggRef.current?.track(e);
    const now = performance.now();
    if (now - lastPaintRef.current < 100) return;
    lastPaintRef.current = now;
    const snap = aggRef.current?.snapshot();
    if (snap) setPhase((prev) => (prev.name === "loading" ? { name: "loading", progress: snap } : prev));
  }

  async function start() {
    if (!plan) return;
    const agg = new ProgressAggregator();
    aggRef.current = agg;
    setPhase({ name: "loading", progress: agg.snapshot() });
    const t0 = performance.now();
    try {
      const mod = await RUNNERS[task]();
      const loaded = await mod.load({
        device: plan.backend,
        dtype: model.run[plan.backend].variant,
        hfRepo: model.hf_repo,
        onProgress,
      });
      setLoadMs(Math.round(performance.now() - t0));
      setDownloaded(agg.snapshot());
      setApi(loaded);
      setPhase({ name: "ready" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setPhase({ name: "error", message });
    }
  }

  const stamp = STAMP[plan?.verdict ?? "unknown"];

  // No aria-live on the root: progress repaints ~10x/second while loading and
  // a live region would make screen readers announce every one. The status
  // lines that matter carry role="status" individually.
  return (
    <div className="pg">
      {phase.name === "idle" && (
        <div>
          {plan ? (
            <>
              <span className="verdict-stamp" data-v={plan.verdict} style={{ color: stamp.fg }}>
                <StampIcon kind={stamp.icon} />
                <span>{stamp.word}</span>
              </span>
              <p className="mt-3 text-sm text-muted-foreground">
                Pressing Run downloads <span className="num text-foreground">{formatBytes(promisedBytes)}</span> ({dtype}) from
                HuggingFace and runs it {backend === "webgpu" ? "on your GPU over WebGPU" : "on your CPU over WebAssembly"}, entirely
                in this tab. Nothing downloads until you press it.
              </p>
              {model.runNote && dtype !== model.headline[backend].variant && (
                <p className="mt-2 text-xs text-muted-foreground">{model.runNote}</p>
              )}
              {plan.verdict !== "no" && (
                <button type="button" onClick={start} className="btn btn--primary mt-4">
                  Run {model.name} here
                </button>
              )}
              <details className="pg-why mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">Why this plan?</summary>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {plan.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Decision by{" "}
                  <a href="https://github.com/ansumanshah/localfit" rel="noopener" className="underline">
                    localfit
                  </a>
                  , probing this browser at page load. No download happened yet.
                </p>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Checking what this browser can run&hellip;</p>
          )}
        </div>
      )}

      {phase.name === "loading" && (
        <div>
          {/* Static text, announced once; the visible line below mutates too often for a live region. */}
          <span className="sr-only" role="status">
            Downloading model weights
          </span>
          <p className="text-sm text-muted-foreground">
            Downloading model weights{phase.progress.currentFile ? <> &middot; <span className="num">{phase.progress.currentFile}</span></> : null}
          </p>
          <div
            className="gauge lens mt-3"
            role="progressbar"
            aria-label="Model download"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round((phase.progress.weightsLoaded / Math.max(1, promisedBytes)) * 100))}
          >
            <div
              className="gauge-fill bar-fill"
              style={
                {
                  transform: `scaleX(${Math.min(1, phase.progress.weightsLoaded / Math.max(1, promisedBytes))})`,
                  background: "color-mix(in oklch, var(--color-brand) 88%, transparent)",
                } as CSSProperties
              }
            />
          </div>
          <div className="read">
            <span>
              <b className="num">{formatBytes(phase.progress.weightsLoaded)}</b> of <b className="num">{formatBytes(promisedBytes)}</b> promised
            </span>
            {phase.progress.extraTotal > 0 && (
              <span>
                + <b className="num">{formatBytes(phase.progress.extraLoaded)}</b> tokenizer &amp; config
              </span>
            )}
          </div>
        </div>
      )}

      {phase.name === "error" && (
        <div>
          <span className="verdict-stamp" data-v="no" style={{ color: "var(--verdict-no-fg)" }}>
            <StampIcon kind="no" />
            <span>Run failed</span>
          </span>
          <p className="mt-3 text-sm text-muted-foreground">{phase.message}</p>
          <button type="button" onClick={start} className="btn mt-3 text-xs">
            Try again
          </button>
        </div>
      )}

      {phase.name === "ready" && api && (
        <div>
          <span className="sr-only" role="status">
            Model loaded and ready to run
          </span>
          {task === "chat" && <ChatSection api={api as never} onMetrics={setMetrics} />}
          {task === "asr" && <AsrSection api={api as never} onMetrics={setMetrics} />}
          {task === "tts" && <TtsSection api={api as never} onMetrics={setMetrics} />}
          {task === "rmbg" && <RmbgSection api={api as never} onMetrics={setMetrics} />}
          {task === "embed" && <EmbedSection api={api as never} onMetrics={setMetrics} />}
          {task === "vlm" && <VlmSection api={api as never} onMetrics={setMetrics} />}

          {metrics.length > 0 && (
            <div className="mt-5">
              <div className="readout-grid" style={{ gridTemplateColumns: `repeat(${Math.min(3, metrics.length)}, minmax(0, 1fr))` }}>
                {metrics.map((m) => (
                  <div key={m.key} className="readout surface-lite">
                    <span className="k">{m.label}</span>
                    <span className="v">
                      <span className="num">{m.value}</span>
                      {m.unit ? <span className="pg-unit"> {m.unit}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Measured on this device just now, not estimated.</p>
            </div>
          )}

          {downloaded && (
            <p className="mt-4 text-xs text-muted-foreground">
              Loaded in <span className="num">{loadMs != null ? (loadMs / 1000).toFixed(1) : "?"}s</span>
              {downloaded.weightsTotal > 0 ? (
                <>
                  {" "}&middot; <span className="num">{formatBytes(downloaded.weightsTotal)}</span> of weights
                  {downloaded.extraTotal > 0 && (
                    <>
                      {" "}+ <span className="num">{formatBytes(downloaded.extraTotal)}</span> tokenizer &amp; config
                    </>
                  )}
                </>
              ) : (
                <> from this browser&rsquo;s cache, no re-download</>
              )}
              . Reloads are instant: weights stay in the browser cache.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
