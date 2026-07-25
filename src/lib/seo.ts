export const siteOrigin = 'https://lyriclint.com';

export function siteUrl(pathname: string): string {
	return new URL(pathname, siteOrigin).href;
}
