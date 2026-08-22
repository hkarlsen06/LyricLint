const siteOrigin = 'https://lyriclint.com';

export function siteUrl(pathname: string): string {
	return new URL(pathname, siteOrigin).href;
}

export const siteMaintainer = {
	name: 'Hjalmar Karlsen',
	email: 'hjalmar@hkarlsen06.dev',
	location: 'Oslo, Norway',
	githubUrl: 'https://github.com/hkarlsen06',
	websiteUrl: 'https://hkarlsen06.dev/'
};

// One identity for every structured-data node that names the person behind the
// project. The `@id` joins those otherwise separate nodes into one entity, and
// the public profiles let an index distinguish that person from someone who
// happens to share the name. A city is enough real-world presence here: this is
// an independent project, not a storefront whose visitors need a street address.
export const maintainerStructuredData = {
	'@type': 'Person',
	'@id': siteUrl('/about/#hjalmar-karlsen'),
	name: siteMaintainer.name,
	url: siteUrl('/about/'),
	email: `mailto:${siteMaintainer.email}`,
	homeLocation: {
		'@type': 'Place',
		name: siteMaintainer.location
	},
	sameAs: [siteMaintainer.websiteUrl, siteMaintainer.githubUrl]
};
