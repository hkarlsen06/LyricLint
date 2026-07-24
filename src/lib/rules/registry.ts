import type { RuleDefinition, SourceReference } from '../core/types.js';
import { adlibParenthesesRule } from './catalog/adlib-parentheses.js';
import { capitalizationLineStartRule } from './catalog/capitalization-line-start.js';
import { censoredMaskRule } from './catalog/censored-mask.js';
import { contractionApostropheRule } from './catalog/contraction-apostrophe.js';
import { lineProseDensityRule } from './catalog/line-prose-density.js';
import { numbersSpellOutRule } from './catalog/numbers-spell-out.js';
import { performerHeaderRequiredRule } from './catalog/performer-header-required.js';
import { performerInlineMismatchRule } from './catalog/performer-inline-mismatch.js';
import { performerLineLabelForbiddenRule } from './catalog/performer-line-label-forbidden.js';
import { performerStyleOrderRule } from './catalog/performer-style-order.js';
import { performerTooManyGroupsRule } from './catalog/performer-too-many-groups.js';
import { punctuationDroppedWordDashRule } from './catalog/punctuation-dropped-word-dash.js';
import { punctuationQuestionRule } from './catalog/punctuation-question.js';
import { quotesTypewriterRule } from './catalog/quotes-typewriter.js';
import { repeatPlaceholderRule } from './catalog/repeat-placeholder.js';
import { sectionHeaderLanguageRule } from './catalog/section-header-language.js';
import { sectionHeaderMissingRule } from './catalog/section-header-missing.js';
import { soundEffectAsterisksRule } from './catalog/sound-effect-asterisks.js';
import { spellingLanguageVariantRule } from './catalog/spelling-language-variant.js';
import { spellingStandardizedRule } from './catalog/spelling-standardized.js';
import { syntaxUnbalancedBracketsRule } from './catalog/syntax-unbalanced-brackets.js';
import { syntaxUnsupportedVoiceMarkupRule } from './catalog/syntax-unsupported-voice-markup.js';
import { unknownMarkerRule } from './catalog/unknown-marker.js';
import { sourceRegistry } from './data/sources.js';

export const enabledRules: readonly RuleDefinition[] = [
	syntaxUnbalancedBracketsRule,
	syntaxUnsupportedVoiceMarkupRule,
	sectionHeaderMissingRule,
	sectionHeaderLanguageRule,
	performerHeaderRequiredRule,
	performerStyleOrderRule,
	performerInlineMismatchRule,
	performerTooManyGroupsRule,
	performerLineLabelForbiddenRule,
	spellingStandardizedRule,
	spellingLanguageVariantRule,
	quotesTypewriterRule,
	contractionApostropheRule,
	unknownMarkerRule,
	repeatPlaceholderRule,
	soundEffectAsterisksRule,
	censoredMaskRule,
	adlibParenthesesRule,
	capitalizationLineStartRule,
	punctuationQuestionRule,
	punctuationDroppedWordDashRule,
	lineProseDensityRule,
	numbersSpellOutRule
];

/** Validate uniqueness and reviewed provenance for every enabled rule. */
export function validateRuleRegistry(
	rules: readonly RuleDefinition[] = enabledRules,
	sources: ReadonlyMap<string, SourceReference> = sourceRegistry
): void {
	const seen = new Set<string>();
	for (const rule of rules) {
		if (seen.has(rule.id)) {
			throw new Error(`Duplicate rule ID: ${rule.id}`);
		}
		seen.add(rule.id);
		if (rule.sourceIds.length === 0) {
			throw new Error(`Enabled rule ${rule.id} has no source IDs`);
		}
		for (const sourceId of rule.sourceIds) {
			const source = sources.get(sourceId);
			if (!source) {
				throw new Error(`Enabled rule ${rule.id} references unknown source ${sourceId}`);
			}
			if (source.reviewStatus !== 'reviewed') {
				throw new Error(
					`Enabled rule ${rule.id} references source ${sourceId} with status ${source.reviewStatus}`
				);
			}
		}
	}
}

validateRuleRegistry();

const ruleById = new Map(enabledRules.map((rule) => [rule.id, rule]));

export function getRule(id: string): RuleDefinition | undefined {
	return ruleById.get(id);
}
