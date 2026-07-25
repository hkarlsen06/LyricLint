import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '$lib/ui/styles/global.css';
import type { LanguagePack } from '$lib/core/types.js';
import SectionPicker from './SectionPicker.svelte';

const languagePack: LanguagePack = {
	tag: 'en',
	displayName: 'English',
	policy: 'localized',
	headers: [{ semanticPart: 'verse', terms: ['Verse'] }],
	sourceIds: [],
	reviewed: true
};

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

describe('SectionPicker dismissal', () => {
	it('cancels on a press outside, without pulling focus back to the editor', async () => {
		const onCancel = vi.fn();
		const returnFocus = vi.fn();
		await render(SectionPicker, {
			languagePack,
			range: { from: 0, to: 0 },
			onChoose: vi.fn(),
			onCancel,
			returnFocus
		});

		await userEvent.click(outside());

		expect(onCancel).toHaveBeenCalledTimes(1);
		// The press already chose where the user is working; returning focus here
		// would drag the caret out of it.
		expect(returnFocus).not.toHaveBeenCalled();
	});

	it('stays open for a press inside itself', async () => {
		const onCancel = vi.fn();
		await render(SectionPicker, {
			languagePack,
			range: { from: 0, to: 0 },
			onChoose: vi.fn(),
			onCancel,
			returnFocus: vi.fn()
		});

		await userEvent.click(document.querySelector<HTMLInputElement>('#ll-section-search')!);

		expect(onCancel).not.toHaveBeenCalled();
	});
});
