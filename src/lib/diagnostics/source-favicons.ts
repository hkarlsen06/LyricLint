/**
 * The favicon drawn inside a citation link, keyed by the cited page's host.
 *
 * A mark riding the link it identifies is the established citation idiom, and
 * it is a different thing from a brand badge on the card: it says where the
 * link goes, nothing about affiliation. The files are fetched once and bundled
 * — every one is under Vite's inline limit, so they ship as data URIs inside
 * the stylesheet-free chunk and cost no request — because a favicon service
 * URL on every card would contact a third party at render time, which this
 * application never does.
 *
 * The map is keyed on the host with any `www.` stripped, so a source URL that
 * gains or loses the prefix keeps its mark. A host with no entry draws
 * nothing: an unknown favicon is not an error, it is a citation exactly as it
 * was before favicons existed. `source-favicons.test.ts` pins the other
 * direction — every source in the registry resolves one — so a new source
 * arrives with its mark or fails there rather than shipping a bare link
 * among decorated ones.
 */
import academie from '$lib/assets/favicons/academie.png';
import apple from '$lib/assets/favicons/apple.png';
import bunka from '$lib/assets/favicons/bunka.png';
import cambridge from '$lib/assets/favicons/cambridge.png';
import duden from '$lib/assets/favicons/duden.png';
import genius from '$lib/assets/favicons/genius.png';
import github from '$lib/assets/favicons/github.png';
import korean from '$lib/assets/favicons/korean.png';
import ksaa from '$lib/assets/favicons/ksaa.png';
import merriamWebster from '$lib/assets/favicons/merriam-webster.png';
import oqlf from '$lib/assets/favicons/oqlf.png';
import projetVoltaire from '$lib/assets/favicons/projet-voltaire.png';
import rae from '$lib/assets/favicons/rae.png';
import sprakradet from '$lib/assets/favicons/sprakradet.png';

const faviconsByHost: Record<string, string> = {
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
