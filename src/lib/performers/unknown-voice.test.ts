import { parseDocument } from '$lib/core/parser.js';
import type { SerializedSelection, TextEdit, UnknownVoiceRequest } from '$lib/core/types.js';
import { assignUnknownVoice, unknownVoiceOffers } from './transform.js';
import { describe, expect, it } from 'vitest';

function applyEdits(text: string, edits: readonly TextEdit[]): string {
	let output = text;
	for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
		output = `${output.slice(0, edit.from)}${edit.insert}${output.slice(edit.to)}`;
	}
	return output;
}

function request(
	text: string,
	selectedText: string,
	styleSlot?: UnknownVoiceRequest['styleSlot']
): UnknownVoiceRequest {
	const from = text.indexOf(selectedText);
	if (from < 0) {
		throw new Error(`Selection ${JSON.stringify(selectedText)} not found.`);
	}
	const base: UnknownVoiceRequest = {
		revision: 7,
		text,
		document: parseDocument(text),
		selection: { anchor: from, head: from + selectedText.length }
	};
	return styleSlot === undefined ? base : { ...base, styleSlot };
}

describe('assignUnknownVoice', () => {
	it('wraps the selection in the first free styled slot and never touches the header', () => {
		const text = '[Verse: A]\nHello there world';
		const result = assignUnknownVoice(request(text, 'world'));

		expect(result.status).toBe('applied');
		if (result.status !== 'applied') return;
		expect(result.styleSlot).toBe(2);
		expect(result.edit.baseRevision).toBe(7);
		expect(applyEdits(text, result.edit.edits)).toBe('[Verse: A]\nHello there <i>world</i>');
	});

	it('allocates around slots held by the legend and by the body', () => {
		const legendHeld = '[Verse: A & <i>B</i>]\nHello world';
		const legendResult = assignUnknownVoice(request(legendHeld, 'world'));
		expect(legendResult.status).toBe('applied');
		if (legendResult.status === 'applied') {
			expect(legendResult.styleSlot).toBe(3);
			expect(applyEdits(legendHeld, legendResult.edit.edits)).toBe(
				'[Verse: A & <i>B</i>]\nHello <b>world</b>'
			);
		}

		const bodyHeld = '[Verse]\n<i>Ayy</i> hello world';
		const bodyResult = assignUnknownVoice(request(bodyHeld, 'world'));
		expect(bodyResult.status).toBe('applied');
		if (bodyResult.status === 'applied') {
			expect(bodyResult.styleSlot).toBe(3);
		}
	});

	it('reuses an explicit unaccounted slot as the same unknown voice', () => {
		const text = '[Verse]\n<i>Ayy</i> hello\nNå må du våkne';
		const result = assignUnknownVoice(request(text, 'Nå må du våkne', 2));

		expect(result.status).toBe('applied');
		if (result.status !== 'applied') return;
		expect(result.styleSlot).toBe(2);
		expect(applyEdits(text, result.edit.edits)).toBe(
			'[Verse]\n<i>Ayy</i> hello\n<i>Nå må du våkne</i>'
		);
	});

	it('refuses an explicit slot the legend already names', () => {
		const text = '[Verse: A & <i>B</i>]\nHello world';
		const result = assignUnknownVoice(request(text, 'world', 2));
		expect(result).toMatchObject({ status: 'blocked', reason: 'invalid-range' });
	});

	it('blocks with too-many-groups when every styled slot is spent', () => {
		const text = '[Verse]\n<i>a</i> <b>b</b> <i><b>c</b></i> hello';
		const result = assignUnknownVoice(request(text, 'hello'));
		expect(result).toMatchObject({ status: 'blocked', reason: 'too-many-groups' });
	});

	it('wraps a multi-line selection as one continuous wrapper', () => {
		const text = '[Verse: A]\nFirst line\nSecond line\nThird line';
		const result = assignUnknownVoice(request(text, 'Second line\nThird line'));

		expect(result.status).toBe('applied');
		if (result.status !== 'applied') return;
		expect(applyEdits(text, result.edit.edits)).toBe(
			'[Verse: A]\nFirst line\n<i>Second line\nThird line</i>'
		);
	});

	it('refuses a selection outside a headered section', () => {
		const headerless = 'Hello there world';
		expect(assignUnknownVoice(request(headerless, 'world'))).toMatchObject({
			status: 'blocked',
			reason: 'invalid-range'
		});
	});
});

describe('unknownVoiceOffers', () => {
	it('offers existing unaccounted slots and a fresh allocation', () => {
		const text = '[Verse: A]\n<i>Ayy</i> hello world';
		const offers = unknownVoiceOffers(parseDocument(text), selectionOf(text, 'world'));
		expect(offers).toEqual({ existingSlots: [2], canAllocateNew: true });
	});

	it('never offers the slot the whole selection already carries', () => {
		const text = '[Verse]\n<i>Ayy</i> hello';
		const offers = unknownVoiceOffers(parseDocument(text), selectionOf(text, 'Ayy'));
		expect(offers.existingSlots).toEqual([]);
	});

	it('offers no new slot when the legend and body have spent all three', () => {
		const text = '[Verse: A, <i>B</i> & <b>C</b>]\n<i><b>d</b></i> hello';
		const offers = unknownVoiceOffers(parseDocument(text), selectionOf(text, 'hello'));
		expect(offers).toEqual({ existingSlots: [4], canAllocateNew: false });
	});

	it('offers nothing for a selection no assignment could take', () => {
		const text = 'No header here';
		const offers = unknownVoiceOffers(parseDocument(text), selectionOf(text, 'header'));
		expect(offers).toEqual({ existingSlots: [], canAllocateNew: false });
	});
});

function selectionOf(text: string, selectedText: string): SerializedSelection {
	const from = text.indexOf(selectedText);
	if (from < 0) {
		throw new Error(`Selection ${JSON.stringify(selectedText)} not found.`);
	}
	return { anchor: from, head: from + selectedText.length };
}
