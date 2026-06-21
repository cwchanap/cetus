// src/lib/games/circuit-hacker/generator.ts
import type {
    DifficultyConfig,
    Direction,
    GridPosition,
    Tile,
    TileType,
} from './types'
import {
    DELTA,
    computePoweredCells,
    getBaseConnectors,
    rotateConnectors,
} from './utils'

export interface GeneratedPuzzle {
    grid: Tile[][]
    sourcePos: GridPosition
    corePositions: GridPosition[]
    solutionOrientations: number[][]
}

const ALL_DIRS: Direction[] = ['N', 'E', 'S', 'W']
const MAX_GENERATE_ATTEMPTS = 50

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

// Reconstruct a path from a parent map.
function reconstructPath(
    parent: Map<string, GridPosition | null>,
    goal: GridPosition
): GridPosition[] {
    const path: GridPosition[] = []
    let cur: GridPosition | null = goal
    while (cur) {
        path.unshift(cur)
        cur = parent.get(key(cur)) ?? null
    }
    return path
}

// Randomized DFS path search. Produces winding paths, but the visited-once
// strategy can spuriously fail when dead-end branches consume cells that a
// different branch needed. O(rows*cols) with no per-step array copies.
function dfsPath(
    start: GridPosition,
    goal: GridPosition,
    rows: number,
    cols: number,
    rng: () => number,
    blocked: Set<string>
): GridPosition[] | null {
    const visited = new Set<string>([key(start), ...blocked])
    const parent = new Map<string, GridPosition | null>([[key(start), null]])
    const stack: GridPosition[] = [start]

    while (stack.length > 0) {
        const current = stack.pop() as GridPosition
        if (current.row === goal.row && current.col === goal.col) {
            return reconstructPath(parent, current)
        }
        for (const dir of shuffle(ALL_DIRS, rng)) {
            const next = {
                row: current.row + DELTA[dir].dr,
                col: current.col + DELTA[dir].dc,
            }
            const k = key(next)
            if (!inBounds(next, rows, cols) || visited.has(k)) {
                continue
            }
            visited.add(k)
            parent.set(k, current)
            stack.push(next)
        }
    }
    return null
}

// BFS fallback — guaranteed to find a path if one exists. Used when the
// randomized DFS spuriously misses one, so the generator never emits an
// unsolvable puzzle due to a search artifact.
function bfsPath(
    start: GridPosition,
    goal: GridPosition,
    rows: number,
    cols: number,
    blocked: Set<string>
): GridPosition[] | null {
    const visited = new Set<string>([key(start), ...blocked])
    const parent = new Map<string, GridPosition | null>([[key(start), null]])
    const queue: GridPosition[] = [start]

    while (queue.length > 0) {
        const current = queue.shift() as GridPosition
        if (current.row === goal.row && current.col === goal.col) {
            return reconstructPath(parent, current)
        }
        for (const dir of ALL_DIRS) {
            const next = {
                row: current.row + DELTA[dir].dr,
                col: current.col + DELTA[dir].dc,
            }
            const k = key(next)
            if (!inBounds(next, rows, cols) || visited.has(k)) {
                continue
            }
            visited.add(k)
            parent.set(k, current)
            queue.push(next)
        }
    }
    return null
}

// Find a path from start to goal, preferring a winding randomized DFS and
// falling back to BFS for completeness. Returns null only when the goal is
// genuinely unreachable with the given blocked set.
function findPath(
    start: GridPosition,
    goal: GridPosition,
    rows: number,
    cols: number,
    rng: () => number,
    blocked: Set<string>
): GridPosition[] | null {
    const dfsResult = dfsPath(start, goal, rows, cols, rng, blocked)
    if (dfsResult) {
        return dfsResult
    }
    return bfsPath(start, goal, rows, cols, blocked)
}

