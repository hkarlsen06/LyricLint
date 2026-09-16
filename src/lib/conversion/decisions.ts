import { parseDocument } from '$lib/core/parser.js';
import type { PerformerRecord, TextEdit, TextRange } from '$lib/core/types.js';
import { escapeLegendText, serializeLegend, styleTags } from '$lib/serialization/genius-markup.js';
import { makeVoiceGroupKey } from '$lib/performers/identity.js';
import { headerNameAtoms, isMirrorableHeaderName } from '$lib/performers/header-rename.js';
import { decodeLegendText } from '$lib/core/legend.js';
import {
	allocateId,
	refuse,
	type ContentKind,
	type ConversionDocument,
	type EngineResult,
	type Projection,
	type ReconciledDocument,
	type SectionRecord,
	type VoiceAssignment,
	type WrapperRecord
} from './model.js';
import { contentOffset, projectOffset, renderProfile } from './projection.js';
import { applyTextEdits, reconcileEdit } from './reconcile.js';
import { resolveFactDecision, type FactAction } from './facts.js';
import { expandRepeat, type RepeatAction } from './repeat.js';
import { resolveLinkDecision, type LinkDecision } from './links.js';

export type ConversionAction =
	| RepeatAction
	| FactAction
	| LinkDecision
	| { kind: 'clearDocument' }
	| { kind: 'setContentKind'; contentKind: ContentKind }
	| { kind: 'setLanguage'; language: string }
	| { kind: 'setForm'; range: TextRange; profile: Projection['profile']; text: string }
	| { kind: 'keepForm'; range: TextRange }
	| { kind: 'confirmCensoredToken'; range: TextRange; heardPrefix: string; audioCensored: true }
	| { kind: 'setSectionType'; sectionId: string; type: NonNullable<SectionRecord['type']> }
	| { kind: 'insertSection'; at: number; type?: NonNullable<SectionRecord['type']> }
	| { kind: 'moveSection'; sectionId: string; at: number }
	| { kind: 'removeSection'; sectionId: string; deleteLyrics?: boolean; targetSectionId?: string }
	| { kind: 'removeDetail'; detailId: string }
	| { kind: 'attachAnnotation'; range: TextRange; annotationId: string }
	| { kind: 'setPassageLanguage'; range: TextRange; language: string }
	| { kind: 'assignVoice'; range: TextRange; sectionId: string; performerIds: string[] }
	| { kind: 'renamePerformer'; performerId: string; previousName: string; displayName: string }
	| { kind: 'mergePerformer'; fromPerformerId: string; toPerformerId: string }
	| { kind: 'removePerformer'; performerId: string };

function visibleRange(projection: Projection, range: TextRange): TextRange | undefined {
	if (
		!Number.isSafeInteger(range.from) ||
		!Number.isSafeInteger(range.to) ||
		range.from < 0 ||
		range.from >= range.to ||
		range.to > projection.text.length
	)
		return undefined;
	if (
		projection.segments.some(
			(segment) =>
				segment.kind === 'generated' && segment.from < range.to && range.from < segment.to
		)
	)
		return undefined;
	return {
		from: contentOffset(projection, range.from, -1),
		to: contentOffset(projection, range.to, 1)
	};
}

/** Reorder only after an explicit structural edit, preserving existing ties. */
function orderSyntax(
	document: ConversionDocument,
	addedWrapper?: string,
	addedSection?: string
): void {
	const events = [
		...document.sections.map((section) => ({
			at: section.at,
			order: section.order,
			kind: 'header' as const,
			id: section.id,
			record: section
		})),
		...document.wrappers.flatMap((wrapper) => [
			{
				at: wrapper.from,
				order: wrapper.openOrder,
				kind: 'open' as const,
				id: wrapper.id,
				record: wrapper
			},
			{
				at: wrapper.to,
				order: wrapper.closeOrder,
				kind: 'close' as const,
				id: wrapper.id,
				record: wrapper
			}
		])
	];
	const rank = (event: (typeof events)[number]) => {
		if (event.id === addedWrapper) return event.kind === 'open' ? 2 : 1;
		if (event.id === addedSection) return 2;
		return event.kind === 'close' ? 0 : event.kind === 'header' ? 1 : 3;
	};
	events.sort(
		(a, b) =>
			a.at - b.at ||
			(a.id === addedWrapper ||
			b.id === addedWrapper ||
			a.id === addedSection ||
			b.id === addedSection
				? rank(a) - rank(b)
				: 0) ||
			a.order - b.order
	);
	for (let index = 0; index < events.length; index++) {
		const event = events[index]!;
		if (event.kind === 'header') event.record.order = index;
		else if (event.kind === 'open') event.record.openOrder = index;
		else event.record.closeOrder = index;
	}
	document.sections.sort((a, b) => a.at - b.at || a.order - b.order);
}

