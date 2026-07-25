import { page, userEvent } from 'vitest/browser';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
// Layout assertions need the real tokens: control heights, padding, and the
// card's max width all come from the design system.
import '$lib/ui/styles/global.css';
import type { PerformerRecord } from '$lib/core/types.js';
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

	it('renders the apply action as the canonical contrast tier, not a local pill', async () => {
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			initialSelectedIds: ['leif tore'],
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => {}
		});

		const action = document.querySelector<HTMLElement>('.actions button');
		expect(action).not.toBeNull();
		// The tier comes from the global classes, not a scoped re-derivation.
		expect(action!.classList.contains('button')).toBe(true);
		expect(action!.classList.contains('button--contrast')).toBe(true);

		// The recipe matches controls.css exactly — the drifted local copy
		// (hover mixed toward transparent, pill silhouette) is gone.
		const probe = document.createElement('button');
		probe.className = 'button button--contrast';
		document.body.append(probe);
		const probeStyle = getComputedStyle(probe);
		const actionStyle = getComputedStyle(action!);
		expect(actionStyle.backgroundColor).toBe(probeStyle.backgroundColor);
		expect(actionStyle.color).toBe(probeStyle.color);
		expect(actionStyle.borderTopColor).toBe(probeStyle.borderTopColor);
		expect(actionStyle.borderTopLeftRadius).toBe(probeStyle.borderTopLeftRadius);
		probe.remove();

		// Pill radii belong to the categorical chips alone.
		const chip = document.querySelector<HTMLElement>('.roster .chip');
		expect(actionStyle.borderTopLeftRadius).not.toBe(getComputedStyle(chip!).borderTopLeftRadius);
	});
});

describe('PerformerPicker dismissal', () => {
	/** Something to press that is unmistakably not part of the picker. */
	function outside(): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = 'Elsewhere';
		button.dataset.outside = '';
		// Pinned to a corner so the picker cannot sit under the pointer instead.
		button.style.cssText = 'position: fixed; right: 0; bottom: 0; z-index: 100;';
		document.body.append(button);
		return button;
	}

	afterEach(() => {
		for (const node of document.querySelectorAll('[data-outside]')) {
			node.remove();
		}
	});

	it('cancels on a press outside, without pulling focus back to the editor', async () => {
		const onCancel = vi.fn();
		const returnFocus = vi.fn();
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			onApply: vi.fn(),
			onCancel,
			returnFocus
		});

		await userEvent.click(outside());

		expect(onCancel).toHaveBeenCalledTimes(1);
		// The press already chose where the user is working; returning focus here
		// would drag the caret out of it.
		expect(returnFocus).not.toHaveBeenCalled();
	});

	it('stays open while the pointer works inside the card', async () => {
		const onCancel = vi.fn();
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			onApply: vi.fn(),
			onCancel,
			returnFocus: vi.fn()
		});

		await userEvent.click(page.getByRole('button', { name: 'Leif Tore' }));

		expect(onCancel).not.toHaveBeenCalled();
	});
});
