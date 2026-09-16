import { fireEvent, waitFor, within } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorHandle } from '$lib/core/types.js';
import EditorPane from '$lib/editor/EditorPane.svelte';
import { createTestWorkbench } from '../test-utils.js';
import LinkingPanel from './LinkingPanel.svelte';

const song =
	'[Chorus]\nWe hold the light\nAnd come home tonight\n\n[Chorus 2]\nWe hold the light\nAnd come home again';
async function setup(text = song) {
	const workbench = createTestWorkbench({ text, revision: 0, selection: { anchor: 0, head: 0 } });
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: text,
			context: { language: 'en', performers: [], ruleSetVersion: 'rich-link-test' },
			callbacks: {
				onSnapshot: (snapshot) => workbench.controller.onSnapshot(snapshot),
				onSectionLinksChanged: () => workbench.controller.onSectionLinksChanged(),
				onAssignRequest: vi.fn(),
				onSectionHeaderRequest: vi.fn(),
				onDiagnosticActivate: vi.fn(),
				onAnnouncement: vi.fn()
			},
			onready(ready) {
				handle = ready;
				workbench.controller.setEditorHandle(ready);
			}
		}
	});
	await waitFor(() => expect(handle).toBeDefined());
	workbench.controller.switchProfile('musixmatch');
	await waitFor(() => expect(workbench.controller.profile).toBe('musixmatch'));
	const view = await render(LinkingPanel, { controller: workbench.controller });
	return { ...workbench, handle: handle!, view, panel: within(view.container) };
}

afterEach(async () => {
	await cleanup();
	await page.viewport(1280, 720);
});

describe('Musixmatch stable section linking', () => {
	it('links hidden-header sections explicitly, mirrors shared lyrics, and preserves independent endings and undo', async () => {
		const { panel, handle, controller } = await setup();
		const exact = handle.getSnapshot().text;
		const checkboxes = panel.getAllByRole('checkbox');
		expect(checkboxes).toHaveLength(2);
		expect(panel.getByRole('button', { name: 'Set up link' })).toHaveProperty('disabled', true);
		for (const checkbox of checkboxes) await fireEvent.click(checkbox);
		await fireEvent.click(panel.getByRole('button', { name: 'Set up link' }));
		await waitFor(() => expect(controller.snapshot.conversion?.model.links).toHaveLength(1));
		expect(handle.getSnapshot().text).toBe(exact);
		expect(panel.getAllByRole('switch')).toHaveLength(2);
		const before = handle.getSnapshot();
		const at = before.text.indexOf('hold');
		handle.dispatchAtomic({
			baseRevision: before.revision,
			edits: [{ from: at, to: at + 4, insert: 'keep' }]
		});
		await waitFor(() => expect(handle.getSnapshot().text).toBe(exact.replaceAll('hold', 'keep')));
		expect(handle.getSnapshot().text).toContain('tonight');
		expect(handle.getSnapshot().text).toContain('again');
		handle.undo();
		expect(handle.getSnapshot().text).toBe(exact);
		handle.undo();
		await waitFor(() => expect(controller.snapshot.conversion?.model.links).toHaveLength(0));
	});

	it('keeps explicit local edits detached after resuming shared editing and allows unlinking', async () => {
		const { panel, handle, controller } = await setup();
		for (const checkbox of panel.getAllByRole('checkbox')) await fireEvent.click(checkbox);
		await fireEvent.click(panel.getByRole('button', { name: 'Set up link' }));
		const toggle = panel.getAllByRole('switch')[0];
		await fireEvent.click(toggle);
		expect(toggle).toHaveAttribute('aria-checked', 'true');
		let snapshot = handle.getSnapshot();
		let at = snapshot.text.indexOf('hold');
		handle.dispatchAtomic({
			baseRevision: snapshot.revision,
			edits: [{ from: at, to: at + 4, insert: 'guard' }]
		});
		expect(handle.getSnapshot().text.match(/guard/gu)).toHaveLength(1);
		expect(handle.getSnapshot().text.match(/hold/gu)).toHaveLength(1);
		await fireEvent.click(toggle);
		expect(toggle).toHaveAttribute('aria-checked', 'false');
		snapshot = handle.getSnapshot();
		at = snapshot.text.indexOf('light');
		handle.dispatchAtomic({
			baseRevision: snapshot.revision,
			edits: [{ from: at, to: at + 5, insert: 'moon' }]
		});
		expect(handle.getSnapshot().text.match(/moon/gu)).toHaveLength(2);
		const exact = handle.getSnapshot().text;
		await fireEvent.click(panel.getAllByRole('button', { name: /^Unlink /u })[0]);
		await waitFor(() => expect(controller.snapshot.conversion?.model.links).toHaveLength(0));
		expect(handle.getSnapshot().text).toBe(exact);
	});

	it('navigates actual projected passages and wraps long lyric text within phone geometry', async () => {
		await page.viewport(390, 844);
		const { panel, view, handle, controller } = await setup(
			song.replace('We hold the light', 'Moonlight'.repeat(40))
		);
		const original = JSON.stringify(controller.snapshot.conversion?.model);
		const disclosure = panel.getAllByText(/^Lyrics in /u)[0];
		const before = disclosure.getBoundingClientRect();
		await fireEvent.click(disclosure);
		expect(disclosure.getBoundingClientRect().top).toBe(before.top);
		await fireEvent.click(panel.getAllByRole('button', { name: 'Show line 1' })[0]);
		expect(handle.getSnapshot().selection.anchor).toBe(0);
		expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(original);
		expect(view.container.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
		expect(
			panel.queryByText(
				'Repeated sections will appear here so you can keep their shared lyrics in sync.'
			)
		).toBeNull();
	});
});
