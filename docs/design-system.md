# Design system: The Calibrated Instrument ↔ Claude Design

The visual language of localmodel.run is **"The Calibrated Instrument"** (*a reading you can
trust*): matte panel surfaces, a calibration-certificate blue as the single accent, inked
inspection-stamp verdicts, graduated gauges with real tick marks, monospace numerals everywhere a
number appears, and deliberate stillness (a needle moves once, settles, and stops; nothing floats,
blurs, or follows the cursor). It replaced the earlier liquid-glass system in July 2026. This doc
explains where it lives and how it stays in sync with [Claude Design](https://claude.ai/design),
where the site can be redesigned on-brand.

## Source of truth

All tokens live in **`src/styles/global.css`**; the component skin lives in
**`src/styles/glass.css`** and **`src/styles/glass-bridge.css`** (the filenames are historical,
kept frozen because hundreds of templates and the import graph reference them — see
`docs/naming-conventions.md`).

- **Tokens** (`global.css`) — CSS custom properties: `--color-brand` (calibration blue `#2D5FA8`, with
  `--brand-ink` darkened/lifted per theme for AA text), `--background` / `--foreground`
  (matte panel `#EDEAE2` light default, gunmetal `#15171A` dark), `--card`, `--border`,
  `--muted-foreground`, the verdict pair (`--color-verdict-*` for fills/borders,
  `--verdict-*-fg` for AA text, both themes computed and passing), and modality accents
  (`--modality-image|video|audio`, inked and desaturated).
- **Type trio** — `--font-display` (Fjalla One: h1/h2 and stamps, single weight,
  `font-synthesis: none`), `--font-sans` (Public Sans: prose, nav, labels), `--font-mono`
  (JetBrains Mono: every numeral, tabular). Discipline: display never below 1.25rem, mono never
  carries prose, body never carries a measured value.
- **Component layer** — `.gauge` / `.gauge-fill` / `.gauge-mark` (the graduated fit gauge),
  `.verdict-stamp` / `.verdict-hero` (the inspection stamp, once per page), `.gv` (silkscreen
  verdict tags), `.bp-eyebrow`, `.bp-panel` / `.bp-instrument` (matte plates; the instrument
  plate carries a ruler-tick top edge), `.gh` (the flush header bezel with its tick contact
  edge), `.bp-stat-*`, `.card-seam`, `.num`, and friends.
- **Motion** — one-shot only: `bar-grow` (needle-overshoot fill sweep), `stamp-press`,
  `mark-draw`, `enter-rise`, count-ups. All guarded by `prefers-reduced-motion`. The cursor
  effects of the previous system (spotlight, tilt, magnetic) were deleted, not disabled.

Rule: **if the CSS and any mirror drift, the CSS wins.** Accent and tone changes are one-token
edits here, and everything inherits them.

One hard-won gotcha: components may reference tokens through Tailwind arbitrary values
(`border-[var(--lite-rim)]`). An undefined `var()` silently invalidates the whole declaration,
so retired token names get **legacy aliases** at the top of `glass.css` rather than deletion.

## Claude Design is a downstream mirror

A design system is published to Claude Design so its design agent builds with the real tokens and
components instead of generic ones. This is a **one-way mirror, not live bidirectional sync** —
think of it as a build artifact derived from the CSS, not a second source of truth.

The published bundle (a self-contained `styles.css` lifted from the three CSS files, plus one
preview card per component) is generated locally and uploaded with the `/design-sync` tool. Its
sync state (`.design-sync/`) is gitignored — regenerated from the CSS on every sync, so it never
rots in the repo.

## The sync loop

```
                 /design-sync  (code → Design, automated)
  global.css  ───────────────────────────────────────────►  Claude Design project
  (canonical)  ◄───────────────────────────────────────────  (redesign / prototype)
                 manual translation  (Design → code)
```

1. **Code is canonical.** Real changes land in the CSS and the `.astro` components, commit to
   git, deploy to localmodel.run via Cloudflare Pages. Normal workflow.
2. **Code → Design.** After a visual change, re-run `/design-sync`. It re-derives `styles.css`,
   re-renders the affected cards, and re-uploads to the same project (the project id is pinned in
   `.design-sync/config.json`). Claude Design now matches production.
3. **Design → code.** When you prototype a redesign *in* Claude Design and like it, translate it
   back into tokens / `.astro` templates, review the diff, commit, deploy. **A redesign is not
   shipped until it is in the repo** — Claude Design has no path to production on its own.

### Cadence

Sync *after* a design change ships (so Design reflects production) and *before* a redesign session
(so the agent starts from the current real site). It is a checkpoint, not a per-commit CI step.

### The seam to watch

The **code → Design** direction is fully automated by `/design-sync`. The **Design → code**
direction is a manual translation — there is no automatic import of a Claude Design layout back
into Astro. Keep the CSS as the arbiter and that seam stays manageable.

## Re-syncing

Edit the CSS → re-run `/design-sync` (the pin routes to the existing project) → review the
re-rendered cards. The sync validates every class and token in the published `README.md` against
the built CSS, so a renamed or deleted class is flagged rather than silently shipped.
