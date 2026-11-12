/**
 * The identity of each format's reviewed representation, pinned into every saved
 * conversion envelope. It changes only when what the renderer writes for a
 * format changes, never when checks are added or reworded.
 *
 * Genius used to borrow the lint rule set's version here. A rule set publishes
 * whenever findings change (a new language pack is enough), so each publish
 * made every saved rich draft "an unavailable version" and startup replaced it
 * with a text recovery. The Genius identity is the rule set under which its
 * representation was reviewed, and it stays there until that representation
 * changes.
 */
export const profilePolicyVersions = {
	genius: '2026.09.21.2',
	musixmatch: '2026.09.16.1'
} as const;

/**
 * Saved identities the current renderer still reads. Reading keeps the saved
 * identity; nothing is rewritten. A saved envelope must also re-render to its
 * exact saved text (`parseConversionEnvelope`), so a listed identity is never
 * what admits a draft the renderer would change.
 *
 * `2026.11.11.0` is the rule set version that builds wrote for a few hours on
 * 2026-11-12, while the Genius identity still followed the rule set.
 */
const readablePolicyVersions = {
	genius: [profilePolicyVersions.genius, '2026.11.11.0'],
	musixmatch: [profilePolicyVersions.musixmatch]
} as const satisfies Record<keyof typeof profilePolicyVersions, readonly string[]>;

/** Whether a saved envelope pins identities the current renderer reads. */
export function readsPolicyVersions(saved: { genius: string; musixmatch: string }): boolean {
	return (
		readablePolicyVersions.genius.some((version) => version === saved.genius) &&
		readablePolicyVersions.musixmatch.some((version) => version === saved.musixmatch)
	);
}
