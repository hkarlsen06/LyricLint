/** bun scripts/benchmark-lint.ts; bundle with bun build --target=node to compare revisions in V8. */
import { createHash } from 'node:crypto';
import { parseDocument } from '../src/lib/core/parser.js';
import { runRules } from '../src/lib/rules/engine.js';
import { ruleContext } from '../src/lib/rules/rule-test-utils.js';

const lines = [
	'I walk through the city when the sun goes down',
	'And all of the people keep on moving around',
	'We find a little moment in the middle of the night',
	'You know I wanna stay until the morning light',
	'<i>Shawdy, take me home (yeah)</i>',
	'Idk if tommorrow will ever feel alright',
	'You bring the light, Yeah',
	"I keep runnin' until the stars fade out"
];
const context = ruleContext();
const scenarios = [3, 10, 100].map((sections) => ({
	name: `${sections * lines.length} lyric lines`,
	texts: Array.from({ length: 12 }, (_, revision) =>
		Array.from(
			{ length: sections },
			(_, section) =>
				`[Verse ${section + 1}]\n${lines.join('\n')}${section === 0 ? ' tonight'.slice(0, revision) : ''}`
		).join('\n\n')
	)
}));
// More distinct lines than the cache can hold: every pass must
// recompute the spelling lookup, exercising cold imports and cache eviction.
function uniqueWord(value: number): string {
	let word = 'zz';
	for (let digit = 0; digit < 5; digit += 1) {
		word += String.fromCharCode(97 + (value % 26));
		value = Math.floor(value / 26);
	}
	return word;
}
scenarios.push({
	name: '240 unique-token lines (cache churn)',
	texts: Array.from(
		{ length: 12 },
		(_, revision) =>
			'[Verse]\n' +
			Array.from({ length: 240 }, (_, line) =>
				Array.from({ length: 6 }, (_, word) => uniqueWord(revision * 1440 + line * 6 + word)).join(
					' '
				)
			).join('\n')
	)
});
for (const scenario of scenarios) {
	const hash = createHash('sha256');
	for (const text of scenario.texts) {
		const document = parseDocument(text);
		hash.update(JSON.stringify([document, runRules(document, context)]));
	}
	for (let warmup = 0; warmup < 3; warmup += 1) {
		for (const text of scenario.texts) runRules(parseDocument(text), context);
	}
	const samples: number[] = [];
	for (let batch = 0; batch < 9; batch += 1) {
		const start = performance.now();
		for (const text of scenario.texts) runRules(parseDocument(text), context);
		samples.push((performance.now() - start) / scenario.texts.length);
	}
	samples.sort((left, right) => left - right);
	console.log(
		JSON.stringify({
			scenario: scenario.name,
			characters: scenario.texts[0].length,
			medianMs: samples[4],
			minMs: samples[0],
			maxMs: samples[8],
			sha256: hash.digest('hex')
		})
	);
}
