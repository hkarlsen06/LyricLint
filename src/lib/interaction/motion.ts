/** Whether the current environment asks interfaces to reduce motion. */
export function prefersReducedMotion(): boolean {
	return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
