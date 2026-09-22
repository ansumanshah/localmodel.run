# Coding benchmark pilot protocol

Status: **no runs yet**. This is a proposed, one-task case study, not a
leaderboard, quality-parity claim, or authorization to download models or use paid APIs.

## Question and scope

Can one local open-weight coding model complete the same small, test-backed TypeScript
repair as Claude and GPT-6 Astra under a frozen environment? The result applies only to
this task, fixture, configuration, and hardware.

Run exactly these three variants, each three times in randomized order:

| Variant | Frozen identity to record before running | Source |
| --- | --- | --- |
| Local | `gpt-oss-20b`, official `ggml-org/gpt-oss-20b-GGUF` MXFP4 file, SHA-256, runtime and flags | [catalog source](https://huggingface.co/ggml-org/gpt-oss-20b-GGUF) |
| Hosted | `claude-sonnet-5`, High effort, exact API/harness version | [model catalog](https://platform.claude.com/docs/en/models/overview) |
| Hosted | `gpt-6-astra`, Max effort, exact API/harness version | [model docs](https://developers.openai.com/api/docs/models/gpt-6-astra) |

Do not substitute a similarly named model, quantization, effort, runtime, or provider
route. If an identity cannot be recorded, mark that variant unavailable and do not run it.

## Frozen task and environment

Before the first run, commit a `metadata-normalizer` fixture in this repository and
record its commit SHA. It contains a TypeScript function that
normalizes a list of package records, where duplicate names must merge by keeping the
newest valid ISO-8601 `updatedAt`, ignoring invalid dates, and preserving a deterministic
name sort. Its tests include duplicate records, invalid dates, equal dates, empty input,
and input-order reversal. The implementation begins with the duplicate merge bug; the
tests describe the intended behavior.

Every variant receives this exact prompt, with the fixture commit substituted once and
saved verbatim:

```text
You are fixing the repository at commit <fixture-commit>. Inspect the code and tests.
Make the smallest production change that makes the existing test suite pass. Do not edit
tests, dependencies, package scripts, lockfiles, or generated files. Run the documented
test command. Return a short summary and the commands you ran.
```

Use one fresh checkout per run at that commit; no network tools, web search, extra
packages, prior-run output, or human code edits. Freeze and record OS, architecture,
CPU/GPU/RAM, Bun and Git versions, fixture lockfile hash, runtime build, context limit,
sampling settings, timeout, and the full command wrapper. Set a 15-minute wall timeout;
timeout, refusal, harness failure, and invalid patch are failures, not retries.

## Correctness and measurement

The sole success condition is a patch that applies cleanly and passes the fixture's
unchanged `bun test`. The runner must additionally confirm only allowed source files
changed and rerun the test command in a clean checkout after applying the saved patch.
Record pass/fail, failure class, elapsed wall time, model-reported input and billed-output
tokens when available, exit status, patch diff, stdout/stderr, and the complete config.
Missing provider token fields stay `unknown`; never infer them from visible text.

Save one directory per run containing `config.json`, `prompt.txt`, `result.patch`,
`stdout.txt`, `stderr.txt`, `metrics.json`, and `verdict.json`. Publish the fixture SHA,
prompt, configs, raw outputs after secret review, per-run values, and all failures. Report
the three runs individually plus successful-runs/three and median wall time; do not turn
three attempts into a general ranking. Harness failures must be shown separately from
model correctness failures, even though neither counts as a successful end-to-end run.

## Cost gate

The current repository tariffs are **dated 2026-09-12**: Claude Sonnet 5 is $2 input and
$10 billed output per million tokens; GPT-6 Astra is $10 and $50. Verify both against
their official pricing pages immediately before execution, update the record, then compute
each hosted run as `(input_tokens × input_rate + billed_output_tokens × output_rate) / 1e6`.
Exclude cache writes/reads, tools, storage, taxes, discounts, subscriptions, and regional
tiers unless actually used and separately recorded. Proposed cap: $5 total hosted spend,
including failed runs; this proposal is not spending authorization. Before execution,
set enforceable per-call input and billed-output token limits (including reasoning), a
maximum call count, and a worst-case cost within that cap. Stop before a call
that could exceed the verified remaining cap. Record local electricity or hardware cost
only if measured; otherwise label it unavailable.

## Execution prerequisites

Required before any run: the committed fixture and SHA, approved spend cap, verified
provider identities/prices, local model file checksum and runtime, reproducible wrapper,
secret-safe output review, and available hardware. No benchmark score exists until all
three repeated runs and saved artifacts pass this protocol.
