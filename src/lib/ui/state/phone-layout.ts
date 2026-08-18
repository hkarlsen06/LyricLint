/**
 * A coarse pointer *and* the stacked layout — the workbench on a phone.
 *
 * Both halves, and neither alone. The pointer by itself catches a tablet in
 * landscape, where the two-column layout is intact and nothing is compromised;
 * the width by itself catches a narrow window on a laptop, which is a supported
 * size with a keyboard behind it. `68rem` is the breakpoint that folds the panel
 * under the editor, so this matches exactly where the layout is the tight one.
 *
 * Shared rather than written out twice: the touch notice fires on this and the
 * cover band's default fold answers to it, and two copies of a breakpoint are
 * two things to remember when the breakpoint moves.
 */
export const STACKED_BREAKPOINT = '68rem';
export const PHONE_LAYOUT_QUERY = `(pointer: coarse) and (max-width: ${STACKED_BREAKPOINT})`;

/**
 * Whether this is that layout, right now.
 *
 * Read once by its callers rather than watched. A phone does not become a
 * laptop, and re-folding a band the user has just opened because they rotated
 * the device would be the layout overriding a decision it was given.
 */
export function isPhoneLayout(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia(PHONE_LAYOUT_QUERY).matches
	);
}
