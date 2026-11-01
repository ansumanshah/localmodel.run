import { expect, test } from "bun:test";
import { allModels, devices, models } from "./data";
import { parseSetupHash, setupHref } from "./setup-link";
import { useCasesFor } from "./usecases";

test("setup links keep the complete selection in a fragment, including non-preset contexts", () => {
  const input = { deviceId: devices[0]!.id, modelId: "llama-3.1-8b", contextK: 3, task: "chat" as const };
  const url = new URL(setupHref(input), "https://localmodel.run");
  expect(url.pathname).toBe("/start");
  expect(url.search).toBe("");
  expect(parseSetupHash(url.hash)).toEqual(input);
  expect(setupHref({})).toBe("/start");
  expect(parseSetupHash("")).toEqual({});
});

test("invalid and hostile fragments never become selected catalog entries or contexts", () => {
  for (const value of ["0", "-1", "1.5", "4k", "Infinity", "1e3", "9007199254740992", "999999999"]) {
    const input = parseSetupHash(`#context=${value}`);
    expect(input.contextK).toBeUndefined();
    expect(input.error).toBeTruthy();
  }
  const input = parseSetupHash("#device=missing&model=%3Cscript%3E&task=vision&context=%E0%A4%A");
  expect(input.deviceId).toBeUndefined();
  expect(input.modelId).toBeUndefined();
  expect(input.task).toBeUndefined();
  expect(input.error).toBeTruthy();
});

test("task is inferred from the requested model only when omitted", () => {
  const coding = models.find((model) => useCasesFor(model).includes("coding"))!;
  expect(parseSetupHash(`#model=${coding.id}`).task).toBe("coding");
  expect(parseSetupHash(`#model=${coding.id}&task=chat`).task).toBe("chat");
  expect(parseSetupHash(`#model=${coding.id}&task=invalid`).task).toBeUndefined();
});

test("catalog models unsupported by setup remain identifiable for an explicit rejection", () => {
  const nonText = allModels.find((model) => model.modality && model.modality !== "text")!;
  expect(parseSetupHash(`#model=${nonText.id}`).modelId).toBe(nonText.id);
  const model = models.find((row) => row.id === "llama-3.1-8b")!;
  const max = Math.max(...models.map((row) => row.default_context_k ?? 0));
  expect(parseSetupHash(`#model=${model.id}&context=${max}`).contextK).toBe(max);
});
