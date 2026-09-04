import { page } from 'vitest/browser';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { LinkDifference } from '$lib/core/types.js';
import type { LinkOccurrence } from '../section-links.js';
import SectionLinkPicker from './SectionLinkPicker.svelte';

const occurrences: LinkOccurrence[] = [
	{
		headerFrom: 0,
		line: 1,
		label: 'Chorus',
		ordinal: 1,
		sameKind: true,
		comparison: 'source'
	},
	{
		headerFrom: 20,
		line: 12,
		label: 'Chorus 2',
		ordinal: 2,
		sameKind: true,
		comparison: 'different'
	},
	{
		headerFrom: 40,
		line: 24,
		label: 'Chorus 3',
		ordinal: 3,
		sameKind: true,
		comparison: 'different'
	}
];

const differences: LinkDifference[] = [
	{
		index: 0,
		wordings: occurrences.map((occurrence, index) => ({
			headerFrom: occurrence.headerFrom,
			before: 'And I will be there ',
			text: ['tonight', 'again', 'when morning comes'][index] ?? '',
			after: ''
		}))
	}
];

describe('SectionLinkPicker placement', () => {
	beforeAll(async () => {
		await page.viewport(900, 600);
	});

	afterAll(async () => {
		await page.viewport(414, 896);
	});

	it('uses the open column to the right and keeps the bottom switch reachable', async () => {
		const onTypeOnlyHere = vi.fn(() => true);
		const anchor = { left: 40, right: 160, top: 460, bottom: 480, width: 120, height: 20 };
		await render(SectionLinkPicker, {
			props: {
				occurrences,
				currentHeaderFrom: 0,
				initialSelected: [20, 40],
				differencesFor: () => differences,
				typeOnlyHereAvailable: true,
				typeOnlyHereActive: false,
				takesFocus: false,
				anchor,
				placement: 'below',
				onApply: vi.fn(),
				onTypeOnlyHere,
				onCancel: vi.fn(),
				returnFocus: vi.fn()
			}
		});

		const card = page.getByRole('dialog', { name: 'Link this chorus' });
		await expect.element(card).toBeVisible();
		const cardBox = (await card.element()).getBoundingClientRect();
		expect(cardBox.left).toBeGreaterThanOrEqual(anchor.right + 6);
		expect(cardBox.bottom).toBeLessThanOrEqual(window.innerHeight - 8);

		const sectionOnly = page.getByRole('switch', { name: /Edit this section only/ });
		await sectionOnly.click();
		await expect.element(sectionOnly).toHaveAttribute('aria-checked', 'true');
		expect(onTypeOnlyHere).toHaveBeenCalledOnce();
	});

	it('caps the below fallback when the right column is too narrow', async () => {
		await render(SectionLinkPicker, {
			props: {
				occurrences,
				currentHeaderFrom: 0,
				initialSelected: [20, 40],
				differencesFor: () => differences,
				typeOnlyHereAvailable: true,
				typeOnlyHereActive: false,
				takesFocus: false,
				anchor: { left: 700, right: 840, top: 460, bottom: 480, width: 140, height: 20 },
				placement: 'below',
				onApply: vi.fn(),
				onTypeOnlyHere: vi.fn(() => true),
				onCancel: vi.fn(),
				returnFocus: vi.fn()
			}
		});

		const card = page.getByRole('dialog', { name: 'Link this chorus' });
		await expect.element(card).toBeVisible();
		const cardBox = (await card.element()).getBoundingClientRect();
		expect(cardBox.top).toBe(486);
		expect(cardBox.bottom).toBeLessThanOrEqual(window.innerHeight - 8);
	});
});
