import type { SectionLink } from '../core/types.js';

/**
 * A deep copy of a draft's section links.
 *
 * Shared rather than written out at each of the copiers, because this is the
 * exact shape of the bug AGENTS.md already warns about: `copySnapshot` and
 * `copyDraft` each list the fields they keep by hand, and both of them spelled
 * out `{ lines: [...link.lines] }`. A link that gained a second field — which is
 * what happened the moment two choruses were allowed to differ — would have been
 * dropped on the way past by both of them, silently, while the editor, the
 * controller and the repository all looked correct.
 *
 * One function is not a guarantee either, but it is one place to change instead
 * of two to remember.
 */
export function copySectionLinks(links: readonly SectionLink[]): SectionLink[] {
	return links.map((link) => ({
		lines: [...link.lines],
		...(link.holes ? { holes: link.holes.map((hole) => ({ ...hole })) } : {})
	}));
}
