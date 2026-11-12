/** The bounded language-tag syntax accepted by editing commands, including custom codes. */
export function isLanguageTag(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length <= 128 &&
		/^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{1,8})*$/u.test(value)
	);
}
