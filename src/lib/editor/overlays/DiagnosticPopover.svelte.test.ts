import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
// Tier assertions need the real tokens: the canonical contrast recipe lives in
// controls.css and these tests compare against it, not against literals.
import '$lib/ui/styles/global.css';
import type { Diagnostic } from '$lib/core/types.js';
import DiagnosticPopover from './DiagnosticPopover.svelte';

function fixableDiagnostic(): Diagnostic {
	return {
		ruleId: 'punctuation.trailing',
		severity: 'warning',
		message: 'Trailing punctuation',
		explanation: 'Genius lyrics omit trailing commas.',
		sourceIds: [],
		from: 0,
		to: 4,
		fixes: [
			{
				kind: 'safe',
				label: 'Remove the comma',
				edit: { baseRevision: 0, edits: [{ from: 0, to: 4, insert: 'Test' }] }
			}
		]
	};
}

function reviewDiagnostic(): Diagnostic {
	return {
		ruleId: 'section.header-unrecognized',
		severity: 'manual-review',
		message: 'Unrecognized header',
		explanation: 'This header is not in the vocabulary.',
		sourceIds: [],
		from: 0,
		to: 4
	};
}

function renderPopover(diagnostic: Diagnostic) {
	return render(DiagnosticPopover, {
		diagnostic,
		onPreviewFix: vi.fn(),
		onCancelPreview: vi.fn(),
		onApplyFix: vi.fn(),
		onIgnore: vi.fn()
	});
}

/** Computed style of a pristine `.button button--contrast` for comparison. */
function withContrastProbe<T>(use: (probe: CSSStyleDeclaration) => T): T {
	const probe = document.createElement('button');
	probe.className = 'button button--contrast';
	document.body.append(probe);
	try {
		return use(getComputedStyle(probe));
	} finally {
		probe.remove();
	}
}

describe('DiagnosticPopover button tiers', () => {
	it('renders fix buttons as the canonical contrast tier, not a local recipe', async () => {
		await renderPopover(fixableDiagnostic());

		const fix = document.querySelector<HTMLElement>('.diagnostic-actions__fix');
		expect(fix).not.toBeNull();
		// Shared with the linter panel's card: the button is the fix's own label.
		expect(fix!.textContent?.trim()).toBe('Remove the comma');
		expect(fix!.classList.contains('button')).toBe(true);
		expect(fix!.classList.contains('button--contrast')).toBe(true);

		// Exactly the controls.css recipe — the scoped `button.apply` copy is gone.
		const fixStyle = getComputedStyle(fix!);
		withContrastProbe((probe) => {
			expect(fixStyle.backgroundColor).toBe(probe.backgroundColor);
			expect(fixStyle.color).toBe(probe.color);
			expect(fixStyle.borderTopColor).toBe(probe.borderTopColor);
			expect(fixStyle.borderTopLeftRadius).toBe(probe.borderTopLeftRadius);
		});
	});

	it('renders the review acceptance as the contrast tier and the dismissals as quiet', async () => {
		// The keyboard-opened card: it holds focus and never closes on pointer
		// leave, so it is the one that owes the user a visible way out.
		await render(DiagnosticPopover, {
			diagnostic: reviewDiagnostic(),
			takeFocus: true,
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		const accept = document.querySelector<HTMLElement>('.diagnostic-actions__accept');
		expect(accept).not.toBeNull();
		expect(accept!.classList.contains('button')).toBe(true);
		expect(accept!.classList.contains('button--contrast')).toBe(true);
		const acceptStyle = getComputedStyle(accept!);
		withContrastProbe((probe) => {
			expect(acceptStyle.backgroundColor).toBe(probe.backgroundColor);
			expect(acceptStyle.borderTopColor).toBe(probe.borderTopColor);
		});

		// Close is a reversible dismissal: quiet tier, so no border and no fill —
		// the old hand-rolled bordered box is gone.
		const close = document.querySelector<HTMLElement>('.diagnostic-actions__close');
		expect(close).not.toBeNull();
		expect(close!.textContent?.trim()).toBe('Close');
		expect(close!.classList.contains('button--quiet')).toBe(true);
		const closeStyle = getComputedStyle(close!);
		expect(closeStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(closeStyle.borderTopColor).toBe('rgba(0, 0, 0, 0)');
	});

	it('sets the detected language from the shared quick action', async () => {
		const onSetLanguage = vi.fn();
		await render(DiagnosticPopover, {
			diagnostic: {
				...reviewDiagnostic(),
				ruleId: 'language.selection-mismatch',
				severity: 'warning',
				detectedLanguage: { tag: 'en', displayName: 'English' }
			},
			onSetLanguage,
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		const action = page.getByRole('button', { name: 'Set language to English' });
		await expect.element(action).toHaveClass('button--contrast');
		await userEvent.click(action);
		expect(onSetLanguage).toHaveBeenCalledWith('en');
	});

	it('gives the hovered card no Close: leaving it is what closes it', async () => {
		// Nothing is pending here, so closing is not a decision — the pointer-leave
		// watcher already ends the card, and a second quiet button beside Ignore
		// would only make the one that silences a rule easier to hit by mistake.
		await renderPopover(fixableDiagnostic());

		expect(document.querySelector('.diagnostic-actions__close')).toBeNull();
		expect(
			[...document.querySelectorAll('.diagnostic-actions button')].map((button) =>
				button.textContent?.trim()
			)
		).toEqual(['Remove the comma', 'Ignore']);
	});
});

describe('DiagnosticPopover dismissal', () => {
	/** Something to press that is unmistakably not part of the card. */
	function outside(): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = 'Elsewhere';
		button.dataset.outside = '';
		// Pinned to a corner so the card cannot sit under the pointer instead.
		button.style.cssText = 'position: fixed; right: 0; bottom: 0; z-index: 100;';
		document.body.append(button);
		return button;
	}

	afterEach(() => {
		for (const node of document.querySelectorAll('[data-outside]')) {
			node.remove();
		}
	});

	it('closes on a press outside and reports that it did not hold focus', async () => {
		const onDismiss = vi.fn();
		await render(DiagnosticPopover, {
			diagnostic: fixableDiagnostic(),
			takeFocus: true,
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn(),
			onDismiss
		});

		await userEvent.click(outside());

		// `false`: the press names the new focus target, so the editor must not
		// pull the caret back out of it.
		expect(onDismiss).toHaveBeenCalledWith(false);
	});

	it('stays open while the pointer works inside the card', async () => {
		const onDismiss = vi.fn();
		const onPreviewFix = vi.fn();
		await render(DiagnosticPopover, {
			diagnostic: fixableDiagnostic(),
			takeFocus: true,
			onPreviewFix,
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn(),
			onDismiss
		});

		await userEvent.click(document.querySelector<HTMLElement>('.popover p')!);

		expect(onDismiss).not.toHaveBeenCalled();
	});
});
