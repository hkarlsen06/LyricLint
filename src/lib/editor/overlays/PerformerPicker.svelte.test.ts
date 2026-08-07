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
		const track = document.querySelector<HTMLElement>('.roster__track');
		expect(track).not.toBeNull();
		expect(track!.scrollWidth).toBeGreaterThan(track!.clientWidth);
	});

	it('renders the apply action as the canonical contrast tier, not a local pill', async () => {
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			initialSelectedIds: ['leif tore'],
			allowRemoval: false,
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

	it('keeps the larger add control fixed beside a fading, scrollable track', async () => {
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			initialSelectedIds: ['leif tore'],
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => {},
			onAddPerformer: vi.fn()
		});
		await userEvent.click(page.getByRole('button', { name: 'Leif Tore' }));

		const roster = document.querySelector<HTMLElement>('.roster');
		const track = document.querySelector<HTMLElement>('.roster__track');
		const addSlot = document.querySelector<HTMLElement>('.add-slot');
		const add = document.querySelector<HTMLButtonElement>('.chip--add');
		const plus = add?.querySelector<SVGElement>('svg');
		expect(roster).not.toBeNull();
		expect(track).not.toBeNull();
		expect(addSlot).not.toBeNull();
		expect(add).not.toBeNull();
		expect(plus).not.toBeNull();
		expect(track!.scrollWidth).toBeGreaterThan(track!.clientWidth);
		await new Promise(requestAnimationFrame);
		expect(getComputedStyle(addSlot!, '::before').backgroundImage).not.toBe('none');
		expect(Number(getComputedStyle(add!).zIndex)).toBeGreaterThan(
			Number(getComputedStyle(addSlot!, '::before').zIndex)
		);
		expect(plus!.getBoundingClientRect().width).toBeGreaterThan(12);
		expect(track!.getBoundingClientRect().width).toBeLessThanOrEqual(
			Number.parseFloat(getComputedStyle(track!).maxWidth)
		);

		const initialLeft = addSlot!.getBoundingClientRect().left;
		track!.scrollLeft = track!.scrollWidth;
		await new Promise(requestAnimationFrame);
		expect(addSlot!.getBoundingClientRect().left).toBeCloseTo(initialLeft, 0);

		const dividerGap =
			document.querySelector<HTMLElement>('.actions')!.getBoundingClientRect().left -
			add!.getBoundingClientRect().right;
		expect(dividerGap).toBeLessThanOrEqual(6);
	});

	it('does not fade the preceding chip when the roster fits without scrolling', async () => {
		await render(PerformerPicker, {
			performers: crowdedRoster().slice(0, 1),
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => {},
			onAddPerformer: vi.fn()
		});

		const roster = document.querySelector<HTMLElement>('.roster');
		const track = document.querySelector<HTMLElement>('.roster__track');
		const addSlot = document.querySelector<HTMLElement>('.add-slot');
		expect(roster).not.toBeNull();
		expect(track).not.toBeNull();
		expect(addSlot).not.toBeNull();
		await new Promise(requestAnimationFrame);
		expect(track!.scrollWidth).toBeLessThanOrEqual(track!.clientWidth);
		expect(roster!.classList.contains('roster--scrollable')).toBe(false);
		expect(getComputedStyle(addSlot!, '::before').backgroundImage).toBe('none');
	});

	it('explains when clearing the main performer cannot remove any formatting', async () => {
		const onApply = vi.fn();
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			initialSelectedIds: ['leif tore'],
			removalAvailable: false,
			onApply,
			onCancel: vi.fn(),
			returnFocus: () => {}
		});

		await userEvent.click(page.getByRole('button', { name: 'Leif Tore' }));

		const action = page.getByRole('button', { name: 'Already plain text' });
		await expect.element(action).toBeDisabled();
		await expect
			.element(page.getByText('The main performer has no inline formatting to remove.'))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /Remove formatting/u }))
			.not.toBeInTheDocument();
		expect(onApply).not.toHaveBeenCalled();
	});

	it('keeps Apply gated until the performer selection actually changes', async () => {
		const onApply = vi.fn();
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			initialSelectedIds: ['leif tore'],
			onApply,
			onCancel: vi.fn(),
			returnFocus: () => {}
		});

		const apply = page.getByRole('button', { name: /Apply/u });
		await expect.element(apply).toBeDisabled();

		// Enter on the initially selected chip follows the same guarded path as
		// the button, so keyboard use cannot submit an unchanged assignment.
		await userEvent.keyboard('{Enter}');
		expect(onApply).not.toHaveBeenCalled();

		await userEvent.click(page.getByRole('button', { name: 'Lars Ulrik' }));
		await expect.element(apply).toBeEnabled();

		// Returning to the original set makes the action inert again.
		await userEvent.click(page.getByRole('button', { name: 'Lars Ulrik' }));
		await expect.element(apply).toBeDisabled();
		expect(onApply).not.toHaveBeenCalled();
	});

	it('does not show a keyboard hint beneath the picker', async () => {
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => {}
		});

		expect(page.getByText(/Alt\+P|Esc cancels|focus returns to editor/u).query()).toBeNull();
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

	// The card that opens itself off a pointer selection has been asked for
	// nothing, so it leaves the caret where the user put it — and drops the `↵`
	// with it, because Enter then belongs to the document rather than to this
	// card. `EditorPane.svelte.test.ts` pins the same pair end to end.
	it('takes no focus and promises no Enter when it opened uninvited', async () => {
		const elsewhere = outside();
		elsewhere.focus();
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			takesFocus: false,
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: vi.fn()
		});

		expect(document.activeElement).toBe(elsewhere);
		expect(document.querySelector('.apply__key')).toBeNull();
	});

	it('takes the focus and offers Enter when the press asked for it', async () => {
		outside().focus();
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: vi.fn()
		});

		expect(document.activeElement).toBe(document.querySelector('[data-picker-chip]'));
		expect(document.querySelector('.apply__key')).not.toBeNull();
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

