import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';
import type { LinkDifference } from '$lib/core/types.js';
import type { LinkOccurrence } from '$lib/editor/section-links.js';
import LinkingDetail from './LinkingDetail.svelte';

const occurrences: LinkOccurrence[] = [
	{ headerFrom: 0, line: 1, label: 'Chorus', ordinal: 1, sameKind: true, comparison: 'source' },
	{
		headerFrom: 20,
		line: 12,
		label: 'Chorus 2',
		ordinal: 2,
		sameKind: true,
		comparison: 'different'
	},
	{ headerFrom: 40, line: 24, label: 'Chorus 3', ordinal: 3, sameKind: true, comparison: 'same' }
];
function difference(
	index: number,
	texts: string[],
	before = 'A distant earlier line\nI’ll be waiting ',
	after = ' for you\nA distant later line'
): LinkDifference {
	return {
		index,
		wordings: occurrences.map((item, i) => ({
			headerFrom: item.headerFrom,
			from: item.headerFrom + before.length,
			before,
			text: texts[i] ?? '',
			after
		}))
	};
}
const differences = [
	difference(0, ['here', 'there', 'here']),
	difference(1, ['tonight', 'again', 'tonight'])
];
async function setup(
	extra: Partial<ComponentProps<typeof LinkingDetail>> = {},
	choosePeers = true,
	reviewWording = true
) {
	const onApply = vi.fn();
	const onBack = vi.fn();
	const view = await render(LinkingDetail, {
		occurrences,
		currentHeaderFrom: 0,
		differencesFor: (headers) =>
			differences.map((item) => ({
				...item,
				wordings: item.wordings.filter((wording) => headers.includes(wording.headerFrom))
			})),
		onApply,
		onBack,
		...extra
	});
	if (!extra.fromOverview && !extra.initialSelected?.length && choosePeers) {
		await page.getByRole('checkbox', { name: /^Chorus 2/ }).click();
		await page.getByRole('checkbox', { name: /^Chorus 3/ }).click();
	}
	if (reviewWording && view.container.querySelector('button[aria-expanded="false"]')) {
		await page.getByRole('button', { name: 'Review differences', exact: true }).click();
		await page.getByRole('button', { name: 'Choose wording per difference', exact: true }).click();
	}
	return { onApply, onBack, view };
}
function originals(container: HTMLElement, index: number): (string | null)[] {
	return [
		...container.querySelectorAll('.difference')[index]!.querySelectorAll('.lyrics--original')
	].map((element) =>
		[...element.querySelectorAll('.lyric-text')].map((line) => line.textContent).join('\n')
	);
}
function chooseSecond(index = 1, count = 3) {
	return page.getByRole('checkbox', {
		name: `Use Chorus 2 wording for difference ${index} in all ${count} sections`
	});
}

