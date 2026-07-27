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
			'grammar.english-pronoun-i [suggestion]'
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
		expect(fixKinds.filter((kind) => kind === 'preview')).toHaveLength(2);
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
