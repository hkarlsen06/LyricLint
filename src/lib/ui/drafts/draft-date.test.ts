import { describe, expect, test } from 'vitest';
import { formatDraftDate, fullDraftDate } from './draft-date.js';

// Local time, because that is the day the reader is having.
const now = new Date(2026, 6, 25, 14, 30);

function daysBefore(days: number, hour = 9): Date {
	return new Date(2026, 6, 25 - days, hour);
}

describe('formatDraftDate', () => {
	test('names the recent days rather than numbering them', () => {
		expect(formatDraftDate(daysBefore(0).toISOString(), now)).toBe('Today');
		expect(formatDraftDate(daysBefore(1).toISOString(), now)).toBe('Yesterday');
		expect(formatDraftDate(daysBefore(3).toISOString(), now)).toBe('3 days ago');
	});

	// Calendar days, not elapsed hours: a draft saved late last night is
	// "Yesterday" this morning, however few hours ago that was.
	test('counts calendar days, not elapsed time', () => {
		expect(
			formatDraftDate(new Date(2026, 6, 24, 23, 50).toISOString(), new Date(2026, 6, 25, 0, 10))
		).toBe('Yesterday');
	});

	test('drops to a date after a week, and adds the year only outside this one', () => {
		expect(formatDraftDate(daysBefore(40).toISOString(), now)).toBe('15 Jun');
		expect(formatDraftDate(new Date(2025, 2, 12).toISOString(), now)).toBe('12 Mar 2025');
	});

	test('says nothing rather than "Invalid Date"', () => {
		expect(formatDraftDate('not a date', now)).toBe('');
		expect(fullDraftDate('not a date')).toBe('');
	});
});
