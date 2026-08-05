import { useState, type CSSProperties } from "react";
import type { ClipApi, Metric } from "../types";
import ImagePick from "./ImagePick";

interface SectionProps {
  api: ClipApi;
  onMetrics: (m: Metric[]) => void;
}

const SAMPLE_URL = "/samples/portrait.jpg";
const DEFAULT_LABELS = "an astronaut in a spacesuit, a business headshot, a dog, a mountain landscape";
const MAX_LABELS = 8;

function parseLabels(raw: string): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const label = part.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    if (labels.length >= MAX_LABELS) break;
  }
  return labels;
}

export default function ClipSection({ api, onMetrics }: SectionProps) {
  const [labelsRaw, setLabelsRaw] = useState(DEFAULT_LABELS);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [results, setResults] = useState<{ label: string; score: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = parseLabels(labelsRaw);

  async function run(url: string) {
    if (labels.length < 2) {
      setError("Give it at least two labels to choose between.");
      return;
    }
    setSrcUrl(url);
    setResults(null);
    setBusy(true);
    setError(null);
    onMetrics([]);
    try {
      const res = await api.classify(url, labels);
      setResults(res.results);
      onMetrics([
        { key: "labels", label: "labels ranked", value: String(res.results.length) },
        { key: "ms", label: "ranked in", value: (res.ms / 1000).toFixed(2), unit: "s" },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Classification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="block">
        <span className="field-label">Your labels (comma-separated, up to {MAX_LABELS})</span>
        <textarea
          className="pg-input"
          rows={2}
          value={labelsRaw}
          onChange={(e) => setLabelsRaw(e.target.value)}
          disabled={busy}
        />
      </label>
      <div className="mt-3">
        <ImagePick
          disabled={busy}
          onPick={run}
          sampleUrl={SAMPLE_URL}
          sampleLabel="Use the sample photo"
        />
      </div>
      {srcUrl && !busy && results && (
        <button type="button" className="btn mt-2 text-xs" onClick={() => run(srcUrl)}>
          Re-rank with edited labels
        </button>
      )}
      {busy && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Ranking labels against the image&hellip;
        </p>
      )}
      {srcUrl && results && (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
          <img src={srcUrl} alt="Image being classified" className="pg-img self-start" />
          <div>
            {results.map((r, i) => (
              <div key={r.label} className={i === 0 ? "" : "mt-3"}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className={i === 0 ? "font-medium" : "text-muted-foreground"}>
                    {r.label}
                  </span>
                  <span className="num shrink-0 text-xs text-muted-foreground">
                    {(r.score * 100).toFixed(1)}%
                  </span>
                </div>
                <div
                  className="gauge lens mt-1"
                  role="img"
                  aria-label={`${r.label}: ${(r.score * 100).toFixed(1)} percent`}
                >
                  <div
                    className="gauge-fill bar-fill"
                    style={
                      {
                        transform: `scaleX(${Math.max(0.005, Math.min(1, r.score))})`,
                        background:
                          i === 0
                            ? "color-mix(in oklch, var(--color-brand) 88%, transparent)"
                            : "color-mix(in oklch, var(--color-brand) 35%, transparent)",
                      } as CSSProperties
                    }
                  />
                </div>
              </div>
            ))}
            <p className="mt-3 text-xs text-muted-foreground">
              Probabilities across your labels sum to 100%. The model never saw these labels in
              training; it matches image and text in one shared vector space.
            </p>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-muted-foreground">{error}</p>}
    </div>
  );
}
