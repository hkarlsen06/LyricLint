import type {
	EditorCallbacks,
	EditorContext,
	EditorHandle,
	SerializedSelection
} from '../core/types.js';

/**
 * Props for the future `EditorPane` component.
 *
 * The component receives initial state once, owns CodeMirror creation and
 * destruction during `onMount`, emits internally consistent snapshots through
 * `callbacks`, and exposes `handle` as its bindable shell-safe control surface.
 */
export interface EditorPaneProps {
	initialText: string;
	initialSelection?: SerializedSelection;
	context: EditorContext;
	callbacks: EditorCallbacks;
	handle?: EditorHandle;
}

/**
 * Editor lifecycle events exposed to component consumers.
 *
 * Document updates flow through `EditorCallbacks.onSnapshot`; consumers must
 * never bind the canonical text as a continuously controlled Svelte value.
 */
export interface EditorPaneEvents {
	ready: EditorHandle;
	destroyed: undefined;
}

export type {
	EditorCallbacks,
	EditorContext,
	EditorHandle,
	EditorSnapshot
} from '../core/types.js';
