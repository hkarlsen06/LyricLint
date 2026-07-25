import { canLintHeaderLanguage, getLanguagePack } from '$lib/languages/registry.js';
import type { Diagnostic, RuleDefinition, Section, SectionHeader } from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';

function semanticPart(header: SectionHeader, language: string): string | undefined {
	const pack = getLanguagePack(language);
	if (!canLintHeaderLanguage(pack)) return undefined;
	const normalized = header.namePart.trim().toLocaleLowerCase();
	return pack.headers.find((entry) =>
		entry.terms.some((term) => term.toLocaleLowerCase() === normalized)
	)?.semanticPart;
}

function ordinalRemovalRange(header: SectionHeader) {
	return header.ordinalRange
		? { from: header.nameRange.to, to: header.ordinalRange.to }
		: undefined;
}

function bodyKey(section: Section): string {
	return section.lines.map((line) => line.text).join('\n');
}

export const sectionVerseNumberingRule: RuleDefinition = {
	id: 'section.verse-numbering',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-SECTION-NUMBERING'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		const verses: Section[] = [];
		const pack = getLanguagePack(context.language);
		const sourceIds = ['G-SECTION-NUMBERING', ...pack.sourceIds];
		for (const section of document.sections) {
			const header = section.header;
			if (!header) continue;
			const part = semanticPart(header, context.language);
			if (part === 'Verse') {
				verses.push(section);
				continue;
			}
			const removal = ordinalRemovalRange(header);
			if (!removal || part === undefined) continue;
			diagnostics.push(
				diagnostic(
					this,
					header.ordinalRange ?? removal,
					`Do not number ${part} headers.`,
					'The Genius section guide reserves enumeration for verses.',
					[replacementFix(context, 'preview', 'Remove section number', removal, '')],
					sourceIds
				)
			);
		}

		const uniqueBodies = new Map<string, number>();
		for (const verse of verses) {
			const key = bodyKey(verse);
			if (!uniqueBodies.has(key)) uniqueBodies.set(key, uniqueBodies.size + 1);
		}
		if (uniqueBodies.size === 1) {
			for (const verse of verses) {
				const header = verse.header;
				const removal = header && ordinalRemovalRange(header);
				if (!header?.ordinalRange || !removal) continue;
				diagnostics.push(
					diagnostic(
						this,
						header.ordinalRange,
						'Do not number a song with only one distinct verse.',
						'If a song contains only one verse, the Genius section guide leaves it unnumbered even when that verse repeats.',
						[replacementFix(context, 'preview', 'Remove verse number', removal, '')],
						sourceIds
					)
				);
			}
		} else if (verses.every((verse) => verse.header?.ordinal !== undefined)) {
			for (const verse of verses) {
				const header = verse.header;
				const expected = uniqueBodies.get(bodyKey(verse));
				if (!header?.ordinalRange || expected === undefined || header.ordinal === expected)
					continue;
				diagnostics.push(
					diagnostic(
						this,
						header.ordinalRange,
						`This verse should be numbered ${expected}.`,
						'Distinct verses are numbered in ascending order; an exact repeated verse keeps the number of its first occurrence.',
						[
							replacementFix(
								context,
								'preview',
								`Replace with ${expected}`,
								header.ordinalRange,
								String(expected)
							)
						],
						sourceIds
					)
				);
			}
		}
		return diagnostics;
	}
};
