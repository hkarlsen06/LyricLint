import { invertedEffects, isolateHistory } from '@codemirror/commands';
import {
	ChangeSet,
	EditorSelection,
	EditorState,
	StateField,
	StateEffect,
	Transaction
} from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { conversionScroll, scrollConversionPassage } from './conversion-scroll.js';
import { projectedVoiceGroups } from '#lib/conversion/voices.js';
import { setVoiceGroupsEffect } from './performer-decorations.js';
import type { PerformerRecord, PerformerRecordDelta, TextEdit } from '#lib/core/types.js';
import {
	applyPerformerRecordDelta,
	changesReferencedPerformers,
	conversionRosterEffect,
	conversionRosterHistory,
	validPerformerRecordDelta
} from './conversion-roster.js';
import {
	importDocument,
	planProfileSwitch,
	renderProfile,
	mapSelection,
	reconcileEdit,
	updateMetadata,
	type MetadataUpdate
} from '#lib/conversion/index.js';
import { conversionSectionAt, conversionSectionLocal } from './conversion-scope.js';
import { resolveDecision, type ConversionAction } from '#lib/conversion/decisions.js';
import type { ProfileId } from '#lib/profiles/types.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { parseConversionEnvelope, type ConversionEnvelope } from '#lib/persistence/conversion.js';
import {
	editorCallbacksField,
	editorComposingField,
	editorContextField,
	editorRevisionField,
	setComposingEffect
} from './editor-state.js';
import {
	lineAnchorsFor,
	setLineAnchorsEffect,
	anchorLineEffect,
	clearLineAnchorEffect
} from './line-anchors.js';
import {
	applyOnlyHereAnnotation,
	sectionLinksFor,
	setSectionLinksEffect,
	setSectionLinkEffect
} from './section-links.js';
import { setFixPreviewEffect } from './fix-preview.js';
import {
	profileProjection,
	setConversionStateEffect,
	type ConversionState
} from './conversion-effects.js';

export const conversionStateField = StateField.define<ConversionState | undefined>({
	create: () => undefined,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setConversionStateEffect)) {
				value = effect.value;
				const highWater = transaction.startState.field(allocatorField, false) ?? 1;
				if (value && value.envelope.model.nextId < highWater)
					value = {
						...value,
						envelope: { ...value.envelope, model: { ...value.envelope.model, nextId: highWater } }
					};
			}
		}
		return value;
	}
});

const allocatorField = StateField.define<number>({
	create: () => 1,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setConversionStateEffect) && effect.value)
				value = Math.max(value, effect.value.envelope.model.nextId);
		}
		return value;
	}
});

const compositionChangesField = StateField.define<ChangeSet | undefined>({
	create: () => undefined,
	update(value, transaction) {
		if (transaction.effects.some((effect) => effect.is(setComposingEffect) && !effect.value))
			return undefined;
		if (!transaction.startState.field(editorComposingField, false) || !transaction.docChanged)
			return value;
		return value ? value.compose(transaction.changes) : transaction.changes;
	}
});

export function conversionForState(state: EditorState): ConversionState | undefined {
	return state.field(conversionStateField, false);
}

export function profileForState(state: EditorState): ProfileId {
	return conversionForState(state)?.envelope.profile ?? 'genius';
}

function envelopeFor(
	previous: ConversionEnvelope,
	model: ConversionEnvelope['model'],
	text: string
): ConversionEnvelope {
	return { ...previous, model, projectionText: text };
}

function metadataEffects(value: ConversionState, performers: readonly PerformerRecord[] = []) {
	return [
		setLineAnchorsEffect.of(value.projection.lineAnchors),
		setSectionLinksEffect.of(value.projection.sectionLinks),
		...(value.envelope.profile === 'musixmatch'
			? [
					setVoiceGroupsEffect.of({
						groups: projectedVoiceGroups(value.envelope.model, value.projection),
						performers
					})
				]
			: [])
	];
}

