import type { VoiceGroup, TextRange } from '$lib/core/types.js';
import type { ConversionDocument, Projection } from './model.js';
import { projectOffset } from './projection.js';

export function projectedVoiceGroups(
	document: ConversionDocument,
	projection: Projection
): (TextRange & { group: VoiceGroup })[] {
	return document.voices
		.map((voice) => ({
			from: projectOffset(projection, voice.from, 1),
			to: projectOffset(projection, voice.to, -1),
			group: {
				id: voice.id,
				performerIds: voice.performerIds,
				styleSlot: voice.styleSlot ?? 1,
				rawNameText: voice.rawNameText
			}
		}))
		.filter((range) => range.from < range.to);
}
