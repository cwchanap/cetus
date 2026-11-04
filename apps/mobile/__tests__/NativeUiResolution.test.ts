/// <reference types="node" />
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

type ExportsMatch = {
    matchSubpathFromExportsLike: (
        context: unknown,
        subpath: string,
        exportsLikeMap: Map<string, unknown>,
        platform: string | null,
        createConfigError: (message: string) => Error
    ) => { target: string | null; patternMatch: string | null }
}

const { matchSubpathFromExportsLike } = jest.requireActual(
    'metro-resolver/private/utils/matchSubpathFromExportsLike'
) as ExportsMatch

const mobileRoot = resolve(__dirname, '..')
const repoRoot = resolve(mobileRoot, '../..')
const uiRoot = resolve(mobileRoot, '../../packages/ui')
const uiSrc = join(uiRoot, 'src')
const uiPkg = JSON.parse(
    readFileSync(join(uiRoot, 'package.json'), 'utf-8')
) as { exports: Record<string, unknown> }

const metroConfigSource = readFileSync(
    join(mobileRoot, 'metro.config.js'),
    'utf-8'
)

const expoMetroConfigSource = readFileSync(
    join(repoRoot, 'node_modules/@expo/metro-config/build/ExpoMetroConfig.js'),
    'utf-8'
)

const conditionsByPlatform = (() => {
    const block = expoMetroConfigSource.match(
        /unstable_conditionsByPlatform:\s*\{([^}]*)\}/
    )
    if (block === null) {
        throw new Error(
            'unstable_conditionsByPlatform not found in @expo/metro-config'
        )
    }
    const parsed: Record<string, string[]> = {}
    for (const entry of block[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
        parsed[entry[1]] = entry[2]
            .split(',')
            .map(condition => condition.trim().replaceAll("'", ''))
            .filter(condition => condition.length > 0)
    }
    return parsed
})()

const exportsMap = new Map(Object.entries(uiPkg.exports))
const resolverContext = {
    isESMImport: false,
    unstable_conditionNames: [],
    unstable_conditionsByPlatform: conditionsByPlatform,
}
const configError = (message: string) => new Error(message)

const resolveSubpath = (subpath: string, platform: string) => {
    const { target, patternMatch } = matchSubpathFromExportsLike(
        resolverContext,
        subpath,
        exportsMap,
        platform,
        configError
    )
    if (target === null) {
        return null
    }
    return target.replace('*', patternMatch ?? '')
}

const mustResolveSubpath = (subpath: string, platform: string): string => {
    const file = resolveSubpath(subpath, platform)
    if (file === null) {
        throw new Error(
            `Metro exports map produced no target for '${subpath}' on ${platform}`
        )
    }
    return file
}

const PORTED_COMPONENT_SUBPATHS = [
    './components/ui/button',
    './components/ui/card',
    './components/ui/badge',
    './components/ui/heading',
    './components/ui/select',
    './components/ui/toggle',
    './components/daily-missions-panel',
    './components/login-reward-modal',
]

const UNPORTED_COMPONENT_SUBPATHS = [
    './components/ui/avatar',
    './components/ui/slider',
    './components/game-title',
    './components/game-overlay',
    './components/specimen-card',
    './components/user-dropdown',
]

const NATIVE_PLATFORMS = ['ios', 'android']

