# Third-party notices

localmodel.run is MIT-licensed (see LICENSE). This file is a voluntary,
good-faith attribution record. None of the licenses below require a published
web page for a static site: where a notice must travel with a shipped file it
already does (the fonts carry their own LICENSE and embed it in their metadata;
the bundled JS keeps its license banners), and everything else is build tooling
that never reaches the browser. The list is here for transparency.

## Shipped to the browser

- **Geist Sans** and **Geist Mono**: SIL Open Font License 1.1.
  Copyright (c) 2023 Vercel, in collaboration with basement.studio
  (https://github.com/vercel/geist-font). Self-hosted via
  `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (plus
  `@fontsource/geist-sans` for the build-time OG cards). Each package ships the
  full OFL text and the woff2 files embed the license in their name-table
  metadata, so the OFL is satisfied by the font files themselves, not by this page.
- **Lucide** (via `@iconify-json/lucide`): ISC License. Copyright the Lucide
  contributors (https://github.com/lucide-icons/lucide). Icon SVG paths are
  inlined into the HTML at build time and carry no banner, so the permission
  notice is reproduced here:

  > Permission to use, copy, modify, and/or distribute this software for any
  > purpose with or without fee is hereby granted, provided that the above
  > copyright notice and this permission notice appear in all copies.
  >
  > THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
  > WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
  > MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
  > ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
  > WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
  > ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
  > OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
- **Simple Icons** (via `@iconify-json/simple-icons`): icon SVG data is CC0-1.0
  (public domain), so no attribution is required; it is credited here only as a
  courtesy. The brand logos themselves (Meta, Google, NVIDIA, Apple, and others)
  are trademarks of their respective owners and are used here only to identify
  the model maker, device vendor or OS. No affiliation or endorsement is implied.
- **React** (MIT): the island runtime is the library code that ships to
  visitors; its license banner stays in the minified bundle.

## Build-time only (never served to visitors)

- **satori** and **@resvg/resvg-js**: Mozilla Public License 2.0. Used
  unmodified at build time to render the social/OG card images. Only the
  resulting PNGs are served, so the MPL imposes nothing on the site.
- **lightningcss** (via Tailwind CSS): Mozilla Public License 2.0. Used
  unmodified at build time; only the compiled CSS is served.
- **Astro**, **@astrojs/\***, **Tailwind CSS**, **astro-icon** and the remaining
  dependencies: MIT (or compatible permissive licenses); see each package in
  `node_modules` for its exact terms.

## Data

The model and device dataset under `src/data/` is compiled from the primary
sources cited in each row's `sources[]` array (Ollama, HuggingFace GGUF repos,
and vendor model cards / spec pages). Factual measurements are not
copyrightable; the compiled dataset is offered under CC BY 4.0 with attribution
to localmodel.run. Figures are estimates; see /methodology.
