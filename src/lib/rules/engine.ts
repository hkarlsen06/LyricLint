import type { Diagnostic, ParsedDocument, RuleContext, RuleDefinition } from '$lib/core/types.js';
import { enabledRules } from './registry.js';
import { languageIndependentMusixmatchRules, musixmatchRules } from './musixmatch.js';
import { profileLanguage } from '$lib/profiles/languages.js';
import { sortDiagnostics } from './results.js';
export { sortDiagnostics, collectSafeFixes } from './results.js';

/** Run a registry synchronously against one immutable parsed document. */
export function runRules(
	document: ParsedDocument,
	context: RuleContext,
	registry: readonly RuleDefinition[] = context.profile === 'musixmatch'
		? musixmatchRules
		: enabledRules
): Diagnostic[] {
	if (context.profile === 'musixmatch' && context.languageRanges?.length) {
		const ranges = [...context.languageRanges].sort((a, b) => a.from - b.from);
		for (const [index, range] of ranges.entries()) {
			if (
				!Number.isSafeInteger(range.from) ||
				!Number.isSafeInteger(range.to) ||
				range.from < 0 ||
				range.to > document.text.length ||
				range.from >= range.to ||
				!range.language.trim() ||
				(index > 0 && ranges[index - 1].to > range.from)
			) {
				throw new Error('Invalid or overlapping language ranges in the active projection.');
			}
		}
		const boundaries = [...new Set(ranges.flatMap((range) => [range.from, range.to]))].sort(
			(a, b) => a - b
		);
		const firstAfter = (values: readonly number[], value: number) => {
			let low = 0;
			let high = values.length;
			while (low < high) {
				const middle = (low + high) >>> 1;
				if (values[middle] <= value) low = middle + 1;
				else high = middle;
			}
			return low;
		};
		const starts = ranges.map((range) => range.from);
		const languageAt = (at: number) => {
			const range = ranges[firstAfter(starts, at) - 1];
			return range && at < range.to ? range.language : context.language;
		};
		const withinLanguage = (from: number, to: number, language: string) => {
			if (languageAt(from) !== language) return false;
			for (
				let index = firstAfter(boundaries, from);
				index < boundaries.length && boundaries[index] < to;
				index += 1
			) {
				if (languageAt(boundaries[index]) !== language) return false;
			}
			return true;
		};
		// A document can contain many locale tags, but only the reviewed families and one
		// non-enforcing fallback need separate rule passes. Keep raw boundaries for fix safety.
		const languages = [
			...new Set([context.language, ...ranges.map((range) => range.language)].map(profileLanguage))
		];
		const diagnostics = registry.flatMap((rule) =>
			(languageIndependentMusixmatchRules.has(rule) ? [undefined] : languages).flatMap((language) =>
				rule.check(document, language ? { ...context, language } : context).flatMap((finding) => {
					const ownerLanguage = languageAt(finding.from);
					if (language !== undefined && profileLanguage(ownerLanguage) !== language) return [];
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
