import { page } from 'vitest/browser';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { EditorView } from '@codemirror/view';
import EditorPane from '$lib/editor/EditorPane.svelte';
import Workspace from './Workspace.svelte';
import { createTestWorkbench } from '../test-utils.js';
import { workspaceEntrance } from './workspace-entrance.js';

let dispose: (() => void) | undefined;
let root: HTMLElement;

afterEach(async () => {
	await cleanup();
	dispose?.();
	dispose = undefined;
	root?.remove();
	vi.restoreAllMocks();
});

function fixture() {
	root = document.createElement('main');
	root.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; height: 480px; gap: 16px';
	const lyrics = Array.from(
		{ length: 100 },
		(_, i) =>
			`<div class="cm-line">Line ${i}: A long lyric with enough words to wrap across the phone screen</div>`
	).join('');
	const cards = Array.from(
		{ length: 100 },
		(_, i) =>
			`<li><button>Finding ${i}: A long diagnostic message that wraps on narrow screens</button></li>`
	).join('');
	root.innerHTML = `<div class="cm-scroller" style="overflow: auto"><div class="cm-content">${lyrics}</div></div><div class="right-panel__body" style="overflow: auto"><ol class="diagnostic-list">${cards}</ol></div>`;
	document.body.append(root);
	return root;
}

function running() {
	return root.getAnimations({ subtree: true });
}

function begin() {
	dispose = workspaceEntrance(root) as (() => void) | undefined;
}

