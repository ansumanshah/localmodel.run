import { useState, type CSSProperties } from "react";
import type { EmbedApi, Metric } from "../types";

interface SectionProps {
  api: EmbedApi;
  onMetrics: (m: Metric[]) => void;
}

export default function EmbedSection({ api, onMetrics }: SectionProps) {
  const [a, setA] = useState("How much RAM does Llama 3 need?");
  const [b, setB] = useState("Memory requirements for running Llama 3 locally");
  const [cosine, setCosine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy || !a.trim() || !b.trim()) return;
    setBusy(true);
    setError(null);
    onMetrics([]);
    try {
      const res = await api.similarity(a, b);
      setCosine(res.cosine);
      onMetrics([
        { key: "cos", label: "cosine similarity", value: res.cosine.toFixed(3) },
        { key: "ms", label: "per sentence", value: Math.round((res.msA + res.msB) / 2).toString(), unit: "ms" },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Embedding failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="block">
        <span className="field-label">Sentence A</span>
        <textarea className="pg-input" rows={1} value={a} onChange={(e) => setA(e.target.value)} disabled={busy} />
      </label>
      <label className="mt-3 block">
        <span className="field-label">Sentence B</span>
        <textarea className="pg-input" rows={1} value={b} onChange={(e) => setB(e.target.value)} disabled={busy} />
      </label>
      <button type="button" className="btn btn--primary mt-3" onClick={run} disabled={busy || !a.trim() || !b.trim()}>
        {busy ? "Embedding…" : "Compare"}
      </button>
      {cosine != null && (
        <div className="mt-4">
          <div
            className="gauge lens"
            role="img"
            aria-label={`Cosine similarity ${cosine.toFixed(3)} on a 0 to 1 scale`}
          >
            <div
              className="gauge-fill bar-fill"
              style={
                {
                  transform: `scaleX(${Math.max(0, Math.min(1, cosine))})`,
                  background: "color-mix(in oklch, var(--color-brand) 88%, transparent)",
                } as CSSProperties
              }
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            1.0 means identical meaning, 0 means unrelated. Same math a vector database runs on every query.
          </p>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-muted-foreground">{error}</p>}
    </div>
  );
}
