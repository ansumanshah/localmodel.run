import { useEffect, useRef, useState } from "react";
import type { Metric, RmbgApi } from "../types";
import { formatBytes } from "../progress";
import ImagePick from "./ImagePick";

interface SectionProps {
  loadApi: () => Promise<RmbgApi | null>;
  canRun: boolean;
  downloadBytes?: number;
  onMetrics: (m: Metric[]) => void;
}

const SAMPLE_URL = "/samples/portrait.jpg";

export default function RmbgSection({ loadApi, canRun, downloadBytes, onMetrics }: SectionProps) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const outUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
    },
    [],
  );

  function choose(url: string) {
    if (busyRef.current) return;
    if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
    outUrlRef.current = null;
    if (url !== srcUrl) setImageReady(false);
    setSrcUrl(url);
    setOutUrl(null);
    setError(null);
    onMetrics([]);
  }

  async function run() {
    if (!srcUrl || !imageReady || !canRun || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    onMetrics([]);
    try {
      const api = await loadApi();
      if (!api) return;
      setProcessing(true);
      const res = await api.removeBackground(srcUrl);
      if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
      outUrlRef.current = res.url;
      setOutUrl(res.url);
      onMetrics([{ key: "ms", label: "cut out in", value: (res.ms / 1000).toFixed(2), unit: "s" }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Background removal failed.");
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProcessing(false);
    }
  }

  return (
    <div>
      {!srcUrl && <p className="mb-3 text-sm text-muted-foreground">Choose a portrait to preview it, or try the sample. Selecting a photo does not load the model.</p>}
      <ImagePick
        disabled={busy}
        onPick={choose}
        sampleUrl={SAMPLE_URL}
        sampleLabel="Use the sample photo"
      />
      {srcUrl && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <figure>
            <img
              src={srcUrl}
              alt="Original"
              className="pg-img pg-img--portrait"
              onLoad={() => setImageReady(true)}
              onError={() => {
                setImageReady(false);
                setError("This image could not be opened. Choose another photo.");
              }}
            />
            <figcaption className="mt-2 text-sm text-muted-foreground">Original</figcaption>
          </figure>
          {outUrl ? (
            <figure>
              <img src={outUrl} alt="Background removed" className="pg-img pg-img--portrait pg-img--checker" />
              <figcaption className="mt-2 text-sm text-muted-foreground">Background removed</figcaption>
            </figure>
          ) : (
            <div className="surface-lite flex items-center justify-center rounded p-5 text-center text-sm text-muted-foreground">
              {busy ? "Keep this tab open. Your photo stays on this device." : "Your transparent PNG will appear here."}
            </div>
          )}
        </div>
      )}
      {srcUrl && !outUrl && downloadBytes != null && <p className="mt-4 text-sm text-muted-foreground">First use downloads <span className="num text-foreground">{formatBytes(downloadBytes)}</span> of model weights, plus runtime and supporting files. Your photo stays in this tab.</p>}
      {srcUrl && !outUrl && (
        <button type="button" onClick={run} disabled={busy || !canRun || !imageReady} className="btn btn--primary mt-4">
          {busy ? (processing ? "Removing background…" : "Loading model…") : "Remove background"}
        </button>
      )}
      {outUrl && (
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground" role="status">Your PNG is ready. Check the edges before using it.</p>
          <a href={outUrl} download="cutout.png" className="btn btn--primary">Download PNG</a>
          <p className="mt-3 text-sm text-muted-foreground">Choose another photo above to make another cutout.</p>
        </div>
      )}
      {busy && <p className="mt-3 text-sm text-muted-foreground" role="status">{processing ? "Cutting out the subject…" : "Loading the model, then removing the background…"}</p>}
      {error && <p className="mt-3 text-sm text-muted-foreground" role="alert">{error}{imageReady && " Your photo is still selected. Try Remove background again."}</p>}
    </div>
  );
}
