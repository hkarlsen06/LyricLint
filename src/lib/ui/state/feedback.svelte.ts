import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

export interface ToastMessage {
	id: string;
	message: string;
	actionLabel?: string;
	action?: () => void;
	/** Milliseconds before auto-dismiss. Defaults by action presence. */
	duration?: number;
	/** How many identical messages this toast stands for. Absent means one. */
	count?: number;
}

/** Informational toasts linger briefly; actionable ones long enough to react. */
export const INFO_TOAST_DURATION = 2000;
export const ACTION_TOAST_DURATION = 4000;
/** Visible-toast cap: the oldest toast collapses first beyond this. */
export const MAX_VISIBLE_TOASTS = 3;

export interface FeedbackState {
	announcement: string;
	announcementId: number;
	toasts: ToastMessage[];
	announce(message: string): void;
	addToast(toast: Omit<ToastMessage, 'id'> & { id?: string }): string;
	dismissToast(id: string): void;
	runToastAction(id: string): void;
	/** Pause the auto-dismiss countdown while the toast is hovered or focused. */
	pauseToast(id: string): void;
	/** Resume a paused countdown with the time that was remaining. */
	resumeToast(id: string): void;
}

interface ToastCountdown {
	remaining: number;
	startedAt: number;
	handle: ReturnType<typeof setTimeout> | undefined;
}

const feedbackContext = Symbol('lyriclint-feedback');

export function createFeedbackState(): FeedbackState {
	let announcement = $state('');
	let announcementId = $state(0);
	let toasts = $state<ToastMessage[]>([]);
	let nextToastId = 0;
	const countdowns = new SvelteMap<string, ToastCountdown>();

	function clearCountdown(id: string): void {
		const countdown = countdowns.get(id);
		if (countdown?.handle !== undefined) clearTimeout(countdown.handle);
		countdowns.delete(id);
	}

	function removeToast(id: string): ToastMessage | undefined {
		const toast = toasts.find((candidate) => candidate.id === id);
		toasts = toasts.filter((candidate) => candidate.id !== id);
		clearCountdown(id);
		return toast;
	}

	function startCountdown(id: string, remaining: number): void {
		countdowns.set(id, {
			remaining,
			startedAt: Date.now(),
			handle: setTimeout(() => {
				// Auto-dismiss only hides the toast; any Undo state it referenced
				// (roster history, session ignores) is untouched.
				removeToast(id);
			}, remaining)
		});
	}

	return {
		get announcement() {
			return announcement;
		},
		get announcementId() {
			return announcementId;
		},
		get toasts() {
			return toasts;
		},
		announce(message) {
			announcement = message;
			announcementId += 1;
		},
		addToast(toast) {
			// The same message twice is one thing that happened twice — ignoring two
			// occurrences of a rule stacked two identical cards, and the second said
			// nothing the first had not. It coalesces onto the existing toast with a
			// count, its countdown restarts, and its Undo runs every action it stands
			// for, so the badge and the press agree about how many.
			const existing = toasts.find(
				(candidate) =>
					candidate.message === toast.message && candidate.actionLabel === toast.actionLabel
			);
			if (existing) {
				const previous = existing.action;
				const next = toast.action;
				const merged: ToastMessage = {
					...existing,
					count: (existing.count ?? 1) + 1,
					action:
						previous && next
							? () => {
									previous();
									next();
								}
							: (next ?? previous)
				};
				toasts = toasts.map((candidate) => (candidate.id === existing.id ? merged : candidate));
				clearCountdown(existing.id);
				startCountdown(
					existing.id,
					toast.duration ?? (merged.action ? ACTION_TOAST_DURATION : INFO_TOAST_DURATION)
				);
				return existing.id;
			}

			const id = toast.id ?? `toast-${++nextToastId}`;
			toasts = [...toasts, { ...toast, id }];
			while (toasts.length > MAX_VISIBLE_TOASTS) {
				const oldest = toasts[0];
				if (!oldest) break;
				removeToast(oldest.id);
			}
			const duration =
				toast.duration ?? (toast.action ? ACTION_TOAST_DURATION : INFO_TOAST_DURATION);
			startCountdown(id, duration);
			return id;
		},
		dismissToast(id) {
			removeToast(id);
		},
		runToastAction(id) {
			const toast = removeToast(id);
			toast?.action?.();
		},
		pauseToast(id) {
			const countdown = countdowns.get(id);
			if (!countdown || countdown.handle === undefined) return;
			clearTimeout(countdown.handle);
			countdown.handle = undefined;
			countdown.remaining = Math.max(0, countdown.remaining - (Date.now() - countdown.startedAt));
		},
		resumeToast(id) {
			const countdown = countdowns.get(id);
			if (!countdown || countdown.handle !== undefined) return;
			startCountdown(id, Math.max(countdown.remaining, 1000));
		}
	};
}

export function provideFeedbackState(state = createFeedbackState()): FeedbackState {
	setContext(feedbackContext, state);
	return state;
}

export function useFeedbackState(): FeedbackState {
	const state = getContext<FeedbackState | undefined>(feedbackContext);
	if (!state) {
		throw new Error('LyricLint feedback state is not available in this component tree.');
	}
	return state;
}
