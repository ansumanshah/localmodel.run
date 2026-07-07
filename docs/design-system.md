# Design system: The Calibrated Instrument

The visual language of localmodel.run is **"The Calibrated Instrument"** (*a reading you can
trust*): matte panel surfaces, a calibration-certificate blue as the single accent, inked
inspection-stamp verdicts, graduated gauges with real tick marks, monospace numerals everywhere a
number appears, and deliberate stillness (a needle moves once, settles, and stops; nothing floats,
blurs, or follows the cursor). It replaced an earlier design language in July 2026. This doc is
the map of where the system lives, so a change lands in one place and everything inherits it.

## Source of truth

All tokens live in **`src/styles/global.css`**; the component skin lives in
**`src/styles/components.css`** with a thin compatibility layer in **`src/styles/bridge.css`**
(see `docs/naming-conventions.md`).

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
  `.verdict-stamp` / `.verdict-hero` (the inspection stamp, once per page), `.tag` (silkscreen
  verdict tags), `.eyebrow`, `.panel` / `.panel-hero` (matte plates; the hero plate
  carries a ruler-tick top edge), `.site-header` (the flush header bezel with its tick contact
  edge), `.stat-*`, `.card-seam`, `.num`, and friends. Plain generic names, no legacy prefix.
- **Motion** — one-shot reveals (`bar-grow` needle-overshoot sweep, `stamp-press`,
  `mark-draw`, `enter-rise`, count-ups) plus ONE sanctioned ambient exception: the runtime
  ticker (`.marquee`) loops continuously, pauses on hover. Everything guarded by
  `prefers-reduced-motion` (ticker collapses to a wrapped static list). The cursor effects of
  the previous system (spotlight, tilt, magnetic) were deleted, not disabled.

Rule: **the CSS is canonical.** Accent and tone changes are one-token edits here, and everything
inherits them.

One hard-won gotcha: components may reference tokens through Tailwind arbitrary values
(`border-[var(--lite-rim)]`). An undefined `var()` silently invalidates the whole declaration,
so retired token names get **legacy aliases** at the top of `components.css` rather than deletion.