describe('Metro resolves @cetus/ui through the react-native export condition', () => {
    it('keeps the react-native condition wired for ios and android', () => {
        for (const platform of NATIVE_PLATFORMS) {
            expect(conditionsByPlatform[platform]).toContain('react-native')
        }
        expect(metroConfigSource).toContain('getDefaultConfig')
        expect(metroConfigSource).not.toContain('unstable_conditionsByPlatform')
        expect(metroConfigSource).not.toContain('resolveRequest')
    })

    it.each(NATIVE_PLATFORMS)(
        'resolves the package root to index.native.ts on %s',
        platform => {
            const file = mustResolveSubpath('.', platform)
            expect(file).toBe('./src/index.native.ts')
            expect(existsSync(join(uiRoot, file))).toBe(true)
        }
    )

    it.each(NATIVE_PLATFORMS)(
        'resolves every ported component subpath to an existing .native file on %s',
        platform => {
            for (const subpath of PORTED_COMPONENT_SUBPATHS) {
                const file = mustResolveSubpath(subpath, platform)
                expect(file).toMatch(/\.native\.tsx$/)
                expect(existsSync(join(uiRoot, file))).toBe(true)
            }
        }
    )

    it.each(NATIVE_PLATFORMS)(
        'keeps declared platform-neutral subpaths working on %s',
        platform => {
            const file = mustResolveSubpath('./lib/utils', platform)
            expect(file).toBe('./src/lib/utils.ts')
            expect(existsSync(join(uiRoot, file))).toBe(true)
        }
    )

    it.each(NATIVE_PLATFORMS)(
        'never falls back to web sources for unported components on %s',
        platform => {
            for (const subpath of UNPORTED_COMPONENT_SUBPATHS) {
                const file = mustResolveSubpath(subpath, platform)
                expect(file).toMatch(/\.native\.tsx$/)
                expect(existsSync(join(uiRoot, file))).toBe(false)
            }
        }
    )

    it.each(NATIVE_PLATFORMS)(
        'blocks catch-all subpaths on %s rather than leaking web modules',
        platform => {
            for (const subpath of [
                './index',
                './index.ts',
                './lib/styles',
                './variants',
            ]) {
                expect(resolveSubpath(subpath, platform)).toBeNull()
            }
        }
    )

    it('preserves web default targets for the browser condition', () => {
        expect(resolveSubpath('.', 'web')).toBe('./src/index.ts')
        expect(resolveSubpath('./components/ui/button', 'web')).toBe(
            './src/components/ui/button.tsx'
        )
        for (const file of [
            './src/index.ts',
            './src/components/ui/button.tsx',
        ]) {
            expect(existsSync(join(uiRoot, file))).toBe(true)
        }
    })
})

const IMPORT_SPECIFIER = /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g

const resolveRelativeImport = (
    importer: string,
    specifier: string
): string | null => {
    const base = resolve(dirname(importer), specifier)
    const candidates = [
        `${base}.native.tsx`,
        `${base}.native.ts`,
        `${base}.tsx`,
        `${base}.ts`,
        base,
    ]
    for (const candidate of candidates) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
            return candidate
        }
    }
    return null
}

const reachableNativeGraph = (): Map<string, string> => {
    const seen = new Map<string, string>()
    const queue = [join(uiSrc, 'index.native.ts')]
    while (queue.length > 0) {
        const file = queue.pop() as string
        if (seen.has(file)) {
            continue
        }
        const source = readFileSync(file, 'utf-8')
        seen.set(file, source)
        for (const match of source.matchAll(IMPORT_SPECIFIER)) {
            const specifier = match[1]
            if (!specifier.startsWith('.')) {
                continue
            }
            const resolved = resolveRelativeImport(file, specifier)
            if (resolved !== null && !seen.has(resolved)) {
                queue.push(resolved)
            }
        }
    }
    return seen
}

describe('the reachable native UI graph stays free of web-only code', () => {
    const graph = reachableNativeGraph()

    it('resolves every relative import reachable from index.native.ts', () => {
        expect(graph.size).toBeGreaterThan(0)
        for (const file of graph.keys()) {
            expect(existsSync(file)).toBe(true)
        }
    })

    it('contains no react-dom, CSS imports or DOM globals', () => {
        for (const [file, source] of graph) {
            expect(source).not.toMatch(/from\s+['"]react-dom/)
            expect(source).not.toMatch(/from\s+['"]react-native-web/)
            expect(source).not.toMatch(/['"][^'"]*\.css['"]/)
            expect(source).not.toMatch(/\bdocument\s*\./)
            expect(source).not.toMatch(/\bwindow\s*\./)
            expect(file).not.toMatch(/(?<!native)\.tsx$/)
        }
    })

    it('reaches every implemented .native source and nothing else', () => {
        const allSources: string[] = []
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry)
                if (statSync(full).isDirectory()) {
                    walk(full)
                } else {
                    allSources.push(full)
                }
            }
        }
        walk(uiSrc)

        const expected = new Set(
            allSources.filter(file => {
                if (/\.test\.tsx?$/.test(file)) {
                    return false
                }
                return /\.native\.tsx$/.test(file)
            })
        )
        expected.add(join(uiSrc, 'index.native.ts'))
        expected.add(join(uiSrc, 'lib/utils.ts'))
        expected.add(join(uiSrc, 'variants.ts'))

        expect(new Set(graph.keys())).toEqual(expected)
    })
})
