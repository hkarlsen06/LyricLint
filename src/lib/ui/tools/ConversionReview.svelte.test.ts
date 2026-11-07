import { fireEvent, within, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { createTestWorkbench, diagnostic } from '../test-utils.js';
import { importDocument, renderProfile, reconcileEdit } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import LinterPanel from '../linter/LinterPanel.svelte';

afterEach(async () => {
	await cleanup();
	await page.viewport(1280, 900);
});

async function focusedTask(
	text: string,
	token: string,
	ruleId = 'mxm.numbers.context',
	language = 'en'
) {
	const imported = importDocument({
		text,
		profile: 'genius',
		language
	});
	if (!imported.ok) throw Error(imported.refusal.message);
	const projection = renderProfile(imported.value, 'musixmatch');
	if (!projection.ok) throw Error(projection.refusal.message);
	const { controller } = createTestWorkbench({ text: projection.value.text });
	controller.onSnapshot({
		...controller.snapshot,
		conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
	});
	const from = projection.value.text.indexOf(token);
	if (from < 0) throw Error('The fixture must contain its target.');
	const range = { from, to: from + token.length };
	controller.openConversionReview(
		diagnostic({
			ruleId,
			message: 'Review this quantity.',
			severity: 'warning',
			...range
		})
	);
	const view = await render(LinterPanel, { controller });
	const panel = within(view.container);
	return { controller, panel, range };
}

test('shows one exact lyric context and prefills only the selected integer, with a direct edit handoff', async () => {
	const { controller, panel, range } = await focusedTask('[Verse]\nI counted 2 stars', '2');
	expect(panel.getByLabelText('Lyric passage').textContent).toBe('I counted 2 stars');
	expect(panel.getByLabelText('Lyric passage').querySelector('strong')?.textContent).toBe('2');
	expect(panel.queryByLabelText('Exact whole-number value')).toBeNull();
	expect(panel.getByLabelText('How is this number used?')).toHaveValue('unknown');
	expect(panel.queryByLabelText('How is it sung?')).toBeNull();
	await fireEvent.change(panel.getByLabelText('How is this number used?'), {
		target: { value: 'ordinary-cardinal' }
	});
	expect(panel.getByLabelText('How is it sung?')).toHaveValue('unknown');
	await fireEvent.change(panel.getByLabelText('How is it sung?'), {
		target: { value: 'whole-quantity' }
	});
	expect(panel.getByLabelText('Exact words as sung')).not.toBeVisible();
	await fireEvent.click(panel.getByText('Use custom exact wording', { exact: true }));
	expect(panel.getByLabelText('Exact words as sung')).toBeVisible();
	await fireEvent.click(panel.getByRole('button', { name: 'Edit in lyrics' }));
	expect(controller.requestedConversionReview).toBeUndefined();
	expect(controller.editor.getSnapshot().selection).toEqual({ anchor: range.from, head: range.to });
	expect(controller.conversionPassageRequest).toEqual({ range, intent: 'edit' });
});

test('previews the resulting lyric line below a stable quantity trigger without changing the lyrics', async () => {
	const { controller, panel } = await focusedTask('[Verse]\nI counted 2 stars', '2');
	await fireEvent.change(panel.getByLabelText('How is this number used?'), {
		target: { value: 'ordinary-cardinal' }
	});
	await fireEvent.change(panel.getByLabelText('How is it sung?'), {
		target: { value: 'whole-quantity' }
	});
	const trigger = panel.getByRole('button', { name: 'Preview quantity' });
	const before = trigger.getBoundingClientRect().toJSON();
	const model = JSON.stringify(controller.snapshot.conversion?.model);
	await fireEvent.click(trigger);
	const preview = panel.getByLabelText('Replacement preview');
	expect(preview.textContent).toBe('I counted two stars');
	expect(preview.querySelector('strong')?.textContent).toBe('two');
	expect(panel.queryByText('Proposed Musixmatch wording: two')).toBeNull();
	expect(trigger.getBoundingClientRect().toJSON()).toEqual(before);
	expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(model);
	expect(panel.getByLabelText('Lyric passage').textContent).toBe('I counted 2 stars');
	await fireEvent.change(panel.getByLabelText('How is it sung?'), {
		target: { value: 'individual-digits' }
	});
	expect(panel.queryByLabelText('Replacement preview')).toBeNull();
	expect(panel.queryByRole('button', { name: 'Apply quantity' })).toBeNull();
});

for (const width of [1280, 360, 390]) {
	test.each([
		['en', 'one hundred and eighty seven thousand six hundred and fifty four'],
		['fr', 'cent quatre vingt sept mille six cent cinquante quatre']
	])(
		'keeps long %s sung wording readable and rejects hard line breaks at ' + width + 'px',
		async (language, words) => {
			await page.viewport(width, 844);
			const source = language === 'en' ? '187654' : words;
			const { panel, controller } = await focusedTask(
				`[Verse]\nI counted ${source} stars`,
				source,
				undefined,
				language
			);
			await fireEvent.change(panel.getByLabelText('How is this number used?'), {
				target: { value: 'ordinary-cardinal' }
			});
			if (language === 'fr')
				await fireEvent.input(panel.getByLabelText('Exact whole-number value'), {
					target: { value: '187654' }
				});
			await fireEvent.change(panel.getByLabelText('How is it sung?'), {
				target: { value: 'whole-quantity' }
			});
			if (language === 'en')
				await fireEvent.click(panel.getByText('Use custom exact wording', { exact: true }));
			else {
				expect(panel.getByText('Use custom digit form', { exact: true })).toBeVisible();
				expect(panel.queryByText('Use custom exact wording', { exact: true })).toBeNull();
			}
			const field = panel.getByRole('textbox', { name: /^Exact words as sung/ });
			const trigger = panel.getByRole('button', { name: 'Preview quantity' });
			const before = trigger.getBoundingClientRect().toJSON();
			await fireEvent.input(field, { target: { value: words } });
			expect(field).toHaveValue(words);
			expect(parseFloat(getComputedStyle(field).fontSize)).toBeGreaterThanOrEqual(16);
			expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth);
			expect(field.scrollHeight).toBeLessThanOrEqual(field.clientHeight);
			expect(field.getBoundingClientRect().right).toBeLessThanOrEqual(width);
			expect(trigger.getBoundingClientRect().toJSON()).toEqual(before);
			await fireEvent.click(trigger);
			expect(panel.getByLabelText('Replacement preview')).toHaveTextContent(
				'I counted 187654 stars'
			);
			expect(controller.snapshot.text).toBe(`I counted ${source} stars`);
			await fireEvent.input(field, { target: { value: words + '\nextra' } });
			expect(panel.queryByLabelText('Replacement preview')).toBeNull();
			expect(panel.queryByRole('button', { name: 'Apply quantity' })).toBeNull();
			expect(trigger).toBeDisabled();
			expect(panel.getByRole('status').textContent).toContain(
				'without digits, line breaks or markup'
			);
		}
	);
}

