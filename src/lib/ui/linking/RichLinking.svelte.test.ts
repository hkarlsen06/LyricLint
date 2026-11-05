import { fireEvent, waitFor, within } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorHandle } from '#lib/core/types.js';
import EditorPane from '#lib/editor/EditorPane.svelte';
import { createTestWorkbench } from '../test-utils.js';
import LinkingPanel from './LinkingPanel.svelte';

const song =
	'[Chorus]\nWe hold the light\nAnd come home tonight\n\n[Chorus 2]\nWe hold the light\nAnd come home again';
async function setup(text = song, onShowEditor?: () => void | Promise<void>) {
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
	const view = await render(LinkingPanel, { controller: workbench.controller, onShowEditor });
	return { ...workbench, handle: handle!, view, panel: within(view.container) };
}

afterEach(async () => {
	await cleanup();
	await page.viewport(1280, 720);
});

describe('Musixmatch stable section linking', () => {
	it('reviews one typo in Musixmatch without changing the ad-lib, and retains exact Genius source through history', async () => {
		const source =
			'[Chorus 1]\nHold on tight\nCarry me home\n\n[Verse]\nWalk with me\n\n[Chorus 2]\nHold on tighht\nCarry me home (Oh)';
		const { panel, handle, controller } = await setup(source);
		const ids = controller.snapshot.conversion!.model.sections.map((section) => section.id);
		await fireEvent.click(panel.getAllByRole('checkbox')[0]);
		await fireEvent.click(panel.getAllByRole('checkbox')[2]);
		await fireEvent.click(panel.getByRole('button', { name: 'Set up link' }));
		const original = handle.getSnapshot().text;
		const model = JSON.parse(JSON.stringify(controller.snapshot.conversion!.model));
		await fireEvent.click(panel.getByRole('button', { name: /^Manage /u }));
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Choose wording per difference' }));
		const choice = panel.getByRole('checkbox', { name: /Use Chorus .*section 1.*difference 1/u });
		const before = choice.getBoundingClientRect();
		await fireEvent.click(choice);
		expect(choice.getBoundingClientRect().top).toBe(before.top);
		expect(handle.getSnapshot().text).toBe(original);
		expect(controller.profile).toBe('musixmatch');
		await fireEvent.click(panel.getAllByRole('button', { name: 'Apply 1 change' })[0]);
		expect(handle.getSnapshot().text).toBe(original.replace('tighht', 'tight'));
		expect(controller.snapshot.conversion!.model.sections.map((section) => section.id)).toEqual(
			ids
		);
		expect(controller.snapshot.conversion!.model.links[0].id).toBe(model.links[0].id);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(original);
		handle.redo();
		expect(handle.getSnapshot().text).toBe(original.replace('tighht', 'tight'));
		controller.switchProfile('genius');
		await waitFor(() => expect(handle.getSnapshot().text).toBe(source.replace('tighht', 'tight')));
	});

	it('refuses a pending correction after the underlying passage changes', async () => {
		const { panel, handle, controller } = await setup();
		for (const checkbox of panel.getAllByRole('checkbox')) await fireEvent.click(checkbox);
		await fireEvent.click(panel.getByRole('button', { name: 'Set up link' }));
		await fireEvent.click(panel.getByRole('button', { name: /^Manage /u }));
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Choose wording per difference' }));
		await fireEvent.click(panel.getAllByRole('checkbox', { name: /^Use /u })[0]);
		const snapshot = handle.getSnapshot();
		const at = snapshot.text.indexOf('tonight');
		handle.dispatchAtomic({
			baseRevision: snapshot.revision,
			edits: [{ from: at, to: at + 7, insert: 'tomorrow' }]
		});
		const changed = handle.getSnapshot().text;
		await fireEvent.click(panel.getAllByRole('button', { name: 'Apply 1 change' })[0]);
		expect(handle.getSnapshot().text).toBe(changed);
		expect(controller.profile).toBe('musixmatch');
		expect(controller.feedback.announcement).toContain('Open Manage again');
		expect(panel.getAllByRole('button', { name: 'Apply 1 change' })).not.toHaveLength(0);
	});
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

it('refuses stale comparison lyric and section navigation after clearing the live document', async () => {
	const { panel, handle, controller } = await setup();
	for (const checkbox of panel.getAllByRole('checkbox')) await fireEvent.click(checkbox);
	await fireEvent.click(panel.getByRole('button', { name: 'Set up link' }));
	await fireEvent.click(panel.getByRole('button', { name: /^Manage /u }));
	await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
	const snapshot = handle.getSnapshot();
	handle.dispatchAtomic({
		baseRevision: snapshot.revision,
		edits: [{ from: 0, to: snapshot.text.length, insert: '' }]
	});
	for (const button of panel.getAllByRole('button', { name: /line [2-9]/iu })) {
		await fireEvent.click(button);
		expect(controller.feedback.announcement).toContain('Open Manage again');
		expect(handle.getSnapshot().selection.anchor).toBe(0);
	}
	expect(controller.feedback.announcement).toContain('Open Manage again');
});

it('revalidates section handoff after asynchronously showing the editor', async () => {
	let change: () => void = () => {};
	const { panel, handle, controller } = await setup(song, async () => {
		await Promise.resolve();
		change();
	});
	for (const checkbox of panel.getAllByRole('checkbox')) await fireEvent.click(checkbox);
	await fireEvent.click(panel.getByRole('button', { name: 'Set up link' }));
	await fireEvent.click(panel.getByRole('button', { name: /^Manage /u }));
	change = () => {
		const snapshot = handle.getSnapshot();
		handle.dispatchAtomic({
			baseRevision: snapshot.revision,
			edits: [{ from: 0, to: snapshot.text.length, insert: '' }]
		});
	};
	await fireEvent.click(panel.getAllByRole('button', { name: /^Line /u }).at(-1)!);
	await waitFor(() => expect(controller.feedback.announcement).toContain('Open Manage again'));
	expect(handle.getSnapshot().selection.anchor).toBe(0);
});