function importEditorState(state: EditorState) {
	const imported = importDocument({
		text: state.doc.toString(),
		profile: 'genius',
		language: state.field(editorContextField)?.language,
		performers: state.field(editorContextField)?.performers,
		lineAnchors: lineAnchorsFor(state),
		sectionLinks: sectionLinksFor(state),
		nextId: state.field(allocatorField)
	});
	if (!imported.ok) return imported;
	const projection = renderProfile(imported.value, 'genius');
	if (!projection.ok) return projection;
	return {
		ok: true as const,
		value: {
			envelope: {
				schema: 1 as const,
				profile: 'genius' as const,
				model: imported.value,
				converterVersion: '2' as const,
				policyVersions: profilePolicyVersions,
				projectionText: projection.value.text
			},
			projection: projection.value
		}
	};
}

type ConversionCommand =
	| { kind: 'action'; action: ConversionAction; rosterChanges?: PerformerRecordDelta }
	| { kind: 'roster'; rosterChanges: PerformerRecordDelta };

function dispatchConversionCommand(
	view: EditorView,
	command: ConversionCommand,
	baseRevision: number
): { ok: true } | { ok: false; message: string } {
	const { rosterChanges } = command;
	if (view.composing || view.state.field(editorComposingField))
		return { ok: false, message: 'Finish composing this character before changing its details.' };
	if (baseRevision !== view.state.field(editorRevisionField))
		return { ok: false, message: 'The lyrics changed. Review this choice again.' };
	const existing = conversionForState(view.state);
	if (existing?.recovery)
		return {
			ok: false,
			message: 'Recover the lyric associations before changing retained details.'
		};
	const input = existing ? { ok: true as const, value: existing } : importEditorState(view.state);
	if (!input.ok) return { ok: false, message: input.refusal.message };
	const before = input.value;
	const roster = view.state.field(editorContextField)?.performers ?? [];
	if (
		rosterChanges &&
		(!validPerformerRecordDelta(roster, rosterChanges) ||
			!view.state.field(editorCallbacksField, false)?.onPerformerRecordsChanged)
	)
		return {
			ok: false,
			message:
				'The performer roster changed or its history handler is unavailable. Review this action again.'
		};
	const nextRoster = rosterChanges ? applyPerformerRecordDelta(roster, rosterChanges) : roster;
	if (
		command.kind === 'roster' &&
		changesReferencedPerformers(before.envelope.model, roster, command.rosterChanges)
	)
		return { ok: false, message: 'This roster change would alter a retained voice or legend.' };
	const result =
		command.kind === 'action'
			? resolveDecision(
					{
						...before.envelope.model,
						nextId: Math.max(before.envelope.model.nextId, view.state.field(allocatorField))
					},
					before.projection,
					command.action,
					{ performers: nextRoster }
				)
			: {
					ok: true as const,
					value: { document: before.envelope.model, projection: before.projection, changes: [] }
				};
	if (!result.ok) return { ok: false, message: result.refusal.message };
	const next: ConversionState = {
		envelope: envelopeFor(before.envelope, result.value.document, result.value.projection.text),
		projection: result.value.projection
	};
	view.dispatch({
		changes: result.value.changes,
		effects: [
			setConversionStateEffect.of(next),
			...metadataEffects(next, nextRoster),
			setFixPreviewEffect.of(undefined),
			...(rosterChanges ? [conversionRosterEffect.of(rosterChanges)] : [])
		],
		annotations: [
			profileProjection.of(true),
			Transaction.userEvent.of('input.profile.details'),
			isolateHistory.of('full'),
			...(command.kind === 'action' && command.action.kind === 'setRecording'
				? [Transaction.addToHistory.of(false)]
				: [])
		]
	});
	return { ok: true };
}

