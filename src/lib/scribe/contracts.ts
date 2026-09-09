export class ScribeFormatError extends Error {}

/**
 * The ceiling a `.lls` is read under, mirroring `MAX_BACKUP_BYTES` in
 * `persistence/backup.ts`.
 *
 * A Scribe is a shared file, which is the one path in this application where
 * somebody else's bytes become workspace state — so the size is refused before
 * `file.text()` is awaited rather than after a browser has decoded it into a
 * string. It is stated here beside the parser, because the cap is a fact about
 * the format rather than about the surface that reads one.
 */
export const maxScribeBytes = 50 * 1024 * 1024;
