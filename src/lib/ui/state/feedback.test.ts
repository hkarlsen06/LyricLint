import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ACTION_TOAST_DURATION,
	createFeedbackState,
	INFO_TOAST_DURATION,
	MAX_VISIBLE_TOASTS
} from './feedback.svelte.js';

describe('feedback toast lifecycle', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('auto-dismisses informational toasts after the short duration', () => {
		const feedback = createFeedbackState();
		feedback.addToast({ message: 'Saved locally.' });
		expect(feedback.toasts).toHaveLength(1);

		vi.advanceTimersByTime(INFO_TOAST_DURATION - 1);
		expect(feedback.toasts).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(feedback.toasts).toHaveLength(0);
	});

	it('gives toasts with an Undo action the longer duration', () => {
		const feedback = createFeedbackState();
		feedback.addToast({ message: 'Removed Mara.', actionLabel: 'Undo', action: () => {} });

		vi.advanceTimersByTime(INFO_TOAST_DURATION);
		expect(feedback.toasts).toHaveLength(1);
		vi.advanceTimersByTime(ACTION_TOAST_DURATION - INFO_TOAST_DURATION);
		expect(feedback.toasts).toHaveLength(0);
	});

	it('pauses the countdown while engaged and resumes with remaining time', () => {
		const feedback = createFeedbackState();
		const id = feedback.addToast({
			message: 'Ignored rule.',
			actionLabel: 'Undo',
			action: () => {}
		});

		vi.advanceTimersByTime(3000);
		feedback.pauseToast(id);
		vi.advanceTimersByTime(60_000);
		expect(feedback.toasts).toHaveLength(1);

		feedback.resumeToast(id);
		vi.advanceTimersByTime(ACTION_TOAST_DURATION - 3000 - 1);
		expect(feedback.toasts).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(feedback.toasts).toHaveLength(0);
	});

	it('keeps a nearly expired toast readable after resuming', () => {
		const feedback = createFeedbackState();
		const id = feedback.addToast({ message: 'Almost gone.' });

		vi.advanceTimersByTime(INFO_TOAST_DURATION - 5);
		feedback.pauseToast(id);
		feedback.resumeToast(id);
		vi.advanceTimersByTime(500);
		expect(feedback.toasts).toHaveLength(1);
		vi.advanceTimersByTime(1000);
		expect(feedback.toasts).toHaveLength(0);
	});

	it('pause and resume are idempotent and safe for dismissed toasts', () => {
		const feedback = createFeedbackState();
		const id = feedback.addToast({ message: 'One.' });
		feedback.pauseToast(id);
		feedback.pauseToast(id);
		feedback.resumeToast(id);
		feedback.resumeToast(id);
		feedback.dismissToast(id);
		feedback.pauseToast(id);
		feedback.resumeToast(id);
		vi.runAllTimers();
		expect(feedback.toasts).toHaveLength(0);
	});

	it('collapses the oldest toast when more than the cap are shown', () => {
		const feedback = createFeedbackState();
		for (let index = 0; index < MAX_VISIBLE_TOASTS + 2; index += 1) {
			feedback.addToast({ message: `Toast ${index}` });
		}
		expect(feedback.toasts).toHaveLength(MAX_VISIBLE_TOASTS);
		expect(feedback.toasts.map((toast) => toast.message)).toEqual([
			'Toast 2',
			'Toast 3',
			'Toast 4'
		]);
		vi.runAllTimers();
		expect(feedback.toasts).toHaveLength(0);
	});

	it('evicts action-less toasts before one holding a live Undo', () => {
		const feedback = createFeedbackState();
		feedback.addToast({ message: 'Ignored rule.', actionLabel: 'Undo', action: () => {} });
		feedback.addToast({ message: 'Saved.' });
		feedback.addToast({ message: 'Copied.' });
		feedback.addToast({ message: 'Exported.' });
		expect(feedback.toasts.map((toast) => toast.message)).toEqual([
			'Ignored rule.',
			'Copied.',
			'Exported.'
		]);
	});

	it('never evicts the toast the press just produced, even when every earlier toast holds an action', () => {
		const feedback = createFeedbackState();
		feedback.addToast({ message: 'Removed A.', actionLabel: 'Undo', action: () => {} });
		feedback.addToast({ message: 'Removed B.', actionLabel: 'Undo', action: () => {} });
		feedback.addToast({ message: 'Removed C.', actionLabel: 'Undo', action: () => {} });
		feedback.addToast({ message: 'Saved.' });
		expect(feedback.toasts.map((toast) => toast.message)).toEqual([
			'Removed B.',
			'Removed C.',
			'Saved.'
		]);
	});

	it('coalesces a repeated message onto one toast, and its Undo runs every action', () => {
		const feedback = createFeedbackState();
		const first = vi.fn();
		const second = vi.fn();
		const id = feedback.addToast({ message: 'Ignored.', actionLabel: 'Undo', action: first });
		vi.advanceTimersByTime(ACTION_TOAST_DURATION - 1000);
		expect(feedback.addToast({ message: 'Ignored.', actionLabel: 'Undo', action: second })).toBe(
			id
		);

		expect(feedback.toasts).toHaveLength(1);
		expect(feedback.toasts[0]?.count).toBe(2);

		// The second occurrence restarts the countdown — a toast the user has not
		// finished reading must not expire because an earlier copy was about to.
		vi.advanceTimersByTime(ACTION_TOAST_DURATION - 1);
		expect(feedback.toasts).toHaveLength(1);

		feedback.runToastAction(id);
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
		expect(feedback.toasts).toHaveLength(0);
	});

	it('running the action dismisses the toast and cancels its timer', () => {
		const feedback = createFeedbackState();
		const action = vi.fn();
		const id = feedback.addToast({ message: 'Undoable.', actionLabel: 'Undo', action });

		feedback.runToastAction(id);
		expect(action).toHaveBeenCalledOnce();
		expect(feedback.toasts).toHaveLength(0);
		vi.runAllTimers();
		expect(action).toHaveBeenCalledOnce();
	});

	it('auto-dismissal hides the toast without running its action', () => {
		const feedback = createFeedbackState();
		const action = vi.fn();
		feedback.addToast({ message: 'Undoable.', actionLabel: 'Undo', action });

		vi.advanceTimersByTime(ACTION_TOAST_DURATION);
		expect(feedback.toasts).toHaveLength(0);
		expect(action).not.toHaveBeenCalled();
	});
});