export function dispatchConversionAction(
	view: EditorView,
	action: ConversionAction,
	baseRevision: number,
	rosterChanges?: PerformerRecordDelta
): { ok: true } | { ok: false; message: string } {
	return dispatchConversionCommand(view, { kind: 'action', action, rosterChanges }, baseRevision);
}

export function dispatchPerformerRecords(
	view: EditorView,
	rosterChanges: PerformerRecordDelta,
	baseRevision: number
): { ok: true } | { ok: false; message: string } {
	return dispatchConversionCommand(view, { kind: 'roster', rosterChanges }, baseRevision);
}

/** A switch is a single history event, including a text-identical switch. */
export function switchEditorProfile(
	view: EditorView,
	profile: ProfileId
): { ok: true } | { ok: false; message: string; deferred?: true } {
	if (view.composing || view.state.field(editorComposingField))
		return {
			ok: false,
			deferred: true,
			message: 'The lyric format will change after this character is finished.'
		};
	let value = conversionForState(view.state);
	if (value?.recovery)
		return {
			ok: false,
			message:
				'These lyrics are in recovery. Export the full Scribe to preserve the text and retained details before repairing its associations.'
		};
	if (profile === (value?.envelope.profile ?? 'genius')) return { ok: true };
	if (!value) {
		const imported = importEditorState(view.state);
		if (!imported.ok) return { ok: false, message: imported.refusal.message };
		value = imported.value;
	}
	const plan = planProfileSwitch(value.envelope.model, {
		from: value.envelope.profile,
		to: profile
	});
	if (!plan.ok) return { ok: false, message: plan.refusal.message };
	const projection = plan.value.projection;
	const next: ConversionState = {
		envelope: { ...value.envelope, profile, projectionText: projection.text },
		projection
	};
	// Every selection is mapped independently; the engine owns segment affinity.
	const ranges = view.state.selection.ranges.map((range) => {
		const mapped = mapSelection(value.projection, projection, {
			anchor: range.anchor,
			head: range.head
		});
		return EditorSelection.range(mapped.anchor, mapped.head);
	});
	view.dispatch({
		changes:
			projection.text === view.state.doc.toString()
				? undefined
				: { from: 0, to: view.state.doc.length, insert: projection.text },
		selection: EditorSelection.create(ranges, view.state.selection.mainIndex),
		effects: [
			setConversionStateEffect.of(next),
			...metadataEffects(next, view.state.field(editorContextField)?.performers),
			setFixPreviewEffect.of(undefined)
		],
		annotations: [
			profileProjection.of(true),
			Transaction.userEvent.of('input.profile'),
			isolateHistory.of('full')
		]
	});
	return { ok: true };
}

const restoreProfileSelection = StateEffect.define<EditorSelection>();

