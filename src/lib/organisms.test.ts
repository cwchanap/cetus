import { describe, it, expect } from 'vitest'
import { GAMES, GameID } from './games'
import {
    ORGANISM_BY_GAME,
    getOrganism,
    getDepth,
    getGamesByDepth,
    getFeaturedGames,
    FEATURED_GAME_IDS,
    DEPTH_LABELS,
    type OrganismShape,
    type OrganismColor,
    type DepthZone,
} from './organisms'

const SHAPES: OrganismShape[] = [
    'jelly',
    'orb',
    'chain',
    'spiral',
    'frond',
    'cluster',
    'lattice',
]
const COLORS: OrganismColor[] = ['teal', 'amber', 'magenta', 'ice', 'green']
const ZONES: DepthZone[] = ['shallow', 'mid', 'abyssal']

describe('organism registry', () => {
    it('assigns an organism and depth to every registered game', () => {
        for (const g of GAMES) {
            expect(ORGANISM_BY_GAME).toHaveProperty(g.id)
            const entry = ORGANISM_BY_GAME[g.id]
            expect(SHAPES).toContain(entry.organism.shape)
            expect(COLORS).toContain(entry.organism.color)
            expect(ZONES).toContain(entry.depth)
        }
    })

    it('every game record carries the matching organism + depth', () => {
        for (const g of GAMES) {
            expect(g.organism).toBeDefined()
            expect(g.depth).toBeDefined()
            expect(g.organism).toEqual(ORGANISM_BY_GAME[g.id].organism)
            expect(g.depth).toBe(ORGANISM_BY_GAME[g.id].depth)
        }
    })

    it('exposes accessors', () => {
        expect(getOrganism(GameID.REFLEX).shape).toBe('orb')
        expect(getOrganism(GameID.REFLEX).color).toBe('magenta')
        expect(getDepth(GameID.SUDOKU)).toBe('abyssal')
        expect(getDepth(GameID.REFLEX)).toBe('shallow')
    })

    it('partitions games into 5 / 6 / 3 by depth', () => {
        expect(getGamesByDepth('shallow')).toHaveLength(5)
        expect(getGamesByDepth('mid')).toHaveLength(6)
        expect(getGamesByDepth('abyssal')).toHaveLength(3)
        // no game is double-counted
        const all = [
            ...getGamesByDepth('shallow'),
            ...getGamesByDepth('mid'),
            ...getGamesByDepth('abyssal'),
        ]
        expect(all).toHaveLength(GAMES.length)
        // depth label maps for each zone
        for (const z of ZONES) {
            expect(DEPTH_LABELS[z].reading).toMatch(/\dm/)
        }
    })

    it('returns the featured five in the spec order', () => {
        expect(FEATURED_GAME_IDS).toEqual([
            GameID.REFLEX,
            GameID.BEJEWELED,
            GameID.SNAKE,
            GameID.GAME_2048,
            GameID.TETRIS,
        ])
        expect(getFeaturedGames().map(g => g.id)).toEqual(FEATURED_GAME_IDS)
    })

    it('marks the two orbiting games', () => {
        expect(ORGANISM_BY_GAME[GameID.BUBBLE_SHOOTER].organism.orb).toBe(true)
        expect(ORGANISM_BY_GAME[GameID.SATELLITE_SYNC].organism.orb).toBe(true)
        expect(ORGANISM_BY_GAME[GameID.QUICK_MATH].organism.orb).toBeFalsy()
    })
})
