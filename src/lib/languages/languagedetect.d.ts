declare module 'languagedetect/lib/Parser.js' {
	class Parser {
		constructor(text: string);
		setPadStart(enabled: boolean): void;
		analyze(): void;
		getTrigramRanks(): { readonly [trigram: string]: number };
		getUnicodeBlocks(): { readonly [block: string]: number };
	}
	export default Parser;
}

declare module 'languagedetect/lib/ISO639.js' {
	const languages: { getCode2(name: string): string | null };
	export default languages;
}
