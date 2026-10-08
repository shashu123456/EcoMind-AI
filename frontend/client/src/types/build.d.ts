/**
 * Build stamp injected at bundle time by `define.__BUILD_STAMP__` in
 * `vite.config.ts`. It is the UTC date the bundle was produced, so the sign-in
 * footer never shows a hardcoded version number.
 */
declare const __BUILD_STAMP__: string;
