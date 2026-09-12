# SEO and local-versus-cloud learnings

Recorded 2026-09-12. This is the durable handoff for the organic-growth review and comparison pilot.
See [organic-growth-plan.md](organic-growth-plan.md) for the phased roadmap. Both documents are linked
from the repository README. Provider facts below are
point-in-time observations, not promises of future prices or availability. No traffic uplift has been measured.

## Product direction

- Keep localmodel.run and its existing hardware-fit engine. Extend the question from “can I run it?” to
  “what should I run on this hardware, for this task and token budget?”
- Start with one useful local-versus-hosted comparison. A generic global leaderboard would overlap with
  Arena and Artificial Analysis without adding much distinctive value. Original benchmarks can follow
  a demonstrated reader need and an approved inference budget.
- The pilot includes four hosted references and six existing open-weight catalog models. It does not add
  imaginary local sizes, parameter counts, or local execution verdicts for closed models.
- Keep existing local leaderboard URLs and scope. Do not create thousands of local/hosted pair pages,
  rebrand, change domains, mass-translate, or claim “best model overall” from this experiment.
- This is a testable product hypothesis. More pages, FAQ schema, llms.txt, or a new leaderboard are not
  evidence that organic traffic will increase.

## Search evidence and measurement

- Prior project query research includes `can i run claude locally`, `can i run claude code locally`,
  `ollama vs claude`, and `running llm locally vs cloud`. That is historical query discovery, not current
  volume, ranking difficulty, or an impression baseline.
- Semrush could not refresh authentication: `oauth_refresh_token_rejected`. No fresh keyword volumes,
  organic-click totals, ranks, or index-coverage figures were obtained during this work.
- Next measurement task: export GSC query/page clicks, impressions, CTR, and position for the last 28 days
  and previous 28 days. Inspect representative indexed/excluded URLs. Choose the next three existing
  pages to improve from actual relevant impressions.
- Review the changed URL cohort after 28, 56, and 84 days. Separate non-brand Google traffic, other organic
  referrals, community referrals, and human tool use. Cloudflare edge unique visitors include bots;
  sitemap counts and `site:` searches do not measure index coverage.
- Choose at most two next guides from fresh query evidence. If impressions exist without clicks, improve
  intent match and snippets. If visits exist without tool use, improve the decision flow. If pages are
  excluded, inspect examples before generating more or applying blanket noindex/deletion.
- Outreach remains drafts only until the owner authorizes sending. No messages, submissions, accounts,
  paid inference, or external publication were performed by this pilot.

## Existing leaderboard honesty findings

- The coding, tool-use and chat boards cover a partial local subset, not the entire catalog or all LLMs.
- Existing stored benchmark values lack individual verification dates and complete configurations. The
  model-size refresh timestamp cannot certify benchmark freshness.
- The legacy `bfcl_v3_acc` field name does not prove the original benchmark version; its linked live source
  now shows v4. Copy now discloses the uncertainty. Do not migrate or reuse these values until their
  original result snapshots and exact model variants have been re-verified.
- Do not mix old chat Elo data with the new Arena snapshot or average unrelated Aider/BFCL/Arena metrics.
- Wording was corrected on leaderboard, model and methodology pages; the legacy scores themselves were
  not re-measured or refreshed.

## Claude and public hosted model identity

- GPT-6 Astra is a public documented API model, `gpt-6-astra`. Do not infer public availability solely from
  the Codex model picker.
- Anthropic does not publish Claude weights/GGUF files in its model catalog. Claude Code is a coding
  application/harness; it can use a separately hosted local model via Ollama's documented integration.
  This does not turn that model into Claude or establish equivalent quality/tool behavior.
- The Claude-local guide uses computed memory examples at 4K and 64K, with source links. The commands and
  models were not exercised in real Claude Code inference in this work.
- Exact evaluated Arena variants retain their effort labels; the public API base IDs are separate fields.

| Displayed reference | Arena row | Public API ID |
| --- | --- | --- |
| GPT-6 Astra, Max | `gpt-6-astra-max` | `gpt-6-astra` |
| Claude Opus 5, High | `claude-opus-5-high` | `claude-opus-5` |
| Claude Sonnet 5, High | `claude-sonnet-5-high` | `claude-sonnet-5` |
| Gemini 3.8 Flash, High | `gemini-3.8-flash-high` | `gemini-3.8-flash` |

