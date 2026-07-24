import { getContext, setContext } from 'svelte';

export interface ToastMessage {
	id: string;
	message: string;
	actionLabel?: string;
	action?: () => void;
}

export interface FeedbackState {
	announcement: string;
	announcementId: number;
	toasts: ToastMessage[];
	announce(message: string): void;
	addToast(toast: Omit<ToastMessage, 'id'> & { id?: string }): string;
	dismissToast(id: string): void;
	runToastAction(id: string): void;
}

const feedbackContext = Symbol('lyriclint-feedback');

export function createFeedbackState(): FeedbackState {
	let announcement = $state('');
	let announcementId = $state(0);
	let toasts = $state<ToastMessage[]>([]);
	let nextToastId = 0;

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
			const id = toast.id ?? `toast-${++nextToastId}`;
			toasts = [...toasts, { ...toast, id }];
			return id;
		},
		dismissToast(id) {
			toasts = toasts.filter((toast) => toast.id !== id);
		},
		runToastAction(id) {
			const toast = toasts.find((candidate) => candidate.id === id);
			toasts = toasts.filter((candidate) => candidate.id !== id);
			toast?.action?.();
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
