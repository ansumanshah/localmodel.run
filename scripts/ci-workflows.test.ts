import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ci = Bun.YAML.parse(await Bun.file(new URL("../.github/workflows/ci.yml", import.meta.url)).text()) as any;
const refresh = Bun.YAML.parse(await Bun.file(new URL("../.github/workflows/update-data.yml", import.meta.url)).text()) as any;

test("CI scope keeps source Markdown and workflow changes behind the full gate", async () => {
  expect(ci.on.pull_request["paths-ignore"]).not.toContain("**.md");
  const scope = ci.jobs.build.steps.find((step: any) => step.id === "scope");
  const dir = await mkdtemp(join(tmpdir(), "ci-scope-"));
  try {
    for (const [event, changed, site, gates] of [
      ["pull_request", "src/pages/guide.md", true, true],
      ["pull_request", ".github/workflows/ci.yml", true, true],
      ["pull_request", "bun.lock", true, true],
      ["pull_request", "scripts/update-data.mjs", false, false],
      ["push", "src/data/models.json", true, false],
      ["workflow_dispatch", "", true, true],
    ] as const) {
      const output = join(dir, `${event}-${site}-${gates}.txt`);
      await Bun.write(output, "");
      const proc = Bun.spawn(["bash", "-e", "-c", `git() { printf '%s\\n' "$CHANGED"; }; ${scope.run}`], {
        env: { ...process.env, ...scope.env, EVENT: event, CHANGED: changed, GITHUB_OUTPUT: output },
        stdout: "ignore", stderr: "pipe",
      });
      expect(await proc.exited).toBe(0);
      expect(await readFile(output, "utf8")).toBe(`site=${site}\ngates=${gates}\n`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("refresh gates run before publication and a rejected push fails without signaling IndexNow", async () => {
  const steps = refresh.jobs.refresh.steps;
  const commit = steps.find((step: any) => step.id === "commit");
  expect(commit.if).toBe("github.ref == 'refs/heads/main'");
  expect(steps.findIndex((step: any) => step.name === "Verify refreshed data before deployment")).toBeLessThan(steps.indexOf(commit));
  expect(steps.find((step: any) => step.name === "Submit refreshed URLs to IndexNow").if).toBe("steps.commit.outputs.pushed == 'true'");
  const dir = await mkdtemp(join(tmpdir(), "refresh-push-"));
  try {
    for (const pushStatus of [0, 1]) {
      const output = join(dir, `${pushStatus}.txt`);
      await Bun.write(output, "");
      const proc = Bun.spawn(["bash", "-e", "-c", `
        git() {
          case "$1" in
            status) printf ' M src/data/models.json\\n' ;;
            push) return "$PUSH_STATUS" ;;
          esac
        }
        ${commit.run}
      `], {
        env: { ...process.env, GITHUB_OUTPUT: output, PUSH_STATUS: String(pushStatus) },
        stdout: "ignore", stderr: "pipe",
      });
      expect(await proc.exited).toBe(pushStatus);
      expect(await readFile(output, "utf8")).toBe(pushStatus === 0 ? "pushed=true\n" : "");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
