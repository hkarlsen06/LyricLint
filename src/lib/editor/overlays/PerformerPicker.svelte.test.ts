import { page, userEvent } from 'vitest/browser';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
// Layout assertions need the real tokens: control heights, padding, and the
// card's max width all come from the design system.
import '../../ui/styles/global.css';
import type { PerformerRecord } from '../../core/types.js';
import PerformerPicker from './PerformerPicker.svelte';

/** Long names, as in a real roster, so the row runs out of room. */
function crowdedRoster(): PerformerRecord[] {
	return ['Leif Tore', 'Lars Ulrik', 'Leif Terje', 'Unresolved'].map((displayName, order) => ({
		id: displayName.toLocaleLowerCase(),
		displayName,
		normalizedKey: displayName.toLocaleLowerCase(),
		aliases: [],
		colorId: `color-${order}`,
		order
	}));
}

describe('PerformerPicker layout', () => {
	beforeAll(async () => {
		// Wide enough to stay clear of the narrow-viewport rule that wraps the
		// row; the overflow only happens while everything shares one line.
		await page.viewport(900, 600);
	});

	afterAll(async () => {
		await page.viewport(414, 896);
	});

	it('keeps the action button inside the card when the roster fills the row', async () => {
		// Regression: the actions box shrank under its own button, so the widest
		// label ("Remove formatting") hung outside the card's rounded edge. The
		// roster is the part that gives way — it scrolls.
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			initialSelectedIds: ['leif tore'],
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => {},
			onAddPerformer: vi.fn()
		});
		// Deselecting the last performer swaps in the removal label, the widest one.
		await userEvent.click(page.getByRole('button', { name: 'Leif Tore' }));
		await expect.element(page.getByRole('button', { name: /Remove formatting/u })).toBeVisible();

		const card = document.querySelector<HTMLElement>('.picker');
		const action = document.querySelector<HTMLElement>('.actions button');
		expect(card).not.toBeNull();
		expect(action).not.toBeNull();
		const cardBox = card!.getBoundingClientRect();
		const actionBox = action!.getBoundingClientRect();
		expect(actionBox.right).toBeLessThanOrEqual(cardBox.right);
		expect(actionBox.left).toBeGreaterThanOrEqual(cardBox.left);
		// The chips take the squeeze instead, which is what the scroller is for.
		const roster = document.querySelector<HTMLElement>('.roster');
		expect(roster!.scrollWidth).toBeGreaterThan(roster!.clientWidth);
	});
});
