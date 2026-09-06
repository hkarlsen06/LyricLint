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

/** Line numbers for many offsets in one pass, in the order they are asked for. */
export function lineNumberLookup(text: string): (offset: number) => number {
	let starts: number[] | undefined;
	return (offset) => {
		if (!starts) {
			starts = [0];
			for (let index = 0; index < text.length; index += 1) {
				if (text[index] === '\n' || (text[index] === '\r' && text[index + 1] !== '\n')) {
					starts.push(index + 1);
				}
			}
		}
		let low = 0;
		let high = starts.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if (starts[mid]! <= offset) low = mid;
			else high = mid - 1;
		}
		return low + 1;
	};
}
