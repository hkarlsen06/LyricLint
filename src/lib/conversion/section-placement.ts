import type { ConversionDocument, SectionRecord } from './model.js';

/** Closing markup at a shared line start would precede the heading on the Genius line. */
export function canPlaceSection(document: ConversionDocument, at: number): boolean {
	return (
		(at === 0 ||
			document.content[at - 1] === '\n' ||
			(document.content[at - 1] === '\r' && document.content[at] !== '\n')) &&
		!document.wrappers.some((wrapper) => wrapper.from < at && at <= wrapper.to)
	);
}

export function canRenderSection(document: ConversionDocument, section: SectionRecord): boolean {
	return (
		section.placement !== 'unresolved' &&
		canPlaceSection(document, section.at) &&
		(/[\r\n]$/u.test(section.header) || section.at === document.content.length)
	);
}

/** A displaced boundary stays a deliberate placement task, even after later lyric edits. */
export function retainSectionPlacement(document: ConversionDocument): void {
	for (const section of document.sections)
		if (section.headerVisible !== false && !canRenderSection(document, section))
			section.placement = 'unresolved';
}