describe('LinkingDetail', () => {
	it('keeps an explicitly opened section locked and preserves wording by default', async () => {
		const { onApply, view } = await setup({}, false);
		await expect
			.element(page.getByRole('button', { name: 'Link sections', exact: true }))
			.toBeDisabled();
		await expect.element(page.getByRole('checkbox', { name: /^Chorus 1/ })).toBeDisabled();
		await expect.element(page.getByRole('checkbox', { name: /^Chorus 2/ })).not.toBeChecked();
		await page.getByRole('checkbox', { name: /^Chorus 2/ }).click();
		await page.getByRole('checkbox', { name: /^Chorus 3/ }).click();
		expect(view.container.textContent).toContain('Same lyrics');
		expect(view.container.textContent).toContain('Differs');
		expect(view.container.querySelector('.difference')).toBeNull();
		expect(view.container.querySelector('[role="dialog"]')).toBeNull();
		expect(view.container.querySelector('input[type="radio"]')).toBeNull();
		await expect
			.element(page.getByRole('button', { name: 'Review differences', exact: true }))
			.toBeVisible();
		await page
			.getByRole('button', { name: /^(Link 3 sections|Keep differences and link)$/ })
			.click();
		expect(onApply).toHaveBeenCalledWith({
			headers: [0, 20, 40],
			keepDifferent: [true, true],
			replaceFromByDifference: [undefined, undefined]
		});
	});

	it('shows read-only differences before the decisions and enables optional wording controls', async () => {
		const { view } = await setup({}, true, false);
		expect(view.container.querySelector('.difference')).toBeNull();
		expect(view.container.querySelector('input[type="radio"]')).toBeNull();
		const apply = view.container.querySelector<HTMLButtonElement>('.actions .button--contrast')!;
		const before = apply.getBoundingClientRect().top - view.container.getBoundingClientRect().top;
		await page.getByRole('button', { name: 'Review differences', exact: true }).click();
		expect(view.container.querySelector('.actions .button--contrast')).toBe(apply);
		expect(apply.getBoundingClientRect().top - view.container.getBoundingClientRect().top).toBe(
			before
		);
		const policy = view.container.querySelector('.approach-picker')!;
		expect(policy.getBoundingClientRect().top).toBeGreaterThan(
			apply.getBoundingClientRect().bottom
		);
		expect(view.container.querySelectorAll('.difference')).toHaveLength(2);
		expect(view.container.querySelector('.version__choice input')).toBeNull();
		expect(policy.getBoundingClientRect().top).toBeGreaterThan(
			view.container.querySelector('.differences')!.getBoundingClientRect().bottom
		);
		expect(view.container.querySelector('input[type=radio]')).toBeNull();
		for (const label of ['Choose wording per difference', 'Use one section’s full version']) {
			await expect
				.element(page.getByRole('button', { name: label, exact: true }))
				.toHaveAttribute('aria-pressed', 'false');
		}
		await page.getByRole('button', { name: 'Choose wording per difference', exact: true }).click();
		expect(view.container.querySelectorAll('.version__choice input[type=checkbox]')).toHaveLength(
			4
		);
		expect(view.container.querySelector('.version__choose')).toBeNull();
		expect(view.container.textContent).not.toContain('As written');
		await expect
			.element(page.getByRole('button', { name: 'Choose wording per difference', exact: true }))
			.toHaveFocus();
		expect(view.container.querySelectorAll('.version')).toHaveLength(4);
		expect(view.container.querySelectorAll('.difference')).toHaveLength(2);
		expect(
			[...view.container.querySelector('.version')!.querySelectorAll('h5')].map((element) =>
				element.textContent?.trim()
			)
		).toEqual(['Chorus 1 & 3']);
		expect(originals(view.container, 0)).toEqual([
			'I’ll be waiting here for you',
			'I’ll be waiting there for you'
		]);
		expect(originals(view.container, 1)).toEqual([
			'I’ll be waiting tonight for you',
			'I’ll be waiting again for you'
		]);
		await expect
			.element(page.getByRole('heading', { name: 'Difference 1', exact: true }))
			.toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: 'Difference 2', exact: true }))
			.toBeVisible();
		expect(view.container.querySelector('.differences [aria-expanded]')).toBeNull();
		await expect
			.element(page.getByRole('button', { name: 'Choose wording per difference' }))
			.toHaveAttribute('aria-pressed', 'true');
		view.container.querySelector('.actions')!.scrollIntoView({ block: 'center' });
		await expect
			.element(page.getByRole('button', { name: 'Hide differences', exact: true }))
			.toBeEnabled();
		await expect
			.element(page.getByRole('button', { name: 'Review differences', exact: true }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Hide differences', exact: true }).click();
		await page.getByRole('button', { name: 'Review differences', exact: true }).click();
		expect(view.container.querySelectorAll('.difference')).toHaveLength(2);
		expect(view.container.querySelector('.version__choice input')).toBeNull();
		await expect
			.element(page.getByRole('button', { name: 'Choose wording per difference' }))
			.toHaveAttribute('aria-pressed', 'false');
	});

	it('transfers the linking action below a long read-only diff without moving its footer', async () => {
		const { view, onApply } = await setup({ fromOverview: true }, false, false);
		view.container.style.width = '320px';
		view.container.style.height = '360px';
		view.container.style.overflow = 'auto';
		await page.getByRole('button', { name: 'Review differences', exact: true }).click();
		const footer = view.container.querySelector<HTMLElement>('.footer-actions')!;
		expect(footer.textContent).not.toContain('Hide differences');
		expect(view.container.querySelector('.approach-picker h3')?.textContent).toBe(
			'What would you like to do?'
		);
		const primary = footer.querySelector<HTMLButtonElement>('.button--contrast')!;
		const height = footer.getBoundingClientRect().height;
		expect(primary.getBoundingClientRect().width).toBe(footer.getBoundingClientRect().width);
		footer.scrollIntoView({ block: 'center' });
		await expect
			.element(page.getByRole('button', { name: 'Keep differences and link', exact: true }))
			.toBeVisible();
		expect(view.container.querySelector('.actions')?.querySelector('[inert]')).not.toBeNull();
		expect(footer.getBoundingClientRect().height).toBe(height);
		expect(view.container.querySelector('.version__choice input')).toBeNull();
		await userEvent.click(primary);
		expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ keepDifferent: [true, true] }));
	});

	it('keeps pending wording edits visible until they are cancelled before leaving review', async () => {
		const { onApply, view } = await setup({ fromOverview: true });
		await page.getByRole('button', { name: 'Use one section’s full version' }).click();
		await page.getByRole('radio', { name: 'Use Chorus 2’s full version' }).click();
		await expect
			.element(page.getByRole('button', { name: 'Hide differences', exact: true }))
			.not.toBeInTheDocument();
		expect(view.container.querySelectorAll('del')).toHaveLength(2);
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		view.container.querySelector('.actions')!.scrollIntoView({ block: 'center' });
		await expect
			.element(page.getByRole('button', { name: 'Hide differences', exact: true }))
			.toBeEnabled();
		await page.getByRole('button', { name: 'Hide differences', exact: true }).click();
		await expect
			.element(page.getByRole('button', { name: 'Review differences', exact: true }))
			.toHaveFocus();
		expect(view.container.querySelector('.difference')).toBeNull();
		expect(view.container.querySelector('input[type="radio"]')).toBeNull();
		await page
			.getByRole('button', { name: /^(Link 3 sections|Keep differences and link)$/ })
			.click();
		expect(onApply).toHaveBeenCalledWith(
			expect.objectContaining({
				keepDifferent: [true, true],
				replaceFromByDifference: [undefined, undefined]
			})
		);
	});

	it('compares an overview group without inventing a source and allows deselecting its representative', async () => {
		const { onApply, view } = await setup({
			fromOverview: true,
			typeOnlyHereAvailable: true,
			onTypeOnlyHere: vi.fn()
		});
		await expect.element(page.getByRole('heading', { name: 'Link sections' })).toBeVisible();
		expect(view.container.textContent).not.toContain('This section');
		expect(view.container.querySelector('[role="switch"]')).toBeNull();
		for (const number of [1, 2, 3])
			await expect
				.element(page.getByRole('checkbox', { name: new RegExp(`^Chorus ${number}`) }))
				.toBeChecked();
		const representative = page.getByRole('checkbox', { name: /^Chorus 1/ });
		await expect.element(representative).toBeEnabled();
		await representative.click();
		await page.getByRole('button', { name: 'Link 2 sections', exact: true }).click();
		expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ headers: [20, 40] }));
		await page.getByRole('checkbox', { name: /^Chorus 2/ }).click();
		await expect
			.element(page.getByRole('button', { name: 'Link sections', exact: true }))
			.toBeDisabled();
		await expect
			.element(page.getByRole('button', { name: 'Unlink this section' }))
			.not.toBeInTheDocument();
	});

	it('opens existing groups on their actual members and an explicit compared row on its exact members', async () => {
		const { view } = await setup({ fromOverview: true, initialSelected: [20] });
		await expect
			.element(page.getByRole('heading', { name: 'Manage linked sections' }))
			.toBeVisible();
		await expect.element(page.getByRole('checkbox', { name: /^Chorus 3/ })).not.toBeChecked();
		expect(view.container.textContent).not.toContain('This section');
	});

	it('uses comparedHeaders as preview selection independently of existing membership', async () => {
		const { onApply } = await setup({
			fromOverview: true,
			initialSelected: [20],
			comparedHeaders: [0, 20, 40]
		});
		await expect.element(page.getByRole('checkbox', { name: /^Chorus 3/ })).toBeChecked();
		await page.getByRole('button', { name: 'Update links', exact: true }).click();
		expect(onApply).toHaveBeenCalledWith(
			expect.objectContaining({ headers: [0, 20, 40], keepDifferent: [true, true] })
		);
	});

	it('keeps adjacent-line differences separate without implying the next line has lost its ad-lib', async () => {
		const adjacent = [
			difference(0, ['tight', 'close', 'tight'], '\nHold me ', '\nCarry me home '),
			difference(1, ['', '(Oh)', ''], '\nCarry me home ', '\nKeep going')
		];
		const { view } = await setup({ differencesFor: () => adjacent });
		expect(originals(view.container, 0)).toEqual(['Hold me tight', 'Hold me close']);
		expect(originals(view.container, 1)).toEqual(['Carry me home ', 'Carry me home (Oh)']);
	});

	it('marks context cut off by another difference on the same lyric line', async () => {
		const sameLine = [
			difference(0, ['me', 'us', 'me'], '\nHold ', ' close '),
			difference(1, ['tonight', 'forever', 'tonight'], ' close ', '\nKeep going')
		];
		const { view } = await setup({ differencesFor: () => sameLine });
		expect(originals(view.container, 0)).toEqual(['Hold me close …', 'Hold us close …']);
		expect(originals(view.container, 1)).toEqual(['… close tonight', '… close forever']);
	});

	it('preserves multiline variations and flags an adjacent line ending at another difference', async () => {
		const multiline = [
			difference(
				0,
				['tight\nAll through the night', 'close', 'tight\nAll through the night'],
				'\nHold me ',
				'\nCarry me home '
			),
			difference(1, ['', '(Oh)', ''], '\nCarry me home ', '\nKeep going')
		];
		const { view } = await setup({ differencesFor: () => multiline });
		expect(originals(view.container, 0)).toEqual([
			'Hold me tight\nAll through the night\nCarry me home …',
			'Hold me close\nCarry me home …'
		]);
		await chooseSecond().click();
		expect([...view.container.querySelectorAll('del')].map((part) => part.textContent)).toEqual([
			'tight',
			'All through the night'
		]);
		expect(view.container.querySelector('ins')?.textContent).toBe('close');
	});

	it('previews individual changes without replacing the original source alternatives', async () => {
		const { onApply, view } = await setup({ initialSelected: [20, 40] });
		const first = page.getByRole('checkbox', {
			name: 'Use Chorus 1 & 3 wording for difference 1 in all 3 sections'
		});
		await first.click();
		await expect.element(first).toBeChecked();
		await chooseSecond().click();
		await expect.element(first).not.toBeChecked();
		await expect.element(chooseSecond(2)).not.toBeChecked();
		expect(originals(view.container, 0)).toEqual([
			'I’ll be waiting here for you',
			'I’ll be waiting there for you'
		]);
		expect(view.container.querySelector('del')?.textContent).toBe('here');
		expect(view.container.querySelector('ins')?.textContent).toBe('there');
		expect(
			[...view.container.querySelector('.version')!.querySelectorAll('h5')].map((element) =>
				element.textContent?.trim()
			)
		).toEqual(['Chorus 1 & 3']);
		await expect.element(chooseSecond()).toBeChecked();
		await chooseSecond().click();
		expect(view.container.querySelector('del')).toBeNull();
		await expect
			.element(page.getByRole('button', { name: 'Choose wording per difference' }))
			.toHaveAttribute('aria-pressed', 'true');
		await chooseSecond().click();
		await page.getByRole('button', { name: 'Apply 1 change', exact: true }).click();
		expect(onApply).toHaveBeenCalledWith({
			headers: [0, 20, 40],
			keepDifferent: [false, true],
			replaceFromByDifference: [20, undefined]
		});
	});

	it('chooses a complete version visibly and applies every difference from that section', async () => {
		const { onApply, view } = await setup({ fromOverview: true });
		expect(view.container.querySelector('select')).toBeNull();
		await page.getByRole('button', { name: 'Use one section’s full version' }).click();
		await page.getByRole('radio', { name: 'Use Chorus 2’s full version' }).click();
		expect(
			[...view.container.querySelectorAll('del')].map((element) => element.textContent)
		).toEqual(['here', 'tonight']);
		expect(
			[...view.container.querySelectorAll('ins')].map((element) => element.textContent)
		).toEqual(['there', 'again']);
		await page.getByRole('button', { name: 'Link and apply 2 changes', exact: true }).click();
		expect(onApply).toHaveBeenCalledWith({
			headers: [0, 20, 40],
			keepDifferent: [false, false],
			replaceFromByDifference: [20, 20]
		});
	});

	it('keeps the two approaches exclusive and clears pending choices when switching', async () => {
		const { view, onApply } = await setup();
		await chooseSecond().click();
		await page.getByRole('button', { name: 'Use one section’s full version' }).click();
		expect(view.container.querySelector('.version__choice input')).toBeNull();
		await expect
			.element(page.getByRole('button', { name: /^(Link 3 sections|Keep differences and link)$/ }))
			.toBeDisabled();
		await page.getByRole('radio', { name: 'Use Chorus 2’s full version' }).click();
		await expect.element(page.getByRole('heading', { name: 'Replacement preview' })).toBeVisible();
		expect(view.container.querySelector('.version__choice input')).toBeNull();
		await page.getByRole('button', { name: 'Choose wording per difference' }).click();
		expect(view.container.querySelector('del')).toBeNull();
		await expect.element(chooseSecond()).not.toBeChecked();
		await chooseSecond(2).click();
		await page.getByRole('button', { name: 'Link and apply 1 change', exact: true }).click();
		expect(onApply).toHaveBeenCalledWith(
			expect.objectContaining({
				keepDifferent: [true, false],
				replaceFromByDifference: [undefined, 20]
			})
		);
	});

	it('places navigation on lyric lines and preserves the pending wording choice', async () => {
		const onNavigateLyric = vi.fn();
		const { view } = await setup({ onNavigateLyric, documentText: 'x\n'.repeat(100) });
		await chooseSecond().click();
		const firstDifference = view.container.querySelector('.difference')!;
		expect(firstDifference.querySelector('.version__choice button')).toBeNull();
		const link = firstDifference.querySelector<HTMLButtonElement>(
			'.lyrics--preview button, .wording-preview :not(.layout-measure) button'
		)!;
		expect(link.closest('.excerpt__line')?.querySelector('.lyric-text')).not.toBeNull();
		await userEvent.click(link);
		expect(onNavigateLyric).toHaveBeenCalled();
		await expect.element(chooseSecond()).toBeChecked();
	});

	it('treats an absent phrase in a populated copy as a valid removal', async () => {
		const { onApply, view } = await setup({
			differencesFor: () => [difference(0, ['(hey)', '', '(hey)'])]
		});
		expect(view.container.textContent).not.toContain('No words in the original');
		expect(view.container.querySelector('.absence')).toBeNull();
		await chooseSecond().click();
		expect(view.container.querySelector('del')?.textContent).toBe('(hey)');
		expect(view.container.querySelector('ins')).toBeNull();
		await page.getByRole('button', { name: 'Link and apply 1 change', exact: true }).click();
		expect(onApply).toHaveBeenCalledWith(
			expect.objectContaining({ keepDifferent: [false], replaceFromByDifference: [20] })
		);
	});

	it('names and displays an empty section fill without offering the empty source as a winner', async () => {
		const { onApply, view } = await setup(
			{
				occurrences: occurrences.map((item) =>
					item.headerFrom === 20 ? { ...item, comparison: 'empty' } : item
				),
				differencesFor: () => [
					difference(0, ['\nHold on\nStay close', '', '\nHold on\nStay close'])
				]
			},
			true,
			false
		);
		await expect
			.element(
				page.getByText('Fill Chorus 2 with Chorus 1’s lyrics and link them.', { exact: true })
			)
			.toBeVisible();
		expect([...view.container.querySelectorAll('ins')].map((part) => part.textContent)).toEqual([
			'Hold on',
			'Stay close'
		]);
		await expect.element(chooseSecond()).not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Fill Chorus 2 and link', exact: true }).click();
		expect(onApply).toHaveBeenCalledWith(
			expect.objectContaining({ keepDifferent: [false], replaceFromByDifference: [0] })
		);
	});

	it('clears pending wording decisions when membership changes', async () => {
		const { onApply, view } = await setup();
		await page.getByRole('button', { name: 'Use one section’s full version' }).click();
		await page.getByRole('radio', { name: 'Use Chorus 2’s full version' }).click();
		await page.getByRole('checkbox', { name: /^Chorus 2/ }).click();
		expect(view.container.querySelector('del')).toBeNull();
		await page.getByRole('button', { name: 'Link 2 sections', exact: true }).click();
		expect(onApply).toHaveBeenCalledWith(
			expect.objectContaining({ headers: [0, 40], keepDifferent: [true, true] })
		);
	});

	it('uses native keyboard buttons without treating Enter on Back as apply', async () => {
		const { onApply, onBack } = await setup();
		(await page.getByRole('button', { name: '← Back to linking' }).element()).focus();
		await userEvent.keyboard('{Enter}');
		expect(onBack).toHaveBeenCalledOnce();
		expect(onApply).not.toHaveBeenCalled();
	});

	it('keeps the explicit section-only switch and working keyboard disclosure', async () => {
		const onTypeOnlyHere = vi.fn();
		await setup({
			currentHeaderFrom: 20,
			initialSelected: [0, 40],
			typeOnlyHereAvailable: true,
			typeOnlyHereActive: true,
			onTypeOnlyHere
		});
		await expect.element(page.getByRole('heading', { name: 'Manage Chorus 2' })).toBeVisible();
		await expect
			.element(page.getByRole('checkbox', { name: /^Chorus 2 This section/ }))
			.toBeDisabled();
		const control = page.getByRole('switch', { name: 'Edit this section only' });
		await expect.element(control).toHaveAttribute('aria-checked', 'true');
		expect((await control.element()).getAttribute('aria-keyshortcuts')).toMatch(/Shift\+L/);
		await control.click();
		expect(onTypeOnlyHere).toHaveBeenCalledOnce();
		(await control.element()).focus();
		const mac = /Mac|iPhone|iPad|iPod/iu.test(navigator.platform);
		await userEvent.keyboard(
			mac ? '{Meta>}{Shift>}l{/Shift}{/Meta}' : '{Control>}{Shift>}l{/Shift}{/Control}'
		);
		expect(onTypeOnlyHere).toHaveBeenCalledTimes(2);
	});

	it('keeps actions and every version anchored across long multiline previews and cancellation', async () => {
		const { view } = await setup({
			differencesFor: () => [
				difference(0, [
					'here',
					'across a very long winding road\nThrough the night and into the morning',
					'here'
				]),
				difference(1, ['tonight', 'again', 'tonight'])
			]
		});
		view.container.style.width = '300px';
		await document.fonts.ready;
		const positions = () =>
			[
				...view.container.querySelectorAll(
					'.actions, .actions > button, .approach-choice, .difference, .version__choice'
				)
			].map((element) => {
				const rect = element.getBoundingClientRect();
				const root = view.container.getBoundingClientRect();
				return [rect.x - root.x, rect.y - root.y, rect.width, rect.height];
			});
		const before = positions();
		await chooseSecond().click();
		expect(positions()).toEqual(before);
		await chooseSecond().click();
		expect(positions()).toEqual(before);
		await chooseSecond().click();
		await chooseSecond(2).click();
		expect(positions()).toEqual(before);
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		expect(positions()).toEqual(before);
		expect(view.container.querySelectorAll('.difference')).toHaveLength(2);
		expect(view.container.querySelector('del')).toBeNull();
	});

	it('keeps Cancel available alongside the decision while keeping chosen members', async () => {
		const { view } = await setup();
		const divider = view.container.querySelector<HTMLElement>('.choice-divider')!;
		const height = divider.getBoundingClientRect().height;
		expect(divider.querySelector('[aria-hidden="true"]')).toBeNull();
		await chooseSecond().click();
		expect(divider.querySelector('span')?.getAttribute('aria-hidden')).toBe('true');
		expect(divider.getBoundingClientRect().height).toBe(height);
		const apply = await page
			.getByRole('button', { name: 'Link and apply 1 change', exact: true })
			.element();
		await expect.element(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
		const cancel = await page.getByRole('button', { name: 'Cancel', exact: true }).element();
		expect(cancel.closest('.linking-detail')).toBe(apply.closest('.linking-detail'));
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		expect(view.container.querySelector('del')).toBeNull();
		expect(divider.querySelector('[aria-hidden="true"]')).toBeNull();
		expect(divider.getBoundingClientRect().height).toBe(height);
		await expect
			.element(page.getByRole('button', { name: /^(Link 3 sections|Keep differences and link)$/ }))
			.toBeEnabled();
	});

	it('unlinks an explicitly opened section when every peer is removed without changing text', async () => {
		const { onApply } = await setup({ initialSelected: [20, 40] });
		await page.getByRole('checkbox', { name: /^Chorus 2/ }).click();
		await page.getByRole('checkbox', { name: /^Chorus 3/ }).click();
		await page.getByRole('button', { name: 'Unlink this section', exact: true }).click();
		expect(onApply).toHaveBeenCalledWith({
			headers: [0],
			keepDifferent: [],
			replaceFromByDifference: []
		});
	});
});
