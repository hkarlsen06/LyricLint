/** Bundle with bun build --target browser, then pass both revisions to lint-browser.mjs. */
import { parseDocument } from '../../src/lib/core/parser.js';
import { runRules } from '../../src/lib/rules/engine.js';
import { ruleContext } from '../../src/lib/rules/rule-test-utils.js';

const body = [
	'I walk through the city when the sun goes down',
	'And all of the people keep on moving around',
	'We find a little moment in the middle of the night',
	'You know I wanna stay until the morning light'
].join('\n');

function measureLint(sections = 20) {
	const text = Array.from({ length: sections }, (_, i) => `[Verse ${i + 1}]\n${body}`).join('\n\n');
	const context = ruleContext();
	const run = (i: number) =>
		runRules(parseDocument(text + '\n' + 'We sing together'.slice(0, i % 17)), {
			...context,
			revision: i
		});
	for (let i = 0; i < 30; i++) run(i);
	const times: number[] = [];
	const outputs: string[] = [];
	for (let i = 0; i < 100; i++) {
		const start = performance.now();
		const result = run(i);
		times.push(performance.now() - start);
		outputs.push(JSON.stringify(result));
	}
	times.sort((a, b) => a - b);
	return {
		characters: text.length,
		lyricLines: sections * 4,
		medianMs: times[50],
		p95Ms: times[95],
		outputs
	};
}

Object.assign(globalThis, { measureLint });
