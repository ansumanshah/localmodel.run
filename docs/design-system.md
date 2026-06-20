# Design system: Gauge ↔ Claude Design

The visual language of localmodel.run is **"Gauge"** (*capacity, measured*): an electric-iris
brand, a warm-paper light mode with a deep iris-tinted dark mode, hairline structure, and a
fit-gauge signature. This doc explains where it lives and how it stays in sync with
[Claude Design](https://claude.ai/design), where the site can be redesigned on-brand.

## Source of truth

All tokens and the named component layer live in **`src/styles/global.css`**:

- **Tokens** — OKLCH custom properties: `--color-brand`, `--background` / `--foreground`,
  `--card`, `--border`, `--muted-foreground`, the verdict pair (`--color-verdict-*` for
  fills/borders, `--verdict-*-fg` for AA text), and modality accents (`--modality-image|video|audio`).
  Light is the default (`:root`); dark is `.dark`.
- **Component layer** — `.gauge` / `.gauge-fill` / `.gauge-mark` (the fit gauge), `.bp-eyebrow`,
  `.bp-panel` / `.bp-instrument`, `.bp-stat-*`, `.card-seam`, `.bp-hero` / `.bp-strip`, `.num`, and
  friends. Components compose these plus Tailwind utilities; some (verdict badge, command chip,
  selects) are inline-styled over the tokens rather than given a named class.

Rule: **if the CSS and any mirror drift, the CSS wins.** Accent and tone changes are one-token
edits here, and everything inherits them.

## Claude Design is a downstream mirror

A design system is published to Claude Design so its design agent builds with the real tokens and
components instead of generic ones. This is a **one-way mirror, not live bidirectional sync** —
think of it as a build artifact derived from `global.css`, not a second source of truth.

The published bundle (a self-contained `styles.css` lifted from `global.css`, plus one preview
card per component, grouped Brand / Foundations / Components / Layout / Navigation) is generated
locally and uploaded with the `/design-sync` tool. The local workspace it builds (`ds-bundle/`)
and its sync state (`.design-sync/`) are gitignored — they are regenerated from `global.css` on
every sync, so they never rot in the repo.

## The sync loop

```
                 /design-sync  (code → Design, automated)
  global.css  ───────────────────────────────────────────►  Claude Design project
  (canonical)  ◄───────────────────────────────────────────  (redesign / prototype)
                 manual translation  (Design → code)
```

1. **Code is canonical.** Real changes land in `global.css` and the `.astro` components, commit to
   git, deploy to localmodel.run via Cloudflare Pages. Normal workflow.
2. **Code → Design.** After a visual change, re-run `/design-sync`. It re-derives `styles.css`,
   re-renders the affected cards, and re-uploads to the same project (the project id is pinned in
   `.design-sync/config.json`). Claude Design now matches production.
3. **Design → code.** When you prototype a redesign *in* Claude Design and like it, translate it
   back into `global.css` tokens / `.astro` templates, review the diff, commit, deploy. **A
   redesign is not shipped until it is in the repo** — Claude Design has no path to production on
   its own.

### Cadence

Sync *after* a design change ships (so Design reflects production) and *before* a redesign session
(so the agent starts from the current real site). It is a checkpoint, not a per-commit CI step.

### The seam to watch

The **code → Design** direction is fully automated by `/design-sync`. The **Design → code**
direction is a manual translation — there is no automatic import of a Claude Design layout back
into Astro. Keep `global.css` as the arbiter and that seam stays manageable.

## Re-syncing

Edit `global.css` → re-run `/design-sync` (the pin routes to the existing project) → review the
re-rendered cards. The sync validates every class and token in the published `README.md` against
the built CSS, so a renamed or deleted class is flagged rather than silently shipped.
