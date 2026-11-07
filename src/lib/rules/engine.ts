import type { Diagnostic, ParsedDocument, RuleContext, RuleDefinition } from '#lib/core/types.js';
import { enabledRules, sharedTranscriptionRules } from './registry.js';
import { languageIndependentMusixmatchRules, musixmatchRules } from './musixmatch.js';
import { languageOwnership } from './language-ownership.js';
import { getLanguagePack } from '#lib/languages/registry.js';
import { languageDependentGeniusRules } from './registry.js';
import { profileLanguage } from '#lib/profiles/languages.js';
import { guillemetLanguages } from './catalog/quotes-typewriter.js';
import { sortDiagnostics } from './results.js';
export { sortDiagnostics, collectSafeFixes } from './results.js';

const musixmatchCheckingRules = [...musixmatchRules, ...sharedTranscriptionRules];
const languageIndependentSharedRules = new Set(
	sharedTranscriptionRules.filter((rule) => !languageDependentGeniusRules.has(rule.id))
);

/** Run a registry synchronously against one immutable parsed document. */
export function runRules(
	document: ParsedDocument,
	context: RuleContext,
	registry: readonly RuleDefinition[] = context.profile === 'musixmatch'
		? musixmatchCheckingRules
		: enabledRules
): Diagnostic[] {
	if (context.languageRanges?.length) {
		const { ranges, languageAt, withinLanguage } = languageOwnership(document.text, context);
		// A document can contain many locale tags, but only the reviewed families and one
		// non-enforcing fallback need separate rule passes. Keep raw boundaries for fix safety.
		const policyLanguage =
			context.profile === 'musixmatch' ? profileLanguage : geniusPolicyLanguage;
		const languages = [
			...new Set([context.language, ...ranges.map((range) => range.language)].map(policyLanguage))
		];
		const diagnostics = registry.flatMap((rule) =>
			((
				context.profile === 'musixmatch'
					? languageIndependentMusixmatchRules.has(rule) || languageIndependentSharedRules.has(rule)
					: !languageDependentGeniusRules.has(rule.id)
			)
				? [undefined]
				: languages
			).flatMap((language) =>
				rule.check(document, language ? { ...context, language } : context).flatMap((finding) => {
					const ownerLanguage = languageAt(finding.from);
					if (language !== undefined && policyLanguage(ownerLanguage) !== language) return [];
					const crossesLanguage =
						!withinLanguage(finding.from, finding.to, ownerLanguage) ||
						finding.fixes?.some((fix) =>
							fix.edit.edits.some((edit) => !withinLanguage(edit.from, edit.to, ownerLanguage))
						);
					if (!crossesLanguage) return [finding];
					return [
						{
							...finding,
							severity: 'manual-review' as const,
							fixes: undefined,
							explanation: `${finding.explanation} This passage crosses an explicit language boundary; review its complete context before changing it.`
						}
					];
				})
			)
		);
		return sortDiagnostics(diagnostics);
	}
	const diagnostics = registry.flatMap((rule) => rule.check(document, context));
	return sortDiagnostics(diagnostics);
}

/** Only reviewed policy distinctions need full-document passes, never arbitrary raw tags. */
function geniusPolicyLanguage(tag: string): string {
	if (/^en-(?:us|gb)$/iu.test(tag)) return tag.toLowerCase();
	const base = tag.toLowerCase().split('-')[0] ?? 'und';
	if (guillemetLanguages.has(base)) return base;
	const pack = getLanguagePack(tag);
	return pack.reviewed ? pack.tag : 'und';
}
