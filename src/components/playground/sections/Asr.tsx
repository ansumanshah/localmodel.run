import { useEffect, useRef, useState } from "react";
import type { AsrApi, Metric } from "../types";
import { blobToMono16k, startRecording, type Recorder } from "../audio";

interface SectionProps {
  api: AsrApi;
  onMetrics: (m: Metric[]) => void;
}

// Bundled public-domain sample (JFK inaugural excerpt, a US federal
// recording), the same clip whisper.cpp ships for smoke tests.
const SAMPLE_URL = "/samples/jfk.wav";

export default function AsrSection({ api, onMetrics }: SectionProps) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recorder | null>(null);
  // Synchronous guard across the getUserMedia await: without it, two rapid
  // clicks both pass the `recording` check and the first mic stream is
  // orphaned live with nothing left holding a reference to stop it.
  const micPendingRef = useRef(false);

  useEffect(() => () => recRef.current?.cancel(), []);

  async function transcribeBlob(blob: Blob) {
    setBusy(true);
    setError(null);
    setText(null);
    onMetrics([]);
    try {
      const { audio, seconds } = await blobToMono16k(blob);
      if (seconds < 0.5) {
        setError("That clip is under half a second; record a bit longer.");
        return;
      }
      const res = await api.transcribe(audio, seconds);
      setText(res.text.trim());
      const xrt = res.ms > 0 ? seconds / (res.ms / 1000) : 0;
      onMetrics([
        { key: "xrt", label: "speed vs realtime", value: `${xrt.toFixed(1)}×` },
        { key: "ms", label: "transcribed in", value: (res.ms / 1000).toFixed(2), unit: "s" },
        { key: "len", label: "audio length", value: seconds.toFixed(1), unit: "s" },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (busy || micPendingRef.current) return;
    if (recording) {
      setRecording(false);
      const rec = recRef.current;
      recRef.current = null;
      if (rec) await transcribeBlob(await rec.stop());
      return;
    }
    micPendingRef.current = true;
    setError(null);
    try {
      recRef.current = await startRecording();
      setRecording(true);
    } catch {
      setError(
        "Microphone access was blocked. You can still try the sample clip below; audio never leaves this tab either way.",
      );
    } finally {
      micPendingRef.current = false;
    }
  }

  async function useSample() {
    if (busy || recording) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error(`Sample clip failed to load (${res.status}).`);
      await transcribeBlob(await res.blob());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sample clip failed to load.");
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={recording ? "btn pg-rec" : "btn btn--primary"}
          onClick={toggleMic}
          disabled={busy}
        >
          {recording ? (
            <>
              <span className="pg-rec-dot" aria-hidden="true" /> Stop &amp; transcribe
            </>
          ) : (
            "Record from mic"
          )}
        </button>
        <button
          type="button"
          className="btn text-xs"
          onClick={useSample}
          disabled={busy || recording}
        >
          Use an 11s sample clip
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Audio is processed in this tab and never uploaded anywhere.
      </p>
      {busy && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Transcribing&hellip;
        </p>
      )}
      {text != null && (
        <div className="pg-output mt-4" aria-label="Transcript">
          {text || "(no speech detected)"}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-muted-foreground">{error}</p>}
    </div>
  );
}
