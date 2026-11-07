import { fireEvent, waitFor, within } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test, vi } from 'vitest';
import type { EditorHandle } from '#lib/core/types.js';
import EditorPane from '#lib/editor/EditorPane.svelte';
import { createTestWorkbench } from '../test-utils.js';
import { createMediaPlayer } from '../state/media-player.svelte.js';
import { createFeedbackState } from '../state/feedback.svelte.js';
import { createInMemoryMediaRepository } from '../state/in-memory.js';
import { StubAudio } from '../state/media-test-audio.js';
import ConversionFacts from './ConversionFacts.svelte';
import RepeatExpansion from './RepeatExpansion.svelte';

async function setup(text = '[Verse]\n2 stars') {
	const audio = new StubAudio();
	const player = createMediaPlayer({
		feedback: createFeedbackState(),
		createAudio: () => audio,
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl() {}
	});
	const workbench = createTestWorkbench({
		text,
		revision: 0,
		media: { repository: createInMemoryMediaRepository([]), player }
	});
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: text,
			context: { language: 'en', performers: [], ruleSetVersion: 'test' },
			callbacks: {
				onSnapshot: (snapshot) => workbench.controller.onSnapshot(snapshot),
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
	handle!.setSelection({ anchor: 0, head: 1 });
	await waitFor(() => expect(workbench.controller.snapshot.selection.head).toBe(1));
	const view = await render(ConversionFacts, { controller: workbench.controller });
	const panel = within(view.container);
	await fireEvent.click(panel.getByText('Decisions that need listening'));
	return { ...workbench, handle: handle!, view, panel, audio, player };
}

async function fillQuantity(panel: ReturnType<typeof within>, value = '2') {
	await fireEvent.input(panel.getByLabelText('Exact whole-number value'), { target: { value } });
	await fireEvent.change(panel.getByLabelText('How is this number used?'), {
		target: { value: 'ordinary-cardinal' }
	});
	await fireEvent.change(panel.getByLabelText('How is it sung?'), {
		target: { value: 'whole-quantity' }
	});
}

afterEach(async () => {
	await cleanup();
	await page.viewport(1280, 720);
});

test.each([390, 1200])(
	'previews exact decisions without mutation, keeps the trigger stable, and preserves source wording at %i px',
	async (width) => {
		await page.viewport(width, 844);
		const { panel, controller, handle, view, player } = await setup();
		await fillQuantity(panel);
		const before = JSON.stringify(controller.snapshot.conversion?.model);
		const trigger = panel.getByRole('button', { name: 'Preview quantity' });
		const top = trigger.getBoundingClientRect().top;
		await fireEvent.click(trigger);
		expect(panel.getByText('Proposed Musixmatch wording: two')).toBeVisible();
		expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(before);
		expect(trigger.getBoundingClientRect().top).toBe(top);
		expect(view.container.scrollWidth).toBeLessThanOrEqual(width);
		await fireEvent.click(panel.getByRole('button', { name: 'Apply quantity' }));
		await waitFor(() => expect(controller.snapshot.text).toBe('two stars'));
		for (let n = 0; n < 4; n++) {
			controller.switchProfile('genius');
			expect(handle.getSnapshot().text).toBe('[Verse]\n2 stars');
			controller.switchProfile('musixmatch');
			expect(handle.getSnapshot().text).toBe('two stars');
		}
		player.destroy();
	}
);

test('uses the selected passage language and retires a preview when its facts change', async () => {
	const { panel, controller, player } = await setup();
	await fillQuantity(panel);
	await fireEvent.click(panel.getByRole('button', { name: 'Preview quantity' }));
	expect(panel.getByRole('button', { name: 'Apply quantity' })).toBeVisible();
	await fireEvent.input(panel.getByLabelText('Exact whole-number value'), {
		target: { value: '3' }
	});
	expect(panel.queryByRole('button', { name: 'Apply quantity' })).toBeNull();
	expect(panel.getByRole('button', { name: 'Preview quantity' })).toBeDisabled();
	expect(
		panel.getByText('The selected digits do not match the exact confirmed quantity.')
	).toBeVisible();
	controller.applyConversionAction({
		kind: 'setPassageLanguage',
		range: { from: 0, to: 1 },
		language: 'ar'
	});
	await fillQuantity(panel);
	expect(panel.getByRole('button', { name: 'Preview quantity' })).toBeDisabled();
	expect(panel.queryByRole('button', { name: 'Apply quantity' })).toBeNull();
	expect(
		panel.getByText(/Dedicated Arabic or Korean numeric-policy evidence is incomplete/u)
	).toBeVisible();
	player.destroy();
});

test.each([false, true])(
	'requires exact interval facts, invalidates listening confirmation, and confirms without duplicating an existing marker (%s)',
	async (existingMarker) => {
		const { panel, controller, handle, audio, player } = await setup(
			existingMarker
				? '[Verse]\nOne\n\n#INSTRUMENTAL\n\n[Chorus]\nTwo'
				: '[Verse]\nOne\n\n[Chorus]\nTwo'
		);
		await fireEvent.click(panel.getByRole('button', { name: 'Instrumental interval' }));
		if (existingMarker) {
			const from = controller.snapshot.text.indexOf('#INSTRUMENTAL');
			handle.setSelection({ anchor: from, head: from + '#INSTRUMENTAL'.length });
			await waitFor(() =>
				expect(
					panel.getByText(
						'The selected #INSTRUMENTAL will become a confirmed Musixmatch marker. Genius will omit it.'
					)
				).toBeVisible()
			);
		}
		expect(
			controller.snapshot.conversion!.model.sections.every((section) => section.type === undefined)
		).toBe(true);
		expect(panel.getByRole('option', { name: 'Verse → Chorus' })).toBeTruthy();
		await controller.media!.attachFile(new File(['audio'], 'song.mp3', { type: 'audio/mpeg' }));
		audio.setDuration(60);
		controller.applyConversionAction({
			kind: 'setRecording',
			recordingId: controller.media!.recordingId
		});
		await fireEvent.change(panel.getByLabelText('Between sections'), {
			target: { value: controller.snapshot.conversion!.model.sections[0].id }
		});
		await fireEvent.input(panel.getByLabelText('Starts at (seconds)'), { target: { value: '5' } });
		await fireEvent.input(panel.getByLabelText('Ends at (seconds)'), { target: { value: '20' } });
		const confirmation = panel.getByRole('checkbox');
		await fireEvent.click(confirmation);
		await fireEvent.click(panel.getByRole('button', { name: 'Preview instrumental interval' }));
		expect(panel.queryByRole('button', { name: 'Save instrumental interval' })).toBeNull();
		await fireEvent.input(panel.getByLabelText('Ends at (seconds)'), { target: { value: '21' } });
		expect(confirmation).not.toBeChecked();
		await fireEvent.click(confirmation);
		await fireEvent.click(panel.getByRole('button', { name: 'Preview instrumental interval' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Save instrumental interval' }));
		await waitFor(() => expect(controller.snapshot.text).toBe('One\n\n#INSTRUMENTAL\n\nTwo'));
		controller.switchProfile('genius');
		expect(handle.getSnapshot().text).toBe('[Verse]\nOne\n\n[Chorus]\nTwo');
		controller.switchProfile('musixmatch');
		expect(handle.getSnapshot().text).toBe('One\n\n#INSTRUMENTAL\n\nTwo');
		player.destroy();
	}
);

test('expands only an explicitly selected repeat scope and count after an exact preview', async () => {
	const { controller, handle, player } = await setup('[Verse]\nAgain (x3)');
	handle.setSelection({ anchor: 0, head: 5 });
	const view = await render(RepeatExpansion, { controller });
	const panel = within(view.container);
	await fireEvent.click(panel.getByText('Expand a repeated passage'));
	await fireEvent.click(panel.getByRole('button', { name: 'Use selected passage' }));
	handle.setSelection({ anchor: 6, head: 10 });
	await fireEvent.input(panel.getByLabelText('Total occurrences, including the first'), {
		target: { value: '3' }
	});
	const before = JSON.stringify(controller.snapshot.conversion?.model);
	await fireEvent.click(panel.getByRole('button', { name: 'Preview repetitions' }));
	expect(panel.getByLabelText('Expanded passage preview').textContent).toBe('Again\nAgain\nAgain');
	expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(before);
	await fireEvent.click(panel.getByRole('button', { name: 'Expand this passage' }));
	expect(handle.getSnapshot().text).toBe('Again\nAgain\nAgain');
	controller.switchProfile('genius');
	expect(handle.getSnapshot().text).toBe('[Verse]\nAgain\nAgain\nAgain');
	handle.undo();
	handle.undo();
	expect(handle.getSnapshot().text).toBe('Again (x3)');
	player.destroy();
});

test.each(['2', '２'])(
	'requires French sung wording and proves source digits for %s',
	async (source) => {
		const { panel, controller, handle, player } = await setup('[Verse]\n' + source + ' étoiles');
		controller.applyConversionAction({ kind: 'setLanguage', language: 'fr' });
		handle.setSelection({ anchor: 0, head: 1 });
		await fillQuantity(panel);
		expect(panel.getByLabelText('Exact words as sung (required)')).toBeVisible();
		expect(panel.getByRole('button', { name: 'Preview quantity' })).toBeDisabled();
		await fireEvent.input(panel.getByLabelText('Exact words as sung (required)'), {
			target: { value: 'deux' }
		});
		const before = JSON.stringify(controller.snapshot.conversion?.model);
		await fireEvent.click(panel.getByRole('button', { name: 'Preview quantity' }));
		expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(before);
		await fireEvent.click(panel.getByRole('button', { name: 'Apply quantity' }));
		expect(controller.snapshot.text).toBe('deux étoiles');
		player.destroy();
	}
);

test('unsupported roles offer a local next action without a conversion or generic fact', async () => {
	const { panel, controller, player } = await setup();
	const before = JSON.stringify(controller.snapshot.conversion?.model);
	await fireEvent.change(panel.getByLabelText('How is this number used?'), {
		target: { value: 'date-or-time' }
	});
	expect(panel.queryByLabelText('How is it sung?')).toBeNull();
	expect(panel.queryByRole('button', { name: 'Preview quantity' })).toBeNull();
	expect(panel.getByRole('status').textContent?.replace(/\s+/gu, ' ')).toContain(
		'Use Edit in lyrics'
	);
	expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(before);
	player.destroy();
});

test('previews a chosen ASCII target for full-width French source without changing its annotation', async () => {
	const source = "[Verse]\nJ'ai compté [１３](123456) étoiles";
	const { panel, controller, handle, player } = await setup(source);
	controller.applyConversionAction({ kind: 'setLanguage', language: 'fr' });
	handle.setSelection({ anchor: 12, head: 14 });
	await waitFor(() => expect(controller.snapshot.selection.head).toBe(14));
	await fillQuantity(panel, '13');
	await fireEvent.click(panel.getByText('Use custom exact wording'));
	await fireEvent.input(panel.getByLabelText('Digit form, if applicable'), {
		target: { value: '13' }
	});
	const before = JSON.stringify(controller.snapshot.conversion?.model);
	await fireEvent.click(panel.getByRole('button', { name: 'Preview quantity' }));
	expect(panel.getByText('Proposed Musixmatch wording: 13')).toBeVisible();
	expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(before);
	await fireEvent.click(panel.getByRole('button', { name: 'Apply quantity' }));
	await waitFor(() => expect(controller.snapshot.text).toBe("J'ai compté 13 étoiles"));
	controller.switchProfile('genius');
	expect(handle.getSnapshot().text).toBe(source);
	player.destroy();
});
