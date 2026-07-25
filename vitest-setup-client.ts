/*
 * Component tests run against the real design tokens.
 *
 * Without this, the browser project mounted components into a document with no
 * stylesheet at all, so every `var(--…)` resolved to nothing and any assertion
 * on a computed style was really asserting the CSS fallback. That was survivable
 * only while the editor theme carried literal fallback colors and weights of its
 * own — exactly the second palette that made the editor drift away from the
 * design system. With those gone, a test that reads a computed style has to see
 * the same tokens the app ships.
 */
import './src/lib/ui/styles/global.css';
