import { expect, test } from "bun:test";
import { installCommands, models, hfRepo } from "./data";

const base = models.find((m) => hfRepo(m) && m.q4_k_m_gb != null && m.q4_k_m_gb < 48)!;
const noodle = (m: typeof base, p: "mac" | "windows", on: boolean) =>
  installCommands(m, p, on).filter((c) => c.tool === "Noodle");

test("Noodle command is first on Mac when launched, absent when not", () => {
  expect(installCommands(base, "mac", true)[0]).toEqual({
    tool: "Noodle",
    cmd: `noodle model run hf.co/${hfRepo(base)}:Q4_K_M`,
  });
  expect(noodle(base, "mac", false)).toHaveLength(0);
});

test("Noodle never appears on non-Mac platforms", () => {
  expect(noodle(base, "windows", true)).toHaveLength(0);
});

test("Noodle skipped at or above the 48 GB single-file cutoff", () => {
  expect(noodle({ ...base, q4_k_m_gb: 48 }, "mac", true)).toHaveLength(0);
  expect(noodle({ ...base, q4_k_m_gb: 47.9 }, "mac", true)).toHaveLength(1);
});
