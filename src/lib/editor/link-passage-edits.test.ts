import { ChangeSet, Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { alignPassages, type PassageMember } from '$lib/core/link-passages.js';
import type { TextEdit } from '$lib/core/types.js';
import {
	applyPassageTransfer,
	detachPassageRange,
	mapPassageState,
	passageTargets,
	type PassageState
} from './link-passage-edits.js';

function fixture(bodies: string[]) {
	let text = '';
	const parts = bodies.map((body, index) => {
		const header = text.length;
		text += `[Part ${index + 1}]\n`;
		const from = text.length;
		text += `${body}\n\n`;
		return { header, from, text: body };
	});
	return {
		text,
		headers: parts.map((part) => part.header),
		links: { passages: alignPassages(parts), detached: [] } as PassageState
	};
}

type Fixture = ReturnType<typeof fixture>;

function apply(state: Fixture, edits: TextEdit[], transfer?: PassageMember[]): Fixture {
	const sorted = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
	const changes = ChangeSet.of(sorted, state.text.length);
	const text = changes.apply(Text.of(state.text.split('\n'))).toString();
	let links = mapPassageState(state.links, changes, sorted, state.text, text);
	if (transfer) links = applyPassageTransfer(links, changes, transfer);
	for (const passage of links.passages) {
		expect(new Set(passage.members.map((member) => text.slice(member.from, member.to))).size).toBe(
			1
		);
		expect(new Set(passage.members.map((member) => member.header)).size).toBe(
			passage.members.length
		);
	}
	return { text, headers: state.headers.map((header) => changes.mapPos(header, 1)), links };
}

function edit(
	state: Fixture,
	index: number,
	before: string,
	insert: string,
	insertion = false
): Fixture {
	const header = state.headers[index]!;
	const found = state.text.indexOf(before, header);
	expect(found).toBeGreaterThanOrEqual(header);
	const from = found + (insertion ? before.length : 0);
	const to = insertion ? from : from + before.length;
	const targets = passageTargets(state.links, state.text, header, { from, to });
	return apply(
		state,
		[
			{ from, to, insert },
			...targets.map((target) => ({ from: target.from, to: target.to, insert }))
		],
		targets.length > 0 ? [{ header, from, to }, ...targets] : undefined
	);
}

function body(state: Fixture, index: number): string {
	const from = state.text.indexOf('\n', state.headers[index]) + 1;
	return state.text.slice(from, state.headers[index + 1] ?? state.text.length).trimEnd();
}

describe('stored passage edits', () => {
	it('keeps appending to a shared word linked before a local comma and ad-lib', () => {
		let state = fixture([
			'drikker vin i et badekar',
			'vin i et badekar, ri-ri',
			'drikker vin i et badekar'
		]);
		state = edit(state, 0, 'badekar', 's', true);
		expect(body(state, 0)).toBe('drikker vin i et badekars');
		expect(body(state, 1)).toBe('vin i et badekars, ri-ri');
		state = edit(state, 1, 'badekars', 'et', true);
		expect(body(state, 0)).toBe('drikker vin i et badekarset');
		expect(body(state, 2)).toBe('drikker vin i et badekarset');
	});

	it('assigns an insertion after a supplementary Unicode letter to its word, not the local punctuation', () => {
		let state = fixture(['hold 𐐀, stay', 'hold 𐐀, stay', 'hold 𐐀! stay']);
		state = edit(state, 0, '𐐀', 's', true);
		expect(body(state, 2)).toBe('hold 𐐀s! stay');
	});

	it('keeps repeated corrections linked without re-aligning the changed words', () => {
		let state = fixture(['i et badekar', 'i et badekar', 'i et badekar, ri-ri']);
		state = edit(state, 0, 'badekar', 'badeker');
		state = edit(state, 1, 'badeker', 'badekar');
		expect(body(state, 0)).toBe('i et badekar');
		expect(body(state, 2)).toBe('i et badekar, ri-ri');
	});

	it('retains empty shared positions after deleting a whole shared passage', () => {
		let state = fixture(['badekar', 'badekar']);
		state = edit(state, 0, 'badekar', '');
		expect(body(state, 0)).toBe('');
		expect(body(state, 1)).toBe('');
		const at = state.text.indexOf('\n') + 1;
		const targets = passageTargets(state.links, state.text, state.headers[0]!, {
			from: at,
			to: at
		});
		expect(targets).toHaveLength(1);
		state = apply(state, [
			{ from: at, to: at, insert: 'badekar' },
			...targets.map((target) => ({ ...target, insert: 'badekar' }))
		]);
		expect(body(state, 0)).toBe('badekar');
		expect(body(state, 1)).toBe('badekar');
	});

	it('detaches one occurrence while retaining untouched peers and shared text on both sides', () => {
		let state = fixture([
			'hold me close tonight',
			'hold me close tonight',
			'hold me close tonight'
		]);
		const from = state.text.indexOf('close');
		state.links = detachPassageRange(state.links, {
			header: state.headers[0]!,
			from,
			to: from + 5
		});
		state = apply(state, [{ from, to: from + 5, insert: 'tight' }]);
		state = edit(state, 1, 'close', 'near');
		expect(body(state, 0)).toBe('hold me tight tonight');
		expect(body(state, 2)).toBe('hold me near tonight');
		state = edit(state, 0, 'tonight', 'forever');
		expect(body(state, 2)).toBe('hold me near forever');
	});

	it('carries a replacement across membership boundaries only to peers sharing its whole range', () => {
		let state = fixture([
			'same opening\nchorus words\nsame ending',
			'same opening\nchorus words\nsame ending',
			'same opening\nother words\nsame ending'
		]);
		state = edit(state, 0, 'opening\nchorus', 'start\nrefrain');
		expect(body(state, 1)).toBe('same start\nrefrain words\nsame ending');
		expect(body(state, 2)).toBe('same opening\nother words\nsame ending');
		state = edit(state, 1, 'refrain', 'chorus');
		expect(body(state, 0)).toBe('same start\nchorus words\nsame ending');
	});

	it('retains one unambiguous insertion owner after deleting across membership boundaries', () => {
		let state = fixture([
			'same opening\nchorus words\nsame ending',
			'same opening\nchorus words\nsame ending',
			'same opening\nother words\nsame ending'
		]);
		state = edit(state, 0, 'opening\nchorus', '');
		state = edit(state, 1, 'same ', 'restored phrase', true);
		expect(body(state, 0)).toBe('same restored phrase words\nsame ending');
		expect(body(state, 2)).toBe('same opening\nother words\nsame ending');
	});

	it('keeps membership addresses current after unrelated edits before linked sections', () => {
		let state = fixture(['hold me close', 'hold me close']);
		state = apply(state, [{ from: 0, to: 0, insert: '[Intro]\nOther lyrics\n\n' }]);
		state = edit(state, 1, 'close', 'tight');
		expect(body(state, 0)).toBe('hold me tight');
	});

	it('does not translate across a peer’s intervening local wording', () => {
		const state = fixture(['hold me close tonight', 'hold me very close tonight']);
		const from = state.text.indexOf('me close');
		expect(
			passageTargets(state.links, state.text, state.headers[0]!, {
				from,
				to: from + 'me close'.length
			})
		).toEqual([]);
	});

	it('maps arbitrary local changes without stale equality, preserving the other peers', () => {
		let state = fixture([
			'hold me close tonight',
			'hold me close tonight',
			'hold me close tonight'
		]);
		const from = state.text.indexOf('close');
		state = apply(state, [{ from, to: from + 5, insert: 'far away' }]);
		state = edit(state, 1, 'close', 'near');
		expect(body(state, 0)).toBe('hold me far away tonight');
		expect(body(state, 2)).toBe('hold me near tonight');
		state = edit(state, 0, 'hold', 'keep');
		expect(body(state, 1)).toBe('keep me near tonight');
	});

	it('treats an explicit empty local boundary inside a replacement as a barrier to propagation', () => {
		const state = fixture(['hold me close', 'hold me close', 'hold me close']);
		const boundary = state.text.indexOf('close');
		state.links = detachPassageRange(state.links, {
			header: state.headers[0]!,
			from: boundary,
			to: boundary
		});
		const from = state.text.indexOf('me close');
		expect(
			passageTargets(state.links, state.text, state.headers[0]!, {
				from,
				to: from + 'me close'.length
			})
		).toEqual([]);
		expect(
			passageTargets(state.links, state.text, state.headers[0]!, { from: boundary, to: boundary })
		).toEqual([]);
	});

	it('does not insert into a peer’s explicit local boundary when only two copies remain', () => {
		const state = fixture(['hold me close', 'hold me close']);
		const boundary = state.text.indexOf('close');
		state.links = detachPassageRange(state.links, {
			header: state.headers[0]!,
			from: boundary,
			to: boundary
		});
		const peerPoint = state.text.indexOf('close', state.headers[1]);
		expect(
			passageTargets(state.links, state.text, state.headers[1]!, { from: peerPoint, to: peerPoint })
		).toEqual([]);
	});

	it('keeps a local boundary authoritative when deleting the shared character immediately before it', () => {
		let state = fixture(['hold me close', 'hold me close', 'hold me close']);
		const boundary = state.text.indexOf('close');
		state.links = detachPassageRange(state.links, {
			header: state.headers[0]!,
			from: boundary,
			to: boundary
		});
		const range = { from: boundary - 1, to: boundary };
		const targets = passageTargets(state.links, state.text, state.headers[0]!, range);
		expect(targets).toHaveLength(2);
		state = apply(
			state,
			[{ ...range, insert: '' }, ...targets.map((target) => ({ ...target, insert: '' }))],
			[{ header: state.headers[0]!, ...range }, ...targets]
		);
		expect(body(state, 0)).toBe('hold meclose');
		expect(body(state, 1)).toBe('hold meclose');
		expect(
			passageTargets(state.links, state.text, state.headers[0]!, {
				from: boundary - 1,
				to: boundary - 1
			})
		).toEqual([]);
		const peerPoint = state.text.indexOf('close', state.headers[1]);
		const peers = passageTargets(state.links, state.text, state.headers[1]!, {
			from: peerPoint,
			to: peerPoint
		});
		expect(peers.map((peer) => peer.header)).toEqual([state.headers[2]]);
	});

	it('does not reconnect an explicitly detached occurrence when its words happen to agree again', () => {
		let state = fixture(['hold me close', 'hold me close', 'hold me close']);
		const from = state.text.indexOf('close');
		state.links = detachPassageRange(state.links, {
			header: state.headers[0]!,
			from,
			to: from + 5
		});
		state = edit(state, 1, 'close', 'tight');
		state = edit(state, 1, 'tight', 'close');
		state = edit(state, 0, 'close', 'near');
		expect(body(state, 1)).toBe('hold me close');
		expect(body(state, 2)).toBe('hold me close');
	});
});
