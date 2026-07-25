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
	it('turns the preview control into confirm in place, without a nested card', async () => {
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

		const preview = page.getByRole('button', { name: 'Preview: Wrap as (Yeah)' });
		await expect.element(preview).toHaveTextContent('Preview');
		await preview.click();

		const apply = page.getByRole('button', { name: 'Apply: Wrap as (Yeah)' });
		await expect.element(apply).toHaveTextContent('Apply');
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
		expect(onPreviewFix).toHaveBeenCalledOnce();
		expect(onApplyFix).not.toHaveBeenCalled();

		// The confirm state replaces the preview control rather than nesting a
		// second card with its own actions inside the diagnostic card.
		expect(screen.container.querySelectorAll('.diagnostic-details__actions')).toHaveLength(1);
		await expect.element(preview).not.toBeInTheDocument();

		await apply.click();
		expect(onApplyFix).toHaveBeenCalledOnce();
	});

	it('hides the ignore action while a preview is pending', async () => {
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
		await expect
			.element(page.getByRole('button', { name: 'Ignore this session' }))
			.not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Preview: Wrap as (Yeah)' }).click();
		await expect.element(ignore).not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(ignore).toBeVisible();
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

	it('cancels a preview without applying it', async () => {
		const onApplyFix = vi.fn();
		const onCancelPreview = vi.fn();
		await render(DiagnosticDetails, {
			diagnostic: previewDiagnostic(),
			sources: new Map(),
			onChooseHeader: vi.fn(),
			onPreviewFix: vi.fn(),
			onCancelPreview,
			onApplyFix,
			onIgnore: vi.fn()
		});

		await page.getByRole('button', { name: 'Preview: Wrap as (Yeah)' }).click();
		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect
			.element(page.getByRole('button', { name: 'Preview: Wrap as (Yeah)' }))
			.toBeVisible();
		expect(onCancelPreview).toHaveBeenCalledOnce();
		expect(onApplyFix).not.toHaveBeenCalled();
	});

	it('labels a safe diagnostic action as apply', async () => {
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

		const apply = page.getByRole('button', {
			name: 'Apply: Insert the missing closing bracket'
		});
		await expect.element(apply).toHaveTextContent('Apply');
		await expect.element(apply).not.toHaveTextContent('Insert the missing closing bracket');

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
		await page.getByRole('button', { name: 'Choose header' }).click();
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