/** History bypasses filters, so restore its selection in the same view update. */
export function dispatchConversionTransactions(
	transactions: readonly Transaction[],
	view: EditorView
): void {
	const last = transactions.at(-1);
	if (!last) return;
	let selection: EditorSelection | undefined;
	let projection = conversionForState(view.state)?.projection;
	let passage: number | undefined;
	let inset = 0;
	let startSnapshot: ReturnType<EditorView['scrollSnapshot']> | undefined;
	// A hidden editor can retain geometry from an earlier projection. Its viewport
	// is not a reading position and must not become a scroll target in the new document.
	if (
		view.inView &&
		view.dom.checkVisibility() &&
		transactions.some(
			(transaction) =>
				profileForState(transaction.startState) !== profileForState(transaction.state)
		)
	) {
		const top = view.scrollDOM.scrollTop - view.documentPadding.top;
		const block = view.lineBlockAtHeight(Math.max(0, top));
		const bounds = view.scrollDOM.getBoundingClientRect();
		passage =
			view.posAtCoords({
				x: Math.max(bounds.left, view.contentDOM.getBoundingClientRect().left) + 1,
				y: bounds.top + Math.min(view.defaultLineHeight / 2, bounds.height / 2)
			}) ?? block.from;
		const coordinates = view.coordsAtPos(passage);
		inset = coordinates ? coordinates.top - bounds.top : block.top - top;
		// Position zero remains the document start, including its block widgets.
		if (view.scrollDOM.scrollTop === 0) startSnapshot = view.scrollSnapshot();
		if (!projection) {
			const imported = importEditorState(view.state);
			if (imported.ok) projection = imported.value.projection;
		}
	}
	for (const transaction of transactions) {
		if (selection) selection = transaction.selection ?? selection.map(transaction.changes);
		for (const effect of transaction.effects) {
			if (effect.is(restoreProfileSelection)) selection = effect.value;
		}
		const next = conversionForState(transaction.state)?.projection;
		if (passage !== undefined) {
			passage =
				projection &&
				next &&
				profileForState(transaction.startState) !== profileForState(transaction.state)
					? mapSelection(projection, next, { anchor: passage, head: passage }).anchor
					: transaction.changes.mapPos(passage);
		}
		projection = next;
	}
	const effects =
		passage === undefined
			? []
			: [
					startSnapshot ??
						scrollConversionPassage(view, passage, inset, {
							doc: last.state.doc,
							selection: selection ?? last.state.selection
						})
				];
	view.update(
		selection || effects.length
			? [
					...transactions,
					last.state.update({
						selection,
						effects,
						annotations: Transaction.addToHistory.of(false)
					})
				]
			: transactions
	);
}

