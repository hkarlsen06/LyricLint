import { screen, waitFor, within } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import { createTestWorkbench, performer } from '../test-utils.js';
import PerformersPanel from './PerformersPanel.svelte';

const text =
	'[Verse: Mira & <i>Noor</i>]\nMira carries the light\n<i>Noor answers</i>\n\n[Chorus: Mira & Noor]\nBoth hold the line\n<b>Anonymous words</b>';
afterEach(cleanup);

test('names current voices, distinguishes joint and mixed passages, and preserves roster geometry', async () => {
	const { controller } = createTestWorkbench({
		text,
		performers: [performer('m', 'Mira', 0), performer('n', 'Noor', 1)],
		selection: { anchor: 51, head: 51 }
	});
	await render(PerformersPanel, { controller });
	const roster = screen.getByRole('list', { name: "'Scribe performer roster" });
	const before = roster.getBoundingClientRect();
	async function select(words: string, length = 0) {
		const head = text.indexOf(words);
		controller.onSnapshot({
			...controller.snapshot,
			selection: { anchor: head, head: head + length }
		});
		await waitFor(() =>
			expect(screen.getByLabelText('Current lyric voices').textContent).toContain(
				length ? 'Selection' : 'Line'
			)
		);
	}
	await select('Noor answers');
	await waitFor(() =>
		expect(screen.getByLabelText('Current lyric voices').textContent).toBe(
			'Line 3 · Performed by Noor'
		)
	);
	controller.onSnapshot({
		...controller.snapshot,
		selection: { anchor: text.indexOf('</i>\n\n'), head: text.indexOf('</i>\n\n') }
	});
	await waitFor(() =>
		expect(screen.getByLabelText('Current lyric voices').textContent).toBe(
			'Line 3 · Performed by Noor'
		)
	);
	await select('Mira carries');
	await waitFor(() =>
		expect(screen.getByLabelText('Current lyric voices').textContent).toBe(
			'Line 2 · Performed by Mira'
		)
	);
	await select('Both hold');
	await waitFor(() =>
		expect(screen.getByLabelText('Current lyric voices').textContent).toBe(
			'Line 6 · Performed by Mira & Noor'
		)
	);
	await select('Mira carries', 45);
	await waitFor(() =>
		expect(screen.getByLabelText('Current lyric voices').textContent).toBe(
			'Selection · Performed by Mira; Noor'
		)
	);
	await select('Anonymous words');
	await waitFor(() =>
		expect(screen.getByLabelText('Current lyric voices').textContent).toBe(
			'Line 7 · Performed by Unknown voice'
		)
	);
	const after = roster.getBoundingClientRect();
	expect({ x: after.x, y: after.y, width: after.width, height: after.height }).toEqual({
		x: before.x,
		y: before.y,
		width: before.width,
		height: before.height
	});
	const rename = within(roster).getByRole('button', { name: 'Rename Noor' });
	expect(rename.textContent).toContain('Rename');
	expect(within(roster).getAllByRole('button', { name: 'Rename Noor' })).toHaveLength(1);
	expect(controller.snapshot.text).toBe(text);
});

test('long names keep the Rename word and removal inside a narrow roster', async () => {
	const name = 'Nora Alexandra With A Very Long Performer Name';
	const { controller } = createTestWorkbench({ performers: [performer('n', name, 0)] });
	const view = await render(PerformersPanel, { controller });
	view.container.style.width = '296px';
	const rename = screen.getByRole('button', { name: `Rename ${name}` });
	const cue = within(rename).getByText('Rename');
	const remove = screen.getByRole('button', { name: `Remove ${name}` });
	const panel = view.container.getBoundingClientRect();
	expect(cue.getBoundingClientRect().right).toBeLessThanOrEqual(panel.right);
	expect(remove.getBoundingClientRect().right).toBeLessThanOrEqual(panel.right);
	expect(cue.getBoundingClientRect().left).toBeGreaterThan(rename.getBoundingClientRect().left);
});
