# The product docs: how to use the workbench, one short page per task

Touches: `src/lib/docs/catalog.ts`, `src/lib/docs/content/`, `src/lib/docs/keys.ts`,
`src/routes/+layout.svelte`, `src/lib/docs/shortcuts.ts`, `src/lib/ui/docs/`, `src/lib/ui/primitives/`,
`src/routes/(site)/docs/`, `src/routes/sitemap.xml/+server.ts`, `scripts/render-docs.mjs`,
`scripts/shot-cursor.mjs`, `scripts/write-shot-dimensions.mjs`, `src/lib/assets/shot-dimensions.json`

## The rules

- `/docs/` explains how to use LyricLint; `/guidelines/` explains Genius conventions and the
  checks. A docs page links to the guide for a convention rather than restating it.
- `catalog.ts` is the table of contents. The sidebar, the index, search, the pager, the sitemap
  and the prerendered `[slug]` routes all read it, so its order is the reading order everywhere.
  Each page is a title, a one-sentence summary (the index row, the lede and the meta
  description) and its sections.
- A content component (`src/lib/docs/content/<slug>.svelte`) renders the body only. Each catalog
  section is one `<h2>` whose `id` and text match the catalog, in order; a component test
  compares them, because search and "On this page" link to those ids.
- Pages are short reference, in the spirit of Texpile's docs: direct sentences, the real
  visible label of every control, steps as ordered lists. A claim about a feature matches the
  current code and the routed subsystem doc. User-facing copy says 'scribe, never draft.
- The shortcuts page renders `shortcuts.ts`, and `shortcuts.test.ts` fails when the editor
  keymap, sync mode or the window transport binds a key the list does not document.
- `Keys` renders both the Windows/Linux and the Mac form of a combo in fixed markup. The site
  is prerendered, so detecting the platform after hydration would swap text under the reader.
- The shadcn components under `src/lib/ui/primitives/<name>/` are shadcn-svelte's API and file
  shape ported onto `bits-ui`, styled with semantic tokens in their own `<style>` blocks. The
  project has no Tailwind and does not add one. Port a part when a page uses it, not before.
- Every figure is generated. `render-docs.mjs` drives the real workbench over invented
  lyrics and writes `static/docs-<scene>` stills and loops; landing loops are reused by name.
  `DocsFigure` reads `shot-dimensions.json`, so a figure without its still fails the build
  rather than drawing a broken image. Loops play in view only and hold the still under
  reduced motion, through the same `autoplayInView` the landing page uses.
- Moving between docs pages skips the wordmark splash (`src/routes/+layout.svelte`), as
  browsing within the guide does: the frame and sidebar stay mounted and only the article
  changes. Entering or leaving `/docs/` still plays it.
- Docs stills are left out of the service worker's install precache; a docs page joins the
  offline snapshot by being read, like a guide page. Loops are excluded with every other WebM.

## Decision record

### Why a docs section beside the guide

The guide answers "what does Genius want", and the diagnostics answer "what is wrong here".
Neither answered "how do I do this in LyricLint": section links, sync mode, line times, the
performer picker, recovery, and what reaches the network were discoverable only by finding
them. `PRODUCT.md` rules out mandatory onboarding, so the teaching has to be somewhere a
reader can be linked to. The structure follows Texpile's docs (four flat groups, one line per
page) because it lets a reader find the one task they came for without reading a tutorial.

### shadcn without Tailwind

The user asked for shadcn components. shadcn-svelte assumes Tailwind, which this project
does not use (the shadcn lint plugin was removed for that reason in `335d85f4`). Adding
Tailwind for one section would have meant a second styling system beside the token CSS every
other surface consumes. shadcn's own model is copying components into the project and owning
them, so the ports keep its component API over the `bits-ui` primitives already installed and
restyle them with the design system.
