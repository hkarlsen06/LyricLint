/**
 * The favicon drawn inside a citation link, keyed by the cited page's host.
 *
 * A mark riding the link it identifies is the established citation idiom, and
 * it is a different thing from a brand badge on the card: it says where the
 * link goes, nothing about affiliation. The files ship as same-origin hashed
 * assets rather than inline data URIs: the editor's initial JavaScript should
 * not contain every citation image before any citation is visible. The offline
 * worker includes them with the other immutable build assets. A favicon service
 * URL would contact a third party at render time, which this application never does.
 *
 * The map is keyed on the host with any `www.` stripped, so a source URL that
 * gains or loses the prefix keeps its mark. A host with no entry draws
 * nothing: an unknown favicon is not an error, it is a citation exactly as it
 * was before favicons existed. `source-favicons.test.ts` pins the other
 * direction — every source in the registry resolves one — so a new source
 * arrives with its mark or fails there rather than shipping a bare link
 * among decorated ones.
 */
import academie from '$lib/assets/favicons/academie.png?no-inline';
import apple from '$lib/assets/favicons/apple.png?no-inline';
import bunka from '$lib/assets/favicons/bunka.png?no-inline';
import cambridge from '$lib/assets/favicons/cambridge.png?no-inline';
import duden from '$lib/assets/favicons/duden.png?no-inline';
import genius from '$lib/assets/favicons/genius.png?no-inline';
import github from '$lib/assets/favicons/github.png?no-inline';
import korean from '$lib/assets/favicons/korean.png?no-inline';
import ksaa from '$lib/assets/favicons/ksaa.png?no-inline';
import merriamWebster from '$lib/assets/favicons/merriam-webster.png?no-inline';
import oqlf from '$lib/assets/favicons/oqlf.png?no-inline';
import projetVoltaire from '$lib/assets/favicons/projet-voltaire.png?no-inline';
import rae from '$lib/assets/favicons/rae.png?no-inline';
import sprakradet from '$lib/assets/favicons/sprakradet.png?no-inline';

/** Hosts are read off a citation's URL, so the table is keyed by whatever it says. */
interface FaviconsByHost {
	readonly [host: string]: string | undefined;
}

const faviconsByHost: FaviconsByHost = {
	'artists.apple.com': apple,
	'bunka.go.jp': bunka,
	'dictionary.cambridge.org': cambridge,
	'dictionnaire-academie.fr': academie,
	'duden.de': duden,
	// Genius's image CDN carries their editorial reference images; it is
	// Genius's own content, so it wears their mark.
	'filepicker-images.genius.com': genius,
	'genius.com': genius,
	'github.com': github,
	'korean.go.kr': korean,
	'library.ksaa.gov.sa': ksaa,
	'merriam-webster.com': merriamWebster,
	'projet-voltaire.fr': projetVoltaire,
	'rae.es': rae,
	'sprakradet.no': sprakradet,
	'vitrinelinguistique.oqlf.gouv.qc.ca': oqlf
};

/** The favicon for a citation's own host, or nothing for a host without one. */
export function sourceFavicon(url: string): string | undefined {
	try {
		const host = new URL(url).hostname.replace(/^www\./u, '');
		return faviconsByHost[host];
	} catch {
		return undefined;
	}
}
