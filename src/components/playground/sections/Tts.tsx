import { useEffect, useRef, useState } from "react";
import type { Metric, TtsApi } from "../types";

interface SectionProps {
  api: TtsApi;
  onMetrics: (m: Metric[]) => void;
}

export default function TtsSection({ api, onMetrics }: SectionProps) {
  const [text, setText] = useState(
    "This voice was generated entirely inside your browser. No server, no API key, no audio upload.",
  );
  const [voice, setVoice] = useState(api.voices[0]?.id ?? "");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  async function run() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    onMetrics([]);
    try {
      const res = await api.speak(text, voice);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = res.url;
      setAudioUrl(res.url);
      const xrt = res.ms > 0 ? res.audioSeconds / (res.ms / 1000) : 0;
      onMetrics([
        { key: "xrt", label: "speed vs realtime", value: `${xrt.toFixed(1)}×` },
        { key: "ms", label: "synthesized in", value: (res.ms / 1000).toFixed(2), unit: "s" },
        { key: "len", label: "audio out", value: res.audioSeconds.toFixed(1), unit: "s" },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Synthesis failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="block">
        <span className="field-label">Text to speak</span>
        <textarea className="pg-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
      </label>
      {api.voices.length > 1 && (
        <label className="mt-3 block max-w-xs">
          <span className="field-label">Voice</span>
          <div className="field">
            <select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={busy} aria-label="Voice">
              {api.voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <span className="truncate">{api.voices.find((v) => v.id === voice)?.label ?? voice}</span>
          </div>
        </label>
      )}
      <button type="button" className="btn btn--primary mt-3" onClick={run} disabled={busy || !text.trim()}>
        {busy ? "Synthesizing…" : "Speak"}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        Each voice is a one-time <span className="num">0.5 MB</span> file on top of the model download
        (measured, fetched on first use). It caches like the weights do.
      </p>
      {audioUrl && (
        <div className="mt-4">
          {/* biome-ignore lint: captions do not apply to generated speech of user-typed text */}
          <audio controls src={audioUrl} className="w-full" />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-muted-foreground">{error}</p>}
    </div>
  );
}
