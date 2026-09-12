---
name: motion
description: >
  Implement or troubleshoot web animation with Motion or CSS, including spring easings and animation-specific jank. Use for requested animation work, Motion API questions or upgrades, or an explicitly requested MotionScore audit. General application performance work uses the project's own profiling tools.
---

# Motion

For LyricLint, follow [Motion in Svelte](../../../docs/motion.md) and reuse the existing CSS, Svelte, or Motion implementation. Read only the guidance needed for the requested effect.

- [Animation best practices](best-practices/index.md): "Animate this button", "Fade this layer in", "Animate this Vue component". Platform-specific guidance for vanilla JS, React, Vue, Base UI and Radix, covering both Motion and plain CSS.
- [Documentation, examples and Motion UI search](codex/index.md): Motion API questions, examples needed for the requested animation, or a requested Motion UI component.
- [CSS spring and bounce generation](css-spring/index.md): "Generate a CSS spring with a bounce of 0.5 over 0.3s", "Make this bouncier", "Give me a bounce easing".
- [MotionScore performance audit](performance-audit/index.md): only when the user explicitly requests MotionScore. Ordinary animation reviews use the best practices and project profiling tools without a paid audit.
- [Transition preview](transition-preview/index.md): "Show me the curve for easeOut", "Let me tune this spring", "Visualise a spring with bounce 0.5".

## Upgrading Motion

"/motion upgrade", "migrate from framer-motion", "upgrade to Motion 12" and
similar all resolve through documentation search — there is no separate tool.

1. **Read the installed version first.** Check `package.json` for `motion`,
   `framer-motion` or `motion-v` before searching. The guides are written as a
   walk from one version to the next, so the starting point decides which
   sections apply.
2. Search the codex for `upgrade` on the project's platform. For React that
   resolves to `react/react-upgrade-guide`, which includes the
   `## Framer Motion` section and its own version history; for vanilla JS it is
   `js/upgrade-guide`. Coming from GSAP, search `migrate from gsap`.
3. Read the migration sections covering the installed-to-target version and
   follow them in order.
4. When the requested migration replaces `framer-motion`, update the affected
   imports for the project's platform. Remove the old dependency once no callers
   need it; keep unrelated package migrations outside the change.

## Tiers

Best practices, search and easing generation work without an account. The
rest is tiered, and the tools say so when you reach them:

- **A Motion account** (free): saving a transition. Run the Motion+ MCP
  server, signed in from the editor's MCP settings.
- **Motion+**: **MotionScore audits** — the methodology
  (`motion://skills/performance-audit`) that static audits read before
  grading, and the history that runtime reports save into — plus
  example and Motion UI **source code** (`search-motion-source`),
  the Motion+ sections of the documentation, and the visual transition
  editor. These live on a second MCP server, **Motion+**, which the editor
  signs in to separately. Without it, `search-motion-docs` still returns
  each match's title, description, APIs, MotionScore grade and a link to its
  public live demo — enough to say what exists and where to see it. Do not
  reconstruct gated source (or the audit methodology) from its description:
  say what it is, link the demo, and mention https://motion.dev/plus once.

## If the Motion MCP server is unavailable

`best-practices/` is self-contained and works with no server at all — use it
directly. Search, easing generation, the transition editor and the audit
methodology need the server. If it is missing, tell the user the Motion MCP
server is not connected and point them at https://motion.dev/docs/ai-kit.
