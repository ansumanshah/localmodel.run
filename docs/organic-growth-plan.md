# Gradual organic growth plan

Research date: 2026-09-12. This is a proposed sequence, not a traffic forecast.

The detailed source evidence, implementation lessons and maintenance handoff are in
[local-vs-cloud-learnings.md](local-vs-cloud-learnings.md).

## Decision

Expand into **local versus hosted model decisions** while keeping localmodel.run and its hardware-fit engine.
Add a small sourced comparison surface first. Build original benchmarks only after a specific reader need
justifies their maintenance and inference cost.

The useful question is: **What should I run for this task, on this hardware, at this cost?**
An undifferentiated global ranking would overlap heavily with Artificial Analysis and Arena. A comparison
that connects comparable quality results to local memory, context, setup and actual usage cost gives this
site a reason to exist alongside them. This is a product hypothesis to test, not a proven keyword opportunity.

## What this review established

- The site already has a leaderboard hub and coding, tool-use and chat boards. Those rank a partial subset
  of the local model catalog. Adding another generic leaderboard does not itself solve discovery.
- Existing score records lack individual verification dates and complete evaluation configurations.
  The scheduled data updater refreshes model sizes, not benchmarks. A catalog date cannot certify scores.
- The linked BFCL source now shows v4 while the legacy field is named `bfcl_v3_acc`. The stored label is
  not proof of the evaluated version. Re-verify the original result snapshot before migrating or reusing
  those scores; the current copy explicitly discloses this uncertainty.
- The existing query research includes `can i run claude locally`, `can i run claude code locally`,
  `ollama vs claude`, and `running llm locally vs cloud`. This establishes prior query discovery,
  not current search volume or a ranking guarantee.
- Current Semrush research could not authenticate (`oauth_refresh_token_rejected`). No fresh keyword-volume,
  rank, organic-click or index-coverage baseline was obtained. Historical notes are not a current baseline.
- GPT-6 Astra is a public model name and `gpt-6-astra` is documented by OpenAI. Claude models and the
  Claude Code application must be treated as distinct entities. Verify exact vendor model IDs again at ingestion.

## First six weeks, one small release at a time

| Order | Deliverable | Why it helps | Completion condition |
| --- | --- | --- | --- |
| Now | Correct partial-ranking and benchmark-freshness claims; one guide answering whether Claude can run locally | Improves trust and tests a query adjacent to the existing product | Source links, real memory examples, internal links, build/link audit and visual QA |
| Week 1 | Establish search baseline and improve 3 existing pages already earning relevant impressions | Existing impressions provide stronger prioritization evidence than guessed demand | GSC last 28 and previous 28 days: query, page, clicks, impressions, CTR and position; inspect representative indexed/excluded URLs |
| Weeks 2–3 | One `/compare/local-vs-cloud` pilot, initially 3–5 hosted models and 5–8 local models | Adds closed models without generating a large new catalog | Same-source/same-version comparisons, missing scores shown honestly, source dates, local-only hardware fit, free static snapshots |
| Week 4 | Usage-based local/API cost calculator within the pilot | Makes visitors' hardware and token workload part of the answer | Correct input/output/cache costs; explicit hardware ownership assumptions; tested zero-saving and missing-data cases |
| Weeks 5–6 | At most 2 additional query-led guides, chosen using new GSC evidence | Tests whether visitors want alternatives, cost decisions or setup help | Each provides new calculations or firsthand evidence; each links into an existing useful tool |

Candidate hosted references are GPT-6 Astra and exact current Claude and Gemini variants. Inclusion depends
on vendor identity and a comparable result being available; never create a score to fill a missing row.
Keep existing `/leaderboard/*` URLs and their local scope. Link the new comparison from the hub and relevant guides.
Do not launch a rebrand, a separate domain, thousands of pair pages or a broad “best AI” directory for this experiment.

## Comparison data contract, before adding closed models

Keep hosted models outside the local `ModelRow` memory engine. Link shared identities to the local catalog
where appropriate; no fabricated parameter counts, quant sizes or “runs locally” verdicts for closed models.

Store the following for every result:

- Exact provider model ID and evaluated variant, including reasoning mode or effort when reported.
- Benchmark ID, benchmark version, category/subset, source snapshot date and source URL or immutable revision.
- Retrieval/review date, score/unit, sample count and uncertainty when available.
- Harness, prompting, tool permissions, retry/attempt budget and precision when reported. Unknown stays unknown.
- Provenance class: vendor-reported, independently measured, or measured here. Never silently combine them.

Only put results in one ordered table when the source and evaluation conditions support that comparison.
Do not average Aider, BFCL and Arena into a made-up overall score. Do not mix historical Elo with a current
Arena snapshot, BFCL versions, or different agent harnesses. A local Q4 memory estimate does not establish
the quality of that quantized configuration. “Not evaluated” is distinct from a zero score.

