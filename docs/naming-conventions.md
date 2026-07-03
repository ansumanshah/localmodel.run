# Naming conventions

How CSS classes, files, and identifiers are named in this repo. The point is one
predictable rule per layer so new code reads like the old code. When in doubt, match
the nearest existing neighbour.

## CSS classes

Three families, each with one job. Pick the family by what the class IS, then use
kebab-case.

### 1. Design-system primitives (the reusable UI kit)

Short `g`-prefixed names, plus the `glass` base and `gh-` for the header. These are the
shared building blocks defined in `glass.css`; reuse them, do not reinvent them. The `g`/
`glass` names are **historical** (they date from the retired liquid-glass system); since the
July 2026 "Calibrated Instrument" reskin they render matte plates, but the names stay frozen
because hundreds of templates use them.

| Class | What (instrument rendering) |
|---|---|
| `.glass`, `.glass-lite` | the two plate weights (hero plate vs dense-content plate, both matte) |
| `.gbtn`, `.gfield`, `.gv` | machined button, recessed field, silkscreen verdict tag |
| `.gstat`, `.gsticky`, `.gscrim`, `.gmodal` | stat readout, sticky bar, modal scrim (no blur), modal |
| `.gh`, `.gh-brand`, `.gh-nav` | the flush header bezel (tick contact edge) and its parts |
| `.gauge`, `.verdict-stamp` | graduated fit gauge, the inked inspection stamp |
| `.spotlight`, `.aurora` | retired glass-era hooks, kept inert (spotlight renders nothing; aurora is a plain backdrop wrapper) |

### 2. Feature / section prefixes (everything page-specific)

`<feature>-<element>` in kebab-case. The prefix names the surface so styles never leak.

`lb-*` (leaderboard) · `det-*` (detector island) · `hiw-*` (how-it-works diagram) ·
`ctx-*` (context-length control) · `rig-*` (rig card) · `bento-*` (bento grid) ·
`verdict-*` (verdict text/hero) · `cmd-chip` (copy-command chip).

**New section? Add a new `<feature>-` prefix.** Do not hang page-specific styles off a
primitive.

### 3. Legacy: `.bp-*` (do not add more)

`bp-` is the old "Blueprint Console" prefix, two redesigns back. It is **load-bearing but
frozen**: hundreds of templates use it and `glass-bridge.css` remaps every `.bp-*` onto the
current skin site-wide. Leave existing `.bp-*` alone (renaming them touches every template +
the bridge + the Claude Design sync bundle for zero user benefit), and never write a new
`.bp-*` class. New work uses families 1 and 2.

The same frozen-names doctrine covers the **files**: `glass.css`, `glass-bridge.css` and
`glass-interactions.ts` kept their names through the instrument reskin; their contents are the
instrument skin. Retired design tokens get legacy aliases at the top of `glass.css` instead of
deletion, because Tailwind arbitrary values like `border-[var(--lite-rim)]` fail silently when
a token disappears.

### Utilities

A few unprefixed helpers exist by design: `.num` (count-up target), `.read`, `.matrix`,
`.tier`, `.skel` (skeleton), `.demo`. Keep these to genuinely cross-cutting helpers.

## Files

- **Components:** `PascalCase.astro` (`Header.astro`, `RigCard.astro`).
- **Pages / routes:** kebab-case, Astro dynamic params in brackets (`best-llm-for/[device].astro`).
- **Libraries (`src/lib`):** lowercase, kebab for multi-word (`compute.ts`, `compute-mm.ts`, `gauge-glass.ts`).
- **Data (`src/data`):** kebab-case JSON (`image-models.json`).
- **Docs / rules:** kebab-case, `<topic>-conventions.md` for conventions.

## Identifiers (TS/JS)

- `camelCase` functions and variables; `PascalCase` types, interfaces, and components.
- `SCREAMING_SNAKE_CASE` for module-level constant maps (`BOARDS`, `USE_CASES`, `QUANT_LABEL`).
- `interface` for object shapes, `type` for unions/intersections (see `.claude/rules/web-conventions`).
- No em-dashes anywhere in user-facing copy (enforced in `CONTRIBUTING.md`); every data point sourced.

## Known dead code (cleanup backlog)

A 2026-06-29 pass found classes referenced in CSS/JS but rendered in **zero** built pages, and
removed them: `.scard`, `.r-maker`, the whole **`.glass--hero`** class (8 CSS refs), and the
**`.maker`** badge code (the `.lb .maker` rule plus the per-maker coloring block in
`glass-interactions.ts`; no element renders `class="maker"` — `maker` is only an `<EntityIcon>`
prop). If you reintroduce a dead-looking class, confirm with `grep -rho '<token>' dist` first.
