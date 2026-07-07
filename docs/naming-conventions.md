# Naming conventions

How CSS classes, files, and identifiers are named in this repo. The point is one
predictable rule per layer so new code reads like the old code. When in doubt, match
the nearest existing neighbour.

## CSS classes

Two families, kebab-case. Pick by what the class IS.

### 1. Generic component classes (the reusable UI kit)

Plain, unprefixed component names, defined in `src/styles/components.css` (with a small
compatibility layer in `bridge.css`). Reuse them; do not reinvent them.

| Class | What |
|---|---|
| `.panel`, `.panel-hero` | the two plate weights (dense-content plate, hero plate; both matte) |
| `.surface`, `.surface-lite` | the raw plate surfaces the panels build on |
| `.panel-head`, `.panel-foot`, `.panel-label` | panel header row, footer row, silkscreen label |
| `.btn`, `.field`, `.tag` | machined button, recessed select field, silkscreen verdict tag |
| `.modal`, `.scrim` | modal dialog and its backdrop (no blur) |
| `.site-header`, `.site-brand`, `.site-nav`, `.site-footer` | the flush header bezel, its parts, the footer |
| `.stat`, `.stat-grid`, `.stat-label`, `.stat-val` | stat readout blocks |
| `.gauge`, `.verdict-stamp` | the graduated fit gauge, the inked inspection stamp |
| `.eyebrow`, `.dot`, `.wire`, `.hero`, `.cta`, `.cta-link` | mono eyebrow, pulse dot, hairline rule, hero shell, calls to action |
| `.aurora` | a plain backdrop wrapper kept for content stacking (the effect it was named for is gone) |

### 2. Feature / section prefixes (everything page-specific)

`<feature>-<element>` in kebab-case. The prefix names the surface so styles never leak.

`lb-*` (leaderboard) · `det-*` (detector island) · `hiw-*` (how-it-works diagram) ·
`ctx-*` (context-length control) · `rig-*` (rig card) · `bento-*` (bento grid) ·
`verdict-*` (verdict text/stamp) · `play-*` (daily quiz) · `cmd-chip` (copy-command chip).

**New section? Add a new `<feature>-` prefix.** Do not hang page-specific styles off a
generic component class.

### Utilities

A few unprefixed helpers exist by design: `.num` (count-up target), `.read`, `.matrix`,
`.tier`, `.skel` (skeleton), `.demo`. Keep these to genuinely cross-cutting helpers.

## Files

- **Components:** `PascalCase.astro` (`Header.astro`, `RigCard.astro`).
- **Pages / routes:** kebab-case, Astro dynamic params in brackets (`best-llm-for/[device].astro`).
- **Libraries (`src/lib`):** lowercase, kebab for multi-word (`compute.ts`, `compute-mm.ts`, `gauge.ts`).
- **Styles (`src/styles`):** `global.css` (design tokens), `components.css` (the component skin), `bridge.css` (a thin compatibility layer). Retired tokens get a legacy alias at the top of `components.css` rather than deletion, because Tailwind arbitrary values like `border-[var(--border)]` fail silently when a token disappears.
- **Data (`src/data`):** kebab-case JSON (`image-models.json`).
- **Docs:** kebab-case, `<topic>-conventions.md` for conventions.

## Identifiers (TS/JS)

- `camelCase` functions and variables; `PascalCase` types, interfaces, and components.
- `SCREAMING_SNAKE_CASE` for module-level constant maps (`BOARDS`, `USE_CASES`, `QUANT_LABEL`).
- `interface` for object shapes, `type` for unions/intersections.
- No em-dashes anywhere in user-facing copy (enforced in `CONTRIBUTING.md`); every data point sourced.

## Dead-code discipline

Classes referenced in CSS/JS but rendered in **zero** built pages are removed, not left to
rot. Before deleting a dead-looking class, confirm it renders nowhere with
`grep -rho '<token>' dist` first (build the site, then grep the output).