Sources: [OpenAI Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
[Anthropic model catalog](https://platform.claude.com/docs/en/models/overview),
[Gemini model documentation](https://ai.google.dev/gemini-api/docs/latest-model),
[Ollama Claude Code integration](https://docs.ollama.com/integrations/claude-code),
[Claude Code overview](https://code.claude.com/docs/en/overview).

## Why this benchmark source

- Arena publishes a credential-free official dataset under CC BY 4.0, with exact names, dates, votes,
  confidence bounds and an immutable repository revision. It supports a zero-inference-spend pilot.
- Artificial Analysis has a structured API but requires an account/key and checking its current data
  terms. No account/key was created or accessed. It remains a possible later source, not this pilot's source.
- The selected dataset is `lmarena-ai/leaderboard-dataset`, config `text_style_control`, split `latest`,
  category `overall`. The researched snapshot was published 2026-09-11 at revision
  `b9c5e261b09333707d0bcc5823b0fd0d8cd1bab2`.
- The metric is a Bradley-Terry human preference rating with style control. It is not correctness,
  intelligence, coding accuracy, local speed, or a locally measured Q4 quality score.
- The source describes style control as the text default since 2025-05-16 and the move from Elo to
  Bradley-Terry in 2024. Keep the current metric name; do not call this table “Elo” by habit.
- Render the source confidence bounds and votes, but do not invent a confidence level. Nearby intervals
  overlap; a displayed sort is not a reliable universal ordering. Do not present selected-row positions
  as global ranks.
- A model's Arena run may have different precision, runtime, prompts or reasoning settings from a local
  installation. Local memory estimates do not establish quality parity. Unreported settings stay unknown.
- Preserve attribution, the CC BY 4.0 license, exact original row names, snapshot date, retrieval date,
  and revision-pinned source URL. The public JSON endpoint exposes the selected source rows and tariffs.

Sources: [Arena dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset),
[immutable researched snapshot](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/blob/b9c5e261b09333707d0bcc5823b0fd0d8cd1bab2/text_style_control/latest-00000-of-00001.parquet),
[dataset filter API](https://huggingface.co/docs/dataset-viewer/filter),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
[Artificial Analysis API](https://artificialanalysis.ai/api-reference).

## Hosted pricing verified 2026-09-12

USD per million text tokens, standard paid API rates. These are not subscription-plan prices.

| Model | Uncached input | Billed output | Cache read, excluded from pilot estimate |
| --- | ---: | ---: | ---: |
| GPT-6 Astra | $10 | $50 | $1 |
| Claude Opus 5 | $5 | $25 | $0.50 |
| Claude Sonnet 5 | $2 | $10 | $0.20 |
| Gemini 3.8 Flash | $0.75 | $3.75 | $0.075 plus storage |

- Astra: above 272K input tokens, the whole request has 2x input/cache pricing and 1.5x output pricing.
  Cache creation is $12.50 per million at the base tier. The pilot uses the <=272K standard rates only.
- Claude: full 1M context is standard price; US-only inference costs 1.1x. Opus fast mode is $10/$50.
  Opus cache writes are $6.25 for 5 minutes / $10 for 1 hour; Sonnet is $2.50 / $4. None of these optional
  modes/cache writes is included in the pilot. The planned September Sonnet increase was withdrawn in
  the verified pricing page, so do not copy stale announced rates.
- Gemini: the listed $0.75/$3.75 pricing lasts through 2026-12-31. Published rates from 2027-01-01 are
  $1.50/$7.50, cache read $0.15, and storage $1 per million tokens/hour (currently $0.50). Re-verify before
  that date. The table shows the end date and the calculator stops estimating after the machine-readable
  `validThrough` date until a reviewed tariff replaces it. No length surcharge is listed for this model.
- Billed output includes reasoning/thinking tokens, which can exceed visible answer tokens. “High” and
  “Max” are evaluation configurations; their extra output use matters even when the base tariff is unchanged.
- Monthly estimate = uncached input millions × input rate + billed output millions × output rate.
  It excludes caching, tools, storage, taxes, region/service-tier differences, discounts, subscriptions,
  and long-request surcharges. The hardware context selector does not change provider pricing tiers.
- Do not call local inference free: hardware, electricity and time cost money. This pilot does not claim
  break-even or equivalent work for equal token counts across models.
- A later local total-cost comparison needs ownership/purchase cost, amortization, measured whole-system
  power, utilization/idle time, prompt processing, context, and maintenance assumptions. Device TDP alone
  is not a whole-system power measurement. Report “no break-even” when appropriate.

Sources: [Astra pricing/model](https://developers.openai.com/api/docs/models/gpt-6-astra),
[Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing),
[Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing?hl=en).

## Implementation map and refresh contract

- `src/data/cloud-comparison-models.json`: editorial selection, exact Arena names, local mapping or public
  provider ID, source links, dated tariff and scope notes. Hosted records stay outside `ModelRow`.
- `src/data/arena-snapshot.json`: checked-in selected benchmark snapshot, generated only after validation.
- `src/lib/arena-snapshot.ts` and `scripts/update-arena.ts`: credential-free ingestion via the dataset API.
- `src/lib/cloud-comparison.ts`: build-time join and local fit matrix; reuse measured catalog sizes and
  `canRun` / `estimateMemory` for 4/16/32/64K. No client import of the full model engine.
- `src/lib/api-cost.ts`: finite, nonnegative token math; missing prices stay unavailable. Cache-read helper
  exists but the UI deliberately offers only uncached input, avoiding hidden write/storage assumptions.
- `src/pages/compare/local-vs-cloud.astro` and `src/lib/cloud-comparison-client.ts`: SSR comparison plus
  native selectors, token inputs, and an abortable custom element for Astro navigation.
- `/api/local-vs-cloud.json`: selected benchmark source rows and tariff records for inspection/reuse.
- Inbound links from `/compare`, `/leaderboard`, and the Claude guide keep the page in the site graph.
- Sitemap and article dates distinguish editorial changes, benchmark publication, memory-data refresh and
  pricing verification. A repeat fetch alone must not advance the article's substantive date.
- `bun run update:arena` refreshes the snapshot. The existing weekly data workflow runs the importer.
  Provider prices remain an explicit editorial verification step, not an automatically refreshed claim.
  If Arena fails, the catalog refresh may still commit its valid changes; the workflow then fails visibly
  to request review while retaining the previous Arena snapshot.
- Read source pages only until every selected exact model name is found; unused tail pages need not be
  fetched. If a requested name is missing, scan to the end and fail. Every fetched API page must have a stable 40-character `x-revision`, complete rows, no partial flag or truncated
  cells, valid finite values, ordered bounds, integer counts, exact identities and one publication date.
  Missing/renamed rows fail instead of fuzzy matching a different variant.
- Optional source organization/license metadata can be blank or null, including on unselected models.
  Preserve those unknowns; do not invent labels or reject the whole dataset for absent optional metadata.
- A real import encountered HTTP 500 on the dataset server. Transient network/429/5xx failures receive two
  bounded retries. Validation failures are not retried. The CLI only atomically replaces the destination
  after all selected rows and fetched pages validate, so a failed refresh retains the prior data and date.
- Import JSON as unknown before asserting the comparison contract; generated JSON types widen literals
  such as access mode. Guard the shared engine's possible unknown verdict rather than silently treating it
  as a no-fit result. Annotate the sitemap JSON shape in the checked JavaScript config.
- Keep dependency versions/lockfile unchanged. Local Bun is 1.4.2; hosted CI was not executed in this task.

## UI and engineering lessons

- A search snippet can retain an announced increase after the live vendor page cancels it. A review
  incorrectly proposed raising Sonnet 5 to $3/$15; reopening the official page confirmed $2/$10 is now
  standard and the September increase was withdrawn. Resolve disagreements against the live primary page.
- Clearing a number input yields an empty string, and `Number("")` is zero. Reject empty values explicitly;
  reserve $0 for an actual zero workload. Reject negative, non-finite and unreasonable input values.
- Very small positive charges must not render as free: display `<$0.001` where needed. Reuse the same
  formatter for SSR and interactive updates.
- Selected 64K fit must not silently link to a detail page that uses 4K. The pilot labels the detail link
  “4K setup details” separately from the live fit chip.
- Inline Astro styles need a rendered check in addition to the stylesheet audit. The new fit chips initially
  referenced old color-token names and rendered without verdict colors despite that audit passing. Reuse
  `--color-verdict-yes/tight/no` and `--verdict-yes/tight/no-fg`; inspect their actual rendered colors.
- Visual review found repeated summary cards pushed the actual controls too far down on phones. Remove
  redundant cards, lead with the computed local-memory range, and give a visible sideways-scroll hint.
- A horizontally scrollable keyboard-focusable table needs `role="region"` and a name. Use real table
  headers, labels and visible focus styles. Check mobile overflow rather than assuming responsive classes work.
- Astro navigation can reconnect a custom element. Abort old handlers in `disconnectedCallback`, use
  scoped controls, and verify navigation out and back. SSR rows and defaults remain readable without JS.
- Keep dates and source information useful but avoid dumping importer identifiers into the main decision
  flow. Exact configuration and price caveats belong with the model and in methodology details.
- Browser verification can use Playwright with installed Chrome: `chromium.launch({channel: "chrome"})`.
  The bundled Playwright browser is absent here. Do not install dependencies just to work around that.
- Scope source reads with rg. If RTK suppresses output, compare a native command or use `rtk proxy`; do not
  clear caches blindly. The Astro sitemap `serialize` callback supports per-route `lastmod`, verified with
  the find-docs skill and installed integration source.

## Verification and remaining work

The original guide/leaderboard pass completed locally: 169 tests, validation (22 existing warnings),
Astro check (0 errors, 0 warnings, 38 hints), production build (8,177 pages), and link audit (15,338 files,
no broken links/orphans). Chrome checks covered seven routes at 360/1280px in light/dark themes, 28 cases.
These results apply to that first pass, not automatically to later pilot changes.

The pilot live import succeeded: 10 selected rows, source date 2026-09-11, revision
`b9c5e261b09333707d0bcc5823b0fd0d8cd1bab2`, retrieval started 2026-09-12T07:21:24.401Z.
Full unit suite: 188 passed (16 files). After the small type-integration fixes, the 4 comparison tests
were also rerun and passed. Data validation passed with 22 existing warnings. Astro check reports 0 errors,
0 warnings and 38 existing hints. Production build completed with 8,178 pages. Link/CSS audit found no
broken links, orphan pages or unresolved bare CSS variables; 15,340 files are below the 19,500-file gate.
Both new page sitemap entries were verified as 2026-09-12, matching their substantive page date.

Chrome QA covered 10 routes at 360/1280px in light/dark themes: 40 render combinations. Checks included
HTTP status, viewport overflow, theme, one h1, canonical URL, meta description, JSON-LD parsing and site-copy
rules. Interaction checks passed for all/local/hosted filtering; hardware and 4K/64K context fit updates;
explicit 4K detail links; four default provider-cost examples; empty, negative, oversized, zero and tiny
usage inputs; Astro navigation away and back; no-JavaScript defaults; and the public JSON payload. No page
errors occurred. Screenshots were visually reviewed, then the redundant summary cards were removed to
shorten the phone layout. The complete 40-case render and interaction pass was rerun successfully after
that final layout change, with the desktop dark and phone light controls also visually inspected.
The final pass additionally asserts the actual Fits/No-fit colors in both themes after correcting the tokens.

Reproducible commands:

```sh
bun run update:arena
bun test
bun run validate-data
bun run check
bun run build
bun run audit:links
bun run preview --host 127.0.0.1 --port 4327
```

These are pre-release local results, recorded before the production push. Deployment and hosted CI status
are tracked by the repository's commit checks and the live `/version.json` endpoint. The release was
authorized on 2026-09-12. No model inference, paid API usage or community outreach was part of this pilot.
The browser checks used installed Chrome. Local scratch output is temporary; the results and operating
rules above are the durable handoff.

After local completion, the next useful decision is informed by GSC evidence: expand only if the page
indexes for relevant non-brand queries or produces repeat useful tool engagement. Original benchmarking
should be one narrow reproducible task suite with fixtures, scoring, failures, hardware, runtime,
quantization, prompts, context, retries, token usage and an explicit hosted-spend cap.
