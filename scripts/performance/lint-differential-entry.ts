/** Compile the same entry against each revision with build-lint.ts --differential. */
import { parseDocument } from '../../src/lib/core/parser.js';
import { ruleContext } from '../../src/lib/rules/rule-test-utils.js';
import { adlibParenthesesRule } from '../../src/lib/rules/catalog/adlib-parentheses.js';
import { capitalizationTitleCaseRule } from '../../src/lib/rules/catalog/capitalization-title-case.js';
import { censoredMaskRule } from '../../src/lib/rules/catalog/censored-mask.js';
import { symbolsSpecialCharactersRule } from '../../src/lib/rules/catalog/symbols-special-characters.js';

export const revision = process.env.LYRICLINT_BENCHMARK_REVISION ?? 'unstamped';
export const ruleIds = [
	adlibParenthesesRule,
	capitalizationTitleCaseRule,
	censoredMaskRule,
	symbolsSpecialCharactersRule
].map((r) => r.id);
export function check(text: string, language: string) {
	const document = parseDocument(text);
	const context = ruleContext({ language });
	return [
		adlibParenthesesRule,
		capitalizationTitleCaseRule,
		censoredMaskRule,
		symbolsSpecialCharactersRule
	].map((rule) => rule.check(document, context));
}
