import { fireEvent, within } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { LinkConnectionPreview } from '$lib/core/types.js';
import type { LinkOccurrence } from '$lib/editor/section-links.js';
import PassageConnections from './PassageConnections.svelte';
import LinkingDetail from './LinkingDetail.svelte';

const documentText = '[Intro]\ni et badekar\nmatching ending';
const connections: LinkConnectionPreview[] = [
	{
		text: 'matching ending',
		from: documentText.indexOf('matching'),
		headers: [0, 20, 40],
		added: false
	},
	{ text: 'i et badekar', from: documentText.indexOf('i et'), headers: [0, 20], added: true },
	{ text: 'matching', from: documentText.indexOf('matching'), headers: [0, 20], added: true }
];
const nameFor = (header: number) =>
	({ 0: 'Intro', 20: 'Chorus 1', 40: 'Outro' })[header] ?? 'Section';

describe('passage connection review', () => {
	it('shows exact additions and recipient groups before offering reconnect, with lyric navigation', async () => {
		const connectionsFor = vi.fn(() => connections);
		const onReconnect = vi.fn();
		const onNavigate = vi.fn();
		const view = render(PassageConnections, {
			connectionsFor,
			nameFor,
			documentText,
			onReconnect,
			onNavigate
		});
		const panel = within(view.container);
		expect(connectionsFor).toHaveBeenCalledOnce();
		expect(panel.queryByRole('button', { name: 'Link these lyrics again' })).toBeNull();
		const disclosure = panel.getByRole('button', { name: 'Link matching lyrics again' });
		await fireEvent.click(disclosure);
		expect(disclosure).toHaveAttribute('aria-expanded', 'true');
		expect(panel.getByRole('heading', { name: 'Intro and Chorus 1' })).toBeTruthy();
		expect(panel.queryByRole('heading', { name: 'Intro, Chorus 1, and Outro' })).toBeNull();
		expect(panel.queryByText('Will reconnect')).toBeNull();
		expect(panel.queryByText('Already connected')).toBeNull();
		expect(panel.queryByText('matching ending')).toBeNull();
		expect(panel.getByText('i et badekar')).toBeTruthy();
		expect(panel.getByText(/previously edited them separately/)).toBeTruthy();
		await fireEvent.click(panel.getByRole('button', { name: 'Go to Intro, line 2' }));
		expect(onNavigate).toHaveBeenCalledWith(documentText.indexOf('i et'));
		expect(onReconnect).not.toHaveBeenCalled();
		await fireEvent.click(panel.getByRole('button', { name: 'Link these lyrics again' }));
		expect(onReconnect).toHaveBeenCalledOnce();
	});

	it('omits whitespace-only snippets and navigates trimmed previews to the first visible lyric', async () => {
		const onNavigate = vi.fn();
		const text = '[Intro]\n\n  i et badekar  \n';
		const view = render(PassageConnections, {
			connectionsFor: () => [
				{ text: '\n  i et badekar  \n', from: 8, headers: [0, 20], added: true },
				{ text: '\n ', from: 7, headers: [0, 20], added: false }
			],
			nameFor,
			documentText: text,
			onNavigate,
			onReconnect: vi.fn()
		});
		const panel = within(view.container);
		await fireEvent.click(panel.getByRole('button', { name: 'Link matching lyrics again' }));
		expect(panel.getByText('i et badekar')).toBeTruthy();
		expect(panel.queryByText('Already connected')).toBeNull();
		expect(panel.getAllByRole('button', { name: /^Go to / })).toHaveLength(1);
		await fireEvent.click(panel.getByRole('button', { name: 'Go to Intro, line 3' }));
		expect(onNavigate).toHaveBeenCalledWith(text.indexOf('i et'));
	});

	it('discloses added empty and whitespace connections before reconnecting them', async () => {
		const onNavigate = vi.fn();
		const view = render(PassageConnections, {
			connectionsFor: () => [
				{ text: '', from: 8, headers: [0, 20], added: true },
				{ text: '\n ', from: 7, headers: [0, 20], added: true }
			],
			nameFor,
			documentText,
			onNavigate,
			onReconnect: vi.fn()
		});
		const panel = within(view.container);
		await fireEvent.click(panel.getByRole('button', { name: 'Link matching lyrics again' }));
		expect(panel.getByText('Keep text typed at this position in sync.')).toBeTruthy();
		expect(panel.getByText('Keep these spaces and line breaks in sync.')).toBeTruthy();
		await fireEvent.click(panel.getByRole('button', { name: 'Go to Intro, line 2' }));
		expect(onNavigate).toHaveBeenCalledWith(8);
		expect(panel.getByRole('button', { name: 'Link these lyrics again' })).toBeTruthy();
	});

	it('shows Unicode word context around a partial connection while highlighting only the added letters', async () => {
		const text = '[Intro]\ni et badekar og blåbær';
		const view = render(PassageConnections, {
			connectionsFor: () => [
				{ text: 'r', from: text.indexOf('badekar') + 6, headers: [0, 20], added: true },
				{ text: 'å', from: text.indexOf('blåbær') + 2, headers: [0, 20], added: true }
			],
			nameFor,
			documentText: text,
			onReconnect: vi.fn()
		});
		const panel = within(view.container);
		await fireEvent.click(panel.getByRole('button', { name: 'Link matching lyrics again' }));
		expect(
			[...view.container.querySelectorAll('.lyric-text')].map((line) => line.textContent)
		).toEqual(['badekar', 'blåbær']);
		expect([...view.container.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual([
			'r',
			'å'
		]);
	});

	it('does not offer reconnect when only existing connections are available', async () => {
		const view = render(PassageConnections, {
			connectionsFor: () => connections.filter((connection) => !connection.added),
			nameFor,
			documentText,
			onReconnect: vi.fn()
		});
		const panel = within(view.container);
		expect(panel.queryByRole('button', { name: 'Link matching lyrics again' })).toBeNull();
		expect(panel.queryByRole('button', { name: 'Link these lyrics again' })).toBeNull();
		expect(view.container.children).toHaveLength(0);
	});

	it.each([320, 640])(
		'opens below its stationary disclosure and wraps long names and snippets at %ipx',
		async (width) => {
			const view = render(PassageConnections, {
				connectionsFor: () => [
					{
						...connections[1]!,
						text: 'i et badekar\nA much longer shared passage that needs several lines on a narrow phone screen'
					}
				],
				nameFor: (header) =>
					`${nameFor(header)} with an exceptionally long performer and section description`,
				documentText,
				onReconnect: vi.fn()
			});
			view.container.style.width = `${width}px`;
			const panel = within(view.container);
			const disclosure = panel.getByRole('button', { name: 'Link matching lyrics again' });
			const before = disclosure.getBoundingClientRect();
			await fireEvent.click(disclosure);
			expect(disclosure.getBoundingClientRect().top).toBe(before.top);
			expect(disclosure.getBoundingClientRect().height).toBe(before.height);
			const section = panel.getByRole('region', { name: 'Lyrics to link again' });
			expect(section.getBoundingClientRect().top).toBeGreaterThanOrEqual(before.bottom);
			expect(section.scrollWidth).toBeLessThanOrEqual(width);
			expect(panel.getByText('i et badekar')).toBeTruthy();
			await fireEvent.click(disclosure);
			expect(disclosure.getBoundingClientRect().top).toBe(before.top);
			expect(panel.queryByRole('region', { name: 'Lyrics to link again' })).toBeNull();
		}
	);
});

const occurrences: LinkOccurrence[] = [
	{ headerFrom: 0, line: 1, label: 'Intro', ordinal: 1, sameKind: false, comparison: 'source' },
	{
		headerFrom: 20,
		line: 4,
		label: 'Chorus 1',
		ordinal: 1,
		sameKind: false,
		comparison: 'different'
	},
	{ headerFrom: 40, line: 7, label: 'Outro', ordinal: 1, sameKind: false, comparison: 'same' }
];

describe('connection review in linking detail', () => {
	it('applies refresh through the existing choice callback and clears review when membership changes', async () => {
		const onApply = vi.fn();
		const view = render(LinkingDetail, {
			occurrences,
			currentHeaderFrom: 0,
			initialSelected: [20],
			fromOverview: true,
			comparedHeaders: [0, 20],
			differencesFor: () => [],
			connectionsFor: () => connections,
			onApply,
			onBack: vi.fn(),
			documentText
		});
		const panel = within(view.container);
		await fireEvent.click(panel.getByRole('button', { name: 'Link matching lyrics again' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Link these lyrics again' }));
		expect(onApply).toHaveBeenCalledWith({ headers: [0, 20], refreshConnections: true });
		await fireEvent.click(panel.getByRole('checkbox', { name: /^Outro/ }));
		expect(panel.queryByRole('button', { name: 'Link matching lyrics again' })).toBeNull();
		expect(panel.queryByRole('button', { name: 'Link these lyrics again' })).toBeNull();
		await fireEvent.click(panel.getByRole('checkbox', { name: /^Outro/ }));
		expect(panel.getByRole('button', { name: 'Link matching lyrics again' })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
	});

	it('retires connection review before opening wording decisions', async () => {
		const view = render(LinkingDetail, {
			occurrences,
			currentHeaderFrom: 0,
			initialSelected: [20],
			fromOverview: true,
			comparedHeaders: [0, 20],
			differencesFor: () => [
				{
					index: 0,
					wordings: [
						{ headerFrom: 0, from: 8, text: 'badekar', before: '', after: '' },
						{ headerFrom: 20, from: 28, text: 'badeker', before: '', after: '' }
					]
				}
			],
			connectionsFor: () => connections,
			onApply: vi.fn(),
			onBack: vi.fn(),
			documentText
		});
		const panel = within(view.container);
		await fireEvent.click(panel.getByRole('button', { name: 'Link matching lyrics again' }));
		await fireEvent.click(panel.getByRole('button', { name: 'Review differences' }));
		expect(panel.queryByRole('button', { name: 'Link these lyrics again' })).toBeNull();
		expect(panel.queryByRole('button', { name: 'Link matching lyrics again' })).toBeNull();
	});
});
