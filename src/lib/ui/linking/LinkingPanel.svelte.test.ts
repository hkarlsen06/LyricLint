import { fireEvent, waitFor, within } from '@testing-library/dom';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { DraftRecord, EditorHandle } from '$lib/core/types.js';
import EditorPane from '$lib/editor/EditorPane.svelte';
import { englishLanguagePack } from '$lib/languages/en.js';
import { createTestWorkbench } from '../test-utils.js';
import LinkingPanel from './LinkingPanel.svelte';

const SONG = [
	'[Chorus]',
	'Hold on tight',
	'And I will be there tonight',
	'Never let go (Yeah)',
	'',
	'[Verse]',
	'A second thing entirely',
	'',
	'[Chorus 2]',
	'Hold on tight',
	'And I will be there again',
	'Never let go (Woo)'
].join('\n');

async function setup(text = SONG) {
	const workbench = createTestWorkbench({
		text,
		revision: 0,
		selection: { anchor: 0, head: 0 }
	});
	let handle: EditorHandle | undefined;
	let publishSnapshots = true;
	await render(EditorPane, {
		props: {
			initialText: text,
			initialSelection: { anchor: 0, head: 0 },
			context: {
				language: 'en',
				languagePack: englishLanguagePack,
				performers: [],
				ruleSetVersion: 'linking-panel-test'
			},
			callbacks: {
				onSnapshot(snapshot) {
					if (publishSnapshots) workbench.controller.onSnapshot(snapshot);
				},
				onSectionLinksChanged: () => workbench.controller.onSectionLinksChanged(),
				onSectionLinkRequest: (request) => workbench.controller.openLinking(request.range.from),
				onAssignRequest: vi.fn(),
				onSectionHeaderRequest: vi.fn(),
				onDiagnosticActivate: vi.fn(),
				onAnnouncement: workbench.feedback.announce
			},
			onready(ready) {
				handle = ready;
				workbench.controller.setEditorHandle(ready);
			}
		}
	});
	await waitFor(() => expect(handle).toBeDefined());
	const view = await render(LinkingPanel, { controller: workbench.controller });
	const panel = within(view.container);
	return {
		...workbench,
		handle: handle!,
		panel,
		view,
		container: view.container,
		pauseSnapshotPublication: () => (publishSnapshots = false)
	};
}

async function openComparison(panel: ReturnType<typeof within>) {
	await fireEvent.click(panel.getByRole('button', { name: /Set up link Chorus, Chorus 2/ }));
	const peer = panel.getByRole('checkbox', { name: /^Chorus 2/ });
	expect(peer).toBeChecked();
	expect(peer).not.toBeDisabled();
	expect(panel.queryByText(/This section/)).toBeNull();
	expect(panel.queryByRole('heading', { name: 'Differences' })).toBeNull();
	expect(panel.queryAllByRole('radio')).toHaveLength(0);
	expect(panel.getByRole('button', { name: 'Review differences' })).toBeTruthy();
}

