/** The 1-based line an offset falls on, counting `\n`, `\r\n`, and a lone `\r`. */
export function lineNumberAt(document: string, offset: number): number {
	let line = 1;
	for (let index = 0; index < offset && index < document.length; index += 1) {
		const code = document.charCodeAt(index);
		if (code === 10) line += 1;
		else if (code === 13 && document.charCodeAt(index + 1) !== 10) line += 1;
	}
	return line;
}
