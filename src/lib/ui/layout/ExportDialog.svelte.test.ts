import { screen, waitFor, within } from '@testing-library/dom';
import { cdp, page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import DocumentToolbar from './DocumentToolbar.svelte';

const lyrics = '[Verse 1]\nShe said hold on.\nevery window I pass\n\n[Chorus]\nHold the line';

async function openExport(text = lyrics) {
	const workbench = createTestWorkbench({ text });
	await render(DocumentToolbar, { controller: workbench.controller });
	await userEvent.click(screen.getByRole('button', { name: 'Export to Musixmatch' }));
	const review = await screen.findByRole('region', { name: 'Musixmatch review' });
	const output = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Musixmatch output' });
	await waitFor(() =>
		expect(within(review).getByRole('status').textContent).not.toMatch(/Checking/)
	);
	return { ...workbench, review, output };
}

describe('the export review', () => {
	afterEach(async () => {
		await cleanup();
		await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await page.viewport(800, 600);
	});

	test('checks the output against the destination, not the draft’s own format', async () => {
		const { review, output } = await openExport();

		expect(output).toHaveValue('She said hold on.\nevery window I pass\n\nHold the line');
		expect(within(review).getByRole('status')).toHaveTextContent('2 to review');
		expect(
			within(review).getByRole('button', { name: 'Review this terminal period.' })
		).toBeVisible();
		expect(
			within(review).getByRole('button', { name: 'Review the lowercase line beginning.' })
		).toBeVisible();
	});

	test('fixes a finding in the output and leaves the draft alone', async () => {
		const { controller, review, output } = await openExport();
		const original = controller.snapshot;
		const row = within(review).getByRole('button', { name: 'Review this terminal period.' });
		await userEvent.click(row);
		expect(row).toHaveAttribute('aria-expanded', 'true');
		// The open finding is washed in the output as well as underlined.
		expect(document.querySelector('.export-marks [data-open]')?.textContent).toBe('.');

		await userEvent.click(within(review).getByRole('button', { name: 'Remove the period' }));

		expect(output).toHaveValue('She said hold on\nevery window I pass\n\nHold the line');
		expect(within(review).getByRole('status')).toHaveTextContent('1 to review');
		expect(
			within(review).queryByRole('button', { name: 'Review this terminal period.' })
		).toBeNull();
		expect(controller.snapshot).toBe(original);
		expect(controller.getExport()).toBe(output.value);
	});

	test('sets a finding aside for this export without changing the output', async () => {
		const { review, output } = await openExport();
		const before = output.value;
		await userEvent.click(
			within(review).getByRole('button', { name: 'Review the lowercase line beginning.' })
		);

		await userEvent.click(within(review).getByRole('button', { name: 'Ignore' }));

		expect(output).toHaveValue(before);
		expect(within(review).getByRole('status')).toHaveTextContent('1 to review');
	});

	test('re-checks what is typed into the output', async () => {
		const { review, output } = await openExport();

		await userEvent.fill(output, 'Hold the line');

		await waitFor(() =>
			expect(within(review).getByRole('status')).toHaveTextContent('Nothing to review')
		);
		expect(
			within(review).getByText('This output raises none of the reviewed Musixmatch checks.')
		).toBeVisible();
	});

	test('lists the structure tags a Musixmatch export leaves out of its text', async () => {
		const { review } = await openExport();

		const tags = within(review).getByRole('heading', { name: 'Section tags' }).parentElement!;
		expect(
			within(tags)
				.getAllByRole('listitem')
				.map((item) => item.textContent)
		).toEqual(['Verse', 'Chorus']);
	});

	test.each([
		[1280, false],
		[390, true]
	])('keeps the marks under their words at %ipx', async (width, touch) => {
		await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 1 });
		await page.viewport(width, 700);
		const { review, output } = await openExport(
			`[Verse 1]\n${'A long lyric line that has to wrap on a phone before it ends.\n'.repeat(48)}`
		);
		const marks = document.querySelector<HTMLElement>('.export-marks')!;

		// Same box and same wrap, so a mark's line is the word's line.
		expect(marks.getBoundingClientRect()).toEqual(output.getBoundingClientRect());
		expect(marks.scrollHeight).toBe(output.scrollHeight);
		const rows = within(review).getAllByRole('button', { name: 'Review this terminal period.' });
		await userEvent.click(rows.at(-1)!);
		await waitFor(() => expect(output.scrollTop).toBeGreaterThan(0));
		await waitFor(() => expect(marks.scrollTop).toBe(output.scrollTop));
		// The review never pushes the dialog or its actions off screen.
		const copy = screen.getByRole('button', { name: 'Copy' }).getBoundingClientRect();
		expect(copy.bottom).toBeLessThanOrEqual(700);
		expect(review.getBoundingClientRect().right).toBeLessThanOrEqual(width);
		if (touch)
			for (const control of within(review).getAllByRole('button'))
				expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
	});
});
