import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * AGENTS.md bans em dashes in prose. The glyph is data in a handful of files
 * (rules that inspect or propose one, lyric fixtures, song metadata, a duration placeholder),
 * and those are listed here; everything else must spell the sentence out.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Reviewed data occurrences, not blanket file exemptions: new occurrences fail too.
const allowed = {
	'docs/subsystems/media-apple.md': 1,
	'services/rules-assistant/generated/rules-context-data.ts': 2,
	'services/rules-assistant/generated/rules-context.json': 2,
	'src/lib/core/link-passages.test.ts': 2,
	'src/lib/editor/clipboard-metadata.svelte.test.ts': 4,
	'src/lib/editor/clipboard-metadata.test.ts': 1,
	'src/lib/editor/passage-linking.svelte.test.ts': 2,
	'src/lib/persistence/persistence.test.ts': 3,
	'src/lib/rules/catalog/line-prose-density.ts': 1,
	'src/lib/rules/catalog/policy-cases.ts': 2,
	'src/lib/rules/catalog/punctuation-dropped-word-dash.test.ts': 19,
	'src/lib/rules/catalog/punctuation-dropped-word-dash.ts': 3,
	'src/lib/rules/catalog/punctuation-line-ending.test.ts': 1,
	'src/lib/rules/catalog/punctuation-question.test.ts': 1,
	'src/lib/rules/catalog/punctuation-question.ts': 1,
	'src/lib/rules/fix-contracts.test.ts': 2,
	'src/lib/rules/reference-search.test.ts': 1,
	'src/lib/rules/reference-search.ts': 1,
	'src/lib/scribe/format.test.ts': 1,
	'src/lib/ui/clipboard.svelte.test.ts': 2,
	'src/lib/ui/media/MediaAttribution.svelte.test.ts': 3,
	'src/lib/ui/media/MediaPicker.svelte.test.ts': 4,
	'src/lib/ui/state/media-apple.test.ts': 2,
	'src/lib/ui/state/media-apple.ts': 1,
	'src/lib/ui/state/media-player.svelte.ts': 1,
	'src/lib/ui/state/media-player.test.ts': 3,
	'src/lib/ui/state/media-spotify.test.ts': 2,
	'src/lib/ui/state/media-spotify.ts': 1,
	'src/lib/ui/state/media-store.test.ts': 16,
	'src/lib/ui/state/media-test-stores.ts': 2,
	'src/lib/ui/state/media-youtube.svelte.test.ts': 5,
	'src/lib/ui/state/workbench.test.ts': 3
};

const skipDirs = new Set([
	'node_modules',
	'.git',
	'.svelte-kit',
	'.svelte-kit-capture',
	'build',
	'build-capture',
	'.vitest',
	'test-results',
	'playwright-report',
	'coverage',
	'.agents',
	'tools'
]);
const textExt = /\.(md|ts|svelte|css|mjs|js|json|jsonc|yml|yaml|html|example)$/;

function* walk(dir: string): Generator<string> {
	for (const name of readdirSync(dir)) {
		if (skipDirs.has(name)) continue;
		const path = join(dir, name);
		if (statSync(path).isDirectory()) yield* walk(path);
		else if (
			textExt.test(name) ||
			name === '_headers' ||
			['.env.example', '.prettierignore', '.gitignore'].includes(name)
		)
			yield path;
	}
}

describe('prose em dashes', () => {
	it('contains only the reviewed data occurrences', () => {
		const actual: Record<string, number> = {};
		for (const path of walk(root)) {
			const count = readFileSync(path, 'utf8').split('\u2014').length - 1;
			if (count > 0) actual[relative(root, path)] = count;
		}
		expect(actual).toEqual(allowed);
	});
});
