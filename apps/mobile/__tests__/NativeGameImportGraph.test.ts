/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const mobileRoot = resolve(__dirname, '..')
const repoRoot = resolve(mobileRoot, '../..')

// --- runtime import graph ---------------------------------------------------

type EdgeKind = 'import' | 'export' | 'require' | 'dynamic-import'

type GraphEdge = { file: string; specifier: string | null; kind: EdgeKind }

type NativeGraph = {
    reachable: Map<string, string>
    externals: Set<string>
    unresolved: GraphEdge[]
    forbidden: GraphEdge[]
}

const ts = jest.requireActual('typescript') as typeof import('typescript')

type TsNode = import('typescript').Node
type TsExpression = import('typescript').Expression

const FORBIDDEN_EXTERNAL =
    /^(react-dom|react-native-web|pixi\.js|canvaskit-wasm|@\/)(\/|$)|^@shopify\/react-native-skia\/(.+\/)?web(\/|$)|^@shopify\/react-native-skia\/.+\.web(\.|$)/

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
        } else if (ts.isCallExpression(node)) {
            const expression = node.expression
            if (
                ts.isIdentifier(expression) &&
                expression.text === 'require' &&
                node.arguments[0] !== undefined &&
                ts.isStringLiteral(node.arguments[0])
            ) {
                edges.push({
                    specifier: node.arguments[0].text,
                    kind: 'require',
                })
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

const resolveRelativeEdge = (importer: string, specifier: string) => {
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
        if (existsSync(candidate)) {
            return candidate
        }
    }
    return null
}

const collectNativeDependencyGraph = (entries: string[]): NativeGraph => {
    const graph: NativeGraph = {
        reachable: new Map(),
        externals: new Set(),
        unresolved: [],
        forbidden: [],
    }
    const queue = [...entries]
    while (queue.length > 0) {
        const file = queue.pop() as string
        if (graph.reachable.has(file)) {
            continue
        }
        let source: string
        try {
            source = readFileSync(file, 'utf-8')
        } catch {
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
                // Opaque edges are unacceptable in the native game graph.
                graph.unresolved.push(edge)
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
            const resolvedFile = resolveRelativeEdge(file, edge.specifier)
            if (resolvedFile === null) {
                graph.unresolved.push(edge)
            } else if (!graph.reachable.has(resolvedFile)) {
                queue.push(resolvedFile)
            }
        }
    }
    return graph
}

const GRAPH_ENTRIES = [
    join(mobileRoot, 'app/games/[gameId]/play.tsx'),
    join(mobileRoot, 'app/games/[gameId].tsx'),
    join(mobileRoot, 'app/(tabs)/index.tsx'),
    join(mobileRoot, 'src/games/registry.ts'),
    join(mobileRoot, 'src/games/NativeGameHost.tsx'),
    join(mobileRoot, 'src/games/NativeGameChrome.tsx'),
]

const mobilePackageJson = JSON.parse(
    readFileSync(join(mobileRoot, 'package.json'), 'utf-8')
) as { dependencies: Record<string, string> }

/** Package names the native graph may reach: mobile deps + react itself. */
const ALLOWED_EXTERNAL_PACKAGES = new Set([
    ...Object.keys(mobilePackageJson.dependencies),
    'react',
])

const packageNameOf = (specifier: string): string => {
    const parts = specifier.split('/')
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

describe('the native game routing graph stays portable', () => {
    const graph = collectNativeDependencyGraph(GRAPH_ENTRIES)

    test('every entry point exists and every runtime edge resolves', () => {
        for (const entry of GRAPH_ENTRIES) {
            expect(existsSync(entry)).toBe(true)
        }
        expect(graph.reachable.size).toBeGreaterThan(GRAPH_ENTRIES.length)
        expect(graph.unresolved).toEqual([])
    })

    test('imports no web renderers, web aliases or stylesheets', () => {
        expect(graph.forbidden).toEqual([])
    })

    test('touches no DOM globals and stays out of the web app', () => {
        for (const [file, source] of graph.reachable) {
            expect(relative(repoRoot, file).startsWith('apps/web')).toBe(false)
            expect(source).not.toMatch(/\bdocument\s*\./)
            expect(source).not.toMatch(/\bwindow\s*\./)
        }
    })

    test('only depends on portable external packages', () => {
        for (const specifier of graph.externals) {
            expect(
                ALLOWED_EXTERNAL_PACKAGES.has(packageNameOf(specifier))
            ).toBe(true)
        }
        // The Stage 1 dependency is genuinely used at runtime (formatTime),
        // and the host adapts through app-core.
        expect(graph.externals).toContain('@cetus/games/shared/utils')
        expect(graph.externals).toContain('@cetus/app-core')
        expect(graph.externals).toContain('@cetus/ui')
        // No web renderer ever enters the graph.
        expect(graph.externals.has('react-dom')).toBe(false)
        expect(graph.externals.has('react-native-web')).toBe(false)
        expect([...graph.externals].some(spec => spec.startsWith('pixi'))).toBe(
            false
        )
    })

    test('lets Skia ports import Skia but rejects its DOM backends', () => {
        const probeDir = mkdtempSync(join(tmpdir(), 'skia-port-probe-'))
        const probeFile = join(probeDir, 'probe.ts')
        writeFileSync(
            probeFile,
            [
                "import { Canvas } from '@shopify/react-native-skia'",
                "import '@shopify/react-native-skia/src/web/LoadSkiaWeb'",
                "import '@shopify/react-native-skia/lib/module/web'",
                "import '@shopify/react-native-skia/src/skia/Skia.web'",
                "import 'canvaskit-wasm'",
                "import * as PIXI from 'pixi.js'",
                '',
            ].join('\n')
        )
        const probeGraph = collectNativeDependencyGraph([probeFile])
        expect(probeGraph.unresolved).toEqual([])
        expect(probeGraph.externals.has('@shopify/react-native-skia')).toBe(
            true
        )
        expect(
            ALLOWED_EXTERNAL_PACKAGES.has('@shopify/react-native-skia')
        ).toBe(true)
        expect(probeGraph.forbidden.map(edge => edge.specifier)).toEqual([
            '@shopify/react-native-skia/src/web/LoadSkiaWeb',
            '@shopify/react-native-skia/lib/module/web',
            '@shopify/react-native-skia/src/skia/Skia.web',
            'canvaskit-wasm',
            'pixi.js',
        ])
    })

    test('the handle-game producer, controller and board join the same portable graph', () => {
        const reachable = [...graph.reachable.keys()].map(file =>
            relative(mobileRoot, file)
        )
        for (const expected of [
            'src/games/runtime.tsx',
            'src/games/handleResult.ts',
            'src/games/rewards.ts',
            'src/games/circuit-hacker/controller.ts',
            'src/games/boards/CircuitHackerBoard.tsx',
            'src/games/satellite-sync/controller.ts',
            'src/games/boards/SatelliteSyncBoard.tsx',
            'src/games/ice-slide/controller.ts',
            'src/games/boards/IceSlideBoard.tsx',
            'src/games/canvas/useFrameLoop.ts',
        ]) {
            expect(reachable).toContain(expected)
        }
        // The shared producer must not fake a BaseGame model for handles.
        for (const controller of [
            'src/games/circuit-hacker/controller.ts',
            'src/games/satellite-sync/controller.ts',
            'src/games/ice-slide/controller.ts',
        ]) {
            const source = readFileSync(join(mobileRoot, controller), 'utf-8')
            expect(source).not.toMatch(/extends\s+BaseGame/)
        }
    })
})

// --- Metro resolution of the native-only package imports ---------------------

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
        if (dirname(dir) === dir) {
            return null
        }
        dir = dirname(dir)
    }
}

