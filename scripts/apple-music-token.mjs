#!/usr/bin/env node
/**
 * Mint the Apple Music developer token this build ships.
 *
 * The token is a JWT signed with a Media Services private key, and it expires
 * within six months — Apple's own ceiling, not a choice made here. So this is
 * not a one-time setup script: it runs again every time the token is rotated,
 * which is at least twice a year for as long as Apple Music is offered.
 *
 * The token itself is **not a secret**. It is handed to every browser that loads
 * the workbench, which is what makes it safe to inline in a static bundle. The
 * `.p8` that signs it is the secret, it is read from a path outside this
 * repository, and nothing here ever writes it anywhere.
 *
 *   bun run token:apple -- --key ~/path/to/AuthKey_XXXXXXXXXX.p8
 *
 * Print it, then set it where the build runs — `.env.development.local` for a
 * dev session, and a Cloudflare Pages *build* variable for production. A runtime
 * variable or a `wrangler secret` never reaches the bundle, because Vite
 * resolves `import.meta.env` at build time.
 */

import { createPrivateKey, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Neither of these is a secret: both travel inside every token this signs, in
 * the header and the payload, so they are as public as the token is. They are
 * defaults rather than required arguments for that reason — the only thing this
 * script genuinely needs told is where the private key lives.
 */
const defaults = {
	keyId: 'PG6RW2N26S',
	teamId: '48ZSLD4RMP'
};

/** Apple's ceiling, and therefore the only sensible lifetime to ask for. */
const sixMonthsInSeconds = 15777000;

function argument(name, fallback) {
	const at = process.argv.indexOf(`--${name}`);
	return at === -1 ? fallback : process.argv[at + 1];
}

function base64url(value) {
	return Buffer.from(value).toString('base64url');
}

const keyPath = argument('key', process.env.APPLE_MUSIC_KEY_PATH);
if (keyPath === undefined) {
	console.error('Pass the private key: --key /path/to/AuthKey_XXXXXXXXXX.p8');
	process.exit(1);
}

const keyId = argument('key-id', defaults.keyId);
const teamId = argument('team', defaults.teamId);
const issuedAt = Math.floor(Date.now() / 1000);
const expiresAt = issuedAt + Number(argument('seconds', sixMonthsInSeconds));

const signingInput =
	`${base64url(JSON.stringify({ alg: 'ES256', kid: keyId }))}.` +
	base64url(JSON.stringify({ iss: teamId, iat: issuedAt, exp: expiresAt }));

// `ieee-p1363` is what makes this a JWT rather than a file Apple rejects: Node
// signs ES256 as a DER sequence by default, and JWS wants the raw r‖s pair. The
// difference is invisible until Apple answers 401 with nothing to go on.
const signature = createSign('SHA256')
	.update(signingInput)
	.sign({ key: createPrivateKey(readFileSync(keyPath, 'utf8')), dsaEncoding: 'ieee-p1363' })
	.toString('base64url');

console.log(`PUBLIC_APPLE_MUSIC_TOKEN=${signingInput}.${signature}`);
console.error(`\nExpires ${new Date(expiresAt * 1000).toISOString().slice(0, 10)}.`);
