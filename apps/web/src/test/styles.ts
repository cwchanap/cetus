import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { appRoot } from './app-root'

export const globalCss = readFileSync(
    resolve(appRoot, 'src/styles/global.css'),
    'utf-8'
)

// Shared token stylesheet, resolved through the @cetus/tokens package
// specifier so the workspace exports mapping stays importable.
export const themeCss = readFileSync(
    createRequire(import.meta.url).resolve('@cetus/tokens/theme.css'),
    'utf-8'
)
