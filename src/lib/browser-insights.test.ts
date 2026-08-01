import { describe, expect, test } from "bun:test";
import type { BrowserModelRow } from "@/data/types";
import {
  browserCatalogRankBullet,
  browserLargeDownloadBullet,
  browserLedeAction,
  browserQuantPlainWords,
  browserQuantSpread,
  browserReadingBullets,
  browserSizePerParamBullet,
  browserTopComputedInsight,
  browserWasmInversion,
  type BrowserBulletPart,
} from "@/lib/data";

// The Reading panel is the fix for "feels AI generated": every bullet must be
// derived from a model's own measured data, never asserted. These tests pin
// each detector's fires/does-not-fire boundary so a future data or copy edit
// can't quietly turn the panel back into a template.

const MB = 1024 * 1024;

function model(over: Partial<BrowserModelRow> = {}): BrowserModelRow {
  return {
    id: "t",
    name: "T",
    hf_repo: "onnx-community/t",
    task: "vision",
    params_m: 100,
    headline: {
      webgpu: { variant: "fp16", bytes: 100 * MB },
      wasm: { variant: "uint8", bytes: 50 * MB },
    },
    variants: { fp16: 100 * MB, uint8: 50 * MB },
    pipeline_task: null,
    sources: [],
    ...over,
  };
}

function text(parts: BrowserBulletPart[] | null): string {
  if (!parts) return "";
  return parts.map((p) => (typeof p === "string" ? p : p.num)).join("");
}

describe("browserWasmInversion", () => {
  test("fires when WASM downloads smaller than WebGPU (whisper-tiny shape)", () => {
    const m = model({
      headline: {
        webgpu: { variant: "fp16", bytes: Math.round(126.9 * MB) },
        wasm: { variant: "uint8", bytes: Math.round(66.8 * MB) },
      },
    });
    const bullet = browserWasmInversion(m);
    expect(bullet).not.toBeNull();
    const s = text(bullet);
    expect(s).toContain("66.8 MB (uint8)");
    expect(s).toContain("126.9 MB (fp16)");
  });

  test("does not fire when WebGPU is the smaller (or equal) download", () => {
    const smaller = model({
      headline: {
        webgpu: { variant: "q4f16", bytes: 50 * MB },
        wasm: { variant: "uint8", bytes: 80 * MB },
      },
    });
    expect(browserWasmInversion(smaller)).toBeNull();
    const equal = model({
      headline: {
        webgpu: { variant: "fp16", bytes: 50 * MB },
        wasm: { variant: "fp16", bytes: 50 * MB },
      },
    });
    expect(browserWasmInversion(equal)).toBeNull();
  });
});

describe("browserQuantSpread", () => {
  test("fires at a >= 3x ladder ratio, with the real min/max variants", () => {
    const m = model({ variants: { q4f16: 10 * MB, fp16: 35 * MB } });
    const bullet = browserQuantSpread(m);
    expect(bullet).not.toBeNull();
    const s = text(bullet);
    expect(s).toContain("3.5x");
    expect(s).toContain("q4f16");
    expect(s).toContain("fp16");
  });

  test("does not fire under a 3x ladder ratio", () => {
    const m = model({ variants: { q4f16: 20 * MB, fp16: 35 * MB } });
    expect(browserQuantSpread(m)).toBeNull();
  });
});

