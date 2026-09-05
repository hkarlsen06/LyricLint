// Decision record: docs/subsystems/reference.md
/** Permanent migration destinations. No fragment is added: browsers inherit the incoming one. */
export function legacyReferenceDestination(url: URL): string | undefined {
	if (/^\/rules\/?$/.test(url.pathname)) return `/guidelines/${url.search}`;
	const match = /^\/rules\/([^/]+)\/?$/.exec(url.pathname);
	if (match) return `/guidelines/checks/${match[1]}/${url.search}`;
	return undefined;
}
