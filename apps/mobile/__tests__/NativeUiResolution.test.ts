/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import {
    existsSync,
    readFileSync,
    readdirSync,
    realpathSync,
    statSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

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

const expoResolverFields = JSON.parse(
    execFileSync(
        process.execPath,
        [
            '-e',
            `const {getDefaultConfig}=require('@expo/metro-config');const c=getDefaultConfig(${JSON.stringify(mobileRoot)});console.log(JSON.stringify({sourceExts:c.resolver.sourceExts,assetExts:c.resolver.assetExts,mainFields:c.resolver.resolverMainFields,conditionNames:c.resolver.unstable_conditionNames??[],conditions:c.resolver.unstable_conditionsByPlatform,enableExports:c.resolver.unstable_enablePackageExports}))`,
        ],
        { cwd: repoRoot, encoding: 'utf-8' }
    )
) as {
    sourceExts: string[]
    assetExts: string[]
    mainFields: string[]
    conditionNames: string[]
    conditions: Record<string, string[]>
    enableExports: boolean
}

const conditionsByPlatform = expoResolverFields.conditions

const exportsMap = new Map(Object.entries(uiPkg.exports))
const exportsEvaluatorContext = {
    isESMImport: false,
    unstable_conditionNames: expoResolverFields.conditionNames,
    unstable_conditionsByPlatform: conditionsByPlatform,
}
const configError = (message: string) => new Error(message)

const resolveSubpath = (subpath: string, platform: string) => {
    const { target, patternMatch } = matchSubpathFromExportsLike(
        exportsEvaluatorContext,
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

describe('the @cetus/ui exports map keeps the react-native condition intent', () => {
    it('keeps the react-native condition wired for ios and android', () => {
        for (const platform of NATIVE_PLATFORMS) {
            expect(conditionsByPlatform[platform]).toContain('react-native')
        }
        expect(conditionsByPlatform.web).toContain('browser')
        expect(metroConfigSource).toContain('getDefaultConfig')
        expect(metroConfigSource).not.toContain('unstable_conditionsByPlatform')
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
        'marks catch-all subpaths as non-exported on %s',
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

type MetroResolution =
    | { type: 'sourceFile'; filePath: string }
    | { type: 'empty' }
    | { type: 'assetFiles'; filePaths: string[] }

type MetroResolve = (
    context: Record<string, unknown>,
    specifier: string,
    platform: string | null
) => MetroResolution

const { resolve: metroResolve } = jest.requireActual('metro-resolver') as {
    resolve: MetroResolve
}
const { redirectModulePath } = jest.requireActual(
    'metro-resolver/private/PackageResolve'
) as {
    redirectModulePath: (
        context: Record<string, unknown>,
        modulePath: string
    ) => string | false
}
const {
    nativeResolver: reactNativeCssNativeResolver,
    webResolver: reactNativeCssWebResolver,
} = jest.requireActual(
    join(
        repoRoot,
        'node_modules/react-native-css/dist/commonjs/metro/resolver.js'
    )
) as {
    nativeResolver: (
        resolver: MetroResolve,
        context: Record<string, unknown>,
        specifier: string,
        platform: string | null
    ) => MetroResolution
    webResolver: (
        resolver: MetroResolve,
        context: Record<string, unknown>,
        specifier: string,
        platform: string | null
    ) => MetroResolution
}
const { withWebOnlyUiGuard } = jest.requireActual(
    join(mobileRoot, 'metro-native-guard.config.js')
) as {
    withWebOnlyUiGuard: (innerResolveRequest?: MetroResolve) => MetroResolve
}

const fileSystemLookup = (targetPath: string) => {
    try {
        const stats = statSync(targetPath)
        return {
            exists: true,
            type: stats.isDirectory() ? 'd' : 'f',
            realPath: realpathSync(targetPath),
        }
    } catch {
        return { exists: false }
    }
}

const getPackageForModule = (absoluteModulePath: string) => {
    let dir = absoluteModulePath
    try {
        if (!statSync(dir).isDirectory()) {
            dir = dirname(dir)
        }
    } catch {
        dir = dirname(dir)
    }
    for (;;) {
        const packageJsonPath = join(dir, 'package.json')
        if (existsSync(packageJsonPath)) {
            return {
                rootPath: dir,
                packageRelativePath: relative(dir, absoluteModulePath),
                packageJson: JSON.parse(readFileSync(packageJsonPath, 'utf-8')),
            }
        }
        if (basename(dir) === 'node_modules') {
            return null
        }
        const next = dirname(dir)
        if (next === dir) {
            return null
        }
        dir = next
    }
}

const buildResolutionContext = (
    resolveRequest?: MetroResolve
): Record<string, unknown> => {
    const context: Record<string, unknown> = {
        allowHaste: false,
        assetExts: new Set(expoResolverFields.assetExts),
        dev: true,
        disableHierarchicalLookup: false,
        doesFileExist: (candidate: string) => {
            try {
                return statSync(candidate).isFile()
            } catch {
                return false
            }
        },
        fileSystemLookup,
        getPackage: (packageJsonPath: string) =>
            JSON.parse(readFileSync(packageJsonPath, 'utf-8')),
        getPackageForModule,
        isESMImport: false,
        mainFields: expoResolverFields.mainFields,
        nodeModulesPaths: [join(repoRoot, 'node_modules')],
        originModulePath: join(mobileRoot, 'app/_layout.tsx'),
        preferNativePlatform: true,
        resolveAsset: () => null,
        resolveHasteModule: () => null,
        resolveHastePackage: () => null,
        sourceExts: expoResolverFields.sourceExts,
        unstable_conditionNames: expoResolverFields.conditionNames,
        unstable_conditionsByPlatform: conditionsByPlatform,
        unstable_enablePackageExports: expoResolverFields.enableExports,
        unstable_incrementalResolution: false,
        unstable_logWarning: () => {},
        customResolverOptions: {},
    }
    context.redirectModulePath = (modulePath: string) =>
        redirectModulePath(context, modulePath)
    if (resolveRequest !== undefined) {
        context.resolveRequest = resolveRequest
    }
    return context
}

const cssNativeResolve: MetroResolve = (context, specifier, platform) =>
    reactNativeCssNativeResolver(metroResolve, context, specifier, platform)

const cssWebResolve: MetroResolve = (context, specifier, platform) =>
    reactNativeCssWebResolver(metroResolve, context, specifier, platform)

const metroContext = buildResolutionContext(
    withWebOnlyUiGuard(cssNativeResolve)
)

const resolveThroughMetro = (
    specifier: string,
    platform: string
): MetroResolution => metroResolve(metroContext, specifier, platform)

const resolvedUiPath = (specifier: string, platform: string): string => {
    const result = resolveThroughMetro(specifier, platform)
    if (result.type !== 'sourceFile') {
        throw new Error(
            `Expected a source file resolution for ${specifier} on ${platform}, got ${result.type}`
        )
    }
    return relative(uiRoot, result.filePath)
}

const SUPPORTED_NATIVE_SPECIFIERS: Array<[string, string]> = [
    ['@cetus/ui', 'src/index.native.ts'],
    ['@cetus/ui/components/ui/button', 'src/components/ui/button.native.tsx'],
    ['@cetus/ui/components/ui/card', 'src/components/ui/card.native.tsx'],
    ['@cetus/ui/components/ui/badge', 'src/components/ui/badge.native.tsx'],
    ['@cetus/ui/components/ui/heading', 'src/components/ui/heading.native.tsx'],
    ['@cetus/ui/components/ui/select', 'src/components/ui/select.native.tsx'],
    ['@cetus/ui/components/ui/toggle', 'src/components/ui/toggle.native.tsx'],
    [
        '@cetus/ui/components/daily-missions-panel',
        'src/components/daily-missions-panel.native.tsx',
    ],
    [
        '@cetus/ui/components/login-reward-modal',
        'src/components/login-reward-modal.native.tsx',
    ],
    ['@cetus/ui/lib/utils', 'src/lib/utils.ts'],
    ['@cetus/ui/src/index', 'src/index.native.ts'],
    [
        '@cetus/ui/src/components/ui/button',
        'src/components/ui/button.native.tsx',
    ],
    [
        '@cetus/ui/src/components/daily-missions-panel',
        'src/components/daily-missions-panel.native.tsx',
    ],
    ['@cetus/ui/src/lib/utils', 'src/lib/utils.ts'],
]

const GUARD_ENFORCED_SPECIFIERS = [
    '@cetus/ui/src/index.ts',
    '@cetus/ui/src/variants',
    '@cetus/ui/src/lib/styles',
    '@cetus/ui/src/lib/styles.ts',
    '@cetus/ui/src/lib/utils.test.tsx',
    '@cetus/ui/src/components/ui/avatar',
    '@cetus/ui/src/components/ui/avatar.tsx',
    '@cetus/ui/src/components/ui/button.tsx',
    '@cetus/ui/src/components/ui/slider.tsx',
    '@cetus/ui/src/components/user-dropdown',
    '@cetus/ui/src/components/specimen-card.css',
    '@cetus/ui/src/components/daily-missions-panel.tsx',
]

const NEVER_RESOLVABLE_SPECIFIERS = [
    '@cetus/ui/index.ts',
    '@cetus/ui/components/ui/avatar',
    '@cetus/ui/components/ui/slider',
    '@cetus/ui/components/user-dropdown',
    '@cetus/ui/components/specimen-card',
    '@cetus/ui/components/ui/avatar.tsx',
    '@cetus/ui/lib/styles',
    '@cetus/ui/variants',
]

describe('the full Metro resolver never leaks web-only @cetus/ui sources', () => {
    it('wires the native web-source guard into metro.config.js', () => {
        expect(metroConfigSource).toContain('metro-native-guard')
        expect(metroConfigSource).toContain('resolveRequest')
    })

    it.each(NATIVE_PLATFORMS)(
        'resolves supported specifiers to native or platform-neutral files on %s',
        platform => {
            for (const [specifier, expected] of SUPPORTED_NATIVE_SPECIFIERS) {
                expect(resolvedUiPath(specifier, platform)).toBe(expected)
            }
        }
    )

    it.each(NATIVE_PLATFORMS)(
        'rejects specifiers that land on existing web-only sources on %s',
        platform => {
            for (const specifier of GUARD_ENFORCED_SPECIFIERS) {
                expect(() => resolveThroughMetro(specifier, platform)).toThrow(
                    /metro-native-guard/
                )
            }
        }
    )

    it.each(NATIVE_PLATFORMS)(
        'rejects specifiers with no native or filesystem target on %s',
        platform => {
            for (const specifier of NEVER_RESOLVABLE_SPECIFIERS) {
                expect(() => resolveThroughMetro(specifier, platform)).toThrow()
            }
        }
    )

    it.each(NATIVE_PLATFORMS)(
        'does not let package metadata or native-safe modules get blocked on %s',
        platform => {
            const packageJson = resolveThroughMetro(
                '@cetus/ui/package.json',
                platform
            )
            expect(packageJson.type).toBe('sourceFile')
            if (packageJson.type === 'sourceFile') {
                expect(packageJson.filePath).toBe(join(uiRoot, 'package.json'))
            }
        }
    )

    it('keeps web exports reachable for the browser platform', () => {
        const webContext = buildResolutionContext(
            withWebOnlyUiGuard(cssWebResolve)
        )
        const resolveWeb = (specifier: string) =>
            metroResolve(webContext, specifier, 'web') as {
                type: string
                filePath?: string
            }
        const cases: Array<[string, string]> = [
            ['@cetus/ui', 'src/index.ts'],
            ['@cetus/ui/src/index.ts', 'src/index.ts'],
            ['@cetus/ui/components/ui/avatar', 'src/components/ui/avatar.tsx'],
            [
                '@cetus/ui/src/components/ui/button.tsx',
                'src/components/ui/button.tsx',
            ],
            ['@cetus/ui/components/ui/button', 'src/components/ui/button.tsx'],
        ]
        for (const [specifier, expected] of cases) {
            const result = resolveWeb(specifier)
            expect(result.type).toBe('sourceFile')
            expect(relative(uiRoot, result.filePath ?? '')).toBe(expected)
        }
    })
})

type SourceIo = {
    readFile: (filePath: string) => string | null
    fileExists: (filePath: string) => boolean
}

type EdgeKind =
    'import' | 'export' | 'require' | 'dynamic-import' | 'import-equals'

type GraphEdge = {
    file: string
    specifier: string | null
    kind: EdgeKind
}

type NativeGraph = {
    reachable: Map<string, string>
    externals: Set<string>
    unresolved: GraphEdge[]
    forbidden: GraphEdge[]
    opaque: GraphEdge[]
}

const ts = jest.requireActual('typescript') as typeof import('typescript')

type TsNode = import('typescript').Node
type TsExpression = import('typescript').Expression

const FORBIDDEN_EXTERNAL = /^(react-dom|react-native-web)(\/|$)/

const extractRuntimeEdges = (
    file: string,
    source: string
): Array<Pick<GraphEdge, 'specifier' | 'kind'>> => {
    const edges: Array<Pick<GraphEdge, 'specifier' | 'kind'>> = []
    const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
    const pushExpression = (expression: TsExpression, kind: EdgeKind): void => {
        edges.push({
            specifier: ts.isStringLiteral(expression) ? expression.text : null,
            kind,
        })
    }
    const visit = (node: TsNode): void => {
        if (ts.isImportDeclaration(node)) {
            if (node.importClause?.isTypeOnly !== true) {
                pushExpression(node.moduleSpecifier, 'import')
            }
        } else if (ts.isExportDeclaration(node)) {
            if (
                node.isTypeOnly !== true &&
                node.moduleSpecifier !== undefined
            ) {
                pushExpression(node.moduleSpecifier, 'export')
            }
        } else if (ts.isImportEqualsDeclaration(node)) {
            const moduleReference = node.moduleReference
            if (ts.isExternalModuleReference(moduleReference)) {
                pushExpression(moduleReference.expression, 'import-equals')
            }
        } else if (ts.isCallExpression(node)) {
            const expression = node.expression
            if (ts.isIdentifier(expression) && expression.text === 'require') {
                const argument = node.arguments[0]
                if (argument !== undefined && ts.isStringLiteral(argument)) {
                    edges.push({ specifier: argument.text, kind: 'require' })
                } else {
                    edges.push({ specifier: null, kind: 'require' })
                }
            } else if (expression.kind === ts.SyntaxKind.ImportKeyword) {
                const argument = node.arguments[0]
                edges.push({
                    specifier:
                        argument !== undefined && ts.isStringLiteral(argument)
                            ? argument.text
                            : null,
                    kind: 'dynamic-import',
                })
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return edges
}

const resolveRelativeEdge = (
    importer: string,
    specifier: string,
    io: SourceIo
): string | null => {
    const base = resolve(dirname(importer), specifier)
    const candidates = [
        `${base}.native.tsx`,
        `${base}.native.ts`,
        `${base}.tsx`,
        `${base}.ts`,
        base,
        join(base, 'index.native.tsx'),
        join(base, 'index.native.ts'),
        join(base, 'index.tsx'),
        join(base, 'index.ts'),
    ]
    for (const candidate of candidates) {
        if (io.fileExists(candidate)) {
            return candidate
        }
    }
    return null
}

const collectNativeDependencyGraph = (
    entries: string[],
    io: SourceIo
): NativeGraph => {
    const graph: NativeGraph = {
        reachable: new Map(),
        externals: new Set(),
        unresolved: [],
        forbidden: [],
        opaque: [],
    }
    const queue = [...entries]
    while (queue.length > 0) {
        const file = queue.pop() as string
        if (graph.reachable.has(file)) {
            continue
        }
        const source = io.readFile(file)
        if (source === null) {
            graph.unresolved.push({
                file: '<entry>',
                specifier: file,
                kind: 'import',
            })
            continue
        }
        graph.reachable.set(file, source)
        for (const extracted of extractRuntimeEdges(file, source)) {
            const edge: GraphEdge = { file, ...extracted }
            if (edge.specifier === null) {
                graph.opaque.push(edge)
                continue
            }
            if (
                edge.specifier.endsWith('.css') ||
                FORBIDDEN_EXTERNAL.test(edge.specifier)
            ) {
                graph.forbidden.push(edge)
                continue
            }
            if (!edge.specifier.startsWith('.')) {
                graph.externals.add(edge.specifier)
                continue
            }
            const resolved = resolveRelativeEdge(file, edge.specifier, io)
            if (resolved === null) {
                graph.unresolved.push(edge)
            } else if (!graph.reachable.has(resolved)) {
                queue.push(resolved)
            }
        }
    }
    return graph
}

const nodeIo: SourceIo = {
    readFile: filePath => {
        try {
            return readFileSync(filePath, 'utf-8')
        } catch {
            return null
        }
    },
    fileExists: filePath => {
        try {
            return statSync(filePath).isFile()
        } catch {
            return false
        }
    },
}

const ioFromMap = (files: Record<string, string>): SourceIo => ({
    readFile: filePath => files[filePath] ?? null,
    fileExists: filePath => Object.hasOwn(files, filePath),
})

describe('the reachable native UI graph stays free of web-only code', () => {
    const graph = collectNativeDependencyGraph(
        [join(uiSrc, 'index.native.ts')],
        nodeIo
    )

    it('resolves every runtime edge reachable from index.native.ts', () => {
        expect(graph.reachable.size).toBeGreaterThan(0)
        expect(graph.unresolved).toEqual([])
        expect(graph.opaque).toEqual([])
        for (const file of graph.reachable.keys()) {
            expect(existsSync(file)).toBe(true)
        }
    })

    it('contains no react-dom, CSS imports or DOM globals', () => {
        expect(graph.forbidden).toEqual([])
        for (const [file, source] of graph.reachable) {
            expect(source).not.toMatch(/from\s+['"]react-dom/)
            expect(source).not.toMatch(/from\s+['"]react-native-web/)
            expect(source).not.toMatch(/['"][^'"]*\.css['"]/)
            expect(source).not.toMatch(/\bdocument\s*\./)
            expect(source).not.toMatch(/\bwindow\s*\./)
            expect(file).not.toMatch(/(?<!native)\.tsx$/)
        }
    })

    it('only imports the expected external packages at runtime', () => {
        expect([...graph.externals].sort()).toEqual([
            '@cetus/shared/challenges',
            '@cetus/shared/loginRewards',
            'clsx',
            'react',
            'react-native',
            'react-native-css/native',
            'react-native-safe-area-context',
            'tailwind-merge',
        ])
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
            allSources.filter(file => /\.native\.tsx$/.test(file))
        )
        expected.add(join(uiSrc, 'index.native.ts'))
        expected.add(join(uiSrc, 'lib/utils.ts'))

        expect(new Set(graph.reachable.keys())).toEqual(expected)
    })
})

describe('runtime dependency extraction covers every executable import form', () => {
    it('collects side-effect imports and reports unresolved edges', () => {
        const files = {
            '/pkg/index.native.ts':
                "import '../user-dropdown'\nimport './present'",
            '/user-dropdown.native.tsx': 'export const x = 1',
            '/pkg/present.native.tsx': 'export const y = 1',
        }
        const graph = collectNativeDependencyGraph(
            ['/pkg/index.native.ts'],
            ioFromMap(files)
        )
        expect(graph.reachable.has('/user-dropdown.native.tsx')).toBe(true)
        expect(graph.reachable.has('/pkg/present.native.tsx')).toBe(true)
        expect(graph.unresolved).toEqual([])
    })

    it('flags side-effect imports that cannot be resolved', () => {
        const files = {
            '/pkg/index.native.ts': "import '../user-dropdown'",
        }
        const graph = collectNativeDependencyGraph(
            ['/pkg/index.native.ts'],
            ioFromMap(files)
        )
        expect(graph.unresolved).toEqual([
            {
                file: '/pkg/index.native.ts',
                specifier: '../user-dropdown',
                kind: 'import',
            },
        ])
    })

    it('flags require() of forbidden packages', () => {
        const files = {
            '/pkg/index.native.ts':
                "const dom = require('react-dom')\nexport const x = dom",
        }
        const graph = collectNativeDependencyGraph(
            ['/pkg/index.native.ts'],
            ioFromMap(files)
        )
        expect(graph.forbidden).toEqual([
            {
                file: '/pkg/index.native.ts',
                specifier: 'react-dom',
                kind: 'require',
            },
        ])
    })

    it('flags unresolved require() and dynamic import() edges', () => {
        const files = {
            '/pkg/index.native.ts':
                "const a = require('./missing-helper')\nconst b = import('./lazy-missing')",
        }
        const graph = collectNativeDependencyGraph(
            ['/pkg/index.native.ts'],
            ioFromMap(files)
        )
        expect(graph.unresolved).toEqual(
            expect.arrayContaining([
                {
                    file: '/pkg/index.native.ts',
                    specifier: './missing-helper',
                    kind: 'require',
                },
                {
                    file: '/pkg/index.native.ts',
                    specifier: './lazy-missing',
                    kind: 'dynamic-import',
                },
            ])
        )
    })

    it('flags dynamic imports whose specifier is not a literal', () => {
        const files = {
            '/pkg/index.native.ts':
                'const target = pick()\nconst mod = import(target)',
        }
        const graph = collectNativeDependencyGraph(
            ['/pkg/index.native.ts'],
            ioFromMap(files)
        )
        expect(graph.opaque).toEqual([
            {
                file: '/pkg/index.native.ts',
                specifier: null,
                kind: 'dynamic-import',
            },
        ])
    })

    it('ignores type-only imports and re-exports', () => {
        const files = {
            '/pkg/index.native.ts':
                "import type { Foo } from './type-only'\nexport type { Bar } from './also-type-only'\nimport { type Baz, qux } from './real'",
            '/pkg/real.native.ts': 'export const qux = 1',
        }
        const graph = collectNativeDependencyGraph(
            ['/pkg/index.native.ts'],
            ioFromMap(files)
        )
        expect(graph.unresolved).toEqual([])
        expect(graph.reachable.has('/pkg/real.native.ts')).toBe(true)
        expect(graph.reachable.size).toBe(2)
    })

    it('follows export-from, import-equals and require edges into native modules', () => {
        const files = {
            '/pkg/index.native.ts':
                "export { thing } from './thing'\nimport impl = require('./impl')",
            '/pkg/thing.native.ts': 'export const thing = 1',
            '/pkg/impl.native.ts': 'export default 1',
        }
        const graph = collectNativeDependencyGraph(
            ['/pkg/index.native.ts'],
            ioFromMap(files)
        )
        expect(graph.reachable.has('/pkg/thing.native.ts')).toBe(true)
        expect(graph.reachable.has('/pkg/impl.native.ts')).toBe(true)
        expect(graph.unresolved).toEqual([])
    })
})
