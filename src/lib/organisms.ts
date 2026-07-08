import {
    GAMES,
    GameID,
    type Game,
    type OrganismIdentity,
    type DepthZone,
} from './games'

// Re-export the organism/depth types so existing consumers (Organism.astro,
// SpecimenCard, tests) can keep importing them from './organisms'.
export type {
    OrganismShape,
    OrganismColor,
    OrganismIdentity,
    DepthZone,
} from './games'

type GameEntry = { organism: OrganismIdentity; depth: DepthZone }

// Derived from the organism/depth fields inlined on each GAMES entry.
// Inlining the data into GAMES (see ./games.ts) removed the previous
// module-load mutation of GAMES, which only ran when this module was
// transitively imported. ORGANISM_BY_GAME is now a pure derivation.
export const ORGANISM_BY_GAME: Record<GameID, GameEntry> = Object.fromEntries(
    GAMES.map(g => [
        g.id,
        {
            organism: g.organism as OrganismIdentity,
            depth: g.depth as DepthZone,
        },
    ])
) as Record<GameID, GameEntry>

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
