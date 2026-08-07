import type { LanguagePack, RuleDefinition } from '$lib/core/types.js';
import { getLanguagePack, semanticPartKey } from '$lib/languages/registry.js';
import { diagnostic, replacementFix } from './utils.js';

const replacementSemantics = new Set(['chorus', 'refrain']);

function canonicalReplacements(pack: LanguagePack): string[] {
	const replacements = pack.headers.flatMap((header) => {
		if (!replacementSemantics.has(semanticPartKey(header.semanticPart))) {
			return [];
		}
		const canonical = header.terms[0];
		return canonical ? [canonical] : [];
	});
	const seen = new Set<string>();
	return replacements.filter((replacement) => {
		const key = replacement.trim().toLocaleLowerCase(pack.tag);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function bracketedAlternatives(replacements: readonly string[]): string {
	const bracketed = replacements.map((replacement) => `[${replacement}]`);
	if (bracketed.length === 1) {
		return bracketed[0]!;
	}
	return `${bracketed.slice(0, -1).join(', ')} or ${bracketed.at(-1)!}`;
}

export const sectionDeprecatedHookRule: RuleDefinition = {
	id: 'section.deprecated-hook',
	version: 2,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: [
		'G-SECTION-HOOK',
		'G-LANG-EN',
		'G-LANG-NO',
		'G-LANG-AR',
		'G-LANG-DE',
		'G-LANG-ES',
		'G-LANG-FR',
		'G-LANG-JA',
		'G-LANG-KO'
	],
	check(document, context) {
		const selectedPack = getLanguagePack(context.language);
		const selectedTerms = new Set(
			selectedPack.headers.flatMap((header) =>
				header.terms.map((term) => term.trim().toLocaleLowerCase(selectedPack.tag))
			)
		);
		return document.sections.flatMap((section) => {
			const header = section.header;
			if (
				!header ||
				header.namePart.trim().toLocaleLowerCase(selectedPack.tag) !== 'hook' ||
				selectedTerms.has('hook')
			)
				return [];
			let replacementPack = selectedPack;
			let replacements = canonicalReplacements(replacementPack);
			if (replacements.length === 0) {
				replacementPack = getLanguagePack('en');
				replacements = canonicalReplacements(replacementPack);
			}
			const replacementNames = bracketedAlternatives(replacements);
			const packDescription =
				replacementPack === selectedPack
					? `selected ${replacementPack.displayName}`
					: `${replacementPack.displayName} fallback`;
			const explanation =
				replacements.length === 1
					? `The current Genius section guide replaces [Hook] with ${replacementNames}. This replacement uses the canonical name from the ${packDescription} language pack.`
					: `The current Genius section guide replaces [Hook] with ${replacementNames}. These replacements use the canonical names from the ${packDescription} language pack; choose the term that matches the song structure.`;
			return [
				diagnostic(
					this,
					header.nameRange,
					'The [Hook] section name is deprecated.',
					explanation,
					replacements.map((replacement) =>
						replacementFix(
							context,
							'preview',
							`Replace with ${replacement}`,
							header.nameRange,
							replacement
						)
					),
					['G-SECTION-HOOK', ...replacementPack.sourceIds]
				)
			];
		});
	}
};
