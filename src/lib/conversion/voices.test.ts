import { describe, expect, it } from 'vitest';
import type { PerformerRecord } from '#lib/core/types.js';
import { importDocument, renderProfile, resolveDecision } from './index.js';
import { projectedVoiceGroups } from './voices.js';

const performers: PerformerRecord[] = ['Mira', 'Noor', 'Lena', 'Sora', 'Ivo'].map(
	(displayName, order) => ({
		id: displayName.toLowerCase(),
		displayName,
		normalizedKey: displayName.toLowerCase(),
		aliases: [],
		colorId: 'olive',
		order
	})
);

function projected(text: string) {
	const imported = importDocument({ text, profile: 'genius', performers });
	if (!imported.ok) throw new Error(imported.refusal.message);
	const rendered = renderProfile(imported.value, 'musixmatch');
	if (!rendered.ok) throw new Error(rendered.refusal.message);
	const original = JSON.stringify(imported.value);
	const ranges = projectedVoiceGroups(imported.value, rendered.value);
	expect(JSON.stringify(imported.value)).toBe(original);
	expect(renderProfile(imported.value, 'genius')).toMatchObject({ ok: true, value: { text } });
	return { model: imported.value, projection: rendered.value, ranges };
}

describe('projected performer attribution', () => {
	it('attributes a secondary line only to its singer, retaining the section baseline', () => {
		const { projection, ranges } = projected(
			'[Verse: Mira & <i>Noor</i>]\nMira carries the light\n<i>Noor answers</i>\nMira returns'
		);
		for (const [words, singer] of [
			['Mira carries the light', 'mira'],
			['Noor answers', 'noor'],
			['Mira returns', 'mira']
		]) {
			const at = projection.text.indexOf(words);
			expect(
				ranges
					.filter((range) => range.from <= at && at < range.to)
					.map((range) => range.group.performerIds)
			).toEqual([[singer]]);
		}
	});

	it.each([
		['<i>Noor</i> and Mira', ['noor'], ['mira']],
		['Mira and <i>Noor</i>', ['mira'], ['noor']],
		['Mira <i>Noor</i> Mira <b>Lena</b> Mira', ['mira'], ['mira']]
	])('keeps mixed-line attribution exclusive: %s', (lyrics, first, last) => {
		const { projection, ranges } = projected(`[Verse: Mira, <i>Noor</i>, <b>Lena</b>]\n${lyrics}`);
		const singersAt = (at: number) =>
			ranges
				.filter((range) => range.from <= at && at < range.to)
				.map((range) => range.group.performerIds);
		expect(singersAt(0)).toEqual([first]);
		expect(singersAt(projection.text.length - 1)).toEqual([last]);
		for (let at = 0; at < projection.text.length; at++) expect(singersAt(at)).toHaveLength(1);
	});

	it('does not assign unnamed styled lyrics to the section singer', () => {
		const { projection, ranges } = projected('[Verse: Mira]\nMira <i>unknown voice</i> Mira');
		const at = projection.text.indexOf('unknown');
		expect(ranges.filter((range) => range.from <= at && at < range.to)).toEqual([]);
		expect(
			ranges.filter((range) => range.from === 0).map((range) => range.group.performerIds)
		).toEqual([['mira']]);
	});

	it('retains an anonymous secondary assignment without attributing it to the baseline singer', () => {
		const { projection, ranges } = projected(
			'[Verse: Mira, <i>Unidentified</i>]\nMira <i>someone</i> Mira'
		);
		const at = projection.text.indexOf('someone');
		expect(
			ranges
				.filter((range) => range.from <= at && at < range.to)
				.map((range) => range.group.performerIds)
		).toEqual([[]]);
	});

	it('projects a retained assignment beyond the Genius style limit without baseline overlap', () => {
		const { model, projection } = projected(
			'[Verse: Mira, <i>Noor</i>, <b>Lena</b>, <i><b>Sora</b></i>]\nMira <i>Noor</i> <b>Lena</b> <i><b>Sora</b></i> Ivo'
		);
		const at = projection.text.indexOf('Ivo');
		const result = resolveDecision(
			model,
			projection,
			{
				kind: 'assignVoice',
				sectionId: model.sections[0]!.id,
				range: { from: at, to: at + 3 },
				performerIds: ['ivo']
			},
			{ performers }
		);
		if (!result.ok) throw new Error(result.refusal.message);
		expect(
			result.value.document.voices.find((voice) => voice.performerIds.includes('ivo'))?.styleSlot
		).toBeUndefined();
		const ranges = projectedVoiceGroups(result.value.document, result.value.projection);
		expect(
			ranges
				.filter((range) => range.from <= at && at < range.to)
				.map((range) => range.group.performerIds)
		).toEqual([['ivo']]);
	});

	it('keeps joint section and secondary groups independent across sections and annotations', () => {
		const { projection, ranges } = projected(
			'[Verse: Mira & <i>Noor</i>]\nMira <i>[Noor](123456)</i>\n\n[Chorus: Mira & Noor]\nTogether'
		);
		const noor = projection.text.indexOf('Noor');
		const joint = projection.text.indexOf('Together');
		expect(
			ranges
				.filter((range) => range.from <= noor && noor < range.to)
				.map((range) => range.group.performerIds)
		).toEqual([['noor']]);
		expect(
			ranges
				.filter((range) => range.from <= joint && joint < range.to)
				.map((range) => range.group.performerIds)
		).toEqual([['mira', 'noor']]);
	});
});