test('explains an uninitialized unsupported quantity before a preview can be requested', async () => {
	const { panel } = await focusedTask('[Verse]\nMy number is 007', '007');
	const value = panel.getByLabelText('Exact whole-number value');
	expect(value).toHaveValue('');
	const guidance = panel.getByRole('status');
	expect(guidance.textContent).toContain('without leading zeros');
	expect(value.getAttribute('aria-describedby')).toBe(guidance.id);
	expect(panel.queryByRole('button', { name: 'Preview quantity' })).toBeNull();
	expect(panel.queryByRole('button', { name: 'Apply quantity' })).toBeNull();
});

test('leaves an uncertain censorship decision without changing lyrics or retained facts', async () => {
	const { panel, controller } = await focusedTask(
		'[Verse: Mira]\nI said [****](123456) tonight',
		'****',
		'mxm.transcription.censor-mask'
	);
	const before = JSON.stringify(controller.snapshot);
	await fireEvent.input(panel.getByLabelText('Audible prefix (if any)'), {
		target: { value: 'f' }
	});
	await fireEvent.click(panel.getByRole('button', { name: 'Decide later' }));
	expect(controller.requestedConversionReview).toBeUndefined();
	expect(JSON.stringify(controller.snapshot)).toBe(before);
});

test.each([1280, 360, 390])(
	'asks for the full-word listening fact before a blank-prefix preview at %spx',
	async (width) => {
		await page.viewport(width, 900);
		const { panel, controller } = await focusedTask(
			'[Verse: Mira]\nI said [****](123456) tonight',
			'****',
			'mxm.transcription.censor-mask'
		);
		const before = JSON.stringify(controller.snapshot);
		const preview = panel.getByRole('button', { name: 'Preview replacement' });
		const fullWord = panel.getByRole('checkbox', {
			name: 'I listened: this entire word is censored.'
		});
		expect(fullWord).not.toBeChecked();
		expect(preview).toBeDisabled();
		await fireEvent.click(fullWord);
		await fireEvent.click(preview);
		const comparison = panel.getByLabelText('Replacement preview');
		expect(comparison.querySelector('del')?.textContent).toBe('****');
		expect(comparison.querySelector('ins')?.textContent).toBe('-');
		expect(comparison.textContent).toBe('I said ****- tonight');
		expect(panel.getByText('A fully censored word is shown as a single hyphen.')).toBeVisible();
		expect(JSON.stringify(controller.snapshot)).toBe(before);
		const position = preview.getBoundingClientRect().toJSON();
		await fireEvent.input(panel.getByLabelText('Audible prefix (if any)'), {
			target: { value: 'f' }
		});
		expect(
			panel.getByRole('checkbox', {
				name: 'I listened: this word is censored right after the prefix.'
			})
		).not.toBeChecked();
		expect(panel.queryByLabelText('Replacement preview')).toBeNull();
		expect(preview).toBeDisabled();
		expect(preview.getBoundingClientRect().toJSON()).toEqual(position);
		expect(JSON.stringify(controller.snapshot)).toBe(before);
	}
);

