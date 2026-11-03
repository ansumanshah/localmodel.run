import { expect, test } from "bun:test";
import { localTasks } from "./local-tasks";
import { playgroundTaskFor } from "@/components/playground/registry";

test("promoted local tasks have a runnable model, measured builds and matching implementation dependencies", () => {
  expect(new Set(localTasks.map((task) => task.href)).size).toBe(localTasks.length);
  for (const task of localTasks) {
    expect(playgroundTaskFor(task.model)).toBe(task.runner);
    expect(task.code).toContain(`from "${task.package}"`);
    expect(task.code).toContain(task.model.hf_repo);
    expect(() => new Bun.Transpiler({ loader: "js" }).transformSync(task.code)).not.toThrow();
    for (const backend of ["webgpu", "wasm"] as const) {
      expect(task.run[backend].bytes).toBe(task.model.variants[task.run[backend].variant]);
      expect(task.run[backend].bytes).toBeGreaterThan(0);
    }
  }
});
