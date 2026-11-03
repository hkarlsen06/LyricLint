import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const words = [
	'I',
	'Ærlig',
	'Café',
	'A\u0301',
	'WHY',
	'yeah',
	'Yeah',
	'Yeah, Yeah',
	'(yeah)',
	"let's go",
	'you & me',
	'37°',
	'su:m37°',
	'H&M',
	'®☆™★',
	'<i>yeah</i>',
	'<u>x™</u>',
	'<b>(yeah)</b>',
	'<i>a *b* c</i>',
	'f**k',
	'***',
	'*Bang*',
	'f*ø*',
	'*',
	'&#39;',
	'<x title="a&b">t</x>',
	'<unclosed',
	'<i>',
	'</i>',
	'😀',
	'\t',
	'\r',
	'<i>x\ny</i>',
	'e\u0301*'
];
export function* differentialCases(samples = 8000) {
	let seed = 31279;
	const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
	for (let sample = 0; sample < samples; sample++) {
		const text =
			(sample % 2 ? '[Verse]\n' : '') +
			Array.from({ length: 1 + (random() % 4) }, () =>
				Array.from({ length: 1 + (random() % 12) }, () => words[random() % words.length]).join(' ')
			).join('\n');
		for (const language of ['en', 'fr', 'no']) yield { text, language };
	}
}
export function compareDiagnostics(before, after, cases = differentialCases()) {
	assert.deepEqual(after.ruleIds, before.ruleIds, 'Rule scope changed');
	const hash = createHash('sha256');
	let checked = 0;
	for (const { text, language } of cases) {
		const expected = before.check(text, language);
		const actual = after.check(text, language);
		assert.deepEqual(actual, expected, JSON.stringify({ text, language }));
		hash.update(JSON.stringify([text, language, actual]));
		checked++;
	}
	assert(checked > 0, 'No differential cases ran');
	return { checked, errors: 0, sha256: hash.digest('hex'), ruleIds: before.ruleIds };
}
if (import.meta.main) {
	const [beforePath, afterPath] = process.argv.slice(2);
	assert(
		beforePath && afterPath && process.argv.length === 4,
		'Usage: node scripts/performance/differential-lint.mjs BEFORE.mjs AFTER.mjs'
	);
	const before = await import(pathToFileURL(resolve(beforePath)).href);
	const after = await import(pathToFileURL(resolve(afterPath)).href);
	assert.match(before.revision, /^[a-f0-9]{40}$/u);
	assert.match(after.revision, /^[a-f0-9]{40}$/u);
	console.log(
		JSON.stringify({
			before: before.revision,
			after: after.revision,
			...compareDiagnostics(before, after)
		})
	);
}
