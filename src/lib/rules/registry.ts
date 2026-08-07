import type { RuleDefinition, SourceReference } from '$lib/core/types.js';
import { adlibParenthesesRule } from './catalog/adlib-parentheses.js';
import { adlibSeparatorRule } from './catalog/adlib-separator.js';
import { capitalizationLineStartRule } from './catalog/capitalization-line-start.js';
import { capitalizationTitleCaseRule } from './catalog/capitalization-title-case.js';
import { censoredMaskRule } from './catalog/censored-mask.js';
import { contractionApostropheRule } from './catalog/contraction-apostrophe.js';
import { grammarEnglishPronounIRule } from './catalog/grammar-english-pronoun-i.js';
import { grammarSpanishContractionsRule } from './catalog/grammar-spanish-contractions.js';
import { languageSelectionMismatchRule } from './catalog/language-selection-mismatch.js';
import { lineProseDensityRule } from './catalog/line-prose-density.js';
import { numbersSpellOutRule } from './catalog/numbers-spell-out.js';
import { performerHeaderRequiredRule } from './catalog/performer-header-required.js';
import { performerInlineMismatchRule } from './catalog/performer-inline-mismatch.js';
import { performerLineLabelForbiddenRule } from './catalog/performer-line-label-forbidden.js';
import { performerParentheticalBoundaryRule } from './catalog/performer-parenthetical-boundary.js';
import { performerRedundantMarkupRule } from './catalog/performer-redundant-markup.js';
import { performerUnusedLegendSlotRule } from './catalog/performer-unused-legend-slot.js';
import { performerStyleOrderRule } from './catalog/performer-style-order.js';
import { performerTooManyGroupsRule } from './catalog/performer-too-many-groups.js';
import { punctuationDroppedWordDashRule } from './catalog/punctuation-dropped-word-dash.js';
import { punctuationLineEndingRule } from './catalog/punctuation-line-ending.js';
import { punctuationParenthesisSpacingRule } from './catalog/punctuation-parenthesis-spacing.js';
import { punctuationQuestionRule } from './catalog/punctuation-question.js';
import { quotesTypewriterRule } from './catalog/quotes-typewriter.js';
import { repeatPlaceholderRule } from './catalog/repeat-placeholder.js';
import { sectionHeaderEmptyRule } from './catalog/section-header-empty.js';
import { sectionHeaderLanguageRule } from './catalog/section-header-language.js';
import { sectionHeaderMissingRule } from './catalog/section-header-missing.js';
import { sectionHeaderProseRule } from './catalog/section-header-prose.js';
import { sectionExtraBlankLinesRule } from './catalog/section-extra-blank-lines.js';
import { sectionHeaderSpacingRule } from './catalog/section-header-spacing.js';
import { sectionHeaderUnrecognizedRule } from './catalog/section-header-unrecognized.js';
import { sectionLocalizedHeaderPreferenceRule } from './catalog/section-localized-header-preference.js';
import { sectionDeprecatedHookRule } from './catalog/section-deprecated-hook.js';
import { sectionImmediateRepeatSpacingRule } from './catalog/section-immediate-repeat-spacing.js';
import { sectionUnlinkedRepeatRule } from './catalog/section-unlinked-repeat.js';
import { sectionVerseNumberingRule } from './catalog/section-verse-numbering.js';
import { soundEffectAsterisksRule } from './catalog/sound-effect-asterisks.js';
import { spellingArabicCommonRule } from './catalog/spelling-arabic-common.js';
import { spellingEnglishCommonRule } from './catalog/spelling-english-common.js';
import { spellingFrenchCommonRule } from './catalog/spelling-french-common.js';
import { spellingGermanCommonRule } from './catalog/spelling-german-common.js';
import { spellingJapaneseCommonRule } from './catalog/spelling-japanese-common.js';
import { spellingKoreanCommonRule } from './catalog/spelling-korean-common.js';
import { spellingLanguageVariantRule } from './catalog/spelling-language-variant.js';
import { spellingNorwegianCommonRule } from './catalog/spelling-norwegian-common.js';
import { spellingSpanishCommonRule } from './catalog/spelling-spanish-common.js';
import { spellingStandardizedRule } from './catalog/spelling-standardized.js';
import { spellingTextingShorthandRule } from './catalog/spelling-texting-shorthand.js';
import { syntaxUnbalancedBracketsRule } from './catalog/syntax-unbalanced-brackets.js';
import { syntaxUnbalancedParenthesesRule } from './catalog/syntax-unbalanced-parentheses.js';
import { syntaxUnsupportedVoiceMarkupRule } from './catalog/syntax-unsupported-voice-markup.js';
import { symbolsSpecialCharactersRule } from './catalog/symbols-special-characters.js';
import { textInvisibleCharactersRule } from './catalog/text-invisible-characters.js';
import { textMultipleSpacesRule } from './catalog/text-multiple-spaces.js';
import {
	unknownImprovisedMarkerRule,
	unknownMarkerRule,
	unknownUnresolvedRule
} from './catalog/unknown-marker.js';
import { sourceRegistry } from './data/sources.js';

export const enabledRules: readonly RuleDefinition[] = [
	syntaxUnbalancedBracketsRule,
	syntaxUnbalancedParenthesesRule,
	syntaxUnsupportedVoiceMarkupRule,
	languageSelectionMismatchRule,
	sectionHeaderMissingRule,
	sectionHeaderEmptyRule,
	sectionHeaderProseRule,
	sectionHeaderSpacingRule,
	sectionExtraBlankLinesRule,
	sectionHeaderLanguageRule,
	sectionLocalizedHeaderPreferenceRule,
	sectionHeaderUnrecognizedRule,
	sectionDeprecatedHookRule,
	sectionImmediateRepeatSpacingRule,
	sectionUnlinkedRepeatRule,
	sectionVerseNumberingRule,
	performerHeaderRequiredRule,
	performerStyleOrderRule,
	performerInlineMismatchRule,
	performerParentheticalBoundaryRule,
	performerRedundantMarkupRule,
	performerUnusedLegendSlotRule,
	performerTooManyGroupsRule,
	performerLineLabelForbiddenRule,
	spellingStandardizedRule,
	spellingLanguageVariantRule,
	spellingTextingShorthandRule,
	quotesTypewriterRule,
	contractionApostropheRule,
	grammarEnglishPronounIRule,
	spellingEnglishCommonRule,
	spellingNorwegianCommonRule,
	spellingGermanCommonRule,
	grammarSpanishContractionsRule,
	spellingSpanishCommonRule,
	spellingFrenchCommonRule,
	spellingArabicCommonRule,
	spellingJapaneseCommonRule,
	spellingKoreanCommonRule,
	symbolsSpecialCharactersRule,
	textInvisibleCharactersRule,
	textMultipleSpacesRule,
	unknownMarkerRule,
	unknownImprovisedMarkerRule,
	unknownUnresolvedRule,
	repeatPlaceholderRule,
	soundEffectAsterisksRule,
	censoredMaskRule,
	adlibParenthesesRule,
	adlibSeparatorRule,
	capitalizationLineStartRule,
	capitalizationTitleCaseRule,
	punctuationLineEndingRule,
	punctuationQuestionRule,
	punctuationDroppedWordDashRule,
	punctuationParenthesisSpacingRule,
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
