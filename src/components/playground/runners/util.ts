import type { NormalizedProgressEvent } from "../types";

// The dtype union transformers.js v4 accepts (src/utils/dtypes.js). localfit
// hands us a plain string from the measured catalog; narrow it or fail loud.
const HF_DTYPES = [
  "auto",
  "fp32",
  "fp16",
  "q8",
  "int8",
  "uint8",
  "q4",
  "bnb4",
  "q4f16",
  "q2",
  "q2f16",
  "q1",
  "q1f16",
] as const;
export type HfDtype = (typeof HF_DTYPES)[number];

export function asDtype(d: string): HfDtype {
  if (!(HF_DTYPES as readonly string[]).includes(d)) {
    throw new Error(`The catalog picked dtype "${d}", which this runtime does not accept.`);
  }
  return d as HfDtype;
}

// transformers.js progress_callback events: per-file objects with a status
// of "initiate" | "download" | "progress" | "done" (plus pipeline-level
// "loading"/"ready" without file fields). Normalize to our aggregator shape.
export interface HfProgressInfo {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

export function adaptProgress(
  onProgress: (e: NormalizedProgressEvent) => void,
): (p: HfProgressInfo) => void {
  return (p) => {
    if (!p.file) return;
    if (p.status === "progress" || p.status === "done") {
      onProgress({
        file: p.file,
        loaded: p.loaded ?? 0,
        total: p.total ?? 0,
        done: p.status === "done",
      });
    }
  };
}

export interface StreamMeter {
  /** Wire to TextStreamer's token_callback_function (fires once per raw token). */
  onTokens(): void;
  /** Wire to TextStreamer's callback_function (fires with decoded text pieces). */
  onPiece(piece: string): void;
  result(fullText?: string): {
    text: string;
    prefillMs: number;
    decodeTokens: number;
    decodeMs: number;
  };
}

// Wall-clock meter around a TextStreamer: time-to-first-token from the raw
// token callback (accurate token count), decoded text accumulated separately.
export function makeStreamMeter(onToken: (text: string) => void): StreamMeter {
  const t0 = performance.now();
  let tFirst = 0;
  let tLast = 0;
  let tokens = 0;
  let text = "";
  return {
    onTokens() {
      const now = performance.now();
      if (tokens === 0) tFirst = now;
      tLast = now;
      tokens += 1;
    },
    onPiece(piece: string) {
      text += piece;
      onToken(text);
    },
    result(fullText?: string) {
      return {
        text: fullText || text,
        prefillMs: (tFirst || performance.now()) - t0,
        decodeTokens: Math.max(0, tokens - 1),
        decodeMs: Math.max(0, tLast - tFirst),
      };
    },
  };
}
