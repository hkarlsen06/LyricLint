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
	for (const { from, to, text } of units) {
		if (
			from >= to ||
			rendered.value.text.slice(
				projectOffset(rendered.value, from, 1),
				projectOffset(rendered.value, to, -1)
			) === text ||
			document.forms.some((form) => form.profile === profile && form.from < to && from < form.to)
		)
			continue;
		const owner = document.owners.find((entry) => entry.from <= from && to <= entry.to);
		if (!owner) continue;
		document.forms.push({
			id: allocateId(document, 'form'),
			from,
			to,
			text,
			profile,
			ownerId: owner.id,
			ownerRevision: owner.revision
		});
	}
	return document.forms.length === formCount ? rendered : renderProfile(document, profile);
}
