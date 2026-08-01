/**
 * Regenerate the rules-assistant knowledge corpus:
 *
 *   bun run assistant:corpus
 *
 * Writes services/rules-assistant/generated/rules-context.json from the
 * frontend's own reviewed data. The content hash excludes the timestamp, and
 * an unchanged hash preserves the existing build stamp, so a no-op generation
 * is byte-stable. The parity tests in src/lib/rules/assistant-corpus.test.ts
 * fail when the committed artifact is stale relative to the reviewed data.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { buildAssistantCorpus } from '../src/lib/rules/assistant-corpus.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'services/rules-assistant/generated/rules-context.json');

const rulesMd = await readFile(join(root, 'docs/rules.md'), 'utf8');
const existing = await readFile(target, 'utf8')
	.then((text) => JSON.parse(text) as { generatedAt?: string; contentHash?: string })
	.catch(() => undefined);
const candidate = await buildAssistantCorpus(rulesMd, new Date().toISOString());
// A no-op regeneration must be byte-stable. Preserve the build stamp whenever
// the reviewed content hash has not moved; a real corpus change receives a new
// stamp.
const corpus =
	existing?.contentHash === candidate.contentHash && existing.generatedAt
		? { ...candidate, generatedAt: existing.generatedAt }
		: candidate;

await mkdir(dirname(target), { recursive: true });
const prettierConfig = (await resolveConfig(target)) ?? {};
await writeFile(
	target,
	await format(JSON.stringify(corpus), { ...prettierConfig, parser: 'json' })
);
console.log(
	`Wrote ${target}\n` +
		`  ruleset ${corpus.ruleSetVersion} · ${corpus.rules.length} rules · ` +
		`${corpus.sources.length} sources · ${corpus.languages.length} languages\n` +
		`  content hash ${corpus.contentHash}`
);
