import type { RuleDefinition } from '$lib/core/types.js';
import { isEnglishLanguage } from '$lib/languages/registry.js';
import { diagnostic, matchesOutsideMarkup, preserveCase, replacementFix } from './utils.js';

export const contractions: Record<string, string> = {
	arent: "aren't",
	cant: "can't",
	couldnt: "couldn't",
	didnt: "didn't",
	doesnt: "doesn't",
	dont: "don't",
	hasnt: "hasn't",
	havent: "haven't",
	im: "I'm",
	isnt: "isn't",
	ive: "I've",
	shouldnt: "shouldn't",
	thats: "that's",
	theyre: "they're",
	wasnt: "wasn't",
	werent: "weren't",
	whats: "what's",
	wont: "won't",
	wouldnt: "wouldn't",
	youre: "you're"
};

const contractionPattern = new RegExp(
	`(?<![\\p{L}\\p{N}_])(?:${Object.keys(contractions).join('|')})(?![\\p{L}\\p{N}_])`,
	'giu'
);

export const contractionApostropheRule: RuleDefinition = {
	id: 'contraction.apostrophe',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-CONTRACTIONS'],
	check(document, context) {
		if (!isEnglishLanguage(context.language)) {
			return [];
		}
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, contractionPattern).map((match) => {
					const preferred = contractions[match.text.toLocaleLowerCase('en')] ?? match.text;
					const replacement =
						match.text.toLocaleLowerCase('en') === 'im'
							? preferred
							: preserveCase(match.text, preferred);
					return diagnostic(
						this,
						match,
						`“${match.text}” looks like a contraction missing an apostrophe.`,
						'This list excludes especially ambiguous forms such as “ill” and “well.” Confirm the intended meaning before applying the punctuation.',
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};
