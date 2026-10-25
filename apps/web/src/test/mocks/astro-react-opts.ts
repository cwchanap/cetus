/**
 * Stand-in for the `astro:react:opts` virtual module that @astrojs/react's
 * integration plugin normally provides (HPA-379 Stage 1).
 *
 * apps/web registers react() with no options, so the integration generates
 * exactly these defaults (see optionsPlugin in @astrojs/react/dist/index.js).
 * The alias in apps/web/vitest.config.ts points at this file because Astro's
 * virtual-module plugins are only registered when getViteConfig can resolve
 * the Astro config — true when vitest runs from apps/web, but not when the
 * root workspace config loads this project with cwd = repo root.
 *
 * shortcut: if react() ever gains options (e.g. experimentalReactChildren),
 * this mock must be updated to match — when to upgrade: on any
 * astro.config.mjs react() argument change.
 */
export default {
    experimentalReactChildren: false,
    experimentalDisableStreaming: false,
}
