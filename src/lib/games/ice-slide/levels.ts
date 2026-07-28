import type { IceSlideLevel } from './types'

/**
 * Authored Ice Slide levels. Glyphs: # wall, . ice, S start, G goal,
 * O rock, H hazard, C crystal.
 *
 * Each level is BFS-validated for solvability and crystal reachability.
 * `parMoves` is the minimum solution length; scoring still awards an
 * at-par move bonus (see `moveBonus`).
 */
export const ICE_SLIDE_LEVELS: IceSlideLevel[] = [
    {
        id: 1,
        name: 'First Frost',
        parMoves: 1,
        rows: ['#####', '#S..#', '#...#', '#G..#', '#####'],
    },
    {
        id: 2,
        name: 'Corner Pocket',
        parMoves: 3,
        rows: ['######', '#S#..#', '#....#', '##.#.#', '#...G#', '######'],
    },
    {
        id: 3,
        name: 'Bank Shot',
        parMoves: 4,
        rows: [
            '#######',
            '#S.#..#',
            '#...#.#',
            '##....#',
            '#.#.#.#',
            '#....G#',
            '#######',
        ],
    },
    {
        id: 4,
        name: 'Thin Ice',
        parMoves: 5,
        rows: [
            '#######',
            '#S....#',
            '##.#H.#',
            '#.....#',
            '#.H#.##',
            '#....G#',
            '#######',
        ],
    },
    {
        id: 5,
        name: 'Crystal Cache',
        parMoves: 6,
        rows: [
            '########',
            '#S#....#',
            '#......#',
            '#.C....#',
            '##..#.##',
            '#.....C#',
            '#.#....#',
            '#.....G#',
            '########',
        ],
    },
    {
        id: 6,
        name: 'Fracture Zone',
        parMoves: 3,
        rows: [
            '########',
            '#S#....#',
            '#..#H..#',
            '#......#',
            '##O#.#.#',
            '#......#',
            '#.H...G#',
            '########',
        ],
    },
    {
        id: 7,
        name: 'Deep Freeze',
        parMoves: 6,
        rows: [
            '#########',
            '#S#.....#',
            '#...#.#.#',
            '#.C.....#',
            '##..#..##',
            '#.....C.#',
            '#.#.#...#',
            '#......G#',
            '#########',
        ],
    },
    {
        id: 8,
        name: 'Absolute Zero',
        parMoves: 6,
        rows: [
            '#########',
            '#S#.....#',
            '#...#.#.#',
            '#.C.....#',
            '##..H..##',
            '#.....C.#',
            '#.#.O.#.#',
            '#......G#',
            '#########',
        ],
    },
]

export function getLevel(index: number): IceSlideLevel {
    const level = ICE_SLIDE_LEVELS[index]
    if (!level) {
        throw new Error(`Ice Slide level index out of range: ${index}`)
    }
    return level
}
