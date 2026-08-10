import { beforeAll, describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import { loadStatisticalLanguageDetector } from '$lib/languages/detect.js';
import { currentRuleSet, runRules, sourceRegistry } from '$lib/rules/index.js';
import { sampleDraftLanguage, sampleDraftText } from './sample-draft.js';

beforeAll(() => loadStatisticalLanguageDetector());

function lint(text: string, language = sampleDraftLanguage) {
	return runRules(parseDocument(text), {
		language,
		performers: [],
		sources: sourceRegistry,
		ruleSetVersion: currentRuleSet.version,
		revision: 0
	});
}

describe('the sample transcription', () => {
	it('demonstrates the linter with a handful of findings, not a wall of them', () => {
		const diagnostics = lint(sampleDraftText);

		expect(
			diagnostics.map((diagnostic) => `${diagnostic.ruleId} [${diagnostic.severity}]`)
		).toEqual([
			'contraction.apostrophe [warning]',
			'quotes.typewriter [warning]',
			'quotes.typewriter [warning]',
			'punctuation.line-ending [warning]',
			'spelling.english-common [suggestion]',
			'grammar.english-pronoun-i [suggestion]'
		]);
	});

	// The sample is also the first place a reader meets the meta line's
	// provenance marks, so its findings deliberately span the origins the panel
	// can cite: Genius annotations, the language authorities behind a
	// misspelling, and a LyricLint reading wearing the derivation mark. (The
	// fourth origin, Harper's `I has` agreement finding, is pinned against the
	// real WASM in `harper.test.ts` so this suite stays fast.)
	it('spans the citation origins rather than citing Genius alone', () => {
		const diagnostics = lint(sampleDraftText);

		const derivations = diagnostics.filter((diagnostic) => diagnostic.derivation);
		expect(derivations.map((diagnostic) => diagnostic.ruleId)).toEqual(['punctuation.line-ending']);

		const spelling = diagnostics.find(
			(diagnostic) => diagnostic.ruleId === 'spelling.english-common'
		);
		expect(spelling?.sourceIds).toContain('L-EN-TOP50');

		const geniusCited = diagnostics.filter((diagnostic) =>
			diagnostic.sourceIds.some((id) => sourceRegistry.get(id)?.url.includes('genius.com'))
		);
		expect(geniusCited.length).toBeGreaterThan(0);
	});

	// Both curly quotes are on line 4, so severity, line number and citation are
	// identical on both rows and the message is the only thing separating them.
	// Two rows reading exactly alike is what the sample looked like before the
	// rule named the mark it had found.
	it('says which quote each of the two curly findings is about', () => {
		const quotes = lint(sampleDraftText).filter(
			(diagnostic) => diagnostic.ruleId === 'quotes.typewriter'
		);

		expect(quotes.map((diagnostic) => diagnostic.message)).toEqual([
			'Use a straight " instead of the opening curly double quote.',
			'Use a straight " instead of the closing curly double quote.'
		]);
	});

	// The bulk strip's two numbers are the point of the sample: one press
	// settles what is mechanical, and the rest are named as judgment calls
	// rather than left looking like a fix that half worked.
	it('splits into fixes the shell can apply and decisions it cannot', () => {
		const fixKinds = lint(sampleDraftText).map(
			(diagnostic) => diagnostic.fixes?.[0]?.kind ?? 'none'
		);

		expect(fixKinds.filter((kind) => kind === 'safe')).toHaveLength(2);
		expect(fixKinds.filter((kind) => kind === 'preview')).toHaveLength(4);
	});

	// Loading English lyrics under another selection is a true finding about a
	// document the user did not write, which is why the sample is only ever
	// offered while English is selected.
	it('would report a language mismatch under another selection', () => {
		expect(lint(sampleDraftText, 'no').map((diagnostic) => diagnostic.ruleId)).toContain(
			'language.selection-mismatch'
		);
	});
});
