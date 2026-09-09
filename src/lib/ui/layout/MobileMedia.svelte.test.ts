import { cdp, page } from 'vitest/browser';
import { tick } from 'svelte';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createTestWorkbench } from '../test-utils.js';
import { createFeedbackState } from '../state/feedback.svelte.js';
import { createInMemoryMediaRepository } from '../state/in-memory.js';
import { createMediaPlayer } from '../state/media-player.svelte.js';
import { StubAudio } from '../state/media-test-audio.js';
import { createStubPoll, createStubYouTubeApi } from '../state/media-test-youtube.js';
import MockEditorPane from './MockEditorPane.svelte';
import Workspace from './Workspace.svelte';

it('keeps one visible YouTube player and transport across every phone view', async () => {
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await page.viewport(390, 844);
	try {
		const youtube = createStubYouTubeApi();
		const audio = new StubAudio();
		const player = createMediaPlayer({
			feedback: createFeedbackState(),
			createAudio: () => audio.asMediaElement(),
			createObjectUrl: () => 'blob:test',
			revokeObjectUrl: () => {},
			loadYouTubeApi: youtube.load,
			scheduleYouTubePoll: createStubPoll().schedule
		});
		const { controller } = createTestWorkbench({
			text: '[Verse]\nFirst line\nSecond line',
			media: { repository: createInMemoryMediaRepository([]), player }
		});
		const view = await render(Workspace, {
			controller,
			editorComponent: MockEditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} }
		});
		await tick();
		await controller.media!.attachYouTube('https://youtu.be/dQw4w9WgXcQ');
		await expect.poll(() => youtube.players.length).toBeGreaterThan(0);
		expect(view.container.querySelectorAll('.media-video__frame')).toHaveLength(1);
		const mountCount = youtube.players.length;
		expect(mountCount).toBe(1);
		const source = youtube.players.at(-1)!;
		source.ready({ duration: 180, title: 'Test song' });
		player.seek(20);
		const frame = view.container.querySelector<HTMLElement>('.media-video__frame')!;
		await expect.element(page.getByTestId('media-strip')).toBeVisible();
		const strip = view.container.querySelector<HTMLElement>('.media-strip')!;
		const editor = view.container.querySelector('[data-testid="editor-region"]');
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		for (const name of ['Review', 'Tools', 'Write']) {
			await page.getByRole('button', { name, exact: true }).click();
			expect(view.container.querySelector('.media-video__frame')).toBe(frame);
			expect(view.container.querySelector('.media-strip')).toBe(strip);
			expect(view.container.querySelector('[data-testid="editor-region"]')).toBe(editor);
			expect(frame.checkVisibility()).toBe(true);
			const bounds = frame.getBoundingClientRect();
			expect(bounds.width).toBeGreaterThanOrEqual(200);
			expect(bounds.height).toBeGreaterThanOrEqual(200);
			expect(bounds.bottom).toBeLessThanOrEqual(844);
			await expect.element(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
			expect(player.currentTime).toBe(20);
			expect(youtube.players).toHaveLength(mountCount);
			expect(source.destroyed).toBe(false);
		}
	} finally {
		await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await page.viewport(800, 600);
	}
});
