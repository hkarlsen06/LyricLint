import type { ConfirmedRuleFact, RuleContext, TextRange } from '$lib/core/types.js';
import type { ConversionDocument, Projection } from '$lib/conversion/model.js';
import { projectOffset } from '$lib/conversion/projection.js';
import { decideInstrumentalRepresentation, decideQuantityRepresentation } from './decisions.js';
import { profileLanguage } from './languages.js';

/** Derive from a validated model and its matching projection; never persist diagnostic ignores. */
export function projectConfirmedFacts(
	document: ConversionDocument,
	projection: Projection
): ConfirmedRuleFact[] {
	if (!document.decisions.length) return [];
	const owners = new Map(document.owners.map((owner) => [owner.id, owner]));
	const sections = new Map(document.sections.map((section, index) => [section.id, index]));
	const markers = new Map(document.markers.map((marker) => [marker.decisionId, marker]));
	const markerSegments = new Map(
		projection.segments
			.filter((segment) => segment.part === 'marker')
			.map((segment) => [segment.recordId, segment])
	);
	const facts: ConfirmedRuleFact[] = [];
	for (const decision of document.decisions) {
		if (decision.profile !== projection.profile) continue;
		const owner = owners.get(decision.ownerId);
		if (!owner || owner.revision !== decision.ownerRevision) continue;
		if (decision.kind === 'quantity') {
			const language =
				document.languageRanges.find(
					(range) => range.from <= decision.from && decision.to <= range.to
				)?.language ?? document.defaultLanguage;
			if (
				language !== decision.facts.language ||
				owner.from > decision.from ||
				decision.to > owner.to ||
				document.languageRanges.some(
					(range) =>
						(decision.from < range.from && range.from < decision.to) ||
						(decision.from < range.to && range.to < decision.to)
				)
			)
				continue;
			const checked = decideQuantityRepresentation(decision.facts);
			if (!checked.ok) continue;
			const from = projectOffset(projection, decision.from, 1);
			const to = projectOffset(projection, decision.to, -1);
			if (from >= to || projection.text.slice(from, to) !== checked.value) continue;
			facts.push({
				kind: decision.kind,
				profile: projection.profile,
				language,
				from,
				to,
				text: checked.value,
				decisionId: decision.id
			});
		} else if (decision.kind === 'instrumental-interval') {
			if (decision.facts.language !== document.defaultLanguage) continue;
			const checked = decideInstrumentalRepresentation({
				...decision.facts,
				language: document.defaultLanguage,
				currentRecordingId: document.recordingId ?? ''
			});
			if (!checked.ok) continue;
			const before = sections.get(decision.facts.beforeSectionId);
			const after = before === undefined ? undefined : document.sections[before + 1];
			const marker = markers.get(decision.id);
			const segment = marker && markerSegments.get(marker.id);
			if (
				before === undefined ||
				!document.sections[before]?.type ||
				!after?.type ||
				after.id !== decision.facts.afterSectionId ||
				after.at !== decision.from ||
				decision.to !== decision.from ||
				owner.from > after.at ||
				after.at >= owner.to ||
				!marker ||
				marker.at !== after.at ||
				!segment ||
				projection.text.slice(segment.from, segment.to) !== marker.text
			)
				continue;
			facts.push({
				kind: decision.kind,
				profile: projection.profile,
				language: document.defaultLanguage,
				from: segment.from,
				to: segment.from + checked.value.text.length,
				text: checked.value.text,
				decisionId: decision.id
			});
		}
	}
	return facts;
}

/** Match one question, its complete text and its current language; unrelated rules still run. */
export function hasConfirmedFact(
	context: RuleContext,
	kind: ConfirmedRuleFact['kind'],
	range: TextRange,
	text: string
): boolean {
	return (
		context.confirmedFacts?.some(
			(fact) =>
				fact.kind === kind &&
				fact.profile === context.profile &&
				profileLanguage(fact.language) === profileLanguage(context.language) &&
				fact.from === range.from &&
				fact.to === range.to &&
				fact.text === text
		) ?? false
	);
}