Start with one attributed source and one dated snapshot. Refresh through a scheduled import with schema,
identity and date validation. On failure, keep the last valid snapshot with its visible date; flag it for
review rather than advancing the date. Legacy scores need a separate provenance audit before reuse.

## Sources and maintenance

- [Artificial Analysis API](https://artificialanalysis.ai/api-reference) offers a structured integration
  with attribution requirements. Check its current Data Platform Terms before implementation. Keep keys
  server-side and publish cached static data. Its [methodology](https://artificialanalysis.ai/methodology)
  changes over time, so retain the relevant index version. It remains an option for a later quality axis once access and data terms are established.
  The pilot uses the credential-free Arena dataset below.
- [Arena's official snapshot dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset)
  provides the pilot human-preference axis with publication dates and uncertainty. Preserve its
  attribution and license requirements. Use one snapshot/category; preference is not correctness.
- [SWE-bench](https://github.com/SWE-bench/swe-bench.github.io) and
  [LiveBench](https://github.com/LiveBench/LiveBench) can be linked as context. Defer copying their results
  until data-specific reuse terms and evaluation comparability are established; a code license alone
  does not establish rights to leaderboard data.
- Verify names, access, context and prices against [OpenAI's Astra page](https://developers.openai.com/api/docs/models/gpt-6-astra),
  [Anthropic's model catalog](https://platform.claude.com/docs/en/models/overview), and the relevant vendor's
  official documentation. Do not derive public product facts from an app's model picker alone.

## Make the cost comparison useful

The current generic hosted-price assumption on pair pages is not sufficient for a named-provider comparison.
Collect input/output tokens per month, cache behavior, model/effort, and currency. Show API charges separately
from subscription plans, which have different limits and cannot be converted to unlimited tokens.

Local estimates need hardware already owned versus newly purchased, electricity, measured whole-system power
when available, idle time/utilization and chosen amortization period. Device TDP alone is not a bound on
whole-system electricity. Include prompt processing and context, not only decode throughput. Expose omitted
maintenance/time costs and label unmeasured quantities as assumptions. Allow local to lose on cost or quality.

Use “no break-even under these assumptions” when local recurring cost is at least API cost. Do not claim
equivalent work from equal token counts across different models. Eventually report cost per successful task
from the same evaluation, including retries, if measured results support it.

## Original benchmarking, after the pilot

Choose one narrow task suite where this project can contribute firsthand evidence, such as repository edits
with tests, structured extraction, or tool-call reliability. Publish fixtures, scoring, failures, exact models,
quantization/runtime versions, hardware, prompts, context, retries, token usage and result files.

Repeat runs and report variation. Keep locally measured and provider-reported results distinct. A small
public suite is a case study, not evidence for “best LLM overall.” Hosted inference has a real cost: define
an explicit spend cap before running it. For a zero-spend pilot, use permitted public result snapshots.

## Organic distribution and measurement

Ship roughly one useful page or improvement per week. Each should have a direct answer, a working tool or
calculation, source links, a visible substantive review date, and relevant internal links. Publish one
technical explanation of the result where it answers a community question, with promotion disclosed.
Offer existing badges or a sourced comparison table to relevant maintainers when useful. Outreach remains
draft-only until the owner authorizes sending it. Avoid bulk directory submissions and paid links.

Google's [AI search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
emphasizes original useful content and standard SEO. Do not treat llms.txt or extra schema as guaranteed
citation/ranking mechanisms. [HowTo and FAQ rich-result changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
also mean those existing markup types are not a general traffic lever for this site.

Record a release cohort of changed URLs. Review at 28, 56 and 84 days against the baseline, separating
non-brand Google clicks/impressions, other organic referrals, community referrals and human tool use.
Check source freshness and update effort as well. Cloudflare edge “unique visitors” are not human organic
sessions. A `site:` search or sitemap count is not an index-coverage report.

Expand only when indexed pages attract relevant non-brand queries or repeated useful engagement and the
data can be maintained. If pages are excluded, inspect GSC examples and content uniqueness before generating
more. If indexed pages get impressions without clicks, improve query fit and snippets. If they get visitors
but little tool use, improve the decision flow. No blanket deletion/noindex of existing pages without evidence.

## Local implementation status

The initial Claude/local-model guide and clearer local leaderboard scope/freshness language are implemented.
The follow-up adds one `/compare/local-vs-cloud` pilot with four hosted and six local models, exact Arena
variant matching, a dated style-adjusted preference snapshot, local hardware/context controls, and standard
uncached API input/output cost estimates. It exposes the selected source data, attributes the dataset license,
and adds a validated refresh command to the existing weekly workflow. Provider prices require separate review.

This pilot is not an original model benchmark, local/cloud total-cost or break-even calculation, or evidence
of quality parity. It does not refresh legacy scores, run inference, or post outreach. Deployment is tracked separately
through commit checks and the live build identity.

See [the learnings and verification handoff](local-vs-cloud-learnings.md#verification-and-remaining-work)
for current gate results and remaining work.
