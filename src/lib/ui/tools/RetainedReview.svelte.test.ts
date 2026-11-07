import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import RetainedReview from './RetainedReview.svelte';
import { retainedFindings, type RetainedFinding } from '#lib/conversion/review.js';
import {
	importDocument,
	reconcileEdit,
	renderProfile,
	resolveDecision
} from '#lib/conversion/index.js';
import { parseDocument } from '#lib/core/parser.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';

afterEach(cleanup);

test('keeps completion focus when the reviewed section has no visible lyrics', async () => {
	const imported = importDocument({ text: '[Custom opening]', profile: 'genius' });
	if (!imported.ok) throw Error(imported.refusal.message);
	const projection = renderProfile(imported.value, 'musixmatch');
	if (!projection.ok) throw Error(projection.refusal.message);
	const { controller } = createTestWorkbench({ text: '' });
	controller.onSnapshot({
		...controller.snapshot,
		conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
	});
	const view = await render(RetainedReview, {
		controller,
		findings: retainedFindings(controller.snapshot)
	});
	screen.getByRole('combobox', { name: 'Musixmatch section type' }).focus();
	const next = resolveDecision(imported.value, projection.value, {
		kind: 'setSectionType',
		sectionId: imported.value.sections[0]!.id,
		type: 'Intro'
	});
	if (!next.ok) throw Error(next.refusal.message);
	controller.onSnapshot({
		...controller.snapshot,
		conversion: createConversionEnvelope(next.value.document, 'musixmatch', profilePolicyVersions)
	});
	await view.rerender({ controller, findings: retainedFindings(controller.snapshot) });
	await waitFor(() =>
		expect(screen.getByRole('heading', { name: 'Retained details (0)' })).toHaveFocus()
	);
});

test('does not carry a completed review into a new empty draft', async () => {
	const { controller } = createTestWorkbench();
	const findings: RetainedFinding[] = [
		{ kind: 'metadata', id: 'one', message: 'Review this detail.' }
	];
	const view = await render(RetainedReview, { controller, findings });
	await view.rerender({ controller, findings: [] });
	expect(screen.getByRole('heading', { name: 'Retained details (0)' })).toBeVisible();
	await controller.createDraft();
	await view.rerender({ controller, findings: [] });
	expect(screen.queryByRole('region', { name: 'Retained details needing review' })).toBeNull();
});

test('identifies retained sections by their header and lyric, including empty boundaries', async () => {
	const imported = importDocument({
		text: '[Custom opening: Mira]\n[The return: Noor]\nStay beside me',
		profile: 'genius'
	});
	if (!imported.ok) throw new Error(imported.refusal.message);
	const projection = renderProfile(imported.value, 'musixmatch');
	if (!projection.ok) throw new Error(projection.refusal.message);
	const { controller } = createTestWorkbench({ text: projection.value.text });
	controller.onSnapshot({
		...controller.snapshot,
		conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
	});
	const findings = retainedFindings(controller.snapshot);
	const view = await render(RetainedReview, { controller, findings });
	const message = () => view.container.querySelector('[aria-live="polite"]')?.textContent;
	expect(message()).toContain('[Custom opening: Mira] (empty section)');
	await fireEvent.click(screen.getByRole('button', { name: 'Next detail' }));
	expect(message()).toContain('[The return: Noor], with retained opening “Stay beside me”');
	expect(screen.getByRole('combobox', { name: 'Musixmatch section type' })).toBeVisible();
	expect(screen.queryByRole('button', { name: 'Review in Song' })).toBeNull();
});

test('reviews one retained detail at a time without moving navigation for long messages', async () => {
	const { controller } = createTestWorkbench();
	const findings: RetainedFinding[] = [
		{ kind: 'metadata', id: 'first', sectionId: 'one', message: 'Choose the section tag.' },
		{
			kind: 'metadata',
			id: 'second',
			sectionId: 'two',
			message:
				'Choose a section tag for the very long original section and performer label. '.repeat(5)
		}
	];
	const view = await render(RetainedReview, { controller, findings });
	view.container.style.width = '300px';
	const next = screen.getByRole('button', { name: 'Next detail' });
	const top = next.getBoundingClientRect().top;
	const message = () => view.container.querySelector('[aria-live="polite"]')?.textContent;
	expect(message()).toBe(findings[0].message);
	await fireEvent.click(next);
	expect(message()).toBe(findings[1].message);
	expect(next.getBoundingClientRect().top).toBe(top);
	expect(next).toBeDisabled();
	expect(screen.getAllByRole('button', { name: 'Review in Song' })).toHaveLength(1);
	await fireEvent.click(screen.getByRole('button', { name: 'Review in Song' }));
	expect(controller.requestedSection).toEqual({ id: 'two', origin: 'review' });
	await view.rerender({ controller, findings: findings.slice(0, 1) });
	expect(message()).toBe(findings[0].message);
	expect(screen.queryByRole('button', { name: 'Next detail' })).toBeNull();
	expect(screen.queryByRole('button', { name: 'Previous detail' })).toBeNull();
});

