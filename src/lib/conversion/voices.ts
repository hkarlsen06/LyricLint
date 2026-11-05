import type { VoiceGroup, TextRange } from '#lib/core/types.js';
import type { ConversionDocument, Projection } from './model.js';
import { projectOffset } from './projection.js';

export function projectedVoiceGroups(
	document: ConversionDocument,
	projection: Projection
): (TextRange & { group: VoiceGroup })[] {
	// The plain voice is the section fallback. Retained styled passages override
	// it, including wrappers whose singer has not been identified yet.
	const overrides: TextRange[] = [];
	const styled = [
		...document.wrappers.filter((wrapper) => wrapper.kind === 'voice'),
		...document.voices.filter((voice) => voice.styleSlot !== 1)
	].sort((left, right) => left.from - right.from || left.to - right.to);
	for (const range of styled) {
		if (range.from >= range.to) continue;
		const previous = overrides.at(-1);
		if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to);
		else overrides.push({ from: range.from, to: range.to });
	}

	return document.voices
		.flatMap((voice) => {
			if (voice.styleSlot !== 1) return [voice];
			let lower = 0;
			let upper = overrides.length;
			while (lower < upper) {
				const middle = (lower + upper) >>> 1;
				if (overrides[middle]!.to <= voice.from) lower = middle + 1;
				else upper = middle;
			}
			const fragments: typeof document.voices = [];
			let from = voice.from;
			for (let index = lower; index < overrides.length; index++) {
				const range = overrides[index]!;
				if (range.from >= voice.to) break;
				if (from < range.from) fragments.push({ ...voice, from, to: range.from });
				from = Math.max(from, range.to);
			}
			if (from < voice.to) fragments.push({ ...voice, from });
			return fragments;
		})
		.map((range) => ({
			from: projectOffset(projection, range.from, 1),
			to: projectOffset(projection, range.to, -1),
			group: {
				id: range.id,
				performerIds: range.performerIds,
				styleSlot: range.styleSlot ?? 1,
				rawNameText: range.rawNameText
			}
		}))
		.filter((range) => range.from < range.to);
}
