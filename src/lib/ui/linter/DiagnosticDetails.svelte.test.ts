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
	it('shows the exact before and after values before applying', async () => {
		const onApplyFix = vi.fn();
		const onPreviewFix = vi.fn();
		await render(DiagnosticDetails, {
			diagnostic: previewDiagnostic(),
			sources: new Map(),
			onPreviewFix,
			onCancelPreview: vi.fn(),
			onApplyFix,
			onIgnore: vi.fn()
		});

		await page.getByRole('button', { name: 'Preview: Wrap as (Yeah)' }).click();

		await expect.element(page.getByText('Previewing this change in the editor.')).toBeVisible();
		expect(onPreviewFix).toHaveBeenCalledOnce();
		expect(onApplyFix).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Apply previewed fix' }).click();
		expect(onApplyFix).toHaveBeenCalledOnce();
	});

	it('cancels a preview without applying it', async () => {
		const onApplyFix = vi.fn();
		const onCancelPreview = vi.fn();
		await render(DiagnosticDetails, {
			diagnostic: previewDiagnostic(),
			sources: new Map(),
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
});
