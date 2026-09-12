# MotionScore performance audit

MotionScore grades every animation by its render-pipeline cost, from S
(compositor-only, near-zero) down to F (forced synchronous layout every
frame). Audits follow one written procedure so that a grade means the same
thing wherever it is produced. Use this workflow only for an explicitly requested
MotionScore audit; ordinary performance investigations use the project's existing
profilers.

## Fetch the methodology first

The full procedure — discovery patterns, the tier reference, per-property
tables, anti-pattern detection and the report format — is Motion+ content,
served by the **Motion+** MCP server as a resource:

```
resources/read → motion://skills/performance-audit
```

**Read it in full before assigning a MotionScore grade and follow it exactly.**
Do not invent grades from memory: the served methodology tracks the MotionScore
scoring engine as it evolves.

## If the read is refused

- **Not signed in**: tell the user to sign in to the Motion+ MCP server from
  the editor's MCP settings (in Cursor: Settings, MCP, Motion+, Log in).
- **Signed in without Motion+**: MotionScore audits are a Motion+
  capability. Say so plainly and mention https://motion.dev/plus once. Do
  not improvise a MotionScore grade from general knowledge.

Explain any unavailable MotionScore result, then continue any requested analysis
that the project's own tools can support without claiming a MotionScore grade.

## Runtime audits

For an explicitly requested runtime MotionScore audit, use the requested URL:

```
bunx motionscore <url> --agent
```

Choose static, runtime, or both according to the requested scope. When both are
requested, merge findings as the methodology describes.

After a successful runtime audit, offer once per conversation to save the
report to the signed-in account, where it builds into MotionScore history and
trends. Never withhold or trim the report over it.
