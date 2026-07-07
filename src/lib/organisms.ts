import { GAMES, GameID, type Game } from './games'

export type OrganismShape =
    | 'jelly'
    | 'orb'
    | 'chain'
    | 'spiral'
    | 'frond'
    | 'cluster'
    | 'lattice'

export type OrganismColor = 'teal' | 'amber' | 'magenta' | 'ice' | 'green'

export type DepthZone = 'shallow' | 'mid' | 'abyssal'

export interface OrganismIdentity {
    shape: OrganismShape
    color: OrganismColor
    /** draw an orbit ring around an orb (Bubble Shooter, Satellite Sync) */
    orb?: boolean
}

type GameEntry = { organism: OrganismIdentity; depth: DepthZone }

// Per the approved spec table.
export const ORGANISM_BY_GAME: Record<GameID, GameEntry> = {
    [GameID.REFLEX]: {
        organism: { shape: 'orb', color: 'magenta' },
        depth: 'shallow',
    },
    [GameID.QUICK_MATH]: {
        organism: { shape: 'orb', color: 'amber' },
        depth: 'shallow',
    },
    [GameID.WORD_SCRAMBLE]: {
        organism: { shape: 'frond', color: 'green' },
        depth: 'shallow',
    },
    [GameID.BEJEWELED]: {
        organism: { shape: 'cluster', color: 'magenta' },
        depth: 'shallow',
    },
    [GameID.EVADER]: {
        organism: { shape: 'spiral', color: 'teal' },
        depth: 'shallow',
    },
    [GameID.SNAKE]: {
        organism: { shape: 'chain', color: 'green' },
        depth: 'mid',
    },
    [GameID.TETRIS]: {
        organism: { shape: 'lattice', color: 'teal' },
        depth: 'mid',
    },
    [GameID.GAME_2048]: {
        organism: { shape: 'cluster', color: 'amber' },
        depth: 'mid',
    },
    [GameID.PATH_NAVIGATOR]: {
        organism: { shape: 'spiral', color: 'ice' },
        depth: 'mid',
    },
    [GameID.BUBBLE_SHOOTER]: {
        organism: { shape: 'orb', color: 'ice', orb: true },
        depth: 'mid',
    },
    [GameID.CIRCUIT_HACKER]: {
        organism: { shape: 'frond', color: 'ice' },
        depth: 'mid',
    },
    [GameID.SUDOKU]: {
        organism: { shape: 'lattice', color: 'amber' },
        depth: 'abyssal',
    },
    [GameID.SATELLITE_SYNC]: {
        organism: { shape: 'orb', color: 'teal', orb: true },
        depth: 'abyssal',
    },
    [GameID.MEMORY_MATRIX]: {
        organism: { shape: 'cluster', color: 'magenta' },
        depth: 'abyssal',
    },
}

export const FEATURED_GAME_IDS: GameID[] = [
    GameID.REFLEX,
    GameID.BEJEWELED,
    GameID.SNAKE,
    GameID.GAME_2048,
    GameID.TETRIS,
]

export const DEPTH_LABELS: Record<
    DepthZone,
    { label: string; reading: string; note: string }
> = {
    shallow: {
        label: 'Shallow',
        reading: '0–200m',
        note: 'Quick reactions. Pick up and play.',
    },
    mid: {
        label: 'Mid-water',
        reading: '1000m',
        note: 'Focused sessions. A few minutes in.',
    },
    abyssal: {
        label: 'Abyssal',
        reading: '4000m+',
        note: 'The deep divers. Long and absorbing.',
    },
}

export function getOrganism(id: GameID): OrganismIdentity {
    return ORGANISM_BY_GAME[id].organism
}

export function getDepth(id: GameID): DepthZone {
    return ORGANISM_BY_GAME[id].depth
}

export function getGamesByDepth(
    zone: DepthZone,
    games: Game[] = GAMES
): Game[] {
    return games.filter(g => g.depth === zone && g.isActive)
}

export function getFeaturedGames(games: Game[] = GAMES): Game[] {
    const byId = new Map(games.map(g => [g.id, g]))
    return FEATURED_GAME_IDS.map(id => byId.get(id)).filter((g): g is Game =>
        Boolean(g)
    )
}

// Attach organism + depth to each registered game. Runs at module load, after
// both ORGANISM_BY_GAME (above) and GAMES (imported from ./games) are defined.
// NOTE: This mutation lives here rather than in games.ts because ESM import
// hoisting (Vite/esbuild) would otherwise cause games.ts to trigger
// organisms.ts evaluation before the GameID enum / GAMES array are declared,
// resulting in a "Cannot read properties of undefined" TypeError. Keeping the
// runtime dependency one-directional (organisms.ts -> games.ts) avoids the
// cycle entirely; games.ts retains only a type-only import.
for (const game of GAMES) {
    const entry = ORGANISM_BY_GAME[game.id]
    if (entry) {
        game.organism = entry.organism
        game.depth = entry.depth
    }
}
