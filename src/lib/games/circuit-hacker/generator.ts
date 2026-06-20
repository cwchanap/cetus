// src/lib/games/circuit-hacker/generator.ts
import type {
    DifficultyConfig,
    Direction,
    GridPosition,
    Tile,
    TileType,
} from './types'
import { DELTA, getBaseConnectors, rotateConnectors } from './utils'

export interface GeneratedPuzzle {
    grid: Tile[][]
    sourcePos: GridPosition
    corePositions: GridPosition[]
    solutionOrientations: number[][]
}

const ALL_DIRS: Direction[] = ['N', 'E', 'S', 'W']

function key(pos: GridPosition): string {
    return `${pos.row},${pos.col}`
}

function inBounds(pos: GridPosition, rows: number, cols: number): boolean {
    return pos.row >= 0 && pos.row < rows && pos.col >= 0 && pos.col < cols
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
    const copy = [...arr]
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
}

// Random simple path from start to goal via randomized DFS over a fresh grid.
function findPath(
    start: GridPosition,
    goal: GridPosition,
    rows: number,
    cols: number,
    rng: () => number,
    blocked: Set<string> = new Set()
): GridPosition[] | null {
    const visited = new Set<string>([key(start), ...blocked])
    const stack: GridPosition[][] = [[start]]

    while (stack.length > 0) {
        const path = stack.pop() as GridPosition[]
        const head = path[path.length - 1]
        if (head.row === goal.row && head.col === goal.col) {
            return path
        }
        for (const dir of shuffle(ALL_DIRS, rng)) {
            const next = {
                row: head.row + DELTA[dir].dr,
                col: head.col + DELTA[dir].dc,
            }
            if (!inBounds(next, rows, cols) || visited.has(key(next))) {
                continue
            }
            visited.add(key(next))
            stack.push([...path, next])
        }
    }
    return null
}

// Pick the tile type + orientation whose connectors equal a required dir set.
function tileForDirections(dirs: Set<Direction>): {
    type: TileType
    orientation: number
} {
    const required = ALL_DIRS.filter(d => dirs.has(d))
    const candidates: TileType[] =
        required.length === 1
            ? [] // handled by source/core elsewhere
            : ['straight', 'elbow', 't-junction', 'cross']

    for (const type of candidates) {
        for (let orientation = 0; orientation < 4; orientation++) {
            const conn = rotateConnectors(getBaseConnectors(type), orientation)
            if (
                conn.length === required.length &&
                required.every(d => conn.includes(d))
            ) {
                return { type, orientation }
            }
        }
    }
    // Fallback (should not happen for size 2..4): a cross covers any set
    return { type: 'cross', orientation: 0 }
}

function orientationForSingle(dir: Direction): number {
    for (let orientation = 0; orientation < 4; orientation++) {
        if (rotateConnectors(['N'], orientation)[0] === dir) {
            return orientation
        }
    }
    return 0
}