describe("browserCatalogRankBullet", () => {
  const groupOf4 = [
    model({
      id: "a",
      task: "speech-to-text",
      headline: {
        webgpu: { variant: "fp16", bytes: 10 * MB },
        wasm: { variant: "uint8", bytes: 5 * MB },
      },
    }),
    model({
      id: "b",
      task: "speech-to-text",
      headline: {
        webgpu: { variant: "fp16", bytes: 20 * MB },
        wasm: { variant: "uint8", bytes: 10 * MB },
      },
    }),
    model({
      id: "c",
      task: "speech-to-text",
      headline: {
        webgpu: { variant: "fp16", bytes: 30 * MB },
        wasm: { variant: "uint8", bytes: 15 * MB },
      },
    }),
    model({
      id: "d",
      task: "speech-to-text",
      headline: {
        webgpu: { variant: "fp16", bytes: 40 * MB },
        wasm: { variant: "uint8", bytes: 20 * MB },
      },
    }),
  ];

  test("fires 'smallest' and 'largest' for the edge ranks in a 4+ group", () => {
    expect(text(browserCatalogRankBullet(groupOf4[0]!, groupOf4))).toContain(
      "smallest speech to text download",
    );
    expect(text(browserCatalogRankBullet(groupOf4[3]!, groupOf4))).toContain(
      "largest speech to text download",
    );
  });

  test("does not fire for groups smaller than 4", () => {
    const smallGroup = groupOf4.slice(0, 3);
    expect(browserCatalogRankBullet(smallGroup[0]!, smallGroup)).toBeNull();
  });
});

describe("browserSizePerParamBullet", () => {
  test("fires when density is more than 25% off the task-group median (dense)", () => {
    const peers = [
      model({
        id: "p1",
        task: "vision",
        params_m: 100,
        headline: {
          webgpu: { variant: "fp16", bytes: 100 * MB },
          wasm: { variant: "uint8", bytes: 50 * MB },
        },
      }),
      model({
        id: "p2",
        task: "vision",
        params_m: 100,
        headline: {
          webgpu: { variant: "fp16", bytes: 100 * MB },
          wasm: { variant: "uint8", bytes: 50 * MB },
        },
      }),
    ];
    const dense = model({
      id: "dense",
      task: "vision",
      params_m: 100,
      headline: {
        webgpu: { variant: "fp16", bytes: 300 * MB },
        wasm: { variant: "uint8", bytes: 150 * MB },
      },
    });
    const catalog = [dense, ...peers];
    const bullet = browserSizePerParamBullet(dense, catalog);
    expect(bullet).not.toBeNull();
    expect(text(bullet)).toContain("dense for its parameter count");
  });

  test("does not fire within 25% of the median, or with too small a group", () => {
    const peers = [
      model({
        id: "p1",
        task: "vision",
        params_m: 100,
        headline: {
          webgpu: { variant: "fp16", bytes: 100 * MB },
          wasm: { variant: "uint8", bytes: 50 * MB },
        },
      }),
      model({
        id: "p2",
        task: "vision",
        params_m: 100,
        headline: {
          webgpu: { variant: "fp16", bytes: 105 * MB },
          wasm: { variant: "uint8", bytes: 50 * MB },
        },
      }),
    ];
    const close = model({
      id: "close",
      task: "vision",
      params_m: 100,
      headline: {
        webgpu: { variant: "fp16", bytes: 110 * MB },
        wasm: { variant: "uint8", bytes: 50 * MB },
      },
    });
    expect(browserSizePerParamBullet(close, [close, ...peers])).toBeNull();
    // Too few known-param peers (< 3 total) even with a big deviation.
    expect(browserSizePerParamBullet(close, [close, peers[0]!])).toBeNull();
  });
});

describe("browserLargeDownloadBullet", () => {
  test("fires past 1 GB with no covering note", () => {
    const m = model({
      notes: undefined,
      headline: {
        webgpu: { variant: "q4f16", bytes: 1.2 * 1024 * MB },
        wasm: { variant: "uint8", bytes: 900 * MB },
      },
    });
    const bullet = browserLargeDownloadBullet(m);
    expect(bullet).not.toBeNull();
    expect(text(bullet)).toContain("1.20 GB");
  });

  test("does not fire under 1 GB, or when notes already say so", () => {
    const small = model({
      headline: {
        webgpu: { variant: "q4f16", bytes: 500 * MB },
        wasm: { variant: "uint8", bytes: 400 * MB },
      },
    });
    expect(browserLargeDownloadBullet(small)).toBeNull();

    const covered = model({
      notes:
        "This is a multi-gigabyte download. Between the file size and current browser memory limits, it is impractical to run on most machines today.",
      headline: {
        webgpu: { variant: "q4f16", bytes: 1.2 * 1024 * MB },
        wasm: { variant: "uint8", bytes: 900 * MB },
      },
    });
    expect(browserLargeDownloadBullet(covered)).toBeNull();
  });
});

