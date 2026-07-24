import type { RuleSetManifest } from '../../core/types.js';

export const currentRuleSet: RuleSetManifest = {
	version: '2026.07.24.1',
	publishedAt: '2026-07-24',
	sourceIds: [
		'G-SECTIONS',
		'G-SPELLING',
		'G-LANG-EN',
		'G-LANG-NO',
		'G-NUMBERS',
		'G-QE-MARKS',
		'G-DASHES',
		'G-CAPS',
		'G-UNKNOWN',
		'G-CONTRACTIONS',
		'G-TYPEWRITER',
		'G-ADLIBS',
		'G-REPEATS',
		'G-LINES',
		'G-SFX',
		'G-CENSORED'
	],
	ruleIds: [
		'syntax.unbalanced-brackets',
		'syntax.unsupported-voice-markup',
		'section.header-missing',
		'section.header-language',
		'performer.header-required',
		'performer.style-order',
		'performer.inline-mismatch',
		'performer.too-many-groups',
		'performer.line-label-forbidden',
		'spelling.standardized',
		'spelling.language-variant',
		'quotes.typewriter',
		'contraction.apostrophe',
		'unknown.marker',
		'repeat.placeholder',
		'sound-effect.asterisks',
		'censored.mask',
		'adlib.parentheses',
		'capitalization.line-start',
		'punctuation.question',
		'punctuation.dropped-word-dash',
		'line.prose-density',
		'numbers.spell-out'
	]
};

/** Empty bootstrap snapshot retained as the prior known-good rule-set. */
export const previousKnownGoodRuleSet: RuleSetManifest = {
	version: '2026.07.24.0',
	publishedAt: '2026-07-24',
	sourceIds: [],
	ruleIds: []
};
