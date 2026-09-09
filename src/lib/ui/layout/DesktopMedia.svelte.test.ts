import { cdp, page } from 'vitest/browser';
import { tick } from 'svelte';
import { afterEach, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createTestWorkbench } from '../test-utils.js';
import { createFeedbackState } from '../state/feedback.svelte.js';
import { createInMemoryMediaRepository } from '../state/in-memory.js';
import { createMediaPlayer } from '../state/media-player.svelte.js';
import { StubAudio } from '../state/media-test-audio.js';
import { createStubPoll, createStubYouTubeApi } from '../state/media-test-youtube.js';
import EditorPane from '$lib/editor/EditorPane.svelte';
import Workspace from './Workspace.svelte';

afterEach(async () => {
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
	await page.viewport(800, 600);
});

it('keeps visible lyrics beside one 16:9 floating player across desktop sizes and phone views', async () => {
	await page.viewport(1440, 800);
	expect(window.matchMedia('(pointer: fine)').matches).toBe(true);
	const youtube = createStubYouTubeApi();
	const player = createMediaPlayer({
		feedback: createFeedbackState(),
		createAudio: () => new StubAudio().asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {},
		loadYouTubeApi: youtube.load,
		scheduleYouTubePoll: createStubPoll().schedule
	});
	const lyrics = [
		'[Verse]',
		'First line',
		...Array.from({ length: 70 }, (_, index) => `Lyric line ${index + 1}`),
		'Last lyric line'
	].join('\n');
	const { controller } = createTestWorkbench({
		text: lyrics,
		media: { repository: createInMemoryMediaRepository([]), player }
	});
	const view = await render(Workspace, {
		controller,
		editorComponent: EditorPane,
		harperProvider: { lint: async () => [], dispose: async () => {} }
	});
	await tick();
	await expect.element(page.getByRole('tab', { name: /Review/ })).toBeVisible();
	const panel = view.container.querySelector<HTMLElement>('.right-panel')!;
	const dock = view.container.querySelector<HTMLElement>('.right-panel__header')!;
	const originalDockHeight = dock.getBoundingClientRect().height;
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	const content = view.container.querySelector<HTMLElement>('.cm-content')!;
	const normalBottomPadding = getComputedStyle(content).paddingBottom;
	await controller.media!.attachYouTube('https://youtu.be/dQw4w9WgXcQ');
	await expect.poll(() => youtube.players.length).toBe(1);
	const source = youtube.players[0];
	source.ready({ duration: 180, title: 'Test song' });
	const frame = view.container.querySelector<HTMLElement>('.media-video__frame')!;
	const editor = view.container.querySelector<HTMLElement>('.editor-host')!;
	const region = view.container.querySelector<HTMLElement>('.editor-region')!;
	async function expectVideoInsideEditor() {
		await expect.poll(() => frame.getBoundingClientRect().width).toBeCloseTo((200 * 16) / 9, 1);
		const bounds = frame.getBoundingClientRect();
		const editorBounds = editor.getBoundingClientRect();
		expect(bounds.height).toBeCloseTo(200, 1);
		expect(bounds.width / bounds.height).toBeCloseTo(16 / 9, 2);
		expect(bounds.left).toBeGreaterThanOrEqual(editorBounds.left);
		expect(bounds.right).toBeLessThanOrEqual(editorBounds.right);
		expect(bounds.bottom).toBeLessThanOrEqual(editorBounds.bottom);
		await expect
			.poll(() => {
				const videoBounds = frame.getBoundingClientRect();
				const lyricBounds = editor.getBoundingClientRect();
				return Math.abs(
					lyricBounds.right - videoBounds.right - (lyricBounds.bottom - videoBounds.bottom)
				);
			})
			.toBeLessThan(1);
		expect(view.container.querySelector('.media-video__frame')).toBe(frame);
	}
	await expectVideoInsideEditor();
	expect(dock.getBoundingClientRect().height).toBe(originalDockHeight);
	await page.getByRole('button', { name: 'Expand editor' }).click();
	await expectVideoInsideEditor();
	await page.getByRole('button', { name: /^Show tools/ }).click();
	await expectVideoInsideEditor();

	for (const width of [1000, 700]) {
		await page.viewport(width, 800);
		await expect.poll(() => editor.getBoundingClientRect().height).toBeGreaterThan(300);
		await expect.poll(() => editor.getBoundingClientRect().width).toBeGreaterThan(width * 0.9);
		expect(getComputedStyle(region).gridColumnStart).toBe('1');
		await expectVideoInsideEditor();
		expect(panel.getBoundingClientRect().height).toBeGreaterThan(200);
		// The real CodeMirror text must be painted in the visible first column,
		// not shifted into an implicit grid column beside the floating player.
		const line = Array.from(view.container.querySelectorAll<HTMLElement>('.cm-line')).find(
			(node) => node.textContent === 'First line'
		)!;
		expect(line).toBeTruthy();
		const bounds = line.getBoundingClientRect();
		const x = bounds.left + 4;
		const y = bounds.top + bounds.height / 2;
		expect(x).toBeGreaterThan(0);
		expect(x).toBeLessThan(width);
		expect(y).toBeLessThan(frame.getBoundingClientRect().top);
		expect(line.contains(document.elementFromPoint(x, y))).toBe(true);
	}
	// Scroll the actual CodeMirror viewport to its end, waiting for virtualized
	// lines to be drawn. The last lyric must clear the player's entire height.
	const scroller = view.container.querySelector<HTMLElement>('.cm-scroller')!;
	const finalLine = () =>
		Array.from(content.querySelectorAll<HTMLElement>('.cm-line')).find(
			(node) => node.textContent === 'Last lyric line'
		);
	await expect
		.poll(() => {
			scroller.scrollTop = scroller.scrollHeight;
			const bounds = finalLine()?.getBoundingClientRect();
			return (
				!!bounds &&
				bounds.bottom < frame.getBoundingClientRect().top &&
				bounds.top >= scroller.getBoundingClientRect().top
			);
		})
		.toBe(true);
	const lastLine = finalLine()!;
	const lastBounds = lastLine.getBoundingClientRect();
	expect(
		lastLine.contains(
			document.elementFromPoint(lastBounds.left + 4, lastBounds.top + lastBounds.height / 2)
		)
	).toBe(true);
	expect(controller.editor?.getSnapshot().text).toBe(lyrics);
	expect(controller.editor?.getSnapshot().text.endsWith('Last lyric line')).toBe(true);
	await page.getByRole('button', { name: 'Expand editor' }).click();
	await expect.poll(() => frame.getBoundingClientRect().bottom).toBeGreaterThan(600);
	await expectVideoInsideEditor();
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await page.viewport(390, 844);
	await expect.element(page.getByRole('navigation', { name: 'Workbench views' })).toBeVisible();
	await expect.poll(() => getComputedStyle(content).paddingBottom).toBe(normalBottomPadding);
	expect(controller.editor?.getSnapshot().text).toBe(lyrics);
	await page.getByRole('button', { name: 'Tools', exact: true }).click();
	expect(view.container.querySelector('.media-video__frame')).toBe(frame);
	expect(frame.checkVisibility()).toBe(true);
	expect(youtube.players).toHaveLength(1);
	expect(source.destroyed).toBe(false);
});
