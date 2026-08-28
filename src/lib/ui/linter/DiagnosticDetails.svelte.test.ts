import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Diagnostic } from '$lib/core/types.js';
import DiagnosticDetails from './DiagnosticDetails.svelte';

function previewDiagnostic(): Diagnostic {
	return {
		ruleId: 'adlib.parentheses',
		severity: 'suggestion',
		from: 6,
		to: 10,
		message: 'This likely ad-lib may need parentheses.',
		explanation: 'Review the contextual edit.',
		sourceIds: [],
		// A synthetic judgment-call finding: no catalog rule sets
		// `presumedCorrect` today (the ad-lib wrap offer that did was retired),
		// but the shell contract it exercises — accepting leads, the fix steps
		// down — stays pinned for the next rule that does.
		presumedCorrect: true,
		fixes: [
			{
				kind: 'preview',
				label: 'Wrap as (Yeah)',
				edit: {
					baseRevision: 0,
					edits: [{ from: 6, to: 10, insert: '(Yeah)' }]
				}
			}
		]
	};
}

describe('DiagnosticDetails preview flow', () => {
	it('previews the fix as soon as the card opens, with one control to keep it', async () => {
		const onApplyFix = vi.fn();
		const onPreviewFix = vi.fn();
		const screen = await render(DiagnosticDetails, {
			diagnostic: previewDiagnostic(),
			onChooseHeader: vi.fn(),
			onPreviewFix,
			onCancelPreview: vi.fn(),
			onApplyFix,
			onIgnore: vi.fn()
		});

		// Expanding the card is the preview: the editor shows the change as a
		// diff without the user asking, so the two-step controls are gone.
		expect(onPreviewFix).toHaveBeenCalledOnce();
		expect(onApplyFix).not.toHaveBeenCalled();
		await expect.element(page.getByRole('button', { name: /Preview/u })).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

		// The fix names itself. "Apply" in front of a label that already reads as
		// a command said the same thing twice, so the label is the whole button.
		const apply = page.getByRole('button', { name: 'Wrap as (Yeah)' });
		await expect.element(apply).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^Apply/u })).not.toBeInTheDocument();
		expect(screen.container.querySelectorAll('.diagnostic-actions')).toHaveLength(1);

		await apply.click();
		expect(onApplyFix).toHaveBeenCalledOnce();
	});

	it('leads an ad-lib with accepting it and offers the wrap second', async () => {
		const onIgnore = vi.fn();
		await render(DiagnosticDetails, {
			diagnostic: previewDiagnostic(),
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore
		});

		// An ad-lib the singer is performing as part of the line belongs exactly as
		// it is written, so the answer that leads is that nothing is wrong — and the
		// quiet `Ignore` that used to sit after the fix is what it replaces.
		const accept = page.getByRole('button', { name: "It's correct" });
		const wrap = page.getByRole('button', { name: 'Wrap as (Yeah)' });
		await expect.element(accept).toBeVisible();
		await expect.element(accept).toHaveClass('button--contrast');
		await expect.element(page.getByRole('button', { name: 'Ignore' })).not.toBeInTheDocument();

		// One contrast action per surface: the wrap steps down to the bordered tier.
		await expect.element(wrap).toBeVisible();
		await expect.element(wrap).not.toHaveClass('button--contrast');
		expect(
			accept.element().compareDocumentPosition(wrap.element()) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();

		// Beside means beside: no auto margin shoving either control to the card's
		// far edge away from the one it pairs with.
		expect(getComputedStyle(accept.element()).marginInlineStart).toBe('0px');

		await accept.click();
		expect(onIgnore).toHaveBeenCalledOnce();
	});

	it('accepts an unrecognized header as correct with an affirmative CTA', async () => {
		const onIgnore = vi.fn();
		await render(DiagnosticDetails, {
			diagnostic: {
				...previewDiagnostic(),
				ruleId: 'section.header-unrecognized',
				severity: 'manual-review',
				fixes: undefined
			},
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore
		});

		const accept = page.getByRole('button', { name: "It's correct" });
		await expect.element(accept).toBeVisible();
		expect(accept.element().querySelector('svg')).not.toBeNull();
		expect(getComputedStyle(accept.element()).marginInlineStart).toBe('0px');
		await expect.element(page.getByRole('button', { name: 'Ignore' })).not.toBeInTheDocument();

		await accept.click();
		expect(onIgnore).toHaveBeenCalledOnce();
	});

	it('takes its preview with it when the card closes', async () => {
		const onApplyFix = vi.fn();
		const onCancelPreview = vi.fn();
		const screen = await render(DiagnosticDetails, {
			diagnostic: previewDiagnostic(),
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview,
			onApplyFix,
			onIgnore: vi.fn()
		});

		expect(onCancelPreview).not.toHaveBeenCalled();

		// Collapsing the card is the only way out of a preview now, and the
		// document must not be left showing a diff for a diagnostic nobody
		// is looking at.
		screen.unmount();
		expect(onCancelPreview).toHaveBeenCalledOnce();
		expect(onApplyFix).not.toHaveBeenCalled();
	});

	it('labels a fix with the change it makes, not with the word apply', async () => {
		const onApplyFix = vi.fn();
		const safeFix = {
			kind: 'safe' as const,
			label: 'Insert the missing closing bracket',
			edit: {
				baseRevision: 0,
				edits: [{ from: 6, to: 6, insert: ']' }]
			}
		};
		await render(DiagnosticDetails, {
			diagnostic: {
				...previewDiagnostic(),
				fixes: [safeFix]
			},
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix,
			onIgnore: vi.fn()
		});

		// Safe and preview fixes are the same control, and it says what it does:
		// the diff in the editor shows the change, the label names it, and the
		// word "Apply" adds nothing the label has not already said.
		const apply = page.getByRole('button', {
			name: 'Insert the missing closing bracket'
		});
		await expect.element(apply).toBeVisible();
		await expect.element(apply).not.toHaveTextContent('Apply');
		// The visible label is the accessible name: no aria-label repeating it
		// back with a verb in front.
		expect(apply.element().getAttribute('aria-label')).toBeNull();

		// Every action here wears the one ordinary button silhouette; the legacy
		// `.button--pill` hook is gone and must not come back.
		await expect.element(apply).toHaveClass('button');
		expect(apply.element().classList.contains('button--pill')).toBe(false);

		await apply.click();
		expect(onApplyFix).toHaveBeenCalledWith(safeFix);
	});

	it('offers choosing a header or removing the blank line', async () => {
		const onChooseHeader = vi.fn();
		const onApplyFix = vi.fn();
		const removeBlankLine = {
			kind: 'preview' as const,
			label: 'Remove blank line',
			edit: {
				baseRevision: 0,
				edits: [{ from: 7, to: 9, insert: '\n' }]
			}
		};
		await render(DiagnosticDetails, {
			diagnostic: {
				ruleId: 'section.header-missing',
				severity: 'warning',
				from: 0,
				to: 0,
				message: 'This lyric section has no header.',
				explanation: 'Choose a reviewed localized term.',
				sourceIds: [],
				fixes: [removeBlankLine]
			},
			onChooseHeader,
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix,
			onIgnore: vi.fn()
		});

		const chooseHeader = page.getByRole('button', { name: 'Choose header' });
		const remove = page.getByRole('button', { name: 'Remove blank line' });
		await expect.element(chooseHeader).toHaveClass('button');
		await expect.element(remove).toBeVisible();
		await expect.element(chooseHeader).toHaveClass('button--contrast');
		await expect.element(remove).not.toHaveClass('button--contrast');
		expect(chooseHeader.element().classList.contains('button--pill')).toBe(false);
		await chooseHeader.click();
		await remove.click();
		expect(onChooseHeader).toHaveBeenCalledOnce();
		expect(onApplyFix).toHaveBeenCalledWith(removeBlankLine);
	});

	it('offers the same header picker for brackets that name nothing', async () => {
		// The empty header asks the same question a headerless section does, so it
		// gets the same control and not a second one worded differently. There is
		// no fix beside it: the name is the whole of what is missing, and the
		// picker is where it is chosen.
		const onChooseHeader = vi.fn();
		await render(DiagnosticDetails, {
			diagnostic: {
				ruleId: 'section.header-empty',
				severity: 'warning',
				from: 0,
				to: 2,
				message: 'This section header is empty.',
				explanation: 'The brackets are here, but the song part they open is not named.',
				sourceIds: []
			},
			onChooseHeader,
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		const chooseHeader = page.getByRole('button', { name: 'Choose header' });
		await expect.element(chooseHeader).toHaveClass('button--contrast');
		// The card that used to draw here claimed `[]` was a custom header the
		// user might mean, and led with agreeing to it.
		await expect
			.element(page.getByRole('button', { name: "It's correct" }))
			.not.toBeInTheDocument();
		await chooseHeader.click();
		expect(onChooseHeader).toHaveBeenCalledOnce();
	});

	it('offers guided performer assignment for an unresolved styled voice', async () => {
		const onAssignPerformers = vi.fn();
		await render(DiagnosticDetails, {
			diagnostic: {
				ruleId: 'performer.inline-mismatch',
				severity: 'suggestion',
				from: 20,
				to: 38,
				message: 'A styled voice is not yet named in the section legend.',
				explanation: 'Choose the section and styled voices.',
				sourceIds: []
			},
			onChooseHeader: vi.fn(),
			onAssignPerformers,
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		await page.getByRole('button', { name: 'Assign section performers' }).click();
		expect(onAssignPerformers).toHaveBeenCalledOnce();
	});

	it('answers an unnamed styled voice with the performer being unknown, not Ignore', async () => {
		// The formatting-first transcriber's honest way out: the acceptance stands
		// in the ignore slot — same press, same per-occurrence key — and the quiet
		// `Ignore` is what it replaces, exactly as `It really is unintelligible`
		// does for a lyric nobody could make out.
		const onIgnore = vi.fn();
		await render(DiagnosticDetails, {
			diagnostic: {
				ruleId: 'performer.inline-mismatch',
				severity: 'suggestion',
				from: 20,
				to: 38,
				message: 'A styled voice is not yet named in the section legend.',
				explanation: 'Choose the section and styled voices.',
				sourceIds: []
			},
			onChooseHeader: vi.fn(),
			onAssignPerformers: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore
		});

		await expect.element(page.getByRole('button', { name: 'Ignore' })).not.toBeInTheDocument();
		await page.getByRole('button', { name: 'The performer is unknown' }).click();
		expect(onIgnore).toHaveBeenCalledOnce();
	});

	it('offers no assignment when the host cannot make one', async () => {
		// A section that cannot take a legend — no header, or two styled voices
		// and no plain lyrics — withholds the handler, and the card withholds the
		// button rather than showing one that only explains why it did nothing.
		await render(DiagnosticDetails, {
			diagnostic: {
				ruleId: 'performer.inline-mismatch',
				severity: 'suggestion',
				from: 20,
				to: 38,
				message: 'A styled voice is not yet named in the section legend.',
				explanation: 'Choose the section and styled voices.',
				sourceIds: []
			},
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		await expect
			.element(page.getByRole('button', { name: 'Assign section performers' }))
			.not.toBeInTheDocument();
	});

	it('leaves provenance to the meta line above it', async () => {
		const screen = await render(DiagnosticDetails, {
			diagnostic: {
				...previewDiagnostic(),
				sourceIds: ['primary', 'supporting-a']
			},
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		// The audit trail used to close the card as a list of block citations with
		// a disclosure control once it ran past three. It is the link on the
		// finding's meta line now, so the card's body ends at its actions.
		expect(screen.container.querySelector('.diagnostic-sources')).toBeNull();
		expect(screen.container.querySelector('.source-reference')).toBeNull();
		await expect
			.element(page.getByRole('button', { name: /more sources/u }))
			.not.toBeInTheDocument();
	});
});
