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

		const confirm = page.getByRole('button', { name: 'Confirm: Wrap as (Yeah)' });
		await expect.element(confirm).toHaveTextContent('Confirm');
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
		expect(onPreviewFix).toHaveBeenCalledOnce();
		expect(onApplyFix).not.toHaveBeenCalled();

		// The confirm state replaces the preview control rather than nesting a
		// second card with its own actions inside the diagnostic card.
		expect(screen.container.querySelectorAll('.diagnostic-details__actions')).toHaveLength(1);
		await expect.element(preview).not.toBeInTheDocument();

		await confirm.click();
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

		const ignore = page.getByRole('button', { name: 'Ignore this session' });
		await expect.element(ignore).toBeVisible();

		await page.getByRole('button', { name: 'Preview: Wrap as (Yeah)' }).click();
		await expect.element(ignore).not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(ignore).toBeVisible();
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
});
