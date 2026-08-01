import { describe, expect, test } from "bun:test";
import { ProgressAggregator, formatBytes, isWeightFile } from "./progress";

describe("isWeightFile", () => {
  test("classifies ONNX weight files", () => {
    expect(isWeightFile("onnx/model_q4f16.onnx")).toBe(true);
    expect(isWeightFile("onnx/decoder_model_merged_fp16.onnx")).toBe(true);
    expect(isWeightFile("model.onnx_data")).toBe(true);
    expect(isWeightFile("model.onnx.data")).toBe(true);
  });
  test("classifies config/tokenizer files as extras", () => {
    expect(isWeightFile("tokenizer.json")).toBe(false);
    expect(isWeightFile("config.json")).toBe(false);
    expect(isWeightFile("preprocessor_config.json")).toBe(false);
  });
});

describe("ProgressAggregator", () => {
  test("sums weights and extras separately", () => {
    const agg = new ProgressAggregator();
    agg.track({ file: "onnx/model.onnx", loaded: 50, total: 100, done: false });
    agg.track({ file: "tokenizer.json", loaded: 10, total: 10, done: true });
    const s = agg.snapshot();
    expect(s.weightsLoaded).toBe(50);
    expect(s.weightsTotal).toBe(100);
    expect(s.extraLoaded).toBe(10);
    expect(s.extraTotal).toBe(10);
    expect(s.filesDone).toBe(1);
    expect(s.filesSeen).toBe(2);
  });

  test("monotonic per file: late lower loaded never regresses the sum", () => {
    const agg = new ProgressAggregator();
    agg.track({ file: "onnx/model.onnx", loaded: 80, total: 100, done: false });
    agg.track({ file: "onnx/model.onnx", loaded: 40, total: 100, done: false });
    expect(agg.snapshot().weightsLoaded).toBe(80);
  });

  test("done pins loaded to total", () => {
    const agg = new ProgressAggregator();
    agg.track({ file: "onnx/model.onnx", loaded: 99, total: 100, done: false });
    agg.track({ file: "onnx/model.onnx", loaded: 0, total: 100, done: true });
    const s = agg.snapshot();
    expect(s.weightsLoaded).toBe(100);
    expect(s.filesDone).toBe(1);
    expect(s.currentFile).toBeNull();
  });

  test("tracks the in-flight file for the status line", () => {
    const agg = new ProgressAggregator();
    agg.track({ file: "onnx/encoder.onnx", loaded: 1, total: 10, done: false });
    expect(agg.snapshot().currentFile).toBe("onnx/encoder.onnx");
  });
});

describe("formatBytes", () => {
  test("mirrors src/lib/data.ts formatBytes exactly", () => {
    // Same fixtures the site renders: whisper-tiny fp16 and a GB-scale case.
    expect(formatBytes(76113088)).toBe("72.6 MB");
    expect(formatBytes(30018257)).toBe("28.6 MB");
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.00 GB");
  });
});
