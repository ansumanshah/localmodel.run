import { useState } from "react";
import type { Metric, PiiApi, PiiEntity } from "../types";
import { redact } from "../runners/pii-align";

interface SectionProps {
  api: PiiApi;
  onMetrics: (m: Metric[]) => void;
}

// Every value here is deliberately fake: the canonical Visa test number, the
// famous Woolworth sample SSN, an invented person at an invented address.
const SAMPLE = `Hi, I'm Priya Sharma. You can reach me at priya.sharma82@example.com or +1 (415) 555-0182.
I live at 2214 Baker Street, San Francisco, 94110. My card number is 4111 1111 1111 1111 and my SSN is 078-05-1120.`;

export default function PiiSection({ api, onMetrics }: SectionProps) {
  const [text, setText] = useState(SAMPLE);
  const [scanned, setScanned] = useState<{ text: string; entities: PiiEntity[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    setScanned(null);
    onMetrics([]);
    try {
      const res = await api.detect(text);
      setScanned({ text, entities: res.entities });
      onMetrics([
        { key: "found", label: "PII spans found", value: String(res.entities.length) },
        { key: "ms", label: "scanned in", value: (res.ms / 1000).toFixed(2), unit: "s" },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyRedacted() {
    if (!scanned) return;
    try {
      await navigator.clipboard.writeText(redact(scanned.text, scanned.entities));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard write was blocked by the browser.");
    }
  }

  // Non-overlapping, sorted by construction: plain segments + <mark> spans.
  function highlighted() {
    if (!scanned) return null;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    scanned.entities.forEach((e, i) => {
      if (e.start > cursor) parts.push(scanned.text.slice(cursor, e.start));
      parts.push(
        <mark key={i} className="pg-pii-mark">
          {scanned.text.slice(e.start, e.end)}
          <span className="pg-pii-tag">{e.tag}</span>
        </mark>,
      );
      cursor = e.end;
    });
    parts.push(scanned.text.slice(cursor));
    return parts;
  }

  return (
    <div>
      <label className="block">
        <span className="field-label">Text to scan</span>
        <textarea
          className="pg-input"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn--primary"
          onClick={run}
          disabled={busy || !text.trim()}
        >
          {busy ? "Scanning…" : "Scan for PII"}
        </button>
        <button
          type="button"
          className="btn pg-preset text-xs"
          onClick={() => setText(SAMPLE)}
          disabled={busy}
        >
          Reset sample
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        The sample is entirely fake data. Paste anything real with confidence: the scan runs in
        this tab and nothing you type is sent anywhere.
      </p>

      {scanned && scanned.entities.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          No PII found in this text. Longer texts are scanned up to the model&rsquo;s 512-token
          window (roughly 300 words).
        </p>
      )}

      {scanned && scanned.entities.length > 0 && (
        <div className="mt-4">
          <span className="field-label">Detected</span>
          <div className="pg-output pg-pii">{highlighted()}</div>
          <div className="mt-3">
            <span className="field-label">Redacted copy</span>
            <div className="pg-output">{redact(scanned.text, scanned.entities)}</div>
          </div>
          <button type="button" className="btn mt-3 text-xs" onClick={copyRedacted}>
            {copied ? "Copied" : "Copy redacted text"}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-muted-foreground">{error}</p>}
    </div>
  );
}
