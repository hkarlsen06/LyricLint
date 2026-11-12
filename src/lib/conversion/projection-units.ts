import type { TextRange } from '#lib/core/types.js';
import {
	allocateId,
	type ConversionDocument,
	type EngineResult,
	type Projection
} from './model.js';
import { projectOffset, renderProfile } from './projection.js';

/** Retain exact unit spellings when their owner or surrounding policy context changes. */
export function retainProjectionUnits(
	document: ConversionDocument,
	profile: Projection['profile'],
	units: readonly (TextRange & { text: string })[]
): EngineResult<Projection> {
	const rendered = renderProfile(document, profile);
	if (!rendered.ok) return rendered;
	const formCount = document.forms.length;
	const authored = document.forms
		.filter((form) => form.profile === profile)
		.sort((a, b) => a.from - b.from);
	let formIndex = 0;
	let ownerIndex = 0;
	let retainedEnd = -1;
	for (const { from, to, text } of [...units].sort((a, b) => a.from - b.from)) {
		if (
			from >= to ||
			from < retainedEnd ||
			rendered.value.text.slice(
				projectOffset(rendered.value, from, 1),
				projectOffset(rendered.value, to, -1)
			) === text
		)
			continue;
		while (authored[formIndex] && authored[formIndex]!.to <= from) formIndex++;
		if (authored[formIndex] && authored[formIndex]!.from < to) continue;
		while (document.owners[ownerIndex] && document.owners[ownerIndex]!.to <= from) ownerIndex++;
		const owner = document.owners[ownerIndex];
		if (!owner || from < owner.from || owner.to < to) continue;
		document.forms.push({
			id: allocateId(document, 'form'),
			from,
			to,
			text,
			profile,
			ownerId: owner.id,
			ownerRevision: owner.revision
		});
		retainedEnd = to;
	}
	return document.forms.length === formCount ? rendered : renderProfile(document, profile);
}
