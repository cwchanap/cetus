import { resolve } from 'node:path'

/**
 * apps/web package root, anchored to this file's location instead of
 * `process.cwd()`: the root Vitest config (HPA-447 Stage 1) runs the web
 * project from the repo root, so cwd-relative source reads in tests would
 * resolve against <repo>/ instead of apps/web/.
 */
export const appRoot = resolve(import.meta.dirname, '../..')