function exactReplacement(before: string, after: string): TextEdit[] {
	if (before === after) return [];
	let from = 0;
	while (from < before.length && from < after.length && before[from] === after[from]) from++;
	let to = before.length;
	let afterTo = after.length;
	while (from < to && from < afterTo && before[to - 1] === after[afterTo - 1]) {
		to--;
		afterTo--;
	}
	return [{ from, to, insert: after.slice(from, afterTo) }];
}

function putForm(
	document: ConversionDocument,
	range: TextRange,
	profile: Projection['profile'],
	text: string
): boolean {
	const owner = document.owners.find((entry) => entry.from <= range.from && range.to <= entry.to);
	if (
		!owner ||
		range.from >= range.to ||
		(text.match(/\r\n|\r|\n/gu) ?? []).join('') !==
			(document.content.slice(range.from, range.to).match(/\r\n|\r|\n/gu) ?? []).join('')
	)
		return false;
	document.forms = document.forms.filter(
		(form) => form.profile !== profile || form.to <= range.from || range.to <= form.from
	);
	document.decisions = document.decisions.filter(
		(decision) =>
			!('from' in decision) ||
			decision.kind === 'instrumental-interval' ||
			decision.to <= range.from ||
			range.to <= decision.from
	);
	document.forms.push({
		id: allocateId(document, 'form'),
		...range,
		profile,
		text,
		ownerId: owner.id,
		ownerRevision: owner.revision
	});
	return true;
}

/** Context changes rerun eligibility while preserving what the author is currently editing. */
function retainActiveRepresentation(
	before: Projection,
	next: ConversionDocument
): EngineResult<ConversionDocument> {
	const after = renderProfile(next, before.profile);
	if (!after.ok) return after;
	const units = [...before.segments, ...after.value.segments]
		.filter((segment) => segment.kind === 'transformed')
		.map((segment) => ({ from: segment.contentFrom, to: segment.contentTo }));
	units.push(
		...[...before.hidden, ...after.value.hidden]
			.filter((entry) => entry.contentTo !== undefined)
			.map((entry) => ({ from: entry.contentAt, to: entry.contentTo! }))
	);
	for (const unit of units) {
		const text = before.text.slice(
			projectOffset(before, unit.from, 1),
			projectOffset(before, unit.to, -1)
		);
		const target = after.value.text.slice(
			projectOffset(after.value, unit.from, 1),
			projectOffset(after.value, unit.to, -1)
		);
		if (text !== target && !putForm(next, unit, before.profile, text))
			return refuse(
				'invariant-failure',
				'The changed language could not preserve an owned spelling.'
			);
	}
	return { ok: true, value: next };
}