test.each([
	['two words', 'Use an audible prefix without spaces or line breaks.'],
	['f'.repeat(101), 'The audible prefix is too long. Shorten it before previewing.'],
	['f***', 'Use the audible prefix without stars, brackets or markup.']
])('announces why the audible prefix %s cannot be previewed', async (prefix, message) => {
	const { panel, controller } = await focusedTask(
		'[Verse: Mira]\nI said [****](123456) tonight',
		'****',
		'mxm.transcription.censor-mask'
	);
	const before = JSON.stringify(controller.snapshot);
	const trigger = panel.getByRole('button', { name: 'Preview replacement' });
	await fireEvent.input(panel.getByLabelText('Audible prefix (if any)'), {
		target: { value: prefix }
	});
	await fireEvent.click(panel.getByRole('checkbox'));
	const box = trigger.getBoundingClientRect().toJSON();
	await fireEvent.click(trigger);
	expect(panel.getByText(message).closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
	expect(trigger.getBoundingClientRect().toJSON()).toEqual(box);
	expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
	expect(JSON.stringify(controller.snapshot)).toBe(before);
});

test.each([1280, 360, 390])(
	'compares the whole censored token beside its replacement even with the full line open at %spx',
	async (width) => {
		await page.viewport(width, 900);
		const token = 'f' + '*'.repeat(60);
		const before = 'I whispered ' + 'toward the silver lantern '.repeat(12);
		const after = ' beside the river'.repeat(12);
		const { panel, controller } = await focusedTask(
			`[Verse: Mira]\n${before}[${token}](123456)${after}`,
			token,
			'mxm.transcription.censor-mask'
		);
		const model = JSON.stringify(controller.snapshot);
		const passage = panel.getByLabelText('Lyric passage');
		const excerpt = passage.textContent;
		expect(passage.querySelector('strong')?.textContent).toBe(token);
		expect(excerpt.startsWith('…')).toBe(true);
		expect(excerpt.endsWith('…')).toBe(true);
		expect(excerpt.length).toBeLessThan(200);
		const full = panel.getByLabelText('Full lyric passage');
		expect(full).not.toBeVisible();
		await fireEvent.input(panel.getByLabelText('Audible prefix (if any)'), {
			target: { value: 'sh' }
		});
		await fireEvent.click(panel.getByRole('checkbox'));
		const trigger = panel.getByRole('button', { name: 'Preview replacement' });
		const position = trigger.getBoundingClientRect().toJSON();
		await fireEvent.click(trigger);
		const preview = panel.getByLabelText('Replacement preview');
		expect(preview.querySelector('del')?.textContent).toBe(token);
		expect(preview.querySelector('ins')?.textContent).toBe('sh-');
		const original = preview.cloneNode(true) as HTMLElement;
		original.querySelector('ins')!.remove();
		expect(original.textContent).toBe(excerpt);
		const proposed = preview.cloneNode(true) as HTMLElement;
		proposed.querySelector('del')!.remove();
		expect(proposed.textContent).toBe(excerpt.replace(token, 'sh-'));
		const previewHeight = preview.getBoundingClientRect().height;
		expect(trigger.getBoundingClientRect().toJSON()).toEqual(position);
		const summary = panel.getByText('Full lyric line', { exact: true });
		await fireEvent.click(summary);
		await waitFor(() => expect(full).toBeVisible());
		expect(full.textContent).toBe(before + token + after);
		expect(preview.textContent).toBe(excerpt.replace(token, token + 'sh-'));
		expect(preview.getBoundingClientRect().height).toBe(previewHeight);
		expect(panel.getByRole('checkbox')).toBeChecked();
		expect(JSON.stringify(controller.snapshot)).toBe(model);
		await fireEvent.click(summary);
		await waitFor(() => expect(full).not.toBeVisible());
		expect(preview.textContent).toBe(excerpt.replace(token, token + 'sh-'));
		expect(trigger.getBoundingClientRect().toJSON()).toEqual(position);
		expect(panel.getByRole('button', { name: 'Apply replacement' })).toBeEnabled();
		expect(JSON.stringify(controller.snapshot)).toBe(model);
		expect(controller.snapshot.conversion?.model.content).toBe(before + token + after);
	}
);

test('previews a censored prefix in its lyric line and retires it when the confirmation changes', async () => {
	const { panel, controller } = await focusedTask(
		'[Verse]\nI said **** tonight',
		'****',
		'mxm.transcription.censor-mask'
	);
	await fireEvent.input(panel.getByLabelText('Audible prefix (if any)'), {
		target: { value: 'f' }
	});
	await fireEvent.click(panel.getByRole('checkbox'));
	const trigger = panel.getByRole('button', { name: 'Preview replacement' });
	const before = trigger.getBoundingClientRect().toJSON();
	const model = JSON.stringify(controller.snapshot.conversion?.model);
	await fireEvent.click(trigger);
	const preview = panel.getByLabelText('Replacement preview');
	expect(preview.textContent).toBe('I said ****f- tonight');
	expect(preview.querySelector('del')?.textContent).toBe('****');
	expect(preview.querySelector('ins')?.textContent).toBe('f-');
	expect(panel.getByText('No missing letters are inferred.')).toBeVisible();
	expect(panel.queryByText('Full lyric line', { exact: true })).toBeNull();
	expect(trigger.getBoundingClientRect().toJSON()).toEqual(before);
	expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(model);
	await fireEvent.click(panel.getByRole('checkbox'));
	expect(panel.queryByLabelText('Replacement preview')).toBeNull();
	expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
});

for (const [rule, title, sourceControl] of [
	['mxm.transcription.repeat-placeholder', 'Replace repeat placeholder', true],
	['mxm.numbers.context', 'Review quantity', false],
	['mxm.structure.instrumental', 'Review instrumental interval', false],
	['mxm.transcription.censor-mask', 'Review censored word', false]
] as const) {
	test(`opens only the ${title} task in Review and refuses a stale target`, async () => {
		const imported = importDocument({
			text: '[Chorus]\nFirst version\n\n[Outro]\nRepeat chorus',
			profile: 'genius',
			language: 'en'
		});
		if (!imported.ok) throw Error(imported.refusal.message);
		const projection = renderProfile(imported.value, 'musixmatch');
		if (!projection.ok) throw Error(projection.refusal.message);
		const { controller } = createTestWorkbench({ text: projection.value.text });
		controller.onSnapshot({
			...controller.snapshot,
			conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
		});
		const range = {
			from: projection.value.text.indexOf('Repeat chorus'),
			to: projection.value.text.length
		};
		controller.openConversionReview(
			diagnostic({ ruleId: rule, message: 'Review this passage.', severity: 'warning', ...range })
		);
		const view = await render(LinterPanel, { controller });
		const panel = within(view.container);
		await waitFor(() => expect(panel.getByRole('heading', { name: title })).toHaveFocus());
		expect(controller.activeTab).toBe('linter');
		expect(panel.queryByRole('button', { name: /^Earlier source section/ }) !== null).toBe(
			sourceControl
		);
		for (const name of [
			'Language and content type',
			'Retained details',
			'Selected passage',
			'Wording and retained annotations',
			'Saved decisions',
			'Decisions that need listening',
			'Export .txt'
		])
			expect(panel.queryByText(name, { exact: true })).toBeNull();
		const heading = panel.getByRole('heading', { name: title }).getBoundingClientRect();
		expect(heading.top).toBeGreaterThanOrEqual(0);
		expect(heading.bottom).toBeLessThan(window.innerHeight);
		controller.onSnapshot({ ...controller.snapshot, selection: { anchor: 0, head: 5 } });
		expect(controller.requestedConversionReview?.range).toEqual(range);
		controller.onSnapshot({ ...controller.snapshot, revision: controller.snapshot.revision + 1 });
		await waitFor(() =>
			expect(panel.getByRole('status').textContent).toContain('The lyrics or format changed')
		);
		expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
		await fireEvent.click(panel.getByRole('button', { name: 'Back to Review' }));
		expect(controller.requestedConversionReview).toBeUndefined();
	});
}

test.each([
	['Two', 'en', 'Two', ''],
	['deux', 'fr', 'deux', ''],
	['２', 'fr', 'deux', '２']
])(
	'keeps exact value and custom forms available for %s',
	async (token, language, words, digits) => {
		const { panel } = await focusedTask(
			`[Verse]\nI counted ${token} stars`,
			token,
			'mxm.numbers.context',
			language
		);
		await fireEvent.input(panel.getByLabelText('Exact whole-number value'), {
			target: { value: '2' }
		});
		await fireEvent.change(panel.getByLabelText('How is this number used?'), {
			target: { value: 'ordinary-cardinal' }
		});
		await fireEvent.change(panel.getByLabelText('How is it sung?'), {
			target: { value: 'whole-quantity' }
		});
		await fireEvent.click(panel.getByText('Use custom digit form', { exact: true }));
		await fireEvent.input(panel.getByLabelText('Exact words as sung (required)'), {
			target: { value: words }
		});
		if (digits)
			await fireEvent.input(panel.getByLabelText('Digit form, if applicable'), {
				target: { value: digits }
			});
		await fireEvent.click(panel.getByRole('button', { name: 'Preview quantity' }));
		expect(panel.getByLabelText('Replacement preview').textContent).toBe(
			`I counted ${words} stars`
		);
		expect(panel.getByRole('button', { name: 'Apply quantity' })).toBeVisible();
	}
);
test('retires a valid quantity preview after an edit elsewhere', async () => {
	const { panel, controller } = await focusedTask('[Verse]\nI counted 2 stars', '2');
	await fireEvent.change(panel.getByLabelText('How is this number used?'), {
		target: { value: 'ordinary-cardinal' }
	});
	await fireEvent.change(panel.getByLabelText('How is it sung?'), {
		target: { value: 'whole-quantity' }
	});
	await fireEvent.click(panel.getByRole('button', { name: 'Preview quantity' }));
	expect(panel.getByRole('button', { name: 'Apply quantity' })).toBeVisible();
	const conversion = controller.snapshot.conversion!;
	const projection = renderProfile(conversion.model, controller.profile);
	if (!projection.ok) throw Error(projection.refusal.message);
	const edited = reconcileEdit(conversion.model, projection.value, {
		changes: [
			{
				from: controller.snapshot.text.length,
				to: controller.snapshot.text.length,
				insert: ' tonight'
			}
		],
		mirror: false
	});
	if (!edited.ok) throw Error(edited.refusal.message);
	controller.onSnapshot({
		...controller.snapshot,
		text: edited.value.projection.text,
		revision: controller.snapshot.revision + 1,
		conversion: createConversionEnvelope(
			edited.value.document,
			controller.profile,
			profilePolicyVersions
		)
	});
	await waitFor(() =>
		expect(panel.getByRole('status').textContent).toContain('The lyrics or format changed')
	);
	expect(panel.queryByRole('button', { name: 'Apply quantity' })).toBeNull();
});

test.each(['date-or-time', 'name-or-identifier'])(
	'refuses an explicit %s role even for canonical digits',
	async (usage) => {
		const { panel } = await focusedTask('[Verse]\nI counted 2 stars', '2');
		await fireEvent.change(panel.getByLabelText('How is this number used?'), {
			target: { value: usage }
		});
		expect(panel.queryByRole('button', { name: 'Preview quantity' })).toBeNull();
		expect(panel.getByText(/This is not an ordinary quantity conversion/)).toBeVisible();
		expect(panel.queryByRole('button', { name: 'Apply quantity' })).toBeNull();
	}
);
test('requires fresh confirmation after editing the heard prefix', async () => {
	const { panel } = await focusedTask(
		'[Verse]\nI said **** tonight',
		'****',
		'mxm.transcription.censor-mask'
	);
	await fireEvent.input(panel.getByLabelText('Audible prefix (if any)'), {
		target: { value: 'f' }
	});
	await fireEvent.click(panel.getByRole('checkbox'));
	await fireEvent.click(panel.getByRole('button', { name: 'Preview replacement' }));
	expect(panel.getByRole('button', { name: 'Apply replacement' })).toBeVisible();
	await fireEvent.input(panel.getByLabelText('Audible prefix (if any)'), {
		target: { value: 'fu' }
	});
	expect(panel.getByRole('checkbox')).not.toBeChecked();
	expect(panel.getByRole('button', { name: 'Preview replacement' })).toBeDisabled();
	expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
});

test.each([1280, 360, 390])(
	'reads source versions before choosing and keeps repeat controls anchored at %spx',
	async (width) => {
		await page.viewport(width, 900);
		const opening = 'We are the neon after rain';
		const chosen = opening + '\nTake my hand and say my name';
		const other = opening + '\nTake my hand and call my name';
		const long = [
			'👩🏽‍🚀e\u0301'.repeat(90),
			'W'.repeat(500),
			...Array(26).fill('Lantern '.repeat(55)),
			'Final river words'
		].join('\n');
		const earlier = Array.from(
			{ length: 15 },
			(_, i) => `[Verse ${i + 1}]\nEarlier words ${i + 1}`
		).join('\n\n');
		const { panel, controller } = await focusedTask(
			earlier +
				'\n\n[Chorus]\n' +
				chosen +
				'\n\n[Chorus]\n' +
				other +
				'\n\n[An extraordinarily long custom section name for the river]\n' +
				long +
				'\n\n[Outro]\nRepeat chorus',
			'Repeat chorus',
			'mxm.transcription.repeat-placeholder'
		);
		const source = panel.getByRole('button', { name: /^Earlier source section/ });
		const count = panel.getByLabelText('Copies to insert here');
		const trigger = panel.getByRole('button', { name: 'Preview replacement' });
		const positions = () =>
			[source, count, trigger].map((e) => {
				const r = e.getBoundingClientRect();
				return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height };
			});
		const before = positions();
		const snapshot = JSON.stringify(controller.snapshot);
		expect(source).toHaveTextContent('Choose the version to repeat');
		expect(count).toHaveValue(null);
		expect(trigger).toBeDisabled();
		expect(source).toHaveAccessibleName('Earlier source section Choose the version to repeat');
		const choose = async (words: string) => {
			await fireEvent.click(source);
			const dialog = within(panel.getByRole('dialog', { name: 'Earlier source section' }));
			await fireEvent.click(dialog.getByRole('button', { name: new RegExp(words) }));
			expect(source).toHaveFocus();
		};
		await choose('Take my hand and say my name');
		expect(positions()).toEqual(before);
		expect(panel.getByLabelText('Chosen source lyrics').textContent).toBe(chosen);
		for (const value of ['', '0', '1.5', '101']) {
			await fireEvent.input(count, { target: { value } });
			await fireEvent.click(trigger);
			expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
			expect(positions()).toEqual(before);
		}
		await fireEvent.input(count, { target: { value: '1' } });
		await fireEvent.click(trigger);
		expect(panel.getByLabelText('Replacement preview').textContent).toBe(chosen);
		await fireEvent.click(source);
		const chooser = panel.getByRole('dialog', { name: 'Earlier source section' });
		expect(
			within(chooser).getByRole('button', { name: /Take my hand and say my name/ })
		).toHaveAttribute('aria-pressed', 'true');
		await fireEvent.click(
			within(chooser).getByText('Full source lyrics · Section 18', { exact: true })
		);
		expect(
			within(chooser).getByLabelText(
				'Section 18 · An extraordinarily long custom section name for the river'
			).textContent
		).toBe(long);
		await fireEvent.click(within(chooser).getByRole('button', { name: 'Close' }));
		expect(panel.getByRole('button', { name: 'Apply replacement' })).toBeEnabled();
		expect(count).toHaveValue(1);
		expect(positions()).toEqual(before);
		expect(JSON.stringify(controller.snapshot)).toBe(snapshot);
		await choose('Take my hand and say my name');
		expect(panel.getByRole('button', { name: 'Apply replacement' })).toBeEnabled();
		await choose('Take my hand and call my name');
		expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
		await choose('Take my hand and say my name');
		expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
		expect(panel.queryByLabelText('Replacement preview')).toBeNull();
		await choose('👩🏽‍🚀');
		await fireEvent.input(count, { target: { value: '2' } });
		await fireEvent.click(trigger);
		const fullResult = panel.getByRole('button', { name: 'Full replacement lyrics' });
		const apply = panel.getByRole('button', { name: 'Apply replacement' });
		const fullSource = panel.getByRole('button', { name: 'Full source lyrics' });
		expect(fullSource.getBoundingClientRect().bottom).toBeLessThan(
			fullResult.getBoundingClientRect().top
		);
		expect(fullResult.getBoundingClientRect().top).toBe(apply.getBoundingClientRect().top);
		expect(fullResult.getBoundingClientRect().right).toBeLessThan(
			apply.getBoundingClientRect().left
		);
		await fireEvent.click(fullResult);
		const viewer = panel.getByRole('dialog', { name: 'Full replacement lyrics' });
		const complete = within(viewer).getByLabelText('Replacement preview');
		expect(complete.textContent).toBe(long + '\n' + long);
		const scrollport = complete.parentElement!;
		const readerApply = within(viewer).getByRole('button', { name: 'Apply replacement' });
		const readerApplyPosition = readerApply.getBoundingClientRect().toJSON();
		expect(readerApply.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			scrollport.getBoundingClientRect().bottom
		);
		expect(readerApply.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			viewer.getBoundingClientRect().bottom
		);
		const destination = within(viewer).getByLabelText('Go to copy');
		expect(destination).toHaveValue('0');
		const destinationPosition = destination.getBoundingClientRect().toJSON();
		await fireEvent.change(destination, { target: { value: '1' } });
		expect(scrollport.scrollTop).toBeGreaterThan(0);
		const copyStart = document.createRange();
		copyStart.setStart(complete.firstChild!, long.length + 1);
		copyStart.setEnd(complete.firstChild!, long.length + 2);
		expect(
			Math.abs(copyStart.getBoundingClientRect().top - scrollport.getBoundingClientRect().top)
		).toBeLessThan(1);
		await fireEvent.click(within(viewer).getByRole('button', { name: 'Last line' }));
		expect(
			Math.abs(
				scrollport.scrollHeight - scrollport.scrollTop - scrollport.getBoundingClientRect().height
			)
		).toBeLessThan(1);
		expect(destination.getBoundingClientRect().toJSON()).toEqual(destinationPosition);
		expect(readerApply.getBoundingClientRect().toJSON()).toEqual(readerApplyPosition);
		expect(complete.textContent).toBe(long + '\n' + long);
		await fireEvent.change(destination, { target: { value: '0' } });
		expect(scrollport.scrollTop).toBeLessThan(1);
		await fireEvent.click(within(viewer).getByRole('button', { name: 'Close' }));
		expect(fullResult).toHaveFocus();
		expect(positions()).toEqual(before);
		expect(JSON.stringify(controller.snapshot)).toBe(snapshot);
		controller.onSnapshot({ ...controller.snapshot, selection: { anchor: 0, head: 5 } });
		expect(panel.getByRole('button', { name: 'Apply replacement' })).toBeEnabled();
		await fireEvent.click(source);
		controller.onSnapshot({ ...controller.snapshot, revision: controller.snapshot.revision + 1 });
		await waitFor(() => expect(panel.queryByRole('dialog')).toBeNull());
		expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
		expect(controller.snapshot.text).toBe(JSON.parse(snapshot).text);
		expect(controller.snapshot.conversion?.model).toEqual(JSON.parse(snapshot).conversion.model);
	}
);