describe('Linking panel with the real editor', () => {
	it('keeps hidden analysis still and catches up to current ranges when activated', async () => {
		const { panel, view, handle, controller } = await setup();
		const firstLine = panel.getByRole('button', { name: 'Line 1' });
		await view.rerender({ controller, active: false });
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: 0, to: 0, insert: '[Intro]\nA new opening\n\n' }]
		});
		await tick();
		expect(panel.getByRole('button', { name: 'Line 1' })).toBe(firstLine);
		expect(panel.queryByRole('button', { name: 'Line 4' })).toBeNull();
		await view.rerender({ controller, active: true });
		await fireEvent.click(panel.getByRole('button', { name: 'Line 4' }));
		expect(handle.getSnapshot().selection.anchor).toBe(
			handle.getSnapshot().text.indexOf('[Chorus]')
		);
		expect(panel.getByRole('button', { name: 'Line 12' })).toBeTruthy();
	});

	it('jumps from overview and detail line buttons without changing linking choices', async () => {
		const { panel, handle, controller } = await setup();
		await fireEvent.click(panel.getByRole('button', { name: /^Line 9$/ }));
		await waitFor(() =>
			expect(handle.getSnapshot().selection.anchor).toBe(SONG.indexOf('[Chorus 2]'))
		);
		expect(controller.linkingHeaderFrom).toBeUndefined();
		await openComparison(panel);
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Use one section’s full version' }));
		await fireEvent.click(panel.getByRole('radio', { name: 'Use Chorus 2’s full version' }));
		await fireEvent.click(panel.getByRole('button', { name: /^Line 1$/ }));
		await waitFor(() => expect(handle.getSnapshot().selection.anchor).toBe(0));
		expect(panel.getByRole('checkbox', { name: 'Chorus Line 1' })).toBeChecked();
		expect(panel.getByRole('radio', { name: 'Use Chorus 2’s full version' })).toBeChecked();
		expect(handle.getSnapshot().text).toBe(SONG);
	});

	it('numbers repeated cross-name sources consistently in groups, choices, and differences', async () => {
		const { panel, container } = await setup(
			'[Intro]\nHold on tight\n\n[Pre-Chorus]\nHold on tight (Oh)\n\n[Pre-Chorus]\nHold on tight (Yeah)'
		);
		expect(
			[...container.querySelectorAll('.linked-member__name')].map((item) => item.textContent)
		).toEqual(['Intro', 'Pre-Chorus 1', 'Pre-Chorus 2']);
		await fireEvent.click(
			panel.getByRole('button', { name: 'Set up link Intro, Pre-Chorus 1, Pre-Chorus 2' })
		);
		expect(panel.getByRole('checkbox', { name: 'Pre-Chorus 2 Line 7' })).toBeChecked();
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Use one section’s full version' }));
		expect(panel.getByRole('radio', { name: 'Use Pre-Chorus 1’s full version' })).toBeTruthy();
		expect(panel.getByRole('radio', { name: 'Use Pre-Chorus 2’s full version' })).toBeTruthy();
		await fireEvent.click(panel.getByRole('checkbox', { name: 'Pre-Chorus 1 Line 4' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Use one section’s full version' }));
		await fireEvent.click(panel.getByRole('radio', { name: 'Use Pre-Chorus 2’s full version' }));
		expect(panel.getByRole('heading', { name: /^Pre-Chorus 2$/ })).toBeTruthy();
	});

	it('keeps stored groups visible when an ordinary edit moves their header lines', async () => {
		const { panel, handle, controller } = await setup();
		await openComparison(panel);
		await fireEvent.click(panel.getByRole('button', { name: 'Link 2 sections' }));
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: 0, to: 0, insert: '[Intro]\nA new opening\n\n' }]
		});
		controller.onSnapshot(handle.getSnapshot());
		await tick();
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([4, 12]);
		expect(panel.getByRole('heading', { name: 'Linked sections' })).toBeTruthy();
		await fireEvent.click(panel.getByRole('button', { name: /Manage Chorus, Chorus 2/ }));
		expect(panel.getByRole('checkbox', { name: 'Chorus Line 4' })).toBeChecked();
		expect(panel.getByRole('checkbox', { name: 'Chorus 2 Line 12' })).toBeChecked();
	});

	it('links directly with differences preserved, then mirrors shared edits', async () => {
		const { panel, handle, controller, container } = await setup();
		const candidates = container.querySelectorAll('.linking-group');
		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.classList.contains('linking-group--linked')).toBe(false);
		const memberList = panel.getByRole('list', { name: 'Sections in this group' });
		const members = within(memberList).getAllByRole('listitem');
		expect(members).toHaveLength(2);
		expect(
			members.map((member) => member.querySelector('.linked-member__name')?.textContent)
		).toEqual(['Chorus', 'Chorus 2']);
		expect(
			members.map((member) => member.querySelector('.linked-member__line')?.textContent)
		).toEqual(['Line 1', 'Line 9']);
		for (const member of members) {
			expect(member.textContent).not.toContain('·');
			expect(getComputedStyle(member).borderInlineStartStyle).toBe('dashed');
		}
		await openComparison(panel);
		await fireEvent.click(panel.getByRole('button', { name: 'Link 2 sections' }));
		await waitFor(() =>
			expect(panel.getByRole('heading', { name: 'Linked sections' })).toBeTruthy()
		);
		expect(handle.getSnapshot().text).toBe(SONG);
		expect(handle.getSectionLinks?.()).toHaveLength(1);
		expect(
			panel.getByText('Matching passages stay in sync. Each section keeps its own variations.')
		).toBeTruthy();
		expect(panel.queryByText(/differences? kept/)).toBeNull();
		expect(panel.queryByText('Not linked together')).toBeNull();
		const linked = container.querySelectorAll('.linking-group--linked');
		expect(linked).toHaveLength(1);
		expect(linked[0]?.querySelectorAll('.linked-member')).toHaveLength(2);
		for (const member of linked[0]!.querySelectorAll('.linked-member')) {
			expect(getComputedStyle(member).borderInlineStartStyle).toBe('solid');
		}
		expect(controller.linkingHeaderFrom).toBeUndefined();
		expect(controller.linkingFromOverview).toBe(false);

		const from = SONG.indexOf('tight');
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from, to: from + 'tight'.length, insert: 'close' }]
		});
		expect(handle.getSnapshot().text.split('Hold on close')).toHaveLength(3);
		expect(handle.getSnapshot().text).toContain('tonight');
		expect(handle.getSnapshot().text).toContain('again');
	});

	it('applies only the reviewed wording and restores the existing differences with one undo', async () => {
		const { panel, handle } = await setup();
		await openComparison(panel);
		await fireEvent.click(panel.getByRole('button', { name: 'Link 2 sections' }));
		const originalLinks = handle.getSectionLinks?.();
		await fireEvent.click(panel.getByRole('button', { name: /Manage Chorus, Chorus 2/ }));
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Choose wording per difference' }));
		await fireEvent.click(
			panel.getByRole('checkbox', {
				name: 'Use Chorus 2 wording for difference 1 in all 2 sections'
			})
		);
		expect(handle.getSnapshot().text).toBe(SONG);
		expect(panel.getByRole('deletion').textContent).toBe('tonight');
		expect(panel.getByRole('insertion').textContent).toBe('again');
		expect(panel.queryByText('Change preview')).toBeNull();
		expect(panel.queryByRole('button', { name: 'Hide differences' })).toBeNull();
		expect(panel.getByRole('button', { name: 'Cancel' })).toBeTruthy();
		await fireEvent.click(panel.getByRole('button', { name: 'Apply 1 change' }));

		expect(handle.getSnapshot().text.split('And I will be there again')).toHaveLength(3);
		expect(handle.getSnapshot().text).toContain('(Yeah)');
		expect(handle.getSnapshot().text).toContain('(Woo)');
		const changed = handle.getSnapshot().text;
		expect(
			handle
				.getLinkDifferences?.([0, changed.indexOf('[Chorus 2]')])
				?.map((difference) => difference.wordings.map((wording) => wording.text))
		).toEqual([['(Yeah)', '(Woo)']]);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(SONG);
		expect(handle.getSectionLinks?.()).toEqual(originalLinks);
		expect(handle.getLinkDifferences?.([0, SONG.indexOf('[Chorus 2]')])).toHaveLength(2);
	});

	it('opens the actual linked members from Manage and all row members from an available comparison', async () => {
		const text = `${SONG}\n\n[Chorus 3]\nHold on tight\nAnd I will be there tonight\nNever let go (Yeah)`;
		const { panel, handle, controller } = await setup(text);
		const second = text.indexOf('[Chorus 2]');
		const third = text.indexOf('[Chorus 3]');
		handle.linkSections?.({ headers: [0, second] });
		await tick();
		expect(
			within(panel.getByRole('list', { name: 'Sections to add' })).getAllByRole('listitem')
		).toHaveLength(1);
		expect(panel.getAllByRole('button', { name: /^Line 1$/ })).toHaveLength(1);
		await fireEvent.click(panel.getByRole('button', { name: 'Manage Chorus, Chorus 2' }));
		expect(controller.linkingComparedHeaders).toEqual([0, second]);
		expect(panel.getByRole('checkbox', { name: /^Chorus Line/ })).toBeChecked();
		expect(panel.getByRole('checkbox', { name: /^Chorus 2/ })).toBeChecked();
		expect(panel.getByRole('checkbox', { name: /^Chorus 3/ })).not.toBeChecked();
		await fireEvent.click(panel.getByRole('button', { name: /Back to linking/ }));
		await fireEvent.click(
			panel.getByRole('button', { name: 'Add sections Chorus, Chorus 2, Chorus 3' })
		);
		expect(controller.linkingComparedHeaders).toEqual([0, second, third]);
		for (const checkbox of panel.getAllByRole('checkbox')) {
			expect(checkbox).toBeChecked();
			expect(checkbox).not.toBeDisabled();
		}
		await fireEvent.click(panel.getByRole('button', { name: 'Update links' }));
		expect(handle.getSnapshot().text).toBe(text);
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([1, 9, 14]);
	});

	it.each([320, 640])(
		'summarizes combining groups without listing their members twice at %ipx',
		async (width) => {
			const text =
				'[Intro with a particularly long section name]\nHold on tight\n\n[Chorus]\nHold on tight\n\n[Chorus]\nHold on tight\n\n[Outro]\nHold on tight';
			const { panel, handle, controller, container } = await setup(text);
			container.style.width = `${width}px`;
			const firstChorus = text.indexOf('[Chorus]');
			const secondChorus = text.indexOf('[Chorus]', firstChorus + 1);
			const outro = text.indexOf('[Outro]');
			handle.linkSections?.({ headers: [0, outro] });
			handle.linkSections?.({ headers: [firstChorus, secondChorus] });
			await tick();
			expect(
				panel.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
			).toEqual(['Linked sections', 'Available to link']);
			expect(container.querySelectorAll('.linked-member')).toHaveLength(4);
			expect(panel.queryByText('Not linked together')).toBeNull();
			expect(panel.queryByText(/differences? kept/)).toBeNull();
			const combine = panel.getByRole('button', { name: /^Combine groups / });
			expect(combine.getBoundingClientRect().right).toBeLessThanOrEqual(
				container.getBoundingClientRect().right + 1
			);
			await fireEvent.click(combine);
			expect(controller.linkingComparedHeaders).toEqual([0, firstChorus, secondChorus, outro]);
			for (const checkbox of panel.getAllByRole('checkbox')) expect(checkbox).toBeChecked();
		}
	);

	it('can exclude the overview representative and link only the remaining selected sections', async () => {
		const text = `${SONG}\n\n[Chorus 3]\nHold on tight\nAnd I will be there tonight\nNever let go (Yeah)`;
		const { panel, handle } = await setup(text);
		await fireEvent.click(
			panel.getByRole('button', { name: 'Set up link Chorus, Chorus 2, Chorus 3' })
		);
		const first = panel.getByRole('checkbox', { name: /^Chorus Line/ });
		expect(first).not.toBeDisabled();
		await fireEvent.click(first);
		await fireEvent.click(panel.getByRole('button', { name: 'Link 2 sections' }));
		expect(handle.getSnapshot().text).toBe(text);
		expect(handle.getSectionLinks?.()[0]?.lines).toEqual([9, 14]);
	});

	it('navigates from a diff gutter to the actual lyric line while retaining choices', async () => {
		const { panel, handle } = await setup();
		await openComparison(panel);
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Choose wording per difference' }));
		const choice = panel.getByRole('checkbox', {
			name: 'Use Chorus 2 wording for difference 1 in all 2 sections'
		});
		await fireEvent.click(choice);
		await fireEvent.click(panel.getByRole('button', { name: 'Go to Chorus 2, line 11' }));
		await waitFor(() =>
			expect(handle.getSnapshot().selection).toEqual({
				anchor: SONG.indexOf('And I will be there again'),
				head: SONG.indexOf('And I will be there again') + 'And I will be there again'.length
			})
		);
		expect(choice).toBeChecked();
		expect(handle.getSnapshot().text).toBe(SONG);
	});

	it('uses a non-first section’s full version for all selected copies with one undo', async () => {
		const { panel, handle } = await setup();
		await openComparison(panel);
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Choose wording per difference' }));
		expect(panel.getByRole('heading', { name: 'Difference 1' })).toBeTruthy();
		expect(panel.getByRole('heading', { name: 'Difference 2' })).toBeTruthy();
		await fireEvent.click(panel.getByRole('button', { name: 'Hide differences' }));
		expect(panel.queryByRole('heading', { name: 'Differences' })).toBeNull();
		expect(panel.queryAllByRole('radio')).toHaveLength(0);
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Use one section’s full version' }));
		await fireEvent.click(panel.getByRole('radio', { name: 'Use Chorus 2’s full version' }));
		expect(handle.getSnapshot().text).toBe(SONG);
		await fireEvent.click(panel.getByRole('button', { name: 'Link and apply 2 changes' }));
		const changed = handle.getSnapshot().text;
		expect(changed.split('And I will be there again')).toHaveLength(3);
		expect(changed.split('Never let go (Woo)')).toHaveLength(3);
		expect(changed).not.toContain('tonight');
		expect(changed).not.toContain('(Yeah)');
		expect(changed).toContain('[Verse]\nA second thing entirely');
		const headers = [0, changed.indexOf('[Chorus 2]')];
		expect(handle.getLinkDifferences?.(headers)).toEqual([]);
		const connections = handle.getLinkConnections?.(headers) ?? [];
		expect(connections.length).toBeGreaterThan(0);
		expect(connections.every((connection) => !connection.added)).toBe(true);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(SONG);
		expect(handle.getSectionLinks?.()).toEqual([]);
	});

	it('keeps the explicitly requested second section as the source instead of the overview representative', async () => {
		const { panel, handle, controller } = await setup();
		await openComparison(panel);
		const caret = SONG.indexOf('And I will be there again');
		handle.setSelection({ anchor: caret, head: caret });
		handle.requestSectionLink?.();
		await tick();
		expect(controller.linkingHeaderFrom).toBe(SONG.indexOf('[Chorus 2]'));
		expect(controller.linkingFromOverview).toBe(false);
		const source = panel.getByRole('checkbox', { name: /^Chorus 2 This section/ });
		expect(source).toBeChecked();
		expect(source).toBeDisabled();
		expect(panel.getByRole('checkbox', { name: /^Chorus Line/ })).not.toBeChecked();
	});

	it('refuses a reviewed choice if the editor has newer text than the shell snapshot', async () => {
		const { panel, handle, feedback, pauseSnapshotPublication } = await setup();
		await openComparison(panel);
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Choose wording per difference' }));
		await fireEvent.click(
			panel.getByRole('checkbox', {
				name: 'Use Chorus 2 wording for difference 1 in all 2 sections'
			})
		);
		// Reproduce the real handoff gap: the document has advanced while its
		// settled snapshot has not reached the panel yet.
		pauseSnapshotPublication();
		handle.dispatchAtomic({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: SONG.length, to: SONG.length, insert: '!' }]
		});
		await fireEvent.click(panel.getByRole('button', { name: 'Link and apply 1 change' }));

		expect(handle.getSnapshot().text).toBe(`${SONG}!`);
		expect(handle.getSectionLinks?.()).toEqual([]);
		expect(feedback.announcement).toBe(
			'The lyrics or links changed. Review the sections again before applying.'
		);
		expect(feedback.toasts.at(-1)?.message).toBe(feedback.announcement);
		expect(panel.getByRole('heading', { name: 'Link repeated sections' })).toBeTruthy();
	});

	it('keeps the current comparison on caret movement and retires it when the draft changes', async () => {
		const { panel, handle, controller, repository, initialDraft } = await setup();
		await openComparison(panel);
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Choose wording per difference' }));
		await fireEvent.click(
			panel.getByRole('checkbox', {
				name: 'Use Chorus 2 wording for difference 1 in all 2 sections'
			})
		);
		const caret = SONG.indexOf('[Chorus 2]');
		handle.setSelection({ anchor: caret, head: caret });
		controller.onSnapshot(handle.getSnapshot());
		await tick();
		expect(controller.linkingHeaderFrom).toBe(0);
		expect(controller.linkingFromOverview).toBe(true);
		expect(panel.getByRole('heading', { name: 'Link sections' })).toBeTruthy();
		expect(panel.getByRole('button', { name: 'Link and apply 1 change' })).toBeTruthy();

		const nextDraft: DraftRecord = {
			...initialDraft,
			id: 'draft-2',
			title: 'Other song',
			text: '[Verse]\nAnother song'
		};
		await repository.save(nextDraft);
		await controller.openDraft(nextDraft.id);
		await tick();
		expect(controller.linkingHeaderFrom).toBeUndefined();
		expect(controller.linkingFromOverview).toBe(false);
		expect(panel.getByRole('heading', { name: 'Link repeated sections' })).toBeTruthy();
		expect(panel.queryByRole('button', { name: 'Link and apply 1 change' })).toBeNull();
	});
});
