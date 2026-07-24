import type {
	ImportSuggestion,
	PerformerId,
	PerformerRecord,
	TextRange,
	VoiceGroupKey
} from './types.js';

/**
 * Build a matching-only key while retaining accents and every meaningful
 * punctuation/HTML-significant character.
 */
export function normalizePerformerKey(value: string): string {
	return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
}

/** Produce an order-independent identity from a non-empty performer-ID set. */
export function makeVoiceGroupKey(performerIds: readonly PerformerId[]): VoiceGroupKey {
	const sortedIds = [...new Set(performerIds)].sort();
	return `voice-group:${JSON.stringify(sortedIds)}`;
}

/**
 * Resolve only byte-exact display names and explicit aliases. Case-folding is
 * deliberately excluded: it belongs to suggestions, not identity resolution.
 */
export function findExactPerformer(
	displayNameOrAlias: string,
	roster: readonly PerformerRecord[]
): PerformerRecord | undefined {
	return roster.find(
		(record) =>
			record.displayName === displayNameOrAlias ||
			record.aliases.some((alias) => alias === displayNameOrAlias)
	);
}

function differsOnlyByCase(left: string, right: string): boolean {
	return left !== right && left.toLocaleLowerCase('und') === right.toLocaleLowerCase('und');
}

/**
 * Return non-destructive candidates for user approval. This function never
 * changes the roster and never chooses one suggestion over another.
 */
export function suggestPerformerMatches(
	importedName: string,
	roster: readonly PerformerRecord[],
	importedRange: TextRange = { from: 0, to: 0 }
): ImportSuggestion[] {
	const importedKey = normalizePerformerKey(importedName);
	const suggestions = new Map<PerformerId, ImportSuggestion>();

	for (const performer of roster) {
		let reason: ImportSuggestion['reason'] | undefined;

		if (differsOnlyByCase(importedName, performer.displayName)) {
			reason = 'case';
		} else if (
			performer.aliases.some(
				(alias) =>
					alias !== importedName &&
					(normalizePerformerKey(alias) === importedKey || differsOnlyByCase(importedName, alias))
			)
		) {
			reason = 'alias';
		} else if (
			importedName !== performer.displayName &&
			(importedKey === performer.normalizedKey ||
				importedKey === normalizePerformerKey(performer.displayName))
		) {
			reason = 'normalized-key';
		}

		if (reason) {
			suggestions.set(performer.id, {
				importedName,
				importedRange,
				performerId: performer.id,
				reason
			});
		}
	}

	return [...suggestions.values()];
}
