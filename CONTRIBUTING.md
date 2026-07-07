# Contributing

Thanks for your interest in localmodel.run.

## Setup

```bash
bun install
bun run dev            # local dev server
bun run build          # static build -> dist/
bun run validate-data  # dataset sanity gate (runs in CI before every build)
bun run check          # astro check (types + templates)
bunx knip              # unused files / exports / deps
```

The project uses **bun** (there is a `bun.lock`, no `package-lock.json`). CI
runs `bun install --frozen-lockfile`, so commit `bun.lock` with any dependency
change.

## The one hard rule: every number must be sourced

This site's value is trustworthy data. When you add or change a model/device
figure:

- Add the primary source URL to that row's `sources[]` array (Ollama library,
  HuggingFace GGUF repo, or the vendor's model card / spec page).
- For non-text models, the `recommended` VRAM/memory anchor must carry its own
  `source` URL; if a number is composed from component sizes rather than a
  single measurement, set `synthesis: true` and explain it in `notes`.
- `bun run validate-data` enforces these and fails the build otherwise.
- No em-dashes in any user-facing copy; prefer specifics over adjectives.

## How the data is structured

- `src/data/models.json`: text LLMs.
- `src/data/{image,video,audio}-models.json`: generation models, each with a
  modality spec and a sourced peak-VRAM/peak-memory anchor.
- `src/lib/compute.ts`: text memory engine (weights + KV cache + overhead).
- `src/lib/compute-mm.ts`: multi-modal engine (sourced anchor + runtime gate).

## Automated data refresh

`.github/workflows/update-data.yml` runs weekly and commits refreshed **text**
model sizes directly to `main` as `data-bot` (after `validate-data` passes). It
does not touch the hand-curated image/video/audio files. If you add branch
protection to `main`, allow this workflow (or switch it to open a PR).

## Pull requests

Keep changes focused, run `bun run build` and `bun run check` before opening a
PR, and include a short note on where any new numbers came from.
