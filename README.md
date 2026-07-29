# LyricLint

LyricLint is a browser-based editor and linter for Genius lyric transcriptions.
It checks formatting, grammar, spelling, section headers, and performer markup.
Every Genius-specific rule cites the guideline behind it.

[Open LyricLint](https://lyriclint.com/lint/) ·
[Browse the rules](https://lyriclint.com/rules/)

## Features

- Review diagnostics inline and preview fixes before applying them.
- Add Genius-compatible performer markup without writing the HTML by hand.
- Keep multiple transcriptions saved locally in the browser.
- Work offline after the app has loaded. Lyrics are not sent to a LyricLint
  server.

## Development

[Bun](https://bun.sh/) is required.

```sh
bun install
bun run dev
```

Run the project checks with:

```sh
bun run check
bun run lint
bun run test:unit -- --run
```

Create a production build with:

```sh
bun run build
```

## Security

Report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md).
