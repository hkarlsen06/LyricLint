import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const outputPath = resolve('static/social-preview.png');
const sansPath = resolve('static/fonts/ibm-plex-sans-latin-wght-normal.woff2');
const monoPath = resolve('static/fonts/ibm-plex-mono-latin-700-normal.woff2');

const [sans, mono] = await Promise.all([readFile(sansPath), readFile(monoPath)]);
const browser = await chromium.launch();

try {
	const page = await browser.newPage({
		viewport: { width: 1200, height: 630 },
		deviceScaleFactor: 1
	});

	await page.setContent(`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<style>
			@font-face {
				font-family: "Plex Sans";
				src: url("data:font/woff2;base64,${sans.toString('base64')}") format("woff2");
				font-style: normal;
				font-weight: 100 700;
			}

			@font-face {
				font-family: "Plex Mono";
				src: url("data:font/woff2;base64,${mono.toString('base64')}") format("woff2");
				font-style: normal;
				font-weight: 700;
			}

			* {
				box-sizing: border-box;
			}

			html,
			body {
				width: 1200px;
				height: 630px;
				margin: 0;
			}

			body {
				overflow: hidden;
				background: oklch(20% 0.004 285);
				color: oklch(94% 0.004 285);
				font-family: "Plex Sans", sans-serif;
			}

			.card {
				position: relative;
				display: grid;
				width: 100%;
				height: 100%;
				grid-template-rows: auto 1fr auto;
				padding: 60px 72px 54px;
			}

			.card::after {
				position: absolute;
				inset: 0;
				border: 1px solid oklch(34% 0.008 285);
				content: "";
				pointer-events: none;
			}

			.brand-row {
				display: flex;
				align-items: center;
				gap: 36px;
			}

			.wordmark {
				display: inline-flex;
				flex: none;
				align-items: center;
				font-family: "Plex Mono", monospace;
				font-size: 31px;
				font-weight: 700;
				line-height: 1;
			}

			.wordmark svg {
				width: 17px;
				height: 38px;
				flex: none;
				stroke: oklch(78% 0.13 78);
				stroke-width: 2.2;
			}

			.wordmark__lint {
				letter-spacing: 0;
			}

			.signal {
				height: 38px;
				flex: 1;
			}

			.signal path {
				fill: none;
				stroke: oklch(78% 0.13 78);
				stroke-linecap: round;
				stroke-width: 2.2;
			}

			.message {
				align-self: center;
				padding-bottom: 6px;
			}

			.eyebrow {
				margin: 0 0 22px;
				color: oklch(78% 0.13 78);
				font-family: "Plex Mono", monospace;
				font-size: 18px;
				font-weight: 700;
				letter-spacing: 0.06em;
				line-height: 1.4;
				text-transform: uppercase;
			}

			h1 {
				max-width: 980px;
				margin: 0;
				font-size: 68px;
				font-weight: 650;
				letter-spacing: -0.035em;
				line-height: 1.04;
			}

			.footer {
				display: flex;
				align-items: center;
				justify-content: space-between;
				color: oklch(72% 0.008 285);
				font-size: 22px;
				line-height: 1.4;
			}

			.facts {
				display: flex;
				align-items: center;
				gap: 14px;
			}

			.separator {
				color: oklch(49% 0.012 285);
			}

			.domain {
				color: oklch(94% 0.004 285);
				font-family: "Plex Mono", monospace;
				font-size: 20px;
				font-weight: 700;
			}
		</style>
	</head>
	<body>
		<main class="card">
			<header class="brand-row">
				<div class="wordmark" aria-label="LyricLint">
					<span>Lyric</span>
					<svg aria-hidden="true" viewBox="4.1 7.4 4.9 17.2" fill="none">
						<path d="M9 8.5H5.2v15H9" />
					</svg>
					<span class="wordmark__lint">Lint</span>
					<svg aria-hidden="true" viewBox="23 7.4 4.9 17.2" fill="none">
						<path d="M23 8.5h3.8v15H23" />
					</svg>
				</div>
				<svg class="signal" aria-hidden="true" viewBox="0 0 700 38" preserveAspectRatio="none">
					<path d="M2 19 Q28 5 54 19 T106 19 C138 19 148 19 180 19 H698" />
				</svg>
			</header>

			<section class="message">
				<p class="eyebrow">Genius transcription linter</p>
				<h1>Catch formatting problems<br />before you submit.</h1>
			</section>

			<footer class="footer">
				<div class="facts">
					<span>Sourced guidance</span>
					<span class="separator" aria-hidden="true">·</span>
					<span>On device</span>
					<span class="separator" aria-hidden="true">·</span>
					<span>No account</span>
				</div>
				<span class="domain">lyriclint.com</span>
			</footer>
		</main>
	</body>
</html>`);

	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: outputPath, type: 'png' });
} finally {
	await browser.close();
}
