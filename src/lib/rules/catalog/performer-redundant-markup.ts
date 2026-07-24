import type {
	Diagnostic,
	LyricLine,
	RuleDefinition,
	SupportedStyleSpan
} from '../../core/types.js';
import { diagnostic } from './utils.js';

function supportedSpans(line: LyricLine): SupportedStyleSpan[] {
	return line.styleSpans.filter((span): span is SupportedStyleSpan => !('unsupported' in span));
}

export const performerRedundantMarkupRule: RuleDefinition = {
	id: 'performer.redundant-markup',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'safe',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (const section of document.sections) {
			for (const line of section.lines) {
				const spans = supportedSpans(line);
				for (let index = 1; index < spans.length; index += 1) {
					const previousSpan = spans[index - 1];
					const span = spans[index];
					if (
						!previousSpan ||
						!span ||
						previousSpan.slot !== span.slot ||
						previousSpan.slot === 1 ||
						previousSpan.continuesToNextLine ||
						span.continuedFromPreviousLine ||
						!document.text.slice(previousSpan.to, span.from).match(/^\s*$/u)
					) {
						continue;
					}
					const closingRange = { from: previousSpan.contentTo, to: previousSpan.to };
					const openingRange = { from: span.from, to: span.contentFrom };
					diagnostics.push(
						diagnostic(
							this,
							{ from: closingRange.from, to: openingRange.to },
							'Adjacent performer formatting can be merged.',
							'The same performer style is split into adjacent wrappers. Keep one wrapper around the continuous passage to minimize formatting markers.',
							[
								{
									kind: 'safe',
									label: 'Merge adjacent formatting',
									edit: {
										baseRevision: context.revision ?? 0,
										edits: [
											{ ...closingRange, insert: '' },
											{ ...openingRange, insert: '' }
										]
									}
								}
							]
						)
					);
				}
			}
			for (let index = 1; index < section.lines.length; index += 1) {
				const previousLine = section.lines[index - 1];
				const line = section.lines[index];
				if (!previousLine || !line) {
					continue;
				}
				const previousSpan = supportedSpans(previousLine).at(-1);
				const span = supportedSpans(line)[0];
				if (
					!previousSpan ||
					!span ||
					previousSpan.slot !== span.slot ||
					previousSpan.slot === 1 ||
					previousSpan.to !== previousLine.to ||
					span.from !== line.from ||
					previousSpan.continuesToNextLine ||
					span.continuedFromPreviousLine
				) {
					continue;
				}
				const between = document.text.slice(previousLine.to, line.from);
				if (!/^(?:\r\n|\r|\n)$/u.test(between)) {
					continue;
				}

				const closingRange = { from: previousSpan.contentTo, to: previousSpan.to };
				const openingRange = { from: span.from, to: span.contentFrom };
				diagnostics.push(
					diagnostic(
						this,
						{ from: closingRange.from, to: openingRange.to },
						'Adjacent performer formatting can be merged.',
						'The same performer style ends and immediately starts again on the next line. Keep one wrapper around the continuous passage to minimize formatting markers.',
						[
							{
								kind: 'safe',
								label: 'Merge adjacent formatting',
								edit: {
									baseRevision: context.revision ?? 0,
									edits: [
										{ ...closingRange, insert: '' },
										{ ...openingRange, insert: '' }
									]
								}
							}
						]
					)
				);
			}
		}
		return diagnostics;
	}
};
