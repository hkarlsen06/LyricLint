import type { ConversionDocument, SectionRecord, WrapperRecord } from './model.js';
import type { SectionHeader } from '#lib/core/types.js';

/** Only complete named headers can become retained section boundaries. */
export function canRetainSectionHeader(header: SectionHeader | undefined): header is SectionHeader {
	return header?.closed === true && header.name.trim().length > 0;
}

/** Syntax order distinguishes empty styles from headings at the same lyric offset. */
export function sectionContainsWrapper(
	section: SectionRecord,
	following: SectionRecord | undefined,
	wrapper: WrapperRecord
): boolean {
	return (
		(section.literalHeaderRange?.to ?? section.at) <= wrapper.from &&
		(section.at < wrapper.from ||
			section.placement === 'unresolved' ||
			section.headerVisible === false ||
			section.order < wrapper.openOrder) &&
		(!following ||
			wrapper.to < following.at ||
			(wrapper.to === following.at && wrapper.closeOrder < following.order))
	);
}

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
