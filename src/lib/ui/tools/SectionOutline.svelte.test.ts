import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { importDocument } from '#lib/conversion/index.js';
import { createLyricEditor } from '#lib/editor/create-editor.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { chooseOption, createTestWorkbench } from '../test-utils.js';
import SectionOutline from './SectionOutline.svelte';

const lyrics = [
	'Back down the block',
	'Counting every light',
	'',
	'Hold the line',
	'Hold the line',
	'',
	'Morning through the glass',
	'',
	'Hold the line',
	'Hold the line'
].join('\n');

const disposers: (() => void)[] = [];
afterEach(async () => {
	await cleanup();
	for (const dispose of disposers.splice(0)) dispose();
});

async function mount(text: string, profile: 'genius' | 'musixmatch') {
	const imported = importDocument({ text, profile, language: 'en' });
	if (!imported.ok) throw new Error(imported.refusal.message);
	const { controller } = createTestWorkbench({
		conversion: createConversionEnvelope(imported.value, profile, profilePolicyVersions),
		selection: { anchor: 0, head: 0 }
	});
	const host = document.createElement('div');
	document.body.append(host);
	const editor = createLyricEditor(host, {
		initialText: controller.snapshot.text,
		initialConversion: controller.snapshot.conversion,
		context: { language: 'en', performers: [], ruleSetVersion: 'test' },
		callbacks: {
			onSnapshot: (snapshot) => controller.onSnapshot(snapshot),
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onAnnouncement: vi.fn()
		}
	});
	disposers.push(() => {
		editor.destroy();
		host.remove();
	});
	controller.setEditorHandle(editor.handle);
	controller.onSnapshot(editor.handle.getSnapshot());
	await render(SectionOutline, { controller });
	return controller;
}

const tagOf = (line: number) =>
	screen.getByRole('combobox', { name: `Tag for the stanza on line ${line}` });
const sections = (controller: Awaited<ReturnType<typeof mount>>) =>
	controller.snapshot.conversion!.model.sections.map((section) => section.type);

describe('the Sections outline of a Musixmatch draft', () => {
	test('lists every stanza by its first line and tags one without moving the caret', async () => {
		const controller = await mount(lyrics, 'musixmatch');
		expect(screen.getByRole('heading', { name: 'Sections' })).toBeVisible();
		expect(screen.getByText(/^0 of 4 stanzas tagged\./u)).toBeVisible();
		expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
			expect.stringContaining('Back down the block'),
			expect.stringContaining('Hold the line'),
			expect.stringContaining('Morning through the glass'),
			expect.stringContaining('Hold the line')
		]);
		expect(tagOf(4)).toHaveTextContent('Add tag');

		await chooseOption(tagOf(4), 'Chorus');

		await waitFor(() => expect(tagOf(4)).toHaveTextContent('Chorus'));
		expect(sections(controller)).toEqual(['Chorus']);
		expect(controller.snapshot.text).toBe(lyrics);
		expect(controller.snapshot.selection.head).toBe(0);
		expect(screen.getByText(/^1 of 4 stanzas tagged\./u)).toBeVisible();
	});

	test('offers the tag of an identically worded stanza as one press', async () => {
		const controller = await mount(lyrics, 'musixmatch');
		expect(screen.queryByRole('button', { name: /like its repeat$/u })).toBeNull();
		await chooseOption(tagOf(4), 'Chorus');

		const repeat = await screen.findByRole('button', {
			name: 'Tag the stanza on line 9 as Chorus, like its repeat'
		});
		expect(repeat).toHaveTextContent('Chorus?');
		await fireEvent.click(repeat);

		await waitFor(() => expect(sections(controller)).toEqual(['Chorus', 'Chorus']));
		expect(screen.queryByRole('button', { name: /like its repeat$/u })).toBeNull();
	});

	test('retypes a tag, takes it off, and opens the options of its section', async () => {
		const controller = await mount(lyrics, 'musixmatch');
		await chooseOption(tagOf(1), 'Verse');
		await chooseOption(tagOf(7), 'Verse');

		await chooseOption(tagOf(7), 'Bridge');
		await waitFor(() => expect(sections(controller)).toEqual(['Verse', 'Bridge']));

		await fireEvent.click(screen.getByRole('button', { name: 'Bridge section options, line 7' }));
		expect(controller.requestedSection).toEqual({
			id: controller.snapshot.conversion!.model.sections[1]!.id,
			origin: 'editor'
		});

		await chooseOption(tagOf(7), 'No tag');
		await waitFor(() => expect(sections(controller)).toEqual(['Verse']));
		expect(tagOf(7)).toHaveTextContent('Add tag');
		expect(controller.snapshot.text).toBe(lyrics);
	});

	test('marks the stanza the caret is in and goes to a stanza that is pressed', async () => {
		const controller = await mount(lyrics, 'musixmatch');
		const rows = screen.getAllByRole('listitem');
		expect(rows.map((row) => row.getAttribute('aria-current'))).toEqual(['true', null, null, null]);

		await fireEvent.click(screen.getByRole('button', { name: /^Morning through the glass/u }));

		const at = lyrics.indexOf('Morning');
		expect(controller.conversionPassageRequest).toEqual({
			range: { from: at, to: at },
			intent: 'edit'
		});
	});
});

describe('sections with no lyric line of their own', () => {
	test('a trailing tag has its own row, and the stanza count leaves it out', async () => {
		const controller = await mount('One\n\n', 'musixmatch');
		controller.applyConversionAction({ kind: 'insertSection', at: 5, type: 'Bridge' });
		const empty = await screen.findByRole('combobox', {
			name: 'Tag for the empty section on line 3'
		});
		expect(empty).toHaveTextContent('Bridge');
		expect(screen.getByText(/^0 of 1 stanzas tagged\./u)).toBeVisible();
		await chooseOption(empty, 'No tag');
		await waitFor(() => expect(sections(controller)).toEqual([]));
	});
});

describe('the Sections outline of a Genius draft', () => {
	test('lists the headers to move between and opens their retained options', async () => {
		const source = '[Verse 1]\nBack down the block\n\n[Chorus: Mira]\nHold the line';
		const controller = await mount(source, 'genius');
		expect(screen.queryByRole('combobox')).toBeNull();
		expect(screen.queryByText(/stanzas tagged/u)).toBeNull();
		expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
			expect.stringMatching(/Verse 1\s*Back down the block/u),
			expect.stringMatching(/Chorus\s*Hold the line/u)
		]);

		await fireEvent.click(screen.getByRole('button', { name: /^Chorus Hold the line/u }));

		const at = source.indexOf('[Chorus');
		expect(controller.conversionPassageRequest?.range).toEqual({ from: at, to: at });

		await fireEvent.click(screen.getByRole('button', { name: 'Chorus section options, line 4' }));
		expect(controller.requestedSection).toEqual({
			id: controller.snapshot.conversion!.model.sections[1]!.id,
			origin: 'editor'
		});
	});

	test('draws nothing for an empty draft', async () => {
		await mount('', 'genius');
		expect(screen.queryByRole('heading', { name: 'Sections' })).toBeNull();
	});
});
