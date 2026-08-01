import { useState } from "react";
import type { Metric, VlmApi } from "../types";
import ImagePick from "./ImagePick";

interface SectionProps {
  api: VlmApi;
  onMetrics: (m: Metric[]) => void;
}

const SAMPLE_URL = "/samples/portrait.jpg";

export default function VlmSection({ api, onMetrics }: SectionProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("Describe this image in one sentence.");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy || !imageUrl) return;
    setBusy(true);
    setError(null);
    setOutput("");
    onMetrics([]);
    try {
      const res = await api.describe(imageUrl, prompt, setOutput);
      setOutput(res.text);
      const tokPerSec = res.decodeMs > 0 ? (res.decodeTokens / res.decodeMs) * 1000 : 0;
      onMetrics([
        { key: "tps", label: "decode speed", value: tokPerSec.toFixed(1), unit: "tok/s" },
        { key: "ttft", label: "first token", value: (res.prefillMs / 1000).toFixed(2), unit: "s" },
        { key: "tok", label: "tokens generated", value: String(res.decodeTokens) },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Description failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ImagePick
        disabled={busy}
        onPick={setImageUrl}
        sampleUrl={SAMPLE_URL}
        sampleLabel="Use the sample photo"
      />
      {imageUrl && (
        <div className="mt-4">
          <img src={imageUrl} alt="Chosen input" className="pg-img pg-img--sm" />
          <label className="mt-3 block">
            <span className="field-label">Ask about it</span>
            <textarea
              className="pg-input"
              rows={1}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary mt-3"
            onClick={run}
            disabled={busy || !prompt.trim()}
          >
            {busy ? "Looking…" : "Describe"}
          </button>
        </div>
      )}
      {output && (
        <div className="pg-output mt-4" aria-label="Model output">
          {output}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-muted-foreground">{error}</p>}
    </div>
  );
}
