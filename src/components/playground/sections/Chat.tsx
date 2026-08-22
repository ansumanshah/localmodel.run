import { useRef, useState } from "react";
import type { ChatApi, Metric } from "../types";

interface SectionProps {
  api: ChatApi;
  onMetrics: (m: Metric[]) => void;
}

const PRESETS = [
  "Write a haiku about running an LLM in a browser tab.",
  "Explain WebGPU to a five-year-old in two sentences.",
  "List three uses for a language model small enough to run in a browser tab.",
];

export default function ChatSection({ api, onMetrics }: SectionProps) {
  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const outRef = useRef<HTMLDivElement>(null);

  async function run() {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    setOutput("");
    onMetrics([]);
    try {
      const res = await api.generate(prompt, (text) => {
        setOutput(text);
        outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
      });
      setOutput(res.text);
      const tokPerSec = res.decodeMs > 0 ? (res.decodeTokens / res.decodeMs) * 1000 : 0;
      onMetrics([
        { key: "tps", label: "decode speed", value: tokPerSec.toFixed(1), unit: "tok/s" },
        { key: "ttft", label: "first token", value: (res.prefillMs / 1000).toFixed(2), unit: "s" },
        { key: "tok", label: "tokens generated", value: String(res.decodeTokens) },
      ]);
    } catch (e: unknown) {
      setOutput(e instanceof Error ? `Generation failed: ${e.message}` : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Example prompts">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className="tag pg-preset"
            onClick={() => setPrompt(p)}
            disabled={busy}
          >
            {p.length > 42 ? `${p.slice(0, 40)}…` : p}
          </button>
        ))}
      </div>
      <label className="mt-3 block">
        <span className="field-label">Prompt</span>
        <textarea
          className="pg-input"
          rows={2}
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
        {busy ? "Generating…" : "Generate"}
      </button>
      {output && (
        <div ref={outRef} className="pg-output mt-4" aria-label="Model output">
          {output}
        </div>
      )}
    </div>
  );
}