describe('workspace entrance', () => {
	test('waits for the real editor viewport before revealing every visible lyric row', async () => {
		await page.viewport(1440, 900);
		const measure = EditorView.prototype.requestMeasure;
		const queued: Array<{
			view: EditorView;
			request: Parameters<EditorView['requestMeasure']>[0];
		}> = [];
		const deferred = vi.spyOn(EditorView.prototype, 'requestMeasure').mockImplementation(function (
			this: EditorView,
			request
		) {
			queued.push({ view: this, request });
		});
		const { controller } = createTestWorkbench({
			text: [
				'[Verse]',
				...Array.from(
					{ length: 120 },
					(_, i) => `Line ${i + 1} lyrics in this place, enough for my display`
				)
			].join('\n')
		});
		controller.setGrammarCheckEnabled(false);
		const view = await render(Workspace, {
			controller,
			editorComponent: EditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} }
		});
		root = view.container.querySelector<HTMLElement>('.workspace')!;
		await waitFor(() => expect(root.querySelector('.cm-line')).not.toBeNull());
		const initialRows = root.querySelectorAll('.cm-line').length;
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
		// CodeMirror initially draws an estimated viewport. Its first measurement
		// adds the lower visible rows, which must not miss the one-shot reveal.
		expect(root.querySelector('.cm-line')!.getAnimations()).toHaveLength(0);
		expect(root.dataset.workspaceEntrance).toContain('lyrics');
		deferred.mockRestore();
		for (const { view, request } of queued) measure.call(view, request);
		await waitFor(() => expect(root.querySelector('.cm-line')!.getAnimations()).toHaveLength(1));
		expect(root.querySelectorAll('.cm-line').length).toBeGreaterThan(initialRows);
		for (const animation of running()) {
			animation.pause();
			animation.currentTime = 0;
		}
		const clip = root.querySelector('.cm-scroller')!.getBoundingClientRect();
		const visible = [...root.querySelectorAll<HTMLElement>('.cm-line')].filter((row) => {
			const rect = row.getBoundingClientRect();
			return rect.bottom > clip.top && rect.top < Math.min(clip.bottom, window.innerHeight);
		});
		expect(visible.length).toBeGreaterThan(initialRows);
		for (const row of visible) {
			expect(row.getAnimations(), row.textContent!).toHaveLength(1);
			expect(getComputedStyle(row).opacity, row.textContent!).toBe('0');
		}
	});

	test('replays for opened and new scribes without remounting the workspace or replaying edits', async () => {
		await page.viewport(1440, 900);
		const { controller, repository } = createTestWorkbench({ text: '[Verse]\nfirst line.' });
		controller.setGrammarCheckEnabled(false);
		const first = (await repository.get(controller.draftId))!;
		await repository.save({
			...first,
			id: 'second-scribe',
			title: 'Second scribe',
			text: '[Verse]\nsecond line.'
		});
		const animate = vi.spyOn(Element.prototype, 'animate');
		const view = await render(Workspace, {
			controller,
			editorComponent: EditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} }
		});
		root = view.container.querySelector<HTMLElement>('.workspace')!;
		const revealed = (selector: string) =>
			animate.mock.contexts.filter(
				(element) => element instanceof Element && element.matches(selector)
			);
		await waitFor(() => expect(revealed('.cm-line').length).toBeGreaterThan(0));
		await waitFor(() => expect(revealed('.diagnostic-list > li').length).toBeGreaterThan(0));
		const originalLine = root.querySelector('.cm-line')!;
		const beforeOpen = revealed('.cm-line').length;
		const cardsBeforeOpen = revealed('.diagnostic-list > li').length;
		await controller.openDraft('second-scribe');
		await waitFor(() => expect(revealed('.cm-line').length).toBeGreaterThan(beforeOpen));
		await waitFor(() =>
			expect(revealed('.diagnostic-list > li').length).toBeGreaterThan(cardsBeforeOpen)
		);
		expect(view.container.querySelector('.workspace')).toBe(root);
		expect(root.querySelector('.cm-line')).not.toBe(originalLine);
		expect(root.dataset.entrancePending).toBe('false');

		await fireEvent.click(within(root).getByRole('button', { name: "New 'scribe" }));
		await waitFor(() => expect(revealed('.ll-placeholder-line').length).toBeGreaterThan(1));
		expect(controller.isEmpty).toBe(true);
		expect(view.container.querySelector('.workspace')).toBe(root);
		const beforeReopen = revealed('.cm-line').length;
		await controller.openDraft(first.id);
		await waitFor(() => expect(revealed('.cm-line').length).toBeGreaterThan(beforeReopen));
		const beforeEdit = animate.mock.calls.length;
		const editor = within(root).getByRole('textbox', { name: 'Lyrics editor' });
		await fireEvent.keyDown(editor, { key: 'a' });
		controller.editor.dispatchAtomic({
			baseRevision: controller.editor.getSnapshot().revision,
			edits: [{ from: 0, to: 0, insert: 'A' }]
		});
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
		expect(revealed('.cm-line').length).toBeGreaterThan(beforeReopen);
		expect(animate.mock.calls.length).toBe(beforeEdit);
		expect(root.hasAttribute('data-workspace-entrance')).toBe(false);
	});

	for (const width of [1440, 390]) {
		test(`staggers visible rows without changing text or layout at ${width}px`, async () => {
			await page.viewport(width, 800);
			fixture();
			// The production CSS minifier rewrites millisecond tokens as seconds.
			root.style.setProperty('--duration-workspace-entrance', width === 390 ? '.4s' : '400ms');
			root.style.setProperty('--duration-workspace-stagger', width === 390 ? '.06s' : '60ms');
			root.style.setProperty(
				'--duration-workspace-stagger-limit',
				width === 390 ? '.72s' : '720ms'
			);
			const originalText = root.textContent;
			const line = root.querySelector<HTMLElement>('.cm-line')!;
			const top = line.offsetTop;
			const restingTop = line.getBoundingClientRect().top;
			const height = root.scrollHeight;
			begin();
			await waitFor(() => expect(running().length).toBeGreaterThan(0));
			const animations = running();
			animations.forEach((animation) => animation.pause());
			const entrance = line.getAnimations()[0];
			expect(entrance.effect!.getTiming().duration).toBe(400);
			line.getAnimations().forEach((animation) => {
				animation.currentTime = 0;
			});
			expect(line.getBoundingClientRect().top).toBe(restingTop);
			line.getAnimations().forEach((animation) => {
				animation.currentTime = 200;
			});
			expect(line.getBoundingClientRect().top).toBe(restingTop);
			for (const selector of ['.cm-line', '.diagnostic-list > li']) {
				const rows = Array.from(root.querySelectorAll(selector));
				const animatedRows = rows.filter((row) => row.getAnimations().length > 0);
				for (const row of animatedRows) {
					expect(row.getAnimations()).toHaveLength(1);
					expect(getComputedStyle(row).transform).toBe('none');
				}
				const delays = animatedRows.map(
					(row) => row.getAnimations()[0].effect!.getTiming().delay ?? 0
				);
				expect(delays.length).toBeGreaterThan(1);
				expect(delays).toEqual([...delays].sort((a, b) => a - b));
				expect(Math.max(...delays)).toBeCloseTo(Math.min((delays.length - 1) * 60, 720), 4);
				// At one shared timeline position the first row is revealing,
				// while the following row is still completely transparent.
				const time = delays[1] / 2;
				for (const row of animatedRows)
					for (const animation of row.getAnimations()) animation.currentTime = time;
				expect(Number(getComputedStyle(animatedRows[0]).opacity)).toBeGreaterThan(0);
				expect(Number(getComputedStyle(animatedRows[0]).opacity)).toBeLessThan(1);
				expect(Number(getComputedStyle(animatedRows[1]).opacity)).toBe(0);
				expect(rows.at(-1)!.getAnimations()).toHaveLength(0);
			}
			expect(line.offsetTop).toBe(top);
			expect(root.scrollHeight).toBe(height);
			expect(root.textContent).toBe(originalText);
			for (const animation of animations) animation.finish();
			await waitFor(() => expect(running()).toHaveLength(0));
			expect(root.querySelectorAll('[style*="transform"], [style*="opacity"]')).toHaveLength(0);
			expect(root.hasAttribute('data-workspace-entrance')).toBe(false);
			root.querySelector('.cm-content')!.append(document.createElement('div'));
			await new Promise(requestAnimationFrame);
			expect(running()).toHaveLength(0);
		});
	}

	test('retires before input and never animates later findings or replacement lyrics', async () => {
		fixture();
		begin();
		await waitFor(() => expect(running().length).toBeGreaterThan(0));
		window.dispatchEvent(new Event('beforeinput'));
		expect(running()).toHaveLength(0);
		expect(root.querySelectorAll('[style*="transform"], [style*="opacity"]')).toHaveLength(0);
		expect(root.hasAttribute('data-workspace-entrance')).toBe(false);
		root.querySelector('.cm-content')!.innerHTML = '<div class="cm-line">Replacement lyrics</div>';
		root.querySelector('.diagnostic-list')!.innerHTML = '<li>New finding</li>';
		await new Promise(requestAnimationFrame);
		expect(running()).toHaveLength(0);
	});

	for (const scrolled of [false, true]) {
		test(`reveals every visible lyric row in a ${scrolled ? 'restored scroll position' : 'tall viewport'}`, async () => {
			await page.viewport(1440, 1800);
			fixture();
			const port = root.querySelector<HTMLElement>('.cm-scroller')!;
			if (scrolled) port.scrollTop = 1400;
			else root.style.height = '1600px';
			// Let restored scrolling settle before the entrance listens for interaction.
			await new Promise(requestAnimationFrame);
			await new Promise(requestAnimationFrame);
			const clip = port.getBoundingClientRect();
			const visible = [...root.querySelectorAll<HTMLElement>('.cm-line')].filter((row) => {
				const rect = row.getBoundingClientRect();
				return rect.bottom > clip.top && rect.top < clip.bottom;
			});
			expect(visible.length).toBeGreaterThan(scrolled ? 1 : 48);
			begin();
			await waitFor(() => expect(running().length).toBeGreaterThan(0));
			for (const animation of running()) {
				animation.pause();
				animation.currentTime = 0;
			}
			for (const row of visible) {
				expect(row.getAnimations(), row.textContent!).toHaveLength(1);
				expect(getComputedStyle(row).opacity).toBe('0');
			}
			const delays = visible.map((row) => row.getAnimations()[0].effect!.getTiming().delay ?? 0);
			expect(delays).toEqual([...delays].sort((a, b) => a - b));
			expect(Math.max(...delays)).toBeLessThanOrEqual(720);
		});
	}

	test('shows content immediately if startup outlasts the masking budget', async () => {
		fixture();
		root.dataset.entrancePending = 'true';
		begin();
		const line = root.querySelector<HTMLElement>('.cm-line')!;
		expect(getComputedStyle(line).opacity).toBe('0');
		await waitFor(() => expect(getComputedStyle(line).opacity).toBe('1'), { timeout: 3000 });
		expect(root.hasAttribute('data-workspace-entrance')).toBe(false);
		root.dataset.entrancePending = 'false';
		await new Promise(requestAnimationFrame);
		expect(running()).toHaveLength(0);
	});

	test('reveals ready lyrics while initial diagnostics are still loading', async () => {
		await page.viewport(1440, 900);
		const rules = Promise.withResolvers<typeof import('$lib/rules/engine.js')>();
		const { controller } = createTestWorkbench({ text: '[Verse]\nfirst line.' });
		controller.setGrammarCheckEnabled(false);
		const view = await render(Workspace, {
			controller,
			editorComponent: EditorPane,
			loadNativeRules: () => rules.promise,
			harperProvider: { lint: async () => [], dispose: async () => {} }
		});
		root = view.container.querySelector<HTMLElement>('.workspace')!;
		await waitFor(() => expect(root.querySelector('.cm-line')?.getAnimations()).toHaveLength(1));
		const line = root.querySelector<HTMLElement>('.cm-line')!;
		expect(root.dataset.diagnosticsPending).toBe('true');
		for (const animation of running()) animation.finish();
		await waitFor(() => expect(getComputedStyle(line).opacity).toBe('1'));
		rules.resolve(await import('$lib/rules/engine.js'));
		await waitFor(() =>
			expect(root.querySelector('.diagnostic-list > li')?.getAnimations()).toHaveLength(1)
		);
		expect(line.getAnimations()).toHaveLength(0);
	});

	test('reveals newly scrolled rows and keeps existing inline styles intact', async () => {
		fixture();
		const line = root.querySelector<HTMLElement>('.cm-line')!;
		line.style.opacity = '0.9';
		begin();
		await waitFor(() => expect(running().length).toBeGreaterThan(0));
		root.querySelector('.cm-scroller')!.scrollTop = 100;
		await waitFor(() => expect(running()).toHaveLength(0));
		expect(line.style.opacity).toBe('0.9');
		expect(root.hasAttribute('data-workspace-entrance')).toBe(false);
	});

	test('reveals all content if the animation API fails', async () => {
		fixture();
		vi.spyOn(Element.prototype, 'animate').mockImplementation(() => {
			throw new Error('Animation unavailable');
		});
		begin();
		await waitFor(() => expect(root.hasAttribute('data-workspace-entrance')).toBe(false));
		expect(getComputedStyle(root.querySelector('.cm-line')!).opacity).toBe('1');
	});

	test('skips reduced motion and cancels when the preference changes', async () => {
		fixture();
		const preference = new EventTarget() as MediaQueryList;
		Object.defineProperty(preference, 'matches', { value: true, configurable: true });
		vi.spyOn(window, 'matchMedia').mockReturnValue(preference);
		begin();
		expect(dispose).toBeUndefined();
		expect(running()).toHaveLength(0);
		Object.defineProperty(preference, 'matches', { value: false });
		begin();
		await waitFor(() => expect(running().length).toBeGreaterThan(0));
		preference.dispatchEvent(new Event('change'));
		expect(running()).toHaveLength(0);
		expect(root.querySelectorAll('[style*="transform"], [style*="opacity"]')).toHaveLength(0);
		expect(root.hasAttribute('data-workspace-entrance')).toBe(false);
	});

	test('cancels a pending frame on teardown', async () => {
		fixture();
		begin();
		dispose?.();
		await new Promise(requestAnimationFrame);
		expect(running()).toHaveLength(0);
	});
});
