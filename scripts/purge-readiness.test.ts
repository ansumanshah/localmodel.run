import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("cache purge waits for the deployed commit, including same-version data refreshes", async () => {
  const workflow = Bun.YAML.parse(await Bun.file(new URL("../.github/workflows/purge-on-deploy.yml", import.meta.url)).text()) as any;
  expect(workflow.on.workflow_run).toEqual({ workflows: ["Refresh model data"], types: ["completed"], branches: ["main"] });
  const script = workflow.jobs.purge.steps.find((step: any) => step.id === "wait").run;
  const dir = await mkdtemp(join(tmpdir(), "purge-readiness-"));
  try {
    for (const [commit, status, promoted] of [["abcdef0", "200", true], ["1234567", "200", false], ["abcdef0", "503", false]] as const) {
      const output = join(dir, `${commit}-${status}.txt`);
      const proc = Bun.spawn(["bash", "-c", `
        git() { printf 'abcdef0'; }
        sleep() { :; }
        curl() { printf '%s' "$RESPONSE_JSON" > "$RESPONSE_FILE"; printf '%s' "$RESPONSE_CODE"; }
        ${script.replaceAll("/tmp/v.json", join(dir, "response.json"))}
      `], {
        env: { ...process.env, READINESS_HOST: "https://example.invalid", GITHUB_OUTPUT: output,
          RESPONSE_FILE: join(dir, "response.json"), RESPONSE_CODE: status,
          RESPONSE_JSON: JSON.stringify({ version: "0.1.68", commit }) },
        stdout: "ignore", stderr: "pipe",
      });
      expect(await proc.exited).toBe(0);
      expect(await readFile(output, "utf8")).toContain(`promoted=${promoted}\n`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
