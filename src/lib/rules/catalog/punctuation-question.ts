import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, hasUnsupportedMarkup, maskedMarkupText, replacementFix } from './utils.js';

const clearQuestion =
	/^(?:(?:who|what|where|when|why)\s+(?:are|is|was|were|do|does|did|can|could|will|would|should|have|has)\b|how\s+(?:are|is|was|were|do|does|did|can|could|will|would|should)\b|(?:are|is|was|were|do|does|did|can|could|will|would|should|have|has)\s+(?:i|you|we|they|he|she|it)\b)/iu;

export const punctuationQuestionRule: RuleDefinition = {
	id: 'punctuation.question',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-QE-MARKS'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				if (hasUnsupportedMarkup(line)) {
					return [];
				}
				const visible = maskedMarkupText(line);
				const content = visible.trim();
				if (!clearQuestion.test(content) || /[?!]$/u.test(content) || /[,:;—-]$/u.test(content)) {
					return [];
				}
				const lastVisible = visible.search(/\s*$/u);
				const offset = line.from + lastVisible;
				const range = { from: offset, to: offset };
				return [
					diagnostic(
						this,
						range,
						'This clearly interrogative line may need a question mark.',
						'The line begins with a strong question construction. Punctuation can still depend on delivery, so insertion is preview-only.',
						[replacementFix(context, 'preview', 'Add a question mark', range, '?')]
					)
				];
			})
		);
	}
};
