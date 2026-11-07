import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorPane from '#lib/editor/EditorPane.svelte';
import type { runRules as RunRules } from '#lib/rules/engine.js';
import { createTestWorkbench } from '../test-utils.js';
import MockEditorPane from './MockEditorPane.svelte';
import Workspace from './Workspace.svelte';

type NativeModule = { runRules: typeof RunRules };
const pendingRules = () => Promise.withResolvers<NativeModule>();

async function mount(loadNativeRules: () => Promise<NativeModule>, text = '[Verse]\nOriginal') {
	const workbench = createTestWorkbench({ text });
	workbench.controller.setGrammarCheckEnabled(false);
	const view = await render(Workspace, {
		controller: workbench.controller,
		editorComponent: MockEditorPane,
		harperProvider: { lint: async () => [], dispose: async () => {} },
		loadNativeRules
	});
	await screen.findByRole('tab', { name: /Review/ });
	return { ...workbench, view };
}

async function typeLyrics(text: string) {
	await fireEvent.input(screen.getByRole('textbox', { name: 'Lyrics editor' }), {
		target: { value: text }
	});
}

// Let loader fulfillment and the resulting Svelte updates complete, including
// the negative cases where there should be no lint call to wait for.
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('Workspace native checker startup', () => {
	beforeEach(async () => {
		await page.viewport(1000, 800);
	});
	afterEach(async () => {
		await cleanup();
		vi.restoreAllMocks();
	});

	it('leaves an untouched empty draft ready for input without loading the catalog', async () => {
		const load = vi.fn(() => pendingRules().promise);
		await mount(load, '');
		await screen.findByText('Ready for your lyrics');
		await nextTask();
		expect(load).not.toHaveBeenCalled();
		expect(screen.queryByText('No issues found')).toBeNull();
		expect(screen.queryByText('Checking lyrics…')).toBeNull();
	});

	it('retains sample spelling, contraction, pronoun and real worker grammar after switching to Musixmatch', async () => {
		const { sampleDraftText } = await import('#lib/ui/sample-draft.js');
		const { controller } = createTestWorkbench({ text: sampleDraftText });
		await render(Workspace, { controller, editorComponent: EditorPane });
		await waitFor(() => expect(controller.editor.switchProfile).toBeTypeOf('function'));
		const musixmatch = await screen.findByRole('button', { name: 'Lyric format: Musixmatch' });
		await fireEvent.click(musixmatch);
		await waitFor(() => expect(controller.profile).toBe('musixmatch'));
		await waitFor(
			() => {
				const findings = controller.snapshot.diagnostics;
				for (const id of [
					'contraction.apostrophe',
					'spelling.english-common',
					'grammar.english-pronoun-i',
					'grammar.harper'
				]) {
					expect(
						findings.some((finding) => finding.ruleId === id),
						id
					).toBe(true);
				}
			},
			{ timeout: 20000 }
		);
		const grammar = controller.snapshot.diagnostics.find(
			(finding) => finding.ruleId === 'grammar.harper'
		);
		expect(grammar).toMatchObject({ sourceIds: ['T-HARPER'] });
		if (!grammar) throw new Error('Expected the sample agreement finding');
		expect(controller.snapshot.text.slice(grammar.from, grammar.to)).toBe('has');
	});

	it.each(['conversionRecovery', 'originalRecovery'] as const)(
		'opens protected %s without repeatedly publishing checking snapshots',
		async (kind) => {
			const { importDocument } = await import('#lib/conversion/index.js');
			const { createConversionEnvelope } = await import('#lib/persistence/conversion.js');
			const { profilePolicyVersions } = await import('#lib/profiles/versions.js');
			const { serializeScribe } = await import('#lib/scribe/format.js');
			const text = '[Verse: Mira]\nArchived source lyric';
			const model = importDocument({ text, profile: 'genius', language: 'en' });
			if (!model.ok) throw new Error(model.refusal.message);
			const checkpoint = createConversionEnvelope(model.value, 'genius', profilePolicyVersions);
			const reason = 'The original data is retained separately.';
			const source = serializeScribe({
				title: 'Protected recovery',
				lyrics: text,
				language: 'en',
				performers: [],
				lineAnchors: [],
				sectionLinks: [],
				ignoredDiagnostics: [],
				...(kind === 'conversionRecovery'
					? {
							conversion: checkpoint,
							conversionRecovery: { text, checkpoint, reason, sourceDraftId: 'foreign-original' }
						}
					: { originalRecovery: { sourceDraftId: 'foreign-original', reason } })
			});
			const { controller } = createTestWorkbench();
			expect(await controller.importScribe(new File([source], 'recovery.lls'))).toBe(true);
			const native = await import('#lib/rules/engine.js');
			const loadNativeRules = vi.fn(async () => native);
			await render(Workspace, {
				controller,
				editorComponent: EditorPane,
				harperProvider: { lint: async () => [], dispose: async () => {} },
				loadNativeRules
			});
			await waitFor(() =>
				expect(controller.editor.dispatchConversionAction).toBeTypeOf('function')
			);
			await nextTask();
			expect(controller.snapshot.text).toBe(text);
			expect(controller.snapshot[kind]?.reason).toBe(reason);
			expect(controller.snapshot.diagnostics).toEqual([]);
			expect(loadNativeRules).not.toHaveBeenCalled();
		}
	);

	it('settles a confirmed quantity without changing its text and restores review on undo', async () => {
		const native = await import('#lib/rules/engine.js');
		const { controller } = createTestWorkbench({ text: '12 stars and 12 moons.' });
		controller.setGrammarCheckEnabled(false);
		await render(Workspace, {
			controller,
			editorComponent: EditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} },
			loadNativeRules: async () => native
		});
		await waitFor(() => expect(controller.editor.dispatchConversionAction).toBeTypeOf('function'));
		controller.switchProfile('musixmatch');
		const quantities = () =>
			controller.snapshot.diagnostics.filter((finding) => finding.ruleId === 'mxm.numbers.context');
		await waitFor(() => expect(quantities()).toHaveLength(2));
		expect(
			controller.applyConversionAction({
				kind: 'confirmQuantity',
				range: { from: 0, to: 2 },
				facts: {
					profile: 'musixmatch',
					language: 'en',
					value: '12',
					usage: 'ordinary-cardinal',
					pronunciation: 'whole-quantity'
				}
			})
		).toBe(true);
		await waitFor(() => expect(quantities().map((finding) => finding.from)).toEqual([13]));
		expect(controller.snapshot.text).toBe('12 stars and 12 moons.');
		expect(
			controller.snapshot.diagnostics.some(
				(finding) => finding.ruleId === 'mxm.punctuation.line-ending'
			)
		).toBe(true);
		controller.editor.undo();
		await waitFor(() => expect(quantities()).toHaveLength(2));
		expect(controller.snapshot.text).toBe('12 stars and 12 moons.');
	});

	it('publishes real checking snapshots while preserving hidden language ownership', async () => {
		const native = await import('#lib/rules/engine.js');
		const { controller } = createTestWorkbench({ text: '[Verse]\nMoon Star Sun' });
		controller.setGrammarCheckEnabled(false);
		await render(Workspace, {
			controller,
			editorComponent: EditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} },
			loadNativeRules: async () => native
		});
		await waitFor(() => expect(controller.editor.dispatchConversionAction).toBeTypeOf('function'));
		controller.switchProfile('musixmatch');
		expect(
			controller.applyConversionAction({
				kind: 'setPassageLanguage',
				range: { from: 0, to: 13 },
				language: 'de'
			})
		).toBe(true);
		expect(
			controller.applyConversionAction({
				kind: 'setForm',
				range: { from: 5, to: 9 },
				profile: 'genius',
				text: ''
			})
		).toBe(true);
		controller.switchProfile('genius');
		await waitFor(() => expect(controller.snapshot.text).toBe('[Verse]\nMoon  Sun'));
		const before = controller.snapshot.revision;
		expect(
			controller.applyConversionAction({
				kind: 'setPassageLanguage',
				range: { from: 0, to: controller.snapshot.text.length },
				language: 'fr'
			})
		).toBe(true);
		await waitFor(() => expect(controller.snapshot.revision).toBeGreaterThan(before));
		expect(
			controller.snapshot.conversion?.model.languageRanges.find((range) => range.language === 'de')
		).toMatchObject({ from: 5, to: 9 });
		expect(controller.snapshot.text).toBe('[Verse]\nMoon  Sun');
		controller.switchProfile('musixmatch');
		await waitFor(() => expect(controller.snapshot.text).toBe('Moon Star Sun'));
		expect(
			controller.snapshot.conversion?.model.languageRanges.find((range) => range.language === 'de')
		).toMatchObject({ from: 5, to: 9 });
		controller.switchProfile('genius');
		await waitFor(() => expect(controller.snapshot.text).toBe('[Verse]\nMoon  Sun'));
	});

	it('reruns real native and Harper checks for metadata-only passage language and scope undo/redo', async () => {
		const native = await import('#lib/rules/engine.js');
		const { createHarperDiagnosticProvider } = await import('#lib/rules/harper.js');
		const [{ LocalLinter }, { binary }] = await Promise.all([
			import('harper.js'),
			import('harper.js/binary')
		]);
		const provider = createHarperDiagnosticProvider(async () => new LocalLinter({ binary }));
		const text = '[Verse]\nBonjour\nCuz you stay\nI has counted every streetlight';
		const { controller } = createTestWorkbench({ text });
		controller.setGrammarCheckEnabled(true);
		try {
			await render(Workspace, {
				controller,
				editorComponent: EditorPane,
				harperProvider: provider,
				loadNativeRules: async () => native
			});
			await waitFor(() =>
				expect(controller.editor.dispatchConversionAction).toBeTypeOf('function')
			);
			const bonjour = () =>
				controller.snapshot.diagnostics.filter((d) => text.slice(d.from, d.to) === 'Bonjour');
			await waitFor(() => expect(bonjour().length).toBeGreaterThan(0));
			for (const language of ['zz-Latn-custom', 'fr']) {
				expect(
					controller.applyConversionAction({
						kind: 'setPassageLanguage',
						range: { from: 8, to: 15 },
						language
					})
				).toBe(true);
				await waitFor(() => expect(bonjour()).toEqual([]));
				await waitFor(() =>
					expect(
						controller.snapshot.diagnostics.some((d) => text.slice(d.from, d.to) === 'has')
					).toBe(true)
				);
				expect(
					controller.snapshot.diagnostics.some((d) => d.ruleId === 'spelling.standardized')
				).toBe(true);
				expect(controller.snapshot.text).toBe(text);
				controller.editor.undo();
				await waitFor(() => expect(bonjour().length).toBeGreaterThan(0));
				controller.editor.redo();
				await waitFor(() => expect(bonjour()).toEqual([]));
				expect(controller.snapshot.text).toBe(text);
				controller.editor.undo();
				await waitFor(() => expect(bonjour().length).toBeGreaterThan(0));
			}
		} finally {
			await cleanup();
			await provider.dispose();
		}
	});

	it('never publishes an unlinked-repeat finding while the real editor restores saved links', async () => {
		const native = await import('#lib/rules/engine.js');
		const text = ['[Chorus]', 'Go', '', '[Verse]', 'Hey', '', '[Chorus 2]', 'Go'].join('\n');
		const { controller } = createTestWorkbench({ text, sectionLinks: [{ lines: [1, 7] }] });
		controller.setGrammarCheckEnabled(false);
		const published = vi.spyOn(controller, 'onSnapshot');
		await render(Workspace, {
			controller,
			editorComponent: EditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} },
			loadNativeRules: async () => native
		});
		await waitFor(() =>
			expect(controller.editor.getSectionLinks?.().map((group) => group.lines)).toEqual([[1, 7]])
		);
		await waitFor(() => expect(controller.snapshot.diagnostics.length).toBeGreaterThan(0));
		expect(published.mock.calls.length).toBeGreaterThan(0);
		expect(
			published.mock.calls
				.flatMap(([snapshot]) => snapshot.diagnostics)
				.filter((diagnostic) => diagnostic.ruleId === 'section.unlinked-repeat')
		).toEqual([]);
	});

	it('keeps pending distinct from clean and checks the latest edit when loading finishes', async () => {
		const pending = pendingRules();
		const load = vi.fn(() => pending.promise);
		const runRules = vi.fn<typeof RunRules>(() => []);
		const { controller, repository } = await mount(load);
		await screen.findByText('Checking lyrics…');
		expect(screen.queryByText('No issues found')).toBeNull();
		await typeLyrics('[Verse]\nLatest');
		expect(controller.snapshot.text).toBe('[Verse]\nLatest');
		await controller.flushAutosave();
		expect((await repository.get(controller.draftId))?.text).toBe('[Verse]\nLatest');
		expect(load).toHaveBeenCalledTimes(1);
		expect(runRules).not.toHaveBeenCalled();
		pending.resolve({ runRules });
		await waitFor(() => expect(runRules).toHaveBeenCalled());
		expect(runRules.mock.calls.every(([document]) => document.text === '[Verse]\nLatest')).toBe(
			true
		);
		await screen.findByText('No issues found');
	});

	it('checks the replacement draft rather than the draft that began loading', async () => {
		const pending = pendingRules();
		const runRules = vi.fn<typeof RunRules>(() => []);
		const { controller } = await mount(() => pending.promise);
		const previousDraft = controller.draftId;
		await fireEvent.click(screen.getByRole('button', { name: "New 'scribe" }));
		await waitFor(() => expect(controller.draftId).not.toBe(previousDraft));
		await typeLyrics('[Verse]\nAnother draft');
		pending.resolve({ runRules });
		await waitFor(() => expect(runRules).toHaveBeenCalled());
		expect(
			runRules.mock.calls.every(([document]) => document.text === '[Verse]\nAnother draft')
		).toBe(true);
	});

	it('waits for a committed snapshot when loading completes during composition', async () => {
		const pending = pendingRules();
		const runRules = vi.fn<typeof RunRules>(() => []);
		const { controller } = await mount(() => pending.promise);
		controller.onSnapshot({ ...controller.snapshot, composing: true });
		pending.resolve({ runRules });
		await nextTask();
		expect(runRules).not.toHaveBeenCalled();
		expect(screen.queryByText('No issues found')).toBeNull();
		expect(screen.getByText('Checking lyrics…')).toBeTruthy();
		const text = '[Verse]\nCommitted';
		await typeLyrics(text);
		await waitFor(() => expect(runRules).toHaveBeenCalled());
		expect(runRules.mock.calls.every(([document]) => document.text === text)).toBe(true);
	});

	it('announces and toasts a load failure, then retries against current lyrics', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const first = pendingRules();
		const retry = pendingRules();
		const load = vi
			.fn<() => Promise<NativeModule>>()
			.mockImplementationOnce(() => first.promise)
			.mockImplementationOnce(() => retry.promise);
		const runRules = vi.fn<typeof RunRules>(() => []);
		const { feedback } = await mount(load);
		first.reject(new Error('Network unavailable'));
		const button = await screen.findByRole('button', { name: 'Retry checking' });
		expect(feedback.announcement).toBe('Lyric checking could not load. Retry in Review.');
		expect(feedback.toasts.some((toast) => toast.message === feedback.announcement)).toBe(true);
		expect(screen.queryByText('No issues found')).toBeNull();
		await typeLyrics('[Verse]\nEdited after failure');
		button.focus();
		await fireEvent.click(button);
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Review/ }))
		);
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		await screen.findByText('Checking lyrics…');
		await typeLyrics('[Verse]\nEdited during retry');
		retry.resolve({ runRules });
		await waitFor(() => expect(runRules).toHaveBeenCalled());
		expect(
			runRules.mock.calls.every(([document]) => document.text === '[Verse]\nEdited during retry')
		).toBe(true);
	});

	it('ignores a loader completing after the workspace is destroyed', async () => {
		const pending = pendingRules();
		const runRules = vi.fn<typeof RunRules>(() => []);
		const { view, controller, feedback } = await mount(() => pending.promise);
		await view.unmount();
		const snapshot = controller.snapshot;
		pending.resolve({ runRules });
		await nextTask();
		expect(runRules).not.toHaveBeenCalled();
		expect(controller.snapshot).toBe(snapshot);
		expect(feedback.toasts).toHaveLength(0);
	});
});
