import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// theme.css must be self-contained: every var(--name) it references has to be
// declared in the same file, or consumers on platforms without a surrounding
// stylesheet (React Native via NativeWind) silently resolve nothing.
const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), 'theme.css')
const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const declaredNames = new Set(
    [...css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map(match => match[1])
)
const referencedNames = [
    ...new Set(
        [...css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map(match => match[1])
    ),
]

describe('@cetus/tokens theme.css', () => {
    it('declares every CSS variable it references', () => {
        const missing = referencedNames.filter(name => !declaredNames.has(name))
        expect(missing, `theme.css references undeclared variables`).toEqual([])
    })
})