export function generatePuzzle(
    config: DifficultyConfig,
    rng: () => number = Math.random
): GeneratedPuzzle {
    const { rows, cols, cores, blockers } = config

    const allCells: GridPosition[] = []
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            allCells.push({ row: r, col: c })
        }
    }

    const hasNonCoreNeighbor = (
        source: GridPosition,
        coreSet: GridPosition[]
    ): boolean =>
        ALL_DIRS.some(d => {
            const n = {
                row: source.row + DELTA[d].dr,
                col: source.col + DELTA[d].dc,
            }
            return (
                inBounds(n, rows, cols) &&
                !coreSet.some(c => c.row === n.row && c.col === n.col)
            )
        })

    let sourcePos: GridPosition
    let corePositions: GridPosition[]
    let attempts = 0
    do {
        const shuffled = shuffle(allCells, rng)
        sourcePos = shuffled[0]
        corePositions = shuffled.slice(1, 1 + cores)
        attempts++
    } while (attempts < 50 && !hasNonCoreNeighbor(sourcePos!, corePositions!))

    // Guard against the (extremely unlikely) case where no shuffled layout
    // produced a source with a non-core neighbor. Failing loudly here beats
    // silently emitting a puzzle with no valid hub, which would be unsolvable.
    if (!hasNonCoreNeighbor(sourcePos, corePositions)) {
        throw new Error(
            'generatePuzzle: could not place a source tile with a non-core neighbor within the retry limit'
        )
    }

    // Accumulate the directions each cell needs in the solved state.
    const required: Map<string, Set<Direction>> = new Map()
    const addDir = (pos: GridPosition, dir: Direction) => {
        const k = key(pos)
        if (!required.has(k)) {
            required.set(k, new Set())
        }
        required.get(k)!.add(dir)
    }
    const dirBetween = (a: GridPosition, b: GridPosition): Direction => {
        if (b.row === a.row - 1) {
            return 'N'
        }
        if (b.row === a.row + 1) {
            return 'S'
        }
        if (b.col === a.col + 1) {
            return 'E'
        }
        return 'W'
    }

    const coreKeys = new Set(corePositions.map(key))

    // The source has a single connector, so it emits one trunk to a hub
    // neighbor; every core path branches off that hub. Paths never route
    // through the source or another core (those tiles have one connector).
    const sourceNeighbors = shuffle(
        ALL_DIRS.map(d => ({
            row: sourcePos.row + DELTA[d].dr,
            col: sourcePos.col + DELTA[d].dc,
        })).filter(n => inBounds(n, rows, cols) && !coreKeys.has(key(n))),
        rng
    )
    const hub = sourceNeighbors[0]
    const hasHub = hub !== undefined

    const pathCells = new Set<string>([key(sourcePos)])
    if (hasHub) {
        pathCells.add(key(hub))
        addDir(sourcePos, dirBetween(sourcePos, hub))
        addDir(hub, dirBetween(hub, sourcePos))
    }

    for (const core of corePositions) {
        const blocked = new Set<string>([key(sourcePos)])
        for (const other of corePositions) {
            if (key(other) !== key(core)) {
                blocked.add(key(other))
            }
        }
        const start = hasHub ? hub : sourcePos
        const path = findPath(start, core, rows, cols, rng, blocked)
        if (!path) {
            continue
        }
        for (let i = 0; i < path.length; i++) {
            pathCells.add(key(path[i]))
            if (i > 0) {
                addDir(path[i], dirBetween(path[i], path[i - 1]))
            }
            if (i < path.length - 1) {
                addDir(path[i], dirBetween(path[i], path[i + 1]))
            }
        }
        pathCells.add(key(core))
    }

    // Build the solved grid.
    const grid: Tile[][] = []
    const solutionOrientations: number[][] = []
    for (let r = 0; r < rows; r++) {
        const gridRow: Tile[] = []
        const solRow: number[] = []
        for (let c = 0; c < cols; c++) {
            const pos = { row: r, col: c }
            const k = key(pos)
            const dirs = required.get(k) ?? new Set<Direction>()

            let type: TileType
            let orientation: number
            let locked = false

            if (pos.row === sourcePos.row && pos.col === sourcePos.col) {
                type = 'source'
                orientation = orientationForSingle([...dirs][0] ?? 'N')
                locked = true
            } else if (corePositions.some(p => key(p) === k)) {
                type = 'core'
                orientation = orientationForSingle([...dirs][0] ?? 'N')
                locked = true
            } else if (pathCells.has(k)) {
                const t = tileForDirections(dirs)
                type = t.type
                orientation = t.orientation
            } else {
                // Decoy cell: random pipe tile (loose ends are allowed).
                const decoys: TileType[] = [
                    'straight',
                    'elbow',
                    't-junction',
                    'cross',
                ]
                type = decoys[Math.floor(rng() * decoys.length)]
                orientation = Math.floor(rng() * 4)
            }

            gridRow.push({ type, orientation, locked, powered: false })
            solRow.push(orientation)
        }
        grid.push(gridRow)
        solutionOrientations.push(solRow)
    }

    // Place blockers on non-path, non-source/core cells.
    const blockerCandidates = shuffle(
        allCells.filter(p => !pathCells.has(key(p))),
        rng
    ).slice(0, blockers)
    for (const pos of blockerCandidates) {
        grid[pos.row][pos.col] = {
            type: 'blocker',
            orientation: 0,
            locked: true,
            powered: false,
        }
        solutionOrientations[pos.row][pos.col] = 0
    }

    // Scramble every rotatable tile to a random orientation.
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!grid[r][c].locked) {
                grid[r][c].orientation = Math.floor(rng() * 4)
            }
        }
    }

    return { grid, sourcePos, corePositions, solutionOrientations }
}
