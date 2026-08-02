/**
 * Run the evaluation set against a live assistant endpoint (staging, or
 * `wrangler dev` with the Turnstile test secret, which passes any token):
 *
 *   ASSISTANT_EVAL_URL=http://127.0.0.1:8787 \
 *   ASSISTANT_EVAL_ORIGIN=http://127.0.0.1:5173 \
 *   node eval/run.mjs
 *
 * Release gates, from the spec:
 *   - 100% structurally valid responses
 *   - 100% valid local rule ids (the corpus is the arbiter)
 *   - no invented source ids
 *   - >= 95% correct answer-scope classification
 * (That every rendered preview derives from local canonical data is a frontend
 * property, pinned by AssistantDialog.svelte.test.ts rather than measured here.)
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const evalSet = JSON.parse(await readFile(join(here, 'eval-set.json'), 'utf8'));
const corpus = JSON.parse(await readFile(join(here, '../generated/rules-context.json'), 'utf8'));
const ruleIds = new Set(corpus.rules.map((rule) => rule.id));
const sourceIds = new Set(corpus.sources.map((source) => source.id));

const baseUrl = process.env.ASSISTANT_EVAL_URL;
if (!baseUrl) {
	console.error('Set ASSISTANT_EVAL_URL to the Worker under evaluation.');
	process.exit(2);
}
const origin = process.env.ASSISTANT_EVAL_ORIGIN ?? 'http://127.0.0.1:5173';
// Each case gets a fresh anonymous session so the release suite does not spend
// the 25-request browser allowance of one real visitor. Four seconds keeps the
// shared evaluation IP below the production 15/min coarse limit as well. Local
// emulators that do not enforce the binding can opt out explicitly.
const delayMs = Number(process.env.ASSISTANT_EVAL_DELAY_MS ?? 4100);

let structural = 0;
let validCitations = 0;
let validSources = 0;
let scopeCorrect = 0;
const failures = [];

for (const [index, testCase] of evalSet.cases.entries()) {
	if (index > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
	const response = await fetch(`${baseUrl}/v1/answers`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			origin
		},
		body: JSON.stringify({
			chatId: `eval-${testCase.id}`,
			messages: [{ role: 'user', content: testCase.question }],
			clientRuleSetVersion: corpus.ruleSetVersion,
			turnstileToken: 'eval-turnstile-token'
		})
	});
	if (!response.ok) {
		failures.push(`${testCase.id}: HTTP ${response.status}`);
		continue;
	}
	const body = await response.json();
	const answer = body.assistant;
	const blocks = Array.isArray(answer?.blocks) ? answer.blocks : undefined;
	if (!answer || !blocks || typeof answer.scope !== 'string') {
		failures.push(`${testCase.id}: structurally invalid`);
		continue;
	}
	structural += 1;

	const cited = blocks.flatMap((block) => block.ruleIds ?? []);
	const citedSources = blocks.flatMap((block) => block.sourceIds ?? []);
	if (cited.every((id) => ruleIds.has(id))) validCitations += 1;
	else failures.push(`${testCase.id}: unknown rule id in ${JSON.stringify(cited)}`);
	if (citedSources.every((id) => sourceIds.has(id))) validSources += 1;
	else failures.push(`${testCase.id}: invented source id`);

	const expect = testCase.expect ?? {};
	let ok = !expect.scopes || expect.scopes.includes(answer.scope);
	if (expect.citesAny && !expect.citesAny.some((id) => cited.includes(id))) ok = false;
	if (expect.citesNone && cited.length > 0) ok = false;
	if (expect.minRuleCitations && new Set(cited).size < expect.minRuleCitations) ok = false;
	if (expect.maxRuleCitations && new Set(cited).size > expect.maxRuleCitations) ok = false;
	// A table-shaped rule reaches the model as its whole lookup table, and the
	// failure that produced one is invisible to every check above: the answer is
	// structurally perfect, cites the right rule, and knows one pair. So these
	// cases assert on the prose, against forms that appear nowhere in the rule's
	// own reviewed example.
	const said = blocks.map((block) => block.text ?? '').join('\n');
	const missing = (expect.mentionsAll ?? []).filter((form) => !said.includes(form));
	if (missing.length > 0) ok = false;
	if (ok) scopeCorrect += 1;
	else
		failures.push(
			`${testCase.id}: scope/citation expectation missed (scope=${answer.scope}, cited=${cited.join(',')}` +
				`${missing.length > 0 ? `, unmentioned=${missing.join(',')}` : ''})`
		);
}

const total = evalSet.cases.length;
const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;
console.log(`structural   ${structural}/${total} (${pct(structural)})  gate: 100%`);
console.log(`rule ids     ${validCitations}/${total} (${pct(validCitations)})  gate: 100%`);
console.log(`source ids   ${validSources}/${total} (${pct(validSources)})  gate: 100%`);
console.log(`scope        ${scopeCorrect}/${total} (${pct(scopeCorrect)})  gate: 95%`);
if (failures.length > 0) {
	console.log('\nMisses:');
	for (const failure of failures) console.log(`  - ${failure}`);
}

const passed =
	structural === total &&
	validCitations === total &&
	validSources === total &&
	scopeCorrect / total >= 0.95;
console.log(passed ? '\nRelease gates: PASS' : '\nRelease gates: FAIL');
process.exit(passed ? 0 : 1);
