import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Diagnostic, SourceReference } from '$lib/core/types.js';
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

function source(id: string): SourceReference {
	return {
		id,
		url: `https://genius.com/${id}`,
		pageTitle: `Source ${id}`,
		sectionTitle: `Section ${id}`,
		retrievedAt: '2026-07-24',
		lastVerifiedAt: '2026-07-24',
		reviewStatus: 'reviewed'
	};
}

describe('DiagnosticDetails preview flow', () => {
	it('previews the fix as soon as the card opens, with one control to keep it', async () => {
		const onApplyFix = vi.fn();
		const onPreviewFix = vi.fn();
		const screen = await render(DiagnosticDetails, {
			diagnostic: previewDiagnostic(),
			sources: new Map(),
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

	it('keeps ignore available beside apply: there is no pending step to hide it', async () => {
		await render(DiagnosticDetails, {
			diagnostic: previewDiagnostic(),
			sources: new Map(),
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		const ignore = page.getByRole('button', { name: 'Ignore' });
		await expect.element(ignore).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Wrap as (Yeah)' })).toBeVisible();
		// Beside means beside: no auto margin shoving Ignore to the card's far
		// edge away from the Apply it pairs with.
		expect(getComputedStyle(ignore.element()).marginInlineStart).toBe('0px');
		await expect
			.element(page.getByRole('button', { name: 'Ignore this session' }))
			.not.toBeInTheDocument();
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
			sources: new Map(),
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
			sources: new Map(),
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
			sources: new Map(),
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

	it('offers the section picker without creating a preview fix', async () => {
		const onChooseHeader = vi.fn();
		await render(DiagnosticDetails, {
			diagnostic: {
				ruleId: 'section.header-missing',
				severity: 'warning',
				from: 0,
				to: 0,
				message: 'This lyric section has no header.',
				explanation: 'Choose a reviewed localized term.',
				sourceIds: []
			},
			sources: new Map(),
			onChooseHeader,
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /Preview:/ })).not.toBeInTheDocument();
		const chooseHeader = page.getByRole('button', { name: 'Choose header' });
		await expect.element(chooseHeader).toHaveClass('button');
		expect(chooseHeader.element().classList.contains('button--pill')).toBe(false);
		await chooseHeader.click();
		expect(onChooseHeader).toHaveBeenCalledOnce();
	});

	it('offers guided performer assignment for an unresolved styled voice', async () => {
		const onAssignPerformers = vi.fn();
		await render(DiagnosticDetails, {
			diagnostic: {
				ruleId: 'performer.inline-mismatch',
				severity: 'warning',
				from: 20,
				to: 38,
				message: 'Inline style has no performer in the section legend.',
				explanation: 'Choose the section and styled voices.',
				sourceIds: []
			},
			sources: new Map(),
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

	it('offers no assignment when the host cannot make one', async () => {
		// A section that cannot take a legend — no header, or two styled voices
		// and no plain lyrics — withholds the handler, and the card withholds the
		// button rather than showing one that only explains why it did nothing.
		await render(DiagnosticDetails, {
			diagnostic: {
				ruleId: 'performer.inline-mismatch',
				severity: 'warning',
				from: 20,
				to: 38,
				message: 'Inline style has no performer in the section legend.',
				explanation: 'Choose the section and styled voices.',
				sourceIds: []
			},
			sources: new Map(),
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

	it('shows two sources initially and reveals the remaining provenance on request', async () => {
		const sourceIds = ['primary', 'selected-language', 'supporting-a', 'supporting-b'];
		const screen = await render(DiagnosticDetails, {
			diagnostic: {
				...previewDiagnostic(),
				sourceIds
			},
			sources: new Map(sourceIds.map((sourceId) => [sourceId, source(sourceId)])),
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		expect(screen.container.querySelectorAll('.source-reference')).toHaveLength(2);
		const showMore = page.getByRole('button', { name: 'Show 2 more sources' });
		await expect.element(showMore).toHaveAttribute('aria-expanded', 'false');

		await showMore.click();
		expect(screen.container.querySelectorAll('.source-reference')).toHaveLength(4);
		const showFewer = page.getByRole('button', { name: 'Show fewer sources' });
		await expect.element(showFewer).toHaveAttribute('aria-expanded', 'true');

		await showFewer.click();
		expect(screen.container.querySelectorAll('.source-reference')).toHaveLength(2);
	});

	it('leaves a short source list fully visible without a disclosure control', async () => {
		const sourceIds = ['primary', 'supporting-a', 'supporting-b'];
		const screen = await render(DiagnosticDetails, {
			diagnostic: {
				...previewDiagnostic(),
				sourceIds
			},
			sources: new Map(sourceIds.map((sourceId) => [sourceId, source(sourceId)])),
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		expect(screen.container.querySelectorAll('.source-reference')).toHaveLength(3);
		await expect
			.element(page.getByRole('button', { name: /more sources/u }))
			.not.toBeInTheDocument();
	});
});
