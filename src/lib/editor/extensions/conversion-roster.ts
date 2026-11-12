import { invertedEffects } from '@codemirror/commands';
import { Prec, StateEffect, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { PerformerRecord, PerformerRecordDelta } from '#lib/core/types.js';
import type { ConversionDocument } from '#lib/conversion/model.js';
import { parseDocument } from '#lib/core/parser.js';
import { headerNameAtoms } from '#lib/performers/index.js';
import { editorCallbacksField } from './editor-state.js';

export const conversionRosterEffect = StateEffect.define<PerformerRecordDelta>();

/** Roster-only inverses cannot rewrite identities still named by the rich document. */
export function changesReferencedPerformers(
	model: ConversionDocument,
	roster: readonly PerformerRecord[],
	delta: PerformerRecordDelta
): boolean {
	const changed = new Set(
		delta.before
			.filter((record) => {
				const replacement = delta.after.find((entry) => entry.id === record.id);
				return (
					!replacement ||
					replacement.displayName !== record.displayName ||
					record.aliases.some((alias) => !replacement.aliases.includes(alias))
				);
			})
			.map((record) => record.id)
	);
	return (
		model.voices.some((voice) => voice.performerIds.some((id) => changed.has(id))) ||
		model.sections.some((section) =>
			headerNameAtoms(parseDocument(section.header), roster).some(
				(atom) => atom.performerId !== undefined && changed.has(atom.performerId)
			)
		)
	);
}

/** Apply only the identities named by the action, retaining independently added performers. */
export function applyPerformerRecordDelta(
	roster: readonly PerformerRecord[],
	delta: PerformerRecordDelta
): PerformerRecord[] {
	const previous = new Set(delta.before.map((record) => record.id));
	const replacements = new Map(delta.after.map((record) => [record.id, record]));
	const result = roster.flatMap((record) => {
		const replacement = replacements.get(record.id);
		replacements.delete(record.id);
		return replacement
			? [{ ...replacement, aliases: [...replacement.aliases] }]
			: previous.has(record.id)
				? []
				: [record];
	});
	return [
		...result,
		...[...replacements.values()].map((record) => ({ ...record, aliases: [...record.aliases] }))
	].sort((left, right) => left.order - right.order);
}

export function validPerformerRecordDelta(
	roster: readonly PerformerRecord[],
	delta: PerformerRecordDelta
): boolean {
	if (!Array.isArray(delta.before) || !Array.isArray(delta.after)) return false;
	const valid = (record: PerformerRecord) =>
		record &&
		typeof record.id === 'string' &&
		record.id.length > 0 &&
		typeof record.displayName === 'string' &&
		record.displayName.trim().length > 0 &&
		typeof record.normalizedKey === 'string' &&
		typeof record.colorId === 'string' &&
		Number.isSafeInteger(record.order) &&
		record.order >= 0 &&
		Array.isArray(record.aliases) &&
		record.aliases.every((alias) => typeof alias === 'string');
	if (
		!delta.before.every(valid) ||
		!delta.after.every(valid) ||
		new Set(delta.before.map((record) => record.id)).size !== delta.before.length ||
		new Set(delta.after.map((record) => record.id)).size !== delta.after.length
	)
		return false;
	return (
		delta.before.every(
			(record) =>
				JSON.stringify(roster.find((entry) => entry.id === record.id)) === JSON.stringify(record)
		) &&
		delta.after.every(
			(record) =>
				delta.before.some((entry) => entry.id === record.id) ||
				!roster.some((entry) => entry.id === record.id)
		)
	);
}

export const conversionRosterHistory: Extension = [
	invertedEffects.of((transaction) =>
		transaction.effects
			.toReversed()
			.flatMap((effect) =>
				effect.is(conversionRosterEffect)
					? [conversionRosterEffect.of({ before: effect.value.after, after: effect.value.before })]
					: []
			)
	),
	// Snapshot listeners have normal precedence. The roster must be in the same
	// committed state before their save callbacks observe the converted model.
	Prec.high(
		EditorView.updateListener.of((update) => {
			for (const transaction of update.transactions)
				for (const effect of transaction.effects)
					if (effect.is(conversionRosterEffect))
						update.state
							.field(editorCallbacksField, false)
							?.onPerformerRecordsChanged?.(effect.value);
		})
	)
];
