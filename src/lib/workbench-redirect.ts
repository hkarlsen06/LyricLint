/** Permanent workspace migration destination. No fragment is added: browsers retain it. */
export function legacyWorkbenchDestination(url: URL): string | undefined {
	return /^\/lint\/?$/.test(url.pathname) ? `/workbench/${url.search}` : undefined;
}