const buildResolutionContext = (): Record<string, unknown> => {
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
        originModulePath: join(mobileRoot, 'app/games/[gameId]/play.tsx'),
        preferNativePlatform: true,
        resolveAsset: () => null,
        resolveHasteModule: () => null,
        resolveHastePackage: () => null,
        sourceExts: expoResolverFields.sourceExts,
        unstable_conditionNames: expoResolverFields.conditionNames,
        unstable_conditionsByPlatform: expoResolverFields.conditions,
        unstable_enablePackageExports: expoResolverFields.enableExports,
        unstable_incrementalResolution: false,
        unstable_logWarning: () => {},
        customResolverOptions: {},
    }
    context.redirectModulePath = (modulePath: string) =>
        redirectModulePath(context, modulePath)
    return context
}

const metroContext = buildResolutionContext()

const resolveSourceFile = (specifier: string, platform: string): string => {
    const result = metroResolve(metroContext, specifier, platform)
    if (result.type !== 'sourceFile') {
        throw new Error(
            `Expected a source file resolution for ${specifier} on ${platform}, got ${result.type}`
        )
    }
    return result.filePath
}

const NATIVE_GAME_SPECIFIERS: Array<[string, RegExp]> = [
    ['@cetus/games', /packages\/games\/src\/index\.ts$/],
    ['@cetus/games/shared/utils', /packages\/games\/src\/shared\/utils\.ts$/],
    [
        '@cetus/games/memory-matrix/MemoryMatrixGame',
        /packages\/games\/src\/memory-matrix\/MemoryMatrixGame\.ts$/,
    ],
    [
        '@cetus/games/chromatic-tide/types',
        /packages\/games\/src\/chromatic-tide\/types\.ts$/,
    ],
    [
        '@cetus/games/bejeweled/types',
        /packages\/games\/src\/bejeweled\/types\.ts$/,
    ],
    [
        '@cetus/games/mine-grid/types',
        /packages\/games\/src\/mine-grid\/types\.ts$/,
    ],
    [
        '@cetus/games/pattern-pulse/types',
        /packages\/games\/src\/pattern-pulse\/types\.ts$/,
    ],
    [
        '@cetus/games/potion-sorter/puzzle',
        /packages\/games\/src\/potion-sorter\/puzzle\.ts$/,
    ],
    [
        '@cetus/games/potion-sorter/types',
        /packages\/games\/src\/potion-sorter\/types\.ts$/,
    ],
    ['@cetus/games/2048/Game2048', /packages\/games\/src\/2048\/Game2048\.ts$/],
    ['@cetus/games/2048/utils', /packages\/games\/src\/2048\/utils\.ts$/],
    [
        '@cetus/games/evader/EvaderGame',
        /packages\/games\/src\/evader\/EvaderGame\.ts$/,
    ],
    [
        '@cetus/games/path-navigator/PathNavigatorGame',
        /packages\/games\/src\/path-navigator\/PathNavigatorGame\.ts$/,
    ],
    [
        '@cetus/games/asteroid-drift/AsteroidDriftGame',
        /packages\/games\/src\/asteroid-drift\/AsteroidDriftGame\.ts$/,
    ],
    [
        '@cetus/games/asteroid-drift/types',
        /packages\/games\/src\/asteroid-drift\/types\.ts$/,
    ],
    [
        '@cetus/games/circuit-hacker/game',
        /packages\/games\/src\/circuit-hacker\/game\.ts$/,
    ],
    [
        '@cetus/games/circuit-hacker/types',
        /packages\/games\/src\/circuit-hacker\/types\.ts$/,
    ],
    [
        '@cetus/games/circuit-hacker/utils',
        /packages\/games\/src\/circuit-hacker\/utils\.ts$/,
    ],
    [
        '@cetus/games/satellite-sync/game',
        /packages\/games\/src\/satellite-sync\/game\.ts$/,
    ],
    [
        '@cetus/games/satellite-sync/geometry',
        /packages\/games\/src\/satellite-sync\/geometry\.ts$/,
    ],
    [
        '@cetus/games/satellite-sync/levels',
        /packages\/games\/src\/satellite-sync\/levels\.ts$/,
    ],
    [
        '@cetus/games/satellite-sync/types',
        /packages\/games\/src\/satellite-sync\/types\.ts$/,
    ],
    [
        '@cetus/games/ice-slide/game',
        /packages\/games\/src\/ice-slide\/game\.ts$/,
    ],
    [
        '@cetus/games/ice-slide/daily',
        /packages\/games\/src\/ice-slide\/daily\.ts$/,
    ],
    [
        '@cetus/games/ice-slide/expedition',
        /packages\/games\/src\/ice-slide\/expedition\.ts$/,
    ],
    [
        '@cetus/games/ice-slide/objectives',
        /packages\/games\/src\/ice-slide\/objectives\.ts$/,
    ],
    ['@cetus/games/ice-slide/run', /packages\/games\/src\/ice-slide\/run\.ts$/],
    [
        '@cetus/games/ice-slide/scoreSubmission',
        /packages\/games\/src\/ice-slide\/scoreSubmission\.ts$/,
    ],
    [
        '@cetus/games/ice-slide/types',
        /packages\/games\/src\/ice-slide\/types\.ts$/,
    ],
    [
        '@cetus/games/shared/geometry',
        /packages\/games\/src\/shared\/geometry\.ts$/,
    ],
    [
        'react-native-gesture-handler',
        /node_modules\/react-native-gesture-handler\/src\/index\.ts$/,
    ],
    ['@cetus/app-core', /packages\/app-core\/src\/index\.ts$/],
    ['@cetus/shared/games', /packages\/shared\/src\/games\.ts$/],
    ['@cetus/ui', /packages\/ui\/src\/index\.native\.ts$/],
    [
        '@shopify/react-native-skia',
        /node_modules\/@shopify\/react-native-skia\/src\/index\.ts$/,
    ],
    [
        'react-native-reanimated',
        /node_modules\/react-native-reanimated\/src\/index\.ts$/,
    ],
]

describe('Metro resolves the native game imports on device platforms', () => {
    it.each(['ios', 'android'])('resolves every specifier on %s', platform => {
        expect(expoResolverFields.conditions[platform]).toContain(
            'react-native'
        )
        for (const [specifier, expectedPath] of NATIVE_GAME_SPECIFIERS) {
            const filePath = resolveSourceFile(specifier, platform)
            expect(filePath).toMatch(expectedPath)
            expect(existsSync(filePath)).toBe(true)
            expect(relative(repoRoot, filePath).startsWith('apps/web')).toBe(
                false
            )
        }
    })
})
