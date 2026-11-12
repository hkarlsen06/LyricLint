import { describe, expect, it, test } from 'vitest';
import {
	decideQuantityRepresentation,
	quantitySourceDigits,
	quantityWordingRequirement,
	decideInstrumentalRepresentation,
	parseQuantityInteger,
	type QuantityFacts,
	type InstrumentalIntervalFacts
} from './decisions.js';

const quantity: QuantityFacts = {
	profile: 'musixmatch',
	language: 'en',
	value: '12',
	usage: 'ordinary-cardinal',
	pronunciation: 'whole-quantity',
	spokenForm: 'twelve'
};
const interval: InstrumentalIntervalFacts = {
	language: 'en',
	recordingId: 'recording-a',
	currentRecordingId: 'recording-a',
	startMs: 1000,
	endMs: 16_001,
	recordingDurationMs: 30_000,
	lyricalContent: 'none-confirmed',
	placement: 'between-tagged-sections',
	beforeSectionId: 'verse',
	afterSectionId: 'chorus'
};

describe('typed quantity decisions', () => {
	it('selects known forms at the exact ten boundary and preserves arbitrary integer precision', () => {
		expect(decideQuantityRepresentation(quantity)).toMatchObject({ ok: true, value: '12' });
		expect(
			decideQuantityRepresentation({ ...quantity, value: '10', spokenForm: undefined })
		).toMatchObject({ ok: true, value: 'ten' });
		expect(decideQuantityRepresentation({ ...quantity, profile: 'genius' })).toMatchObject({
			ok: true,
			value: 'twelve'
		});
		const large = '900719925474099312345678901234567890';
		expect(
			decideQuantityRepresentation({ ...quantity, value: large, spokenForm: undefined })
		).toMatchObject({ ok: true, value: large });
	});
	it.each([
		'fixed-expression',
		'name-or-identifier',
		'date-or-time',
		'phone-or-decade',
		'unknown'
	] as const)('cannot override the %s role with a numeric value', (usage) => {
		expect(decideQuantityRepresentation({ ...quantity, usage }).ok).toBe(false);
	});
	it('never treats digit strings, leading zeros, rounding or mixed digit sets as ordinary numeric proof', () => {
		for (const value of ['01', '-1', '1.1', '1e6', '١٢'])
			expect(parseQuantityInteger(value)).toBeUndefined();
		expect(
			decideQuantityRepresentation({ ...quantity, pronunciation: 'individual-digits' }).ok
		).toBe(false);
		expect(decideQuantityRepresentation({ ...quantity, digitForm: '1٢' }).ok).toBe(false);
		expect(decideQuantityRepresentation({ ...quantity, digitForm: '１２' })).toMatchObject({
			ok: true,
			value: '１２'
		});
	});
	it.each(['en', 'no', 'de', 'fr'])(
		'uses generic count policy only after complete role facts in %s',
		(language) => {
			expect(decideQuantityRepresentation({ ...quantity, language })).toMatchObject({
				ok: true,
				value: '12'
			});
		}
	);
	it.each(['ar', 'es', 'ja', 'ko'])(
		'retains a review outcome for unresolved %s numeric scope',
		(language) => {
			expect(decideQuantityRepresentation({ ...quantity, language }).ok).toBe(false);
		}
	);
	it('requires authored morphological forms outside the narrow English formatter', () => {
		expect(
			decideQuantityRepresentation({
				...quantity,
				language: 'de',
				value: '1',
				spokenForm: undefined
			}).ok
		).toBe(false);
		expect(
			decideQuantityRepresentation({ ...quantity, language: 'de', value: '1', spokenForm: 'einen' })
		).toMatchObject({ ok: true, value: 'einen' });
	});
});

describe('typed instrumental interval decisions', () => {
	it('names an end beyond the actual recording without disguising precision failures', () => {
		expect(
			decideInstrumentalRepresentation({
				...interval,
				startMs: 2000,
				endMs: 26000,
				recordingDurationMs: 25000
			})
		).toMatchObject({
			ok: false,
			reason: 'invalid-fact',
			message: expect.stringContaining('recording duration of 25 seconds')
		});
		for (const endMs of [26000.1, Infinity, NaN, 1000])
			expect(
				decideInstrumentalRepresentation({
					...interval,
					startMs: 2000,
					endMs,
					recordingDurationMs: 25000
				})
			).toMatchObject({ ok: false, message: expect.stringContaining('whole milliseconds') });
	});
	it('requires strictly more than fifteen seconds and preserves the authored interval', () => {
		expect(decideInstrumentalRepresentation({ ...interval, endMs: 16_000 }).ok).toBe(false);
		expect(decideInstrumentalRepresentation(interval)).toMatchObject({
			ok: true,
			value: { text: '#INSTRUMENTAL', startMs: 1000, endMs: 16_001 }
		});
	});
	it.each([
		{ lyricalContent: 'uncertain' as const },
		{ placement: 'within-section' as const },
		{ beforeSectionId: 'chorus' },
		{ startMs: 0 },
		{ endMs: 30_000 },
		{ currentRecordingId: 'different-recording' },
		{ endMs: Number.POSITIVE_INFINITY },
		{ endMs: 16_001.1 },
		{ language: 'ja' }
	])('refuses incomplete, stale or conflicting interval evidence: %o', (change) => {
		expect(decideInstrumentalRepresentation({ ...interval, ...change }).ok).toBe(false);
	});
});

test('source digits prove only exact identity and wording requirements remain policy-owned', () => {
	expect(quantitySourceDigits('２', '2')).toBe('２');
	expect(quantitySourceDigits('٢', '2')).toBe('٢');
	for (const source of ['007', '０２', '2٢', '２x', '3', 'two'])
		expect(quantitySourceDigits(source, '2')).toBeUndefined();
	expect(quantityWordingRequirement({ ...quantity, value: '2', spokenForm: undefined }, '2')).toBe(
		'optional'
	);
	expect(quantityWordingRequirement({ ...quantity, language: 'fr', value: '2' }, '２')).toBe(
		'required'
	);
	expect(quantityWordingRequirement(quantity, 'twelve')).toBe('required');
});
