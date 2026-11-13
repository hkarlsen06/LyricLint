import { CONVERSION_LIMITS } from '#lib/conversion/model.js';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { cdp, page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import { importDocument } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { createTestWorkbench } from '../test-utils.js';
import DocumentToolbar from './DocumentToolbar.svelte';

afterEach(async () => {
	await cleanup();
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
	await page.viewport(800, 600);
});

function musixmatchWorkbench() {
	const imported = importDocument({ profile: 'genius', text: '[Verse]\nLine', language: 'en' });
	if (!imported.ok) throw new Error(imported.refusal.message);
	return createTestWorkbench({
		conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
	});
}

test.each([1280, 390])(
	'a Genius draft shows the other format only with Musixmatch tools on at %ipx',
	async (width) => {
		await cdp().send('Emulation.setTouchEmulationEnabled', {
			enabled: width < 600,
			maxTouchPoints: 1
		});
		await page.viewport(width, 700);
		const { controller } = createTestWorkbench({ text: '[Verse]\nLine' });
		const { container } = await render(DocumentToolbar, { controller });

		expect(controller.musixmatchToolsEnabled).toBe(false);
		expect(screen.queryByText('Genius', { exact: true })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Export to Musixmatch' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Copy Genius' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Copy lyrics' })).toBeVisible();
		if (width >= 600) {
			expect(screen.getByRole('button', { name: 'Compare' })).toBeVisible();
			expect(container.querySelectorAll('.document-toolbar__divider')).toHaveLength(1);
		}

		controller.setMusixmatchToolsEnabled(true);
		await waitFor(() => expect(screen.getByText('Genius', { exact: true })).toBeVisible());
		expect(screen.getByRole('button', { name: 'Export to Musixmatch' })).toBeVisible();
		expect(screen.getByRole('button', { name: 'Copy Genius' })).toBeVisible();
		expect(screen.queryByRole('button', { name: 'Copy lyrics' })).toBeNull();
	}
);

test('a Musixmatch draft keeps its tag, export and copy label with Musixmatch tools off', async () => {
	const { controller } = musixmatchWorkbench();
	controller.setMusixmatchToolsEnabled(false);
	await render(DocumentToolbar, { controller });
	expect(screen.getByText('Musixmatch', { exact: true })).toBeVisible();
	expect(screen.getByRole('button', { name: 'Export to Genius' })).toBeVisible();
	expect(screen.getByRole('button', { name: 'Copy Musixmatch' })).toBeVisible();
});

test.each([1280, 360, 390])(
	'fixed primary and independent editable export at %ipx',
	async (width) => {
		await cdp().send('Emulation.setTouchEmulationEnabled', {
			enabled: width < 600,
			maxTouchPoints: 1
		});
		await page.viewport(width, 700);
		const { controller } = createTestWorkbench({ text: 'A [silver compass](123456) (nearby)' });
		controller.setMusixmatchToolsEnabled(true);
		const original = controller.snapshot;
		await render(DocumentToolbar, { controller });
		expect(screen.queryByRole('button', { name: 'Lyric format: Musixmatch' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Copy Genius' })).toBeVisible();
		const opener = screen.getByRole('button', { name: 'Export to Musixmatch' });
		await userEvent.click(opener);
		const output = screen.getByRole('textbox', { name: 'Musixmatch output' });
		await userEvent.fill(output, 'Independent output\n');
		expect(controller.snapshot).toBe(original);
		await userEvent.keyboard('{Escape}');
		await waitFor(() => expect(document.querySelector('dialog:modal')).toBeNull());
		expect(document.activeElement).toBe(opener);
		await userEvent.click(opener);
		expect(screen.getByRole('textbox', { name: 'Musixmatch output' })).toHaveValue(
			'Independent output\n'
		);
		const reopened = screen.getByRole('textbox', { name: 'Musixmatch output' });
		const box = reopened.getBoundingClientRect();
		expect(box.left).toBeGreaterThanOrEqual(0);
		expect(box.right).toBeLessThanOrEqual(width);
		expect(parseFloat(getComputedStyle(reopened).fontSize)).toBeGreaterThanOrEqual(16);
		await userEvent.click(screen.getByRole('button', { name: 'Edit lyrics' }));
		expect(controller.snapshot).toBe(original);
	}
);

test('refuses oversized output without truncating it or changing the primary, and guards departure', async () => {
	const { controller } = createTestWorkbench({ text: 'Original words' });
	controller.setMusixmatchToolsEnabled(true);
	controller.setExport('Last saved output');
	const original = controller.snapshot;
	await render(DocumentToolbar, { controller });
	await userEvent.click(screen.getByRole('button', { name: 'Export to Musixmatch' }));
	const output = screen.getByRole('textbox', { name: 'Musixmatch output' });
	const oversized = 'x'.repeat(CONVERSION_LIMITS.text + 1);
	await fireEvent.input(output, { target: { value: oversized } });
	expect(output).toHaveValue(oversized);
	expect(controller.snapshot).toBe(original);
	expect(controller.getExport()).toBe('Last saved output');
	expect(screen.getByRole('alert')).toHaveTextContent(
		'This output could not be saved. Shorten it to save, or copy or download it here.'
	);
	const departure = new Event('beforeunload', { cancelable: true });
	window.dispatchEvent(departure);
	expect(departure.defaultPrevented).toBe(true);
	await userEvent.keyboard('{Escape}');
	const discard = screen.getByRole('button', { name: 'Discard unsaved output and close' });
	expect(discard).toHaveFocus();
	expect(output).toHaveValue(oversized);
	await userEvent.click(discard);
	expect(document.querySelector('dialog:modal')).toBeNull();
	expect(controller.snapshot).toBe(original);
	const afterDiscard = new Event('beforeunload', { cancelable: true });
	window.dispatchEvent(afterDiscard);
	expect(afterDiscard.defaultPrevented).toBe(false);
	await userEvent.click(screen.getByRole('button', { name: 'Export to Musixmatch' }));
	expect(screen.getByRole('textbox', { name: 'Musixmatch output' })).toHaveValue(
		'Last saved output'
	);
});