test.each([1, 100])(
	'navigates the exact %s-copy result while retaining source annotations',
	async (copies) => {
		const lines = Array.from(
			{ length: 8 },
			(_, index) => `Northern lantern ${index + 1} shines beside the river`
		);
		const plain = 'A silver moon rises\n' + lines.join('\n');
		const { panel, controller } = await focusedTask(
			'[Chorus]\nA [silver moon](123456) rises\n' + lines.join('\n') + '\n\n[Outro]\nRepeat chorus',
			'Repeat chorus',
			'mxm.transcription.repeat-placeholder'
		);
		const before = JSON.stringify(controller.snapshot);
		await fireEvent.click(panel.getByRole('button', { name: /^Earlier source section/ }));
		const chooser = panel.getByRole('dialog', { name: 'Earlier source section' });
		await fireEvent.click(within(chooser).getByRole('button', { name: /Northern lantern 1/ }));
		await fireEvent.input(panel.getByLabelText('Copies to insert here'), {
			target: { value: String(copies) }
		});
		await fireEvent.click(panel.getByRole('button', { name: 'Preview replacement' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Full replacement lyrics' }));
		const viewer = panel.getByRole('dialog', { name: 'Full replacement lyrics' });
		const complete = within(viewer).getByLabelText('Replacement preview');
		expect(within(viewer).getByRole('button', { name: 'Apply replacement' })).toBeEnabled();
		expect(complete.textContent).toBe(Array(copies).fill(plain).join('\n'));
		if (copies > 1) {
			const destination = within(viewer).getByLabelText('Go to copy');
			await fireEvent.change(destination, { target: { value: '99' } });
			expect(complete.parentElement!.scrollTop).toBeGreaterThan(0);
			const copyStart = document.createRange();
			copyStart.setStart(complete.firstChild!, Array(99).fill(plain).join('\n').length + 1);
			copyStart.setEnd(complete.firstChild!, Array(99).fill(plain).join('\n').length + 2);
			expect(copyStart.getBoundingClientRect().top).toBeGreaterThanOrEqual(
				complete.parentElement!.getBoundingClientRect().top - 1
			);
		} else expect(within(viewer).queryByLabelText('Go to copy')).toBeNull();
		await fireEvent.click(within(viewer).getByRole('button', { name: 'Last line' }));
		expect(complete.textContent).toBe(Array(copies).fill(plain).join('\n'));
		expect(JSON.stringify(controller.snapshot)).toBe(before);
		controller.onSnapshot({ ...controller.snapshot, revision: controller.snapshot.revision + 1 });
		await waitFor(() => expect(panel.queryByRole('dialog')).toBeNull());
		expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
		expect(controller.snapshot.text).toBe(JSON.parse(before).text);
		expect(controller.snapshot.conversion?.model).toEqual(JSON.parse(before).conversion.model);
	}
);

test('does not revive a repeat proposal after a copy-count round trip', async () => {
	const { panel, controller } = await focusedTask(
		'[Chorus]\nFirst version\n\n[Outro]\nRepeat chorus',
		'Repeat chorus',
		'mxm.transcription.repeat-placeholder'
	);
	const before = JSON.stringify(controller.snapshot);
	await fireEvent.click(panel.getByRole('button', { name: /^Earlier source section/ }));
	const chooser = panel.getByRole('dialog', { name: 'Earlier source section' });
	await fireEvent.click(within(chooser).getByRole('button', { name: /First version/ }));
	const count = panel.getByLabelText('Copies to insert here');
	await fireEvent.input(count, { target: { value: '2' } });
	await fireEvent.click(panel.getByRole('button', { name: 'Preview replacement' }));
	expect(panel.getByRole('button', { name: 'Apply replacement' })).toBeEnabled();
	await fireEvent.input(count, { target: { value: '3' } });
	expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
	await fireEvent.input(count, { target: { value: '2' } });
	expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
	await fireEvent.click(panel.getByRole('button', { name: 'Preview replacement' }));
	expect(panel.getByRole('button', { name: 'Apply replacement' })).toBeEnabled();
	expect(JSON.stringify(controller.snapshot)).toBe(before);
});

test('does not revive a censored-word proposal after editing and reconfirming facts', async () => {
	const { panel, controller } = await focusedTask(
		'[Verse]\nI said **** tonight',
		'****',
		'mxm.transcription.censor-mask'
	);
	const before = JSON.stringify(controller.snapshot);
	const prefix = panel.getByLabelText('Audible prefix (if any)');
	await fireEvent.input(prefix, { target: { value: 'f' } });
	await fireEvent.click(panel.getByRole('checkbox'));
	await fireEvent.click(panel.getByRole('button', { name: 'Preview replacement' }));
	expect(panel.getByRole('button', { name: 'Apply replacement' })).toBeEnabled();
	await fireEvent.input(prefix, { target: { value: 'fo' } });
	expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
	await fireEvent.input(prefix, { target: { value: 'f' } });
	await fireEvent.click(panel.getByRole('checkbox'));
	expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
	await fireEvent.click(panel.getByRole('button', { name: 'Preview replacement' }));
	expect(panel.getByRole('button', { name: 'Apply replacement' })).toBeEnabled();
	expect(JSON.stringify(controller.snapshot)).toBe(before);
});

test('offers direct editing when a repeat placeholder has no earlier source', async () => {
	const { panel, controller, range } = await focusedTask(
		'[Outro]\nRepeat chorus',
		'Repeat chorus',
		'mxm.transcription.repeat-placeholder'
	);
	const text = controller.snapshot.text;
	const model = JSON.stringify(controller.snapshot.conversion?.model);
	expect(panel.getByText('No earlier section is available.', { exact: false })).toBeVisible();
	expect(panel.queryByRole('button', { name: /^Earlier source section/ })).toBeNull();
	expect(panel.queryByLabelText('Copies to insert here')).toBeNull();
	expect(panel.queryByRole('button', { name: 'Preview replacement' })).toBeNull();
	expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
	await fireEvent.click(panel.getByRole('button', { name: 'Edit in lyrics' }));
	expect(controller.requestedConversionReview).toBeUndefined();
	expect(controller.conversionPassageRequest).toEqual({ range, intent: 'edit' });
	expect(controller.snapshot.text).toBe(text);
	expect(JSON.stringify(controller.snapshot.conversion?.model)).toBe(model);
});
