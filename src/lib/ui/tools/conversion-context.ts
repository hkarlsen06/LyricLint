const CONTEXT_LENGTH = 48;
const words = new Intl.Segmenter(undefined, { granularity: 'word' });

/** Elide distant context at word boundaries; the selected target is rendered separately. */
export function conversionContext(before: string, after: string) {
	const leading = before.length > CONTEXT_LENGTH;
	const trailing = after.length > CONTEXT_LENGTH;
	const start = leading
		? words.segment(before).containing(before.length - CONTEXT_LENGTH)
		: undefined;
	const end = trailing ? words.segment(after).containing(CONTEXT_LENGTH) : undefined;
	const from = start
		? start.index + (start.index < before.length - CONTEXT_LENGTH ? start.segment.length : 0)
		: before.length;
	return {
		before: leading ? `…${before.slice(from)}` : before,
		after: trailing ? `${after.slice(0, end?.index ?? 0)}…` : after,
		clipped: leading || trailing
	};
}