export function conversionState(
	initial?: ConversionEnvelope,
	recovery?: ConversionState['recovery']
): Extension {
	let start: ConversionState | undefined;
	if (initial) {
		const envelope = parseConversionEnvelope(initial);
		const projection = renderProfile(envelope.model, envelope.profile);
		if (!projection.ok) throw new Error(projection.refusal.message);
		start = { envelope, projection: projection.value };
		if (recovery) start.recovery = recovery;
	}
	return [
		conversionScroll,
		conversionRosterHistory,
		conversionStateField.init(() => start),
		compositionChangesField,
		allocatorField.init(() => start?.envelope.model.nextId ?? 1),
		invertedEffects.of((transaction) => {
			if (!transaction.effects.some((effect) => effect.is(setConversionStateEffect))) return [];
			let previous = conversionForState(transaction.startState);
			if (!previous) {
				const imported = importEditorState(transaction.startState);
				if (imported.ok) previous = imported.value;
			}
			return [
				setConversionStateEffect.of(previous),
				// History guesses the opposite selection through the full replacement.
				// Retain it explicitly on switches and their inverses, never on typing.
				...(transaction.effects.some((effect) => effect.is(restoreProfileSelection)) ||
				transaction.effects.some(
					(effect) =>
						effect.is(setConversionStateEffect) &&
						(effect.value?.envelope.profile ?? 'genius') !==
							(previous?.envelope.profile ?? 'genius')
				)
					? [restoreProfileSelection.of(transaction.startState.selection)]
					: []),
				...(previous
					? metadataEffects(previous, transaction.startState.field(editorContextField)?.performers)
					: [
							setLineAnchorsEffect.of(lineAnchorsFor(transaction.startState)),
							setSectionLinksEffect.of(sectionLinksFor(transaction.startState))
						])
			];
		}),
		EditorState.transactionFilter.of((transaction) => {
			const previous = conversionForState(transaction.startState);
			if (
				!previous ||
				transaction.annotation(profileProjection) ||
				transaction.effects.some((effect) => effect.is(setConversionStateEffect))
			)
				return transaction;
			const composing = transaction.startState.field(editorComposingField, false);
			const ended = transaction.effects.some(
				(effect) => effect.is(setComposingEffect) && !effect.value
			);
			if (composing && !ended) return transaction;
			const pending = transaction.startState.field(compositionChangesField, false);
			const changes = ended && pending ? pending.compose(transaction.changes) : transaction.changes;
			const edits: TextEdit[] = [];
			changes.iterChanges((from, to, _a, _b, inserted) =>
				edits.push({ from, to, insert: inserted.toString() })
			);
			const onlyHere = transaction.annotation(applyOnlyHereAnnotation);
			let onlySectionId = conversionSectionLocal(transaction.startState);
			if (onlyHere && previous.envelope.profile === 'musixmatch') {
				onlySectionId = conversionSectionAt(transaction.startState, onlyHere);
				if (
					!onlySectionId ||
					edits.some((edit) => edit.from < onlyHere.from || onlyHere.to < edit.to)
				)
					throw new RangeError(
						'The local linked-section edit must stay inside its selected section and addressed range.'
					);
			}
			const timingChanged = transaction.effects.some(
				(effect) =>
					effect.is(setLineAnchorsEffect) ||
					effect.is(anchorLineEffect) ||
					effect.is(clearLineAnchorEffect)
			);
			const linksChanged = transaction.effects.some(
				(effect) => effect.is(setSectionLinksEffect) || effect.is(setSectionLinkEffect)
			);
			if (!edits.length && !timingChanged && !linksChanged) return transaction;
			const recover = (reason: string) => [
				transaction,
				{
					effects: setConversionStateEffect.of({
						...previous,
						recovery: {
							...previous.recovery,
							text: transaction.newDoc.toString(),
							checkpoint: previous.envelope,
							reason
						}
					}),
					sequential: true
				}
			];
			if (previous.recovery) return recover(previous.recovery.reason);
			let next = previous;
			let additionalChanges: TextEdit[] = [];
			if (edits.length) {
				const model = {
					...previous.envelope.model,
					nextId: Math.max(
						previous.envelope.model.nextId,
						transaction.startState.field(allocatorField)
					)
				};
				const reconciled = reconcileEdit(model, previous.projection, {
					changes: edits,
					onlySectionId,
					mirror: previous.envelope.profile === 'musixmatch',
					performers: transaction.startState.field(editorContextField)?.performers
				});
				if (!reconciled.ok) return recover(reconciled.refusal.message);
				additionalChanges = reconciled.value.changes
					.filter(
						(candidate) =>
							!edits.some(
								(edit) =>
									edit.from === candidate.from &&
									edit.to === candidate.to &&
									edit.insert === candidate.insert
							)
					)
					.map((edit) => ({
						...edit,
						from: changes.mapPos(edit.from, 1),
						to: changes.mapPos(edit.to, 1)
					}));
				next = {
					envelope: envelopeFor(
						previous.envelope,
						reconciled.value.document,
						reconciled.value.projection.text
					),
					projection: reconciled.value.projection
				};
			}
			if (timingChanged || (linksChanged && next.envelope.profile === 'genius')) {
				const details: MetadataUpdate = {};
				if (timingChanged) details.lineAnchors = lineAnchorsFor(transaction.state);
				if (linksChanged && next.envelope.profile === 'genius')
					details.sectionLinks = sectionLinksFor(transaction.state);
				const updated = updateMetadata(next.envelope.model, next.projection, details);
				if (!updated.ok) return recover(updated.refusal.message);
				next = {
					envelope: envelopeFor(
						next.envelope,
						updated.value.document,
						updated.value.projection.text
					),
					projection: updated.value.projection
				};
			}
			const text = transaction.newDoc.toString();
			if (
				ChangeSet.of(additionalChanges, text.length).apply(transaction.newDoc).toString() !==
				next.projection.text
			)
				return recover('The reconciled lyric edits could not be mapped exactly.');
			return [
				transaction,
				{
					changes: additionalChanges,
					// The settled model belongs to the native composition's typing event.
					userEvent: ended && pending ? 'input.type.compose' : undefined,
					effects: [
						setConversionStateEffect.of(next),
						...metadataEffects(next, transaction.startState.field(editorContextField)?.performers)
					],
					sequential: true
				}
			];
		})
	];
}