describe('PerformerPicker selection state', () => {
	beforeAll(async () => {
		await page.viewport(900, 600);
	});

	afterAll(async () => {
		await page.viewport(414, 896);
	});

	it('carries selection on the chip itself rather than on a glyph appended to it', async () => {
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			initialSelectedIds: [],
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => {}
		});

		const chip = () => document.querySelectorAll<HTMLElement>('[data-picker-chip]')[0];
		const restingWidth = chip().getBoundingClientRect().width;
		// Read as strings, never held as a `CSSStyleDeclaration`: that object is a
		// *live* view of the element, so a "before" kept across the press reports
		// the state after it and the comparison below passes against itself.
		const restingBackground = getComputedStyle(chip()).backgroundColor;
		const restingBorder = getComputedStyle(chip()).borderTopColor;
		// Nothing is drawn behind an unpicked chip, so the fill below is a real
		// presence-against-absence rather than one tone against another.
		expect(restingBackground).toBe('rgba(0, 0, 0, 0)');

		await userEvent.click(page.getByRole('button', { name: 'Leif Tore' }));

		expect(chip().getAttribute('aria-pressed')).toBe('true');
		// Two cues, both surviving a greyscale print: a fill arrives, and the
		// border leaves the neutral control token for the performer's own colour.
		expect(getComputedStyle(chip()).backgroundColor).not.toBe(restingBackground);
		expect(getComputedStyle(chip()).borderTopColor).not.toBe(restingBorder);

		// The check glyph is gone. It is the reason this test measures width at
		// all: appended after the name, it grew the chip on being pressed and
		// shifted every chip after it along a row the pointer is working through.
		expect(chip().querySelector('svg')).toBeNull();
		expect(Math.abs(chip().getBoundingClientRect().width - restingWidth)).toBeLessThan(0.5);
	});
});