describe("browserReadingBullets / browserTopComputedInsight", () => {
  test("puts notes first, then computed insights, capped at 4 bullets total", () => {
    const catalog = [
      model({
        id: "a",
        task: "speech-to-text",
        headline: {
          webgpu: { variant: "fp16", bytes: 10 * MB },
          wasm: { variant: "uint8", bytes: 5 * MB },
        },
      }),
      model({
        id: "b",
        task: "speech-to-text",
        headline: {
          webgpu: { variant: "fp16", bytes: 20 * MB },
          wasm: { variant: "uint8", bytes: 10 * MB },
        },
      }),
      model({
        id: "c",
        task: "speech-to-text",
        headline: {
          webgpu: { variant: "fp16", bytes: 30 * MB },
          wasm: { variant: "uint8", bytes: 15 * MB },
        },
      }),
    ];
    const m = model({
      id: "subject",
      task: "speech-to-text",
      notes: "A hand-authored caveat.",
      params_m: 100,
      variants: { q4f16: 5 * MB, fp16: 40 * MB },
      headline: {
        webgpu: { variant: "fp16", bytes: 40 * MB },
        wasm: { variant: "uint8", bytes: 5 * MB },
      },
    });
    const full = [m, ...catalog];
    const bullets = browserReadingBullets(m, full);
    expect(bullets.length).toBeGreaterThanOrEqual(2);
    expect(bullets.length).toBeLessThanOrEqual(4);
    expect(text(bullets[0]!)).toBe("A hand-authored caveat.");

    // The top *computed* insight excludes notes.
    const top = browserTopComputedInsight(m, full);
    expect(top).not.toBeNull();
    expect(text(top)).not.toContain("hand-authored");
  });

  test("a model with nothing notable still returns an empty (not fabricated) list", () => {
    const m = model({
      notes: undefined,
      variants: { fp16: 100 * MB },
      headline: {
        webgpu: { variant: "fp16", bytes: 50 * MB },
        wasm: { variant: "fp16", bytes: 50 * MB },
      },
    });
    expect(browserReadingBullets(m, [m])).toEqual([]);
    expect(browserTopComputedInsight(m, [m])).toBeNull();
  });
});

describe("browserLedeAction", () => {
  test("prefers a model-specific override, then pipeline_task, then task fallback", () => {
    expect(
      browserLedeAction(
        model({ id: "gliner-small-v2.1", task: "utility", pipeline_task: "token-classification" }),
      ),
    ).toContain("named entities");
    expect(
      browserLedeAction(
        model({ id: "z", task: "speech-to-text", pipeline_task: "automatic-speech-recognition" }),
      ),
    ).toBe("transcribe speech to text");
    expect(
      browserLedeAction(model({ id: "z", task: "speaker-diarization", pipeline_task: null })),
    ).toContain("who is speaking");
  });

  test("falls back to a generic verb for an unknown task and pipeline", () => {
    expect(browserLedeAction(model({ id: "z", task: "unknown-task", pipeline_task: null }))).toBe(
      "run",
    );
  });
});

describe("browserQuantPlainWords", () => {
  test("explains known variant codes in plain words", () => {
    expect(browserQuantPlainWords("q4f16")).toContain("4-bit");
    expect(browserQuantPlainWords("fp32")).toContain("uncompressed");
  });

  test("falls back safely for an unknown code", () => {
    expect(browserQuantPlainWords("mystery9")).toBe("the mystery9 build");
  });
});
