# Third-party notices

localmodel.run is MIT-licensed (see LICENSE). It builds on the following
third-party works, each under its own license.

## Fonts

- **Geist Sans** and **Geist Mono**: SIL Open Font License 1.1.
  Copyright The Geist Project Authors (https://github.com/vercel/geist-font).
  Bundled via `@fontsource/geist-sans` and `@fontsource-variable/geist` /
  `@fontsource-variable/geist-mono`; each package ships the full OFL text.

## Icons

- **Simple Icons** (via `@iconify-json/simple-icons`): icon SVG data is CC0-1.0
  (public domain). The brand logos themselves (Meta, Google, NVIDIA, Apple,
  etc.) are trademarks of their respective owners and are used here only for
  identification of the model maker, device vendor or OS. No affiliation or
  endorsement is implied.
- **Lucide** (via `@iconify-json/lucide`): ISC License. Copyright the Lucide
  contributors (https://github.com/lucide-icons/lucide).

## Build-time libraries

- **satori** and **@resvg/resvg-js**: Mozilla Public License 2.0. Used
  unmodified at build time to render the social/OG card images.
- **Astro**, **@astrojs/\***, **React**, **Tailwind CSS**, **astro-icon** and the
  remaining dependencies: MIT (or compatible permissive licenses); see each
  package in `node_modules` for its exact terms.

## Data

The model and device dataset under `src/data/` is compiled from the primary
sources cited in each row's `sources[]` array (Ollama, HuggingFace GGUF repos,
and vendor model cards / spec pages). Factual measurements are not
copyrightable; the compiled dataset is offered under CC BY 4.0 with attribution
to localmodel.run. Figures are estimates; see /methodology.
