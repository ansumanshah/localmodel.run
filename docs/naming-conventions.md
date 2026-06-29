# Naming conventions

How CSS classes, files, and identifiers are named in this repo. The point is one
predictable rule per layer so new code reads like the old code. When in doubt, match
the nearest existing neighbour.

## CSS classes

Three families, each with one job. Pick the family by what the class IS, then use
kebab-case.

### 1. Glass design-system primitives (the reusable UI kit)

Short `g`-prefixed names, plus the `glass` base and `gh-` for the header. These are the
shared building blocks defined in `glass.css`; reuse them, do not reinvent them.

| Class | What |
|---|---|
| `.glass`, `.glass-lite` | the two glass materials (real backdrop-filter vs cheap twin) |
| `.gbtn`, `.gfield`, `.gv` | button, form field, value chip |
| `.gstat`, `.gsticky`, `.gscrim`, `.gmodal` | stat tile, sticky bar, modal scrim, modal |
| `.gh`, `.gh-brand`, `.gh-nav` | the floating header capsule and its parts |
| `.gauge`, `.spotlight`, `.aurora` | signature gauge, cursor spotlight, page backdrop |

### 2. Feature / section prefixes (everything page-specific)

`<feature>-<element>` in kebab-case. The prefix names the surface so styles never leak.

`lb-*` (leaderboard) · `det-*` (detector island) · `hiw-*` (how-it-works diagram) ·
`ctx-*` (context-length control) · `rig-*` (rig card) · `bento-*` (bento grid) ·
`verdict-*` (verdict text/hero) · `cmd-chip` (copy-command chip).

**New section? Add a new `<feature>-` prefix.** Do not hang page-specific styles off a
primitive.

### 3. Legacy: `.bp-*` (do not add more)

`bp-` is the old "Blueprint Console" prefix from before the Gauge·Glass redesign. It is
**load-bearing but frozen**: hundreds of templates use it and `glass-bridge.css` remaps every
`.bp-*` onto the glass layer site-wide. Leave existing `.bp-*` alone (renaming them touches
every template + the bridge + the Claude Design sync bundle for zero user benefit), and never
write a new `.bp-*` class. New work uses families 1 and 2.

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

A pass on 2026-06-29 found classes referenced in CSS/JS but rendered in **zero** built pages.
Removed in that pass: `.scard`, `.r-maker`. Still pending a dedicated dead-code sweep (left alone
because each spans several rules and wants visual verification): **`.glass--hero`** (8 CSS refs, a
whole dead class) and the **`.maker` / maker-badge coloring block** in `glass-interactions.ts`
(no element renders `class="maker"`). Remove these with a build + mobile-audit + visual check, not
inline with unrelated work.