test('requires Save, resets pending choice between items, and refuses unavailable commits', async () => {
	const { controller } = createTestWorkbench();
	const findings: RetainedFinding[] = [
		{ kind: 'section-type', id: 'one', sectionId: 'stable-one', message: 'Empty section.' },
		{ kind: 'section-type', id: 'two', sectionId: 'stable-two', message: 'Another section.' }
	];
	const view = await render(RetainedReview, { controller, findings });
	const select = () => screen.getByRole('combobox', { name: 'Musixmatch section type' });
	await fireEvent.change(select(), { target: { value: 'Verse' } });
	expect(controller.feedback.announcement).toBe('');
	await fireEvent.click(screen.getByRole('button', { name: 'Next detail' }));
	expect(select()).toHaveValue('');
	await fireEvent.change(select(), { target: { value: 'Chorus' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Save section type' }));
	expect(controller.feedback.announcement).toBe('Document details are not ready yet.');
	expect(select()).toHaveValue('Chorus');
	select().focus();
	await view.rerender({ controller, findings: [] });
	expect(screen.getByRole('heading', { name: 'Retained details (0)' })).toHaveFocus();
	await view.rerender({ controller, findings });
	expect(select()).toHaveValue('');
});

test('expires a prepared section choice after an edit while retaining selection-only choices', async () => {
	const imported = importDocument({
		text: '[Custom opening: Mira]\n[Returning refrain: Noor]\nStay beside me',
		profile: 'genius'
	});
	if (!imported.ok) throw Error(imported.refusal.message);
	const projection = renderProfile(imported.value, 'musixmatch');
	if (!projection.ok) throw Error(projection.refusal.message);
	const { controller } = createTestWorkbench({ text: projection.value.text });
	controller.onSnapshot({
		...controller.snapshot,
		conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
	});
	const view = await render(RetainedReview, {
		controller,
		findings: retainedFindings(controller.snapshot)
	});
	const select = screen.getByRole('combobox', { name: 'Musixmatch section type' });
	const save = screen.getByRole('button', { name: 'Save section type' });
	await fireEvent.change(select, { target: { value: 'Verse' } });
	controller.onSnapshot({ ...controller.snapshot, selection: { anchor: 2, head: 2 } });
	await view.rerender({ controller, findings: retainedFindings(controller.snapshot) });
	expect(select).toHaveValue('Verse');
	expect(save).toBeEnabled();
	const before = save.getBoundingClientRect().toJSON();
	save.focus();
	const text = 'Current words stay exact';
	const edited = reconcileEdit(imported.value, projection.value, {
		changes: [{ from: 0, to: projection.value.text.length, insert: text }]
	});
	if (!edited.ok) throw Error(edited.refusal.message);
	controller.onSnapshot({
		...controller.snapshot,
		revision: controller.snapshot.revision + 1,
		text,
		parsed: parseDocument(text),
		conversion: createConversionEnvelope(edited.value.document, 'musixmatch', profilePolicyVersions)
	});
	await view.rerender({ controller, findings: retainedFindings(controller.snapshot) });
	expect(select).toHaveValue('');
	expect(save).toBeDisabled();
	expect(screen.getByRole('status')).toHaveTextContent(
		'The document changed. Choose the section type again.'
	);
	expect(screen.getByRole('heading', { name: 'Retained details (2)' })).toHaveFocus();
	expect(save.getBoundingClientRect().toJSON()).toEqual(before);
	await fireEvent.submit(save.closest('form')!);
	expect(controller.snapshot.conversion?.model).toEqual(edited.value.document);
	expect(controller.feedback.announcement).toBe('');
	await fireEvent.change(select, { target: { value: 'Chorus' } });
	expect(select).toHaveValue('Chorus');
	expect(save).toBeEnabled();
	expect(screen.queryByRole('status')).toBeNull();
	expect(controller.snapshot.text).toBe(text);
	expect(controller.snapshot.conversion?.model).toEqual(edited.value.document);
});

for (const header of ['Chorus x2', 'Repeat Chorus', 'Chorus 2x', 'Chorus x 2']) {
	test(`retains ${header} as a repeat concern even after tagging`, async () => {
		const imported = importDocument({
			text: `[${header}: Mira]\nStay beside me`,
			profile: 'genius'
		});
		if (!imported.ok) throw Error(imported.refusal.message);
		const section = imported.value.sections[0]!;
		section.type = 'Chorus';
		const { controller } = createTestWorkbench({ text: 'Stay beside me' });
		controller.onSnapshot({
			...controller.snapshot,
			conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
		});
		const findings = retainedFindings(controller.snapshot);
		expect(findings).toEqual([
			expect.objectContaining({ kind: 'repeat-header', sectionId: section.id })
		]);
		const view = await render(RetainedReview, { controller, findings });
		expect(
			within(view.container).getByRole('button', { name: 'Edit header in Genius' })
		).toBeVisible();
		expect(within(view.container).queryByRole('combobox')).toBeNull();
	});
}