// Pick the tile type + orientation whose connectors equal a required dir set.
// Returns null when no connectors are required (a degenerate layout the caller
// should retry rather than emit), so defensive failures route through the
// retry loop instead of bypassing it via a thrown exception.
function tileForDirections(dirs: Set<Direction>): {
    type: TileType
    orientation: number
} | null {
    const required = ALL_DIRS.filter(d => dirs.has(d))
    if (required.length === 0) {
        return null
    }
    if (required.length === 1) {
        // Only occurs for the hub in a degenerate cores=0 layout: a stub off
        // the source with no core to reach. A cross covers the one needed
        // direction; the extra loose ends are harmless on a path cell.
        return { type: 'cross', orientation: 0 }
    }
    const candidates: TileType[] = ['straight', 'elbow', 't-junction', 'cross']
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

function dirBetween(a: GridPosition, b: GridPosition): Direction {
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

// One attempt at producing a fully-solvable puzzle. Returns null if any core
// could not be reached from the hub, so the caller can retry with a fresh
// layout instead of emitting an unwinnable puzzle.
function tryGenerate(
    config: DifficultyConfig,
    rng: () => number
): GeneratedPuzzle | null {
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

    // Pick a source with at least one non-core neighbor.
    let sourcePos: GridPosition | null = null
    let corePositions: GridPosition[] = []
    for (let i = 0; i < 50; i++) {
        const shuffled = shuffle(allCells, rng)
        const candidateSource = shuffled[0]
        const candidateCores = shuffled.slice(1, 1 + cores)
        if (hasNonCoreNeighbor(candidateSource, candidateCores)) {
            sourcePos = candidateSource
            corePositions = candidateCores
            break
        }
    }
    if (!sourcePos) {
        return null
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

    const coreKeys = new Set(corePositions.map(key))

    // The source has a single connector, so it emits one trunk to a hub
    // neighbor; every core path branches off that hub. Paths never route
    // through the source or another core (those tiles have one connector).
    // hasNonCoreNeighbor guaranteed sourceNeighbors is non-empty, so the hub
    // is always defined.
    const sourceNeighbors = shuffle(
        ALL_DIRS.map(d => ({
            row: sourcePos.row + DELTA[d].dr,
            col: sourcePos.col + DELTA[d].dc,
        })).filter(n => inBounds(n, rows, cols) && !coreKeys.has(key(n))),
        rng
    )
    const hub = sourceNeighbors[0]

    const pathCells = new Set<string>([key(sourcePos), key(hub)])
    addDir(sourcePos, dirBetween(sourcePos, hub))
    addDir(hub, dirBetween(hub, sourcePos))

    for (const core of corePositions) {
        const blocked = new Set<string>([key(sourcePos)])
        for (const other of corePositions) {
            if (key(other) !== key(core)) {
                blocked.add(key(other))
            }
        }
        const path = findPath(hub, core, rows, cols, rng, blocked)
        if (!path) {
            // This core is genuinely unreachable from the hub with this
            // layout. Signal the caller to try a fresh layout rather than
            // emitting an unsolvable puzzle.
            return null
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
                if (!t) {
                    // Degenerate layout (path cell with no required
                    // connectors). Signal the caller to retry with a fresh
                    // layout rather than emitting an unsolvable tile.
                    return null
                }
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

    // Defensive re-scramble guard: if the random scramble happened to leave
    // every core powered, the puzzle would be trivially pre-solved. The
    // probability is astronomically low (~1/4^rotatableTiles), but returning
    // null here routes it back through the retry loop for an airtight
    // guarantee rather than emitting a no-op board.
    const powered = computePoweredCells(grid, sourcePos)
    if (corePositions.every(c => powered[c.row][c.col])) {
        return null
    }

    return { grid, sourcePos, corePositions, solutionOrientations }
}

export function generatePuzzle(
    config: DifficultyConfig,
    rng: () => number = Math.random
): GeneratedPuzzle {
    for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
        const puzzle = tryGenerate(config, rng)
        if (puzzle) {
            return puzzle
        }
    }
    throw new Error(
        'generatePuzzle: could not generate a solvable puzzle within retry limit'
    )
}
