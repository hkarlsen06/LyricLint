import { fireEvent, within, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import { createTestWorkbench, diagnostic } from '../test-utils.js';
import { importDocument, renderProfile, reconcileEdit } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import LinterPanel from '../linter/LinterPanel.svelte';

afterEach(cleanup);

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
	expect(panel.getByLabelText('How is it sung?')).toHaveValue('unknown');
	expect(panel.getByLabelText('Exact words as sung')).not.toBeVisible();
	await fireEvent.click(panel.getByText('Use custom exact wording', { exact: true }));
	expect(panel.getByLabelText('Exact words as sung')).toBeVisible();
	await fireEvent.click(panel.getByRole('button', { name: 'Edit in lyrics' }));
	expect(controller.requestedConversionReview).toBeUndefined();
	expect(controller.editor.getSnapshot().selection).toEqual({ anchor: range.from, head: range.to });
	expect(controller.conversionPassageRequest).toBe(1);
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

test('explains an uninitialized unsupported quantity before a preview can be requested', async () => {
	const { panel } = await focusedTask('[Verse]\nMy number is 007', '007');
	const value = panel.getByLabelText('Exact whole-number value');
	expect(value).toHaveValue('');
	const guidance = panel.getByRole('status');
	expect(guidance.textContent).toContain('without leading zeros');
	expect(value.getAttribute('aria-describedby')).toBe(guidance.id);
	expect(panel.getByRole('button', { name: 'Preview quantity' })).toBeDisabled();
	expect(panel.queryByRole('button', { name: 'Apply quantity' })).toBeNull();
});

test('leaves an uncertain censorship decision without changing lyrics or retained facts', async () => {
	const { panel, controller } = await focusedTask(
		'[Verse: Mira]\nI said [****](123456) tonight',
		'****',
		'mxm.transcription.censor-mask'
	);
	const before = JSON.stringify(controller.snapshot);
	await fireEvent.input(panel.getByLabelText('Audible prefix'), { target: { value: 'f' } });
	await fireEvent.click(panel.getByRole('button', { name: 'Decide later' }));
	expect(controller.requestedConversionReview).toBeUndefined();
	expect(JSON.stringify(controller.snapshot)).toBe(before);
});

test('previews a censored prefix in its lyric line and retires it when the confirmation changes', async () => {
	const { panel, controller } = await focusedTask(
		'[Verse]\nI said **** tonight',
		'****',
		'mxm.transcription.censor-mask'
	);
	await fireEvent.input(panel.getByLabelText('Audible prefix'), { target: { value: 'f' } });
	await fireEvent.click(panel.getByRole('checkbox'));
	const trigger = panel.getByRole('button', { name: 'Preview replacement' });
	const before = trigger.getBoundingClientRect().toJSON();
	const model = JSON.stringify(controller.snapshot.conversion?.model);
	await fireEvent.click(trigger);
	const preview = panel.getByLabelText('Replacement preview');
	expect(preview.textContent).toBe('I said f- tonight');
	expect(preview.querySelector('strong')?.textContent).toBe('f-');
	expect(panel.getByText('No missing letters are inferred.')).toBeVisible();
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
		expect(panel.queryByLabelText('Earlier source section') !== null).toBe(sourceControl);
		for (const name of [
			'Document settings',
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
		await fireEvent.click(panel.getByText('Use custom exact wording', { exact: true }));
		await fireEvent.input(panel.getByLabelText('Exact words as sung'), {
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
		await fireEvent.change(panel.getByLabelText('How is it sung?'), {
			target: { value: 'whole-quantity' }
		});
		await fireEvent.click(panel.getByRole('button', { name: 'Preview quantity' }));
		expect(
			panel.getByText(/This operation applies only to an ordinary cardinal quantity/)
		).toBeVisible();
		expect(panel.queryByRole('button', { name: 'Apply quantity' })).toBeNull();
	}
);
test('requires fresh confirmation after editing the heard prefix', async () => {
	const { panel } = await focusedTask(
		'[Verse]\nI said **** tonight',
		'****',
		'mxm.transcription.censor-mask'
	);
	await fireEvent.input(panel.getByLabelText('Audible prefix'), { target: { value: 'f' } });
	await fireEvent.click(panel.getByRole('checkbox'));
	await fireEvent.click(panel.getByRole('button', { name: 'Preview replacement' }));
	expect(panel.getByRole('button', { name: 'Apply replacement' })).toBeVisible();
	await fireEvent.input(panel.getByLabelText('Audible prefix'), { target: { value: 'fu' } });
	expect(panel.getByRole('checkbox')).not.toBeChecked();
	expect(panel.getByRole('button', { name: 'Preview replacement' })).toBeDisabled();
	expect(panel.queryByRole('button', { name: 'Apply replacement' })).toBeNull();
});
