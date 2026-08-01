import type { NormalizedProgressEvent, ProgressSnapshot } from "./types";

// The page promises a measured byte count for the model's weight files (the
// per-variant ONNX sums measured from the HF API). The runtime also fetches
// small config/tokenizer files that are not part of that sum, so the
// aggregator keeps the two buckets separate: the bar tracks weights against
// the promise, extras are disclosed on their own line.
const WEIGHT_FILE = /\.onnx(\.data|_data)?(_\d+)?$/i;

export function isWeightFile(file: string): boolean {
  return WEIGHT_FILE.test(file) || file.includes("onnx/");
}

interface FileState {
  loaded: number;
  total: number;
  done: boolean;
}

export class ProgressAggregator {
  private files = new Map<string, FileState>();
  private current: string | null = null;

  track(e: NormalizedProgressEvent): void {
    const prev = this.files.get(e.file);
    const total = Math.max(e.total || 0, prev?.total ?? 0);
    const loaded = e.done ? total : Math.max(e.loaded || 0, prev?.loaded ?? 0);
    this.files.set(e.file, { loaded, total, done: e.done || (prev?.done ?? false) });
    if (!e.done) this.current = e.file;
    else if (this.current === e.file) this.current = null;
  }

  snapshot(): ProgressSnapshot {
    let weightsLoaded = 0;
    let weightsTotal = 0;
    let extraLoaded = 0;
    let extraTotal = 0;
    let filesDone = 0;
    for (const [file, s] of this.files) {
      if (isWeightFile(file)) {
        weightsLoaded += s.loaded;
        weightsTotal += s.total;
      } else {
        extraLoaded += s.loaded;
        extraTotal += s.total;
      }
      if (s.done) filesDone += 1;
    }
    return {
      weightsLoaded,
      weightsTotal,
      extraLoaded,
      extraTotal,
      filesDone,
      filesSeen: this.files.size,
      currentFile: this.current,
    };
  }
}

// Mirrors src/lib/data.ts formatBytes exactly, so the island's numbers render
// identically to the server-rendered ones beside them.
export function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
