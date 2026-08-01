import { useState } from "react";
import type { Metric, RmbgApi } from "../types";
import ImagePick from "./ImagePick";

interface SectionProps {
  api: RmbgApi;
  onMetrics: (m: Metric[]) => void;
}

const SAMPLE_URL = "/samples/portrait.jpg";

export default function RmbgSection({ api, onMetrics }: SectionProps) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(url: string) {
    setSrcUrl(url);
    setOutUrl(null);
    setBusy(true);
    setError(null);
    onMetrics([]);
    try {
      const res = await api.removeBackground(url);
      setOutUrl(res.url);
      onMetrics([{ key: "ms", label: "cut out in", value: (res.ms / 1000).toFixed(2), unit: "s" }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Background removal failed.");
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
          Cutting out the subject&hellip;
        </p>
      )}
      {srcUrl && outUrl && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <figure>
            <img src={srcUrl} alt="Original" className="pg-img" />
            <figcaption className="mt-1 text-xs text-muted-foreground">Original</figcaption>
          </figure>
          <figure>
            <img src={outUrl} alt="Background removed" className="pg-img pg-img--checker" />
            <figcaption className="mt-1 text-xs text-muted-foreground">
              Background removed &middot;{" "}
              <a href={outUrl} download="cutout.png" className="underline">
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
