import { fireEvent, within } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { VoiceGroup } from '$lib/core/types.js';
import { performer } from '../test-utils.js';
import PerformerLegend from './PerformerLegend.svelte';

const performers = [performer('avery', 'Avery', 0), performer('blair', 'Blair', 1)];

function documentWithVoices(sections: [string, VoiceGroup[]][]) {
	const parsed = parseDocument(sections.map(([name]) => `[${name}]\nA lyric line`).join('\n\n'));
	parsed.sections.forEach((section, index) => {
		section.voiceGroups = sections[index][1];
	});
	return parsed;
}

function voice(id: string, styleSlot: VoiceGroup['styleSlot'] = 1): VoiceGroup {
	return { id: `${id}-${styleSlot}`, performerIds: [id], styleSlot };
}

describe('PerformerLegend', () => {
	afterEach(cleanup);

	test('starts closed and groups recurring arrangements across noncontiguous sections', async () => {
		const parsed = documentWithVoices([
			['Intro', [voice('avery')]],
			['Verse', [voice('blair')]],
			['Bridge', []],
			['Chorus', [voice('avery')]],
			['Chorus', [voice('avery')]],
			['Outro', [voice('avery')]]
		]);
		const view = await render(PerformerLegend, { document: parsed, performers });
		const details = view.container.querySelector('details')!;
		expect(details.open).toBe(false);
		expect(view.container.querySelector('ul')!.checkVisibility()).toBe(false);
		await fireEvent.click(details.querySelector('summary')!);
		expect(details.open).toBe(true);
		const groups = within(view.container).getAllByRole('listitem');
		expect(groups).toHaveLength(2);
		expect(within(groups[0]).getByText('Avery')).toBeTruthy();
		expect(within(groups[0]).getByText('1. Intro · 4. Chorus · 5. Chorus · 6. Outro')).toBeTruthy();
		expect(within(groups[1]).getByText('2. Verse')).toBeTruthy();
		expect(view.container.querySelector('ol')).toBeNull();
		expect(within(view.container).queryByText('plain')).toBeNull();
		await fireEvent.click(details.querySelector('summary')!);
		expect(details.open).toBe(false);
	});

	test('keeps changed styling and ordered joint voices distinct, showing the formatting on names', async () => {
		const parsed = documentWithVoices([
			['Chorus', [voice('avery'), voice('blair', 2)]],
			['Chorus', [voice('avery', 2), voice('blair')]],
			['Bridge', [voice('avery', 3), voice('blair', 4)]],
			['Outro', [{ id: 'joint', performerIds: ['avery', 'blair'], styleSlot: 1 }]],
			['Outro', [{ id: 'joint', performerIds: ['blair', 'avery'], styleSlot: 1 }]]
		]);
		const view = await render(PerformerLegend, { document: parsed, performers });
		await fireEvent.click(view.container.querySelector('summary')!);
		expect(within(view.container).getAllByRole('listitem')).toHaveLength(5);
		expect(within(view.container).getByText('1. Chorus')).toBeTruthy();
		expect(within(view.container).getByText('2. Chorus')).toBeTruthy();
		expect(within(view.container).getByText('Avery & Blair')).toBeTruthy();
		expect(within(view.container).getByText('Blair & Avery')).toBeTruthy();
		for (const slot of [2, 3, 4]) {
			const name = view.container.querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;
			const style = getComputedStyle(name);
			expect(style.fontStyle).toBe(slot === 3 ? 'normal' : 'italic');
			expect(Number(style.fontWeight)).toBeGreaterThanOrEqual(slot === 2 ? 400 : 600);
			expect(name.querySelector('.sr-only')?.textContent).toMatch(/italic|bold/);
		}
		expect(view.container.querySelector('[data-slot="1"] .sr-only')).toBeNull();
	});

	test('updates renamed voices in place and retains unresolved raw names', async () => {
		const parsed = documentWithVoices([
			['Verse', [voice('avery')]],
			['Chorus', [{ id: 'raw', performerIds: [], styleSlot: 1, rawNameText: 'Guest' }]],
			['Bridge', [{ id: 'other-raw', performerIds: [], styleSlot: 1, rawNameText: 'Other guest' }]]
		]);
		const view = await render(PerformerLegend, { document: parsed, performers });
		await fireEvent.click(view.container.querySelector('summary')!);
		await view.rerender({
			document: parsed,
			performers: [performer('avery', 'Avery Stone', 0), performers[1]]
		});
		expect(within(view.container).queryByText('Avery')).toBeNull();
		expect(within(view.container).getByText('Avery Stone')).toBeTruthy();
		expect(within(view.container).getByText('Guest')).toBeTruthy();
		expect(within(view.container).getByText('Other guest')).toBeTruthy();
		expect(within(view.container).getAllByRole('listitem')).toHaveLength(3);
		expect(view.container.querySelector('details')!.open).toBe(true);
	});

	test('omits the disclosure when no section names voices', async () => {
		const view = await render(PerformerLegend, {
			document: parseDocument('[Verse]\nA lyric'),
			performers
		});
		expect(view.container.querySelector('details')).toBeNull();
		expect(view.container.textContent?.trim()).toBe('');
	});
});
