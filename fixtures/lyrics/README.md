# Synthetic lyric fixtures

These fixtures are invented for LyricLint testing. They are not copied song lyrics.

`cases.json` is a seed corpus for parser, rule, transformation, selection, Unicode, and persistence tests. Expected rule IDs reference `docs/rules.md`.

The corpus intentionally includes malformed and unsupported markup. Test harnesses must treat every `input` value as untrusted plain text.
