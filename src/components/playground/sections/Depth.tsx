import { useEffect, useRef, useState } from "react";
import type { DepthApi, Metric } from "../types";
import ImagePick from "./ImagePick";

interface SectionProps {
  api: DepthApi;
  onMetrics: (m: Metric[]) => void;
}

const SAMPLE_URL = "/samples/portrait.jpg";

export default function DepthSection({ api, onMetrics }: SectionProps) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each run mints a fresh PNG object URL; revoke the previous one on
  // replace and on unmount (same pattern as the RMBG section).
  const outUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
    },
    [],
  );

  async function run(url: string) {
    setSrcUrl(url);
    setOutUrl(null);
    setBusy(true);
    setError(null);
    onMetrics([]);
    try {
      const res = await api.estimate(url);
      if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current);
      outUrlRef.current = res.url;
      setOutUrl(res.url);
      onMetrics([
        { key: "ms", label: "depth mapped in", value: (res.ms / 1000).toFixed(2), unit: "s" },
        { key: "px", label: "output", value: `${res.width}×${res.height}`, unit: "px" },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Depth estimation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ImagePick
        disabled={busy}
        onPick={run}
        sampleUrl={SAMPLE_URL}
        sampleLabel="Use the sample photo"
      />
      {busy && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          Estimating depth&hellip;
        </p>
      )}
      {srcUrl && outUrl && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <figure>
            <img src={srcUrl} alt="Original" className="pg-img" />
            <figcaption className="mt-1 text-xs text-muted-foreground">Original</figcaption>
          </figure>
          <figure>
            <img src={outUrl} alt="Estimated depth map" className="pg-img" />
            <figcaption className="mt-1 text-xs text-muted-foreground">
              Depth map (bright = near) &middot;{" "}
              <a href={outUrl} download="depth-map.png" className="underline">
                download PNG
              </a>
            </figcaption>
          </figure>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-muted-foreground">{error}</p>}
    </div>
  );
}