describe('PerformerPicker action width', () => {
	beforeAll(async () => {
		await page.viewport(900, 600);
	});

	afterAll(async () => {
		await page.viewport(414, 896);
	});

	/** The action's box for one set of labels, with the roster left untouched. */
	async function actionWidth(props: Record<string, unknown>): Promise<number> {
		const { unmount } = await render(PerformerPicker, {
			performers: crowdedRoster(),
			allowRemoval: false,
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => {},
			...props
		});
		const action = document.querySelector<HTMLElement>('.actions button');
		expect(action).not.toBeNull();
		const width = action!.getBoundingClientRect().width;
		unmount();
		return width;
	}

	it('holds one width across the three labels the two-voice flow rewrites', async () => {
		// Step one offers `Next`; step two offers `Skip` until somebody is picked
		// and `Apply` once one is. All three land in the same slot, at the end of
		// the row, so a width that follows the label drags the card's right edge
		// in and out while the reader is working along the roster — and moves the
		// target between deciding to press it and pressing it.
		const next = await actionWidth({ initialSelectedIds: ['leif tore'], applyLabel: 'Next' });
		const skip = await actionWidth({ initialSelectedIds: [], emptyApplyLabel: 'Skip' });
		const apply = await actionWidth({ initialSelectedIds: ['leif tore'], applyLabel: 'Apply' });

		expect(skip).toBeCloseTo(next, 1);
		expect(apply).toBeCloseTo(next, 1);

		// The floor has to be doing the work: if the widest of the three had grown
		// past it the three would still agree here while the min-width had
		// silently stopped mattering.
		const floor = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 5.25;
		expect(next).toBeCloseTo(floor, 0);
	});
});

describe('PerformerPicker step bar', () => {
	beforeAll(async () => {
		await page.viewport(900, 600);
	});

	afterAll(async () => {
		await page.viewport(414, 896);
	});

	it('holds one prompt width across the questions a two-step flow asks', async () => {
		// The two questions are different lengths, and the roster sits directly
		// beside them — so a prompt that sized itself to its own text slid every
		// chip along as the flow advanced.
		const widths: number[] = [];
		const bars: Array<{ bar: number; question: number }> = [];
		for (const [prompt, step] of [
			['Who sings this?', 1],
			['Who sings the rest?', 2]
		] as const) {
			const { unmount } = await render(PerformerPicker, {
				performers: crowdedRoster(),
				initialSelectedIds: [],
				prompt,
				step,
				stepCount: 2,
				onApply: vi.fn(),
				onCancel: vi.fn(),
				returnFocus: () => {}
			});
			const box = (selector: string) =>
				document.querySelector<HTMLElement>(selector)!.getBoundingClientRect().width;
			widths.push(box('.picker__prompt'));
			bars.push({ bar: box('.picker__steps'), question: box('.picker__question') });

			// The reached stops are the visual half; the sentence is the whole of
			// what a screen reader gets, since a run of empty spans says nothing.
			const stops = [...document.querySelectorAll('.picker__step')];
			expect(stops).toHaveLength(2);
			expect(stops.filter((s) => s.classList.contains('picker__step--done'))).toHaveLength(step);
			expect(document.querySelector('.picker__prompt .sr-only')?.textContent?.trim()).toBe(
				`Step ${step} of 2`
			);
			unmount();
		}

		expect(widths[1]).toBeCloseTo(widths[0], 1);
		// The bar spans the floored block rather than the words, so both steps draw
		// the same bar in the same place and only the fill moves.
		for (const { bar, question } of bars) expect(bar).toBeGreaterThanOrEqual(question);
	});

	it('draws no bar for a prompt that is not a step in a flow', async () => {
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			initialSelectedIds: ['leif tore'],
			prompt: 'Section voice · formatting removed',
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => {}
		});

		expect(document.querySelector('.picker__steps')).toBeNull();
		expect(document.querySelector('.picker__prompt .sr-only')).toBeNull();
	});

	it('drops the empty answer out of the contrast tier and puts it back on a real one', async () => {
		// `Skip` is a real answer but not the one the card is asking for, so it
		// must not be the loudest control on the surface — otherwise the card's
		// primary action advertises not answering the question.
		await render(PerformerPicker, {
			performers: crowdedRoster(),
			initialSelectedIds: [],
			allowRemoval: false,
			prompt: 'Who sings the rest?',
			step: 2,
			stepCount: 2,
			emptyApplyLabel: 'Skip',
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => {}
		});

		const action = () => document.querySelector<HTMLButtonElement>('.actions button')!;
		expect(action().textContent).toContain('Skip');
		expect(action().classList.contains('button')).toBe(true);
		expect(action().classList.contains('button--contrast')).toBe(false);
		// Still a real control: quiet is not disabled.
		expect(action().disabled).toBe(false);

		await userEvent.click(page.getByRole('button', { name: 'Leif Tore' }));

		expect(action().textContent).toContain('Apply');
		expect(action().classList.contains('button--contrast')).toBe(true);
	});
});
