import { fireEvent, screen } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import RetainedReview from './RetainedReview.svelte';
import { retainedFindings, type RetainedFinding } from '#lib/conversion/review.js';
import { importDocument, renderProfile } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';

afterEach(cleanup);

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
	expect(message()).toContain('[The return: Noor], beginning “Stay beside me”');
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
	expect(screen.getByRole('button', { name: 'Next detail' })).toBeDisabled();
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
