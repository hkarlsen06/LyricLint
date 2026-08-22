/**
 * The one place a new id is minted.
 *
 * `crypto.randomUUID` is **secure-context only**, so it does not exist over
 * plain `http://` on a LAN address — which is exactly how the workbench is
 * opened on a phone during development. Unguarded, it threw inside the boot
 * sequence and the page came up as "Local storage is unavailable", naming the
 * wrong subsystem entirely.
 *
 * `crypto.getRandomValues` carries no such restriction, so the fallback is the
 * same v4 UUID built by hand rather than a weaker id from `Math.random()`.
 * There were four call sites with three different guards between them, two of
 * which had none; the guard belongs here and nowhere else.
 */
export function randomId(): string {
	if (globalThis.crypto?.randomUUID !== undefined) {
		return globalThis.crypto.randomUUID();
	}

	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