/** Explicit user choices; no ignored warning can become a semantic conversion fact. */
export function resolveDecision(
	document: ConversionDocument,
	projection: Projection,
	action: ConversionAction,
	context?: { performers: readonly PerformerRecord[] }
): EngineResult<ReconciledDocument> {
	const current = renderProfile(document, projection.profile);
	if (!current.ok) return current;
	if (current.value.text !== projection.text)
		return refuse('stale-basis', 'This decision belongs to an earlier lyric projection.');
	const next: ConversionDocument = {
		...document,
		sections: document.sections.map((section) => ({ ...section })),
		wrappers: document.wrappers.map((wrapper) => ({ ...wrapper })),
		voices: document.voices.map((voice) => ({ ...voice, performerIds: [...voice.performerIds] })),
		languageRanges: [...document.languageRanges],
		forms: [...document.forms]
	};
	const invalid = (message: string) => refuse<ReconciledDocument>('invalid-input', message);
	if (!action || typeof action !== 'object') return invalid('Choose an available document action.');
	switch (action.kind) {
		case 'expandRepeat':
			return expandRepeat(document, projection, action);
		case 'linkSections':
		case 'unlinkSection':
			return resolveLinkDecision(document, projection, action);
		case 'confirmQuantity':
		case 'confirmInstrumentalInterval':
		case 'setRecording':
			return resolveFactDecision(document, projection, action);
		case 'clearDocument':
			next.content = '';
			next.owners = [];
			next.lines = [];
			next.sections = [];
			next.wrappers = [];
			next.voices = [];
			next.forms = [];
			next.languageRanges = [];
			next.links = [];
			next.decisions = [];
			next.markers = [];
			break;
		case 'renamePerformer': {
			const performer = context?.performers.find((entry) => entry.id === action.performerId);
			if (
				!performer ||
				!isMirrorableHeaderName(action.displayName) ||
				typeof action.previousName !== 'string'
			)
				return invalid(
					'Choose an existing performer and a complete name that fits a section legend.'
				);
			const roster = context!.performers.map((entry) =>
				entry.id === action.performerId
					? {
							...entry,
							displayName: action.previousName,
							aliases: [...entry.aliases, action.previousName]
						}
					: entry
			);
			for (const section of next.sections) {
				const edits = headerNameAtoms(parseDocument(section.header), roster)
					.filter((atom) => atom.performerId === action.performerId)
					.map((atom) => ({
						from: atom.from,
						to: atom.to,
						insert: escapeLegendText(action.displayName)
					}));
				if (edits.length && section.headerVisible === false)
					return invalid(
						'Repair the partially edited section header before renaming a performer it names.'
					);
				section.header = applyTextEdits(section.header, edits);
			}
			for (const voice of next.voices)
				if (
					voice.performerIds.includes(action.performerId) &&
					voice.rawNameText &&
					decodeLegendText(voice.rawNameText) === action.previousName
				)
					voice.rawNameText = escapeLegendText(action.displayName);
			break;
		}
		case 'mergePerformer':
		case 'removePerformer': {
			const removed =
				action.kind === 'mergePerformer' ? action.fromPerformerId : action.performerId;
			const replacement =
				action.kind === 'mergePerformer'
					? context?.performers.find((entry) => entry.id === action.toPerformerId)
					: undefined;
			if (
				action.kind === 'mergePerformer' &&
				(!replacement || action.fromPerformerId === action.toPerformerId)
			)
				return invalid('Choose a different existing performer to merge into.');
			const affected = new Set(
				next.voices
					.filter((voice) => voice.performerIds.includes(removed))
					.map((voice) => voice.sectionId)
			);
			if (
				next.sections.some((section) => affected.has(section.id) && section.headerVisible === false)
			)
				return invalid(
					'Repair the partially edited section header before changing the performer it names.'
				);
			next.voices = next.voices.map((voice) => {
				if (!voice.performerIds.includes(removed)) return voice;
				const performerIds = [
					...new Set(
						voice.performerIds.flatMap((id) =>
							id === removed ? (replacement ? [replacement.id] : []) : [id]
						)
					)
				];
				return {
					...voice,
					performerIds,
					rawNameText: undefined,
					...(performerIds.length ? { anonymous: undefined } : { anonymous: true as const })
				};
			});
			for (const section of next.sections)
				if (affected.has(section.id)) {
					const groups = next.voices.filter(
						(voice) =>
							voice.sectionId === section.id &&
							voice.styleSlot &&
							(voice.performerIds.length || voice.rawNameText)
					);
					const unique = [
						...new Map(groups.map((voice) => [voice.styleSlot!, voice])).values()
					].sort((a, b) => a.styleSlot! - b.styleSlot!);
					const legend = serializeLegend(
						unique.map((voice) => ({
							styleSlot: voice.styleSlot!,
							members: voice.performerIds.length
								? voice.performerIds
										.map((id) => context?.performers.find((entry) => entry.id === id)?.displayName)
										.filter((name): name is string => name !== undefined)
								: [decodeLegendText(voice.rawNameText!)]
						}))
					);
					const parsed = parseDocument(section.header).sections[0]?.header;
					if (!parsed) continue;
					const label = section.header
						.slice(
							parsed.from + 1,
							parsed.legendRange ? section.header.indexOf(':', parsed.from) : parsed.to - 1
						)
						.trimEnd();
					section.header = `${section.header.slice(0, parsed.from)}[${label}${legend ? `: ${legend}` : ''}]${section.header.slice(parsed.to)}`;
				}
			break;
		}
		case 'setContentKind':
			if (!['original', 'translation', 'romanization', 'unknown'].includes(action.contentKind))
				return invalid('Choose a known content type.');
			next.contentKind = action.contentKind;
			break;
		case 'setLanguage': {
			if (
				typeof action.language !== 'string' ||
				!/^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{1,8})*$/u.test(action.language) ||
				action.language.length > 128
			)
				return invalid('Choose a valid language tag.');
			next.defaultLanguage = action.language;
			const retained = retainActiveRepresentation(projection, next);
			if (!retained.ok) return retained;
			break;
		}
		case 'setForm':
		case 'keepForm': {
			const range = visibleRange(projection, action.range);
			const profile = action.kind === 'setForm' ? action.profile : projection.profile;
			const text =
				action.kind === 'setForm'
					? action.text
					: projection.text.slice(action.range.from, action.range.to);
			if (
				!range ||
				!['genius', 'musixmatch'].includes(profile) ||
				typeof text !== 'string' ||
				next.wrappers.some(
					(wrapper) =>
						(range.from < wrapper.from && wrapper.from < range.to) ||
						(range.from < wrapper.to && wrapper.to < range.to)
				) ||
				!putForm(next, range, profile, text)
			)
				return invalid(
					'A retained spelling must belong to one lyric unit without crossing detail boundaries.'
				);
			break;
		}
		case 'confirmCensoredToken': {
			const range = visibleRange(projection, action.range);
			const token = projection.text.slice(action.range.from, action.range.to);
			if (
				!range ||
				action.audioCensored !== true ||
				typeof action.heardPrefix !== 'string' ||
				action.heardPrefix.length > 100 ||
				/[\s[\]<>*]/u.test(action.heardPrefix) ||
				(projection.profile === 'genius' ? token !== '****' : token !== `${action.heardPrefix}-`)
			)
				return invalid(
					'Confirm a four-asterisk Genius token or the exact audible prefix and cutoff in Musixmatch.'
				);
			const owner = next.owners.find((entry) => entry.from <= range.from && range.to <= entry.to);
			const target = projection.profile === 'genius' ? 'musixmatch' : 'genius';
			const text = target === 'musixmatch' ? `${action.heardPrefix}-` : '****';
			if (!owner || !putForm(next, range, target, text))
				return invalid('This confirmed token does not have one stable lyric owner.');
			next.decisions = [
				...next.decisions.filter(
					(decision) =>
						decision.kind !== 'censored-token' ||
						decision.from !== range.from ||
						decision.to !== range.to
				),
				{
					id: allocateId(next, 'decision'),
					kind: 'censored-token',
					profile: projection.profile,
					ownerId: owner.id,
					ownerRevision: owner.revision,
					...range,
					heardPrefix: action.heardPrefix
				}
			];
			break;
		}
		case 'setSectionType': {
			if (
				!['Intro', 'Verse', 'PreChorus', 'Chorus', 'Hook', 'Bridge', 'Outro'].includes(action.type)
			)
				return invalid('Choose a supported Musixmatch section type.');
			const section = next.sections.find((entry) => entry.id === action.sectionId);
			if (!section) return invalid('This section no longer exists.');
			section.type = action.type;
			break;
		}
		case 'insertSection':
		case 'moveSection': {
			if (!Number.isSafeInteger(action.at) || action.at < 0 || action.at > projection.text.length)
				return invalid('The section boundary is outside the lyrics.');
			const at = contentOffset(projection, action.at, 1);
			if (
				next.decisions.some((decision) => {
					if (decision.kind !== 'instrumental-interval') return false;
					const before = next.sections.find(
						(section) => section.id === decision.facts.beforeSectionId
					)!;
					const after = next.sections.find(
						(section) => section.id === decision.facts.afterSectionId
					)!;
					return (
						(action.kind === 'moveSection' && [before.id, after.id].includes(action.sectionId)) ||
						(before.at < at && at <= after.at)
					);
				})
			)
				return invalid(
					'Remove the confirmed instrumental interval before changing either of its section boundaries.'
				);
			if (at > 0 && at < next.content.length && next.content[at - 1] !== '\n')
				return invalid('Place a section boundary at the start of a lyric line.');
			if (next.wrappers.some((wrapper) => wrapper.from < at && at < wrapper.to))
				return invalid(
					'This boundary crosses a retained annotation or voice span. Split that detail explicitly first.'
				);
			if (action.kind === 'moveSection') {
				const section = next.sections.find((entry) => entry.id === action.sectionId);
				if (!section) return invalid('This section no longer exists.');
				section.at = at;
				orderSyntax(next);
			} else {
				if (
					action.type !== undefined &&
					!['Intro', 'Verse', 'PreChorus', 'Chorus', 'Hook', 'Bridge', 'Outro'].includes(
						action.type
					)
				)
					return invalid('Choose a supported section type.');
				const name = action.type === 'PreChorus' ? 'Pre-Chorus' : (action.type ?? 'Section');
				const section: SectionRecord = {
					id: allocateId(next, 'section'),
					at,
					order: 0,
					header: `[${name}]${at < next.content.length ? '\n' : ''}`,
					name,
					explicitEmpty: at === next.content.length
				};
				if (action.type) section.type = action.type;
				next.sections.push(section);
				orderSyntax(next, undefined, section.id);
			}
			break;
		}
		case 'removeSection': {
			const section = next.sections.find((entry) => entry.id === action.sectionId);
			if (!section) return invalid('This section no longer exists.');
			if (
				next.decisions.some(
					(decision) =>
						decision.kind === 'instrumental-interval' &&
						(decision.facts.beforeSectionId === section.id ||
							decision.facts.afterSectionId === section.id)
				)
			)
				return invalid(
					'Remove the confirmed instrumental interval before removing its section boundary.'
				);
			const end = next.sections[next.sections.indexOf(section) + 1]?.at ?? next.content.length;
			const voices = next.voices.filter((voice) => voice.sectionId === section.id);
			const target = action.targetSectionId
				? next.sections.find((entry) => entry.id === action.targetSectionId)
				: undefined;
			if (
				target &&
				(target.id === section.id ||
					Math.abs(next.sections.indexOf(target) - next.sections.indexOf(section)) !== 1)
			)
				return invalid('Merge a boundary only into its adjacent section.');
			if (!action.deleteLyrics && voices.length) {
				if (!target)
					return invalid(
						'This section has voice assignments. Choose an adjacent section to retain them, or remove those assignments explicitly.'
					);
				if (
					voices.some(
						(voice) =>
							!next.voices.some(
								(other) =>
									other.sectionId === target.id &&
									voice.styleSlot === other.styleSlot &&
									makeVoiceGroupKey(voice.performerIds) === makeVoiceGroupKey(other.performerIds) &&
									(voice.performerIds.length > 0 || voice.rawNameText === other.rawNameText)
							)
					)
				)
					return invalid(
						'These sections use different voice styles. Resolve their voice assignments before merging the boundary.'
					);
			}
			next.sections = next.sections.filter((entry) => entry.id !== section.id);
			next.voices = next.voices.flatMap((voice) =>
				voice.sectionId !== section.id
					? [voice]
					: !action.deleteLyrics && target
						? [{ ...voice, sectionId: target.id }]
						: []
			);
			next.links = next.links.flatMap((link) => {
				const sectionIds = link.sectionIds.filter((id) => id !== section.id);
				if (sectionIds.length < 2) return [];
				const retained = { ...link, sectionIds };
				if (link.passages)
					retained.passages = link.passages
						.map((passage) => ({
							members: passage.members.filter((member) => member.sectionId !== section.id)
						}))
						.filter((passage) => passage.members.length >= 2);
				if (link.detached)
					retained.detached = link.detached.filter((member) => member.sectionId !== section.id);
				return [retained];
			});
			if (action.deleteLyrics && section.at < end) {
				const plain = renderProfile(next, 'musixmatch');
				if (!plain.ok) return plain;
				const deleted = reconcileEdit(next, plain.value, {
					changes: [
						{
							from: projectOffset(plain.value, section.at, 1),
							to: projectOffset(plain.value, end, -1),
							insert: ''
						}
					],
					mirror: false
				});
				if (!deleted.ok) return deleted;
				const projectionAfter = renderProfile(deleted.value.document, projection.profile);
				if (!projectionAfter.ok) return projectionAfter;
				return {
					ok: true,
					value: {
						document: deleted.value.document,
						projection: projectionAfter.value,
						changes: exactReplacement(projection.text, projectionAfter.value.text)
					}
				};
			}
			break;
		}
		case 'removeDetail': {
			const wrapper = next.wrappers.find((entry) => entry.id === action.detailId);
			const voice = next.voices.find((entry) => entry.id === action.detailId);
			const language = next.languageRanges.find((entry) => entry.id === action.detailId);
			const form = next.forms.find((entry) => entry.id === action.detailId);
			const decision = next.decisions.find((entry) => entry.id === action.detailId);
			const marker = next.markers.find((entry) => entry.id === action.detailId);
			if (!wrapper && !voice && !language && !form && !decision && !marker)
				return invalid('This retained detail no longer exists.');
			next.wrappers = next.wrappers.filter(
				(entry) => entry.id !== (wrapper?.id ?? voice?.wrapperId)
			);
			next.voices = next.voices.filter(
				(entry) => entry.id !== action.detailId && entry.wrapperId !== wrapper?.id
			);
			next.languageRanges = next.languageRanges.filter((entry) => entry.id !== action.detailId);
			next.forms = next.forms.filter(
				(entry) =>
					entry.id !== action.detailId &&
					!(
						(decision?.kind === 'censored-token' || decision?.kind === 'quantity') &&
						entry.from === decision.from &&
						entry.to === decision.to &&
						(decision.kind === 'quantity'
							? entry.profile === decision.profile
							: entry.profile !== decision.profile)
					)
			);
			next.decisions = next.decisions.filter(
				(entry) =>
					entry.id !== action.detailId &&
					!(
						form &&
						'from' in entry &&
						entry.kind !== 'instrumental-interval' &&
						entry.from === form.from &&
						entry.to === form.to
					)
			);
			next.markers = next.markers.filter(
				(entry) => entry.id !== action.detailId && entry.decisionId !== action.detailId
			);
			if (marker) next.decisions = next.decisions.filter((entry) => entry.id !== marker.decisionId);
			break;
		}
		case 'attachAnnotation': {
			const range = visibleRange(projection, action.range);
			if (
				!range ||
				typeof action.annotationId !== 'string' ||
				!/^\d+$/u.test(action.annotationId) ||
				action.annotationId.length > 100
			)
				return invalid('An annotation needs lyric text and a numeric Genius annotation ID.');
			if (
				next.wrappers.some(
					(wrapper) =>
						wrapper.kind === 'annotation' && wrapper.from < range.to && range.from < wrapper.to
				)
			)
				return invalid('Genius annotations cannot overlap or nest.');
			if (
				next.wrappers.some(
					(wrapper) =>
						(wrapper.from < range.from && range.from < wrapper.to && wrapper.to < range.to) ||
						(range.from < wrapper.from && wrapper.from < range.to && range.to < wrapper.to)
				)
			)
				return invalid('This annotation would cross an existing voice span.');
			const wrapper: WrapperRecord = {
				id: allocateId(next, 'wrapper'),
				kind: 'annotation',
				profile: 'genius',
				...range,
				open: '[',
				close: `](${action.annotationId})`,
				annotationId: action.annotationId,
				openOrder: 0,
				closeOrder: 1
			};
			next.wrappers.push(wrapper);
			orderSyntax(next, wrapper.id);
			break;
		}
		case 'setPassageLanguage': {
			const range = visibleRange(projection, action.range);
			if (
				!range ||
				typeof action.language !== 'string' ||
				!/^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{1,8})*$/u.test(action.language) ||
				action.language.length > 128
			)
				return invalid('Choose a language for a nonempty lyric passage.');
			next.languageRanges = next.languageRanges.flatMap((entry) => {
				if (entry.to <= range.from || range.to <= entry.from) return [entry];
				return [
					...(entry.from < range.from ? [{ ...entry, to: range.from }] : []),
					...(range.to < entry.to
						? [
								{
									...entry,
									id: entry.from < range.from ? allocateId(next, 'language') : entry.id,
									from: range.to
								}
							]
						: [])
				];
			});
			next.languageRanges.push({
				id: allocateId(next, 'language'),
				...range,
				language: action.language
			});
			next.languageRanges.sort((a, b) => a.from - b.from);
			const retained = retainActiveRepresentation(projection, next);
			if (!retained.ok) return retained;
			break;
		}
		case 'assignVoice': {
			const range = visibleRange(projection, action.range);
			const section = next.sections.find((entry) => entry.id === action.sectionId);
			const nextSection = section ? next.sections[next.sections.indexOf(section) + 1] : undefined;
			if (
				!range ||
				!section ||
				range.from < section.at ||
				range.to > (nextSection?.at ?? next.content.length) ||
				!Array.isArray(action.performerIds) ||
				new Set(action.performerIds).size !== action.performerIds.length ||
				action.performerIds.some(
					(id) => !context?.performers.some((performer) => performer.id === id)
				)
			)
				return invalid('Choose existing performers for lyrics inside one section.');
			if (
				next.voices.some(
					(voice) =>
						voice.sectionId === section.id &&
						voice.styleSlot !== 1 &&
						voice.from < range.to &&
						range.from < voice.to &&
						!(range.from <= voice.from && voice.to <= range.to)
				)
			)
				return invalid(
					'This assignment partly overlaps another voice. Select the complete existing assignment.'
				);
			const replaced = next.voices.filter(
				(voice) =>
					voice.sectionId === section.id && range.from <= voice.from && voice.to <= range.to
			);
			next.voices = next.voices.filter((voice) => !replaced.includes(voice));
			const removedWrappers = new Set(
				replaced.flatMap((voice) => (voice.wrapperId ? [voice.wrapperId] : []))
			);
			next.wrappers = next.wrappers.filter((wrapper) => !removedWrappers.has(wrapper.id));
			const same = next.voices.find(
				(voice) =>
					voice.sectionId === section.id &&
					makeVoiceGroupKey(voice.performerIds) === makeVoiceGroupKey(action.performerIds) &&
					action.performerIds.length > 0
			);
			const used = new Set(
				next.voices
					.filter((voice) => voice.sectionId === section.id)
					.map((voice) => voice.styleSlot)
			);
			const fullSection =
				range.from === section.at && range.to === (nextSection?.at ?? next.content.length);
			const slot =
				same?.styleSlot ??
				([...(fullSection ? [1 as const] : []), 2, 3, 4] as const).find(
					(candidate) => !used.has(candidate)
				);
			const voice: VoiceAssignment = {
				id: allocateId(next, 'voice'),
				...range,
				sectionId: section.id,
				performerIds: [...action.performerIds]
			};
			if (!action.performerIds.length) voice.anonymous = true;
			if (slot) voice.styleSlot = slot;
			if (slot && slot !== 1) {
				const tags = styleTags(slot);
				const wrapper: WrapperRecord = {
					id: allocateId(next, 'wrapper'),
					...range,
					profile: 'genius',
					kind: 'voice',
					styleSlot: slot,
					open: tags.opening,
					close: tags.closing,
					openOrder: 0,
					closeOrder: 1
				};
				next.wrappers.push(wrapper);
				orderSyntax(next, wrapper.id);
				next.voices.push({ ...voice, wrapperId: wrapper.id });
			} else next.voices.push(voice);
			if (slot && action.performerIds.length) {
				const groups = next.voices.filter(
					(entry) => entry.sectionId === section.id && entry.styleSlot && entry.performerIds.length
				);
				const unique = [...new Map(groups.map((entry) => [entry.styleSlot!, entry])).values()].sort(
					(a, b) => a.styleSlot! - b.styleSlot!
				);
				const parsed = parseDocument(section.header).sections[0]?.header;
				if (parsed) {
					const legend = serializeLegend(
						unique.map((entry) => ({
							styleSlot: entry.styleSlot!,
							members: entry.performerIds
								.map((id) => context!.performers.find((performer) => performer.id === id)!)
								.filter(Boolean)
						}))
					);
					const label = section.header
						.slice(
							parsed.from + 1,
							parsed.legendRange ? section.header.indexOf(':', parsed.from) : parsed.to - 1
						)
						.trimEnd();
					section.header = `${section.header.slice(0, parsed.from)}[${label}: ${legend}]${section.header.slice(parsed.to)}`;
				}
			}
			break;
		}
		default:
			return invalid('This conversion action is unsupported.');
	}
	const rendered = renderProfile(next, projection.profile);
	return rendered.ok
		? {
				ok: true,
				value: {
					document: next,
					projection: rendered.value,
					changes: exactReplacement(projection.text, rendered.value.text)
				}
			}
		: rendered;
}
