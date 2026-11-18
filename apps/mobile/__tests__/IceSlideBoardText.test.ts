import type { CellType } from '@cetus/games/ice-slide/types'

import {
    ICE_SLIDE_INITIAL_PROJECTION,
    type IceSlideProjection,
} from '../src/games/ice-slide/controller'
import {
    describeIceSlideBoard,
    describeIceSlideRow,
    formatIceSlideColumns,
    iceSlideRowLabels,
} from '../src/games/ice-slide/boardText'

const row = (cells: string): CellType[] =>
    [...cells].map(glyph => {
        const map: Record<string, CellType> = {
            '#': 'wall',
            '.': 'ice',
            S: 'start',
            G: 'goal',
            O: 'rock',
            H: 'hazard',
            C: 'crystal',
            N: 'snow',
            F: 'fragile',
        }
        const cell = map[glyph]
        if (!cell) {
            throw new Error(`unknown glyph ${glyph}`)
        }
        return cell
    })

const projection = (
    overrides: Partial<IceSlideProjection>
): IceSlideProjection => ({ ...ICE_SLIDE_INITIAL_PROJECTION, ...overrides })

describe('describeIceSlideRow', () => {
    it('names every terrain type and marks the player cell', () => {
        expect(describeIceSlideRow(row('#.GCHO'), 0, { row: 0, col: 1 })).toBe(
            'Row 1: wall at column 1; you at column 2; goal at column 3; crystal at column 4; hazard at column 5; rock at column 6.'
        )
    })

    it('groups repeated terrain and lists columns in words', () => {
        expect(describeIceSlideRow(row('##...'), 2, { row: 0, col: 0 })).toBe(
            'Row 3: wall at columns 1 and 2; ice at columns 3, 4 and 5.'
        )
    })

    it('only marks the player on the player row', () => {
        expect(describeIceSlideRow(row('...'), 1, { row: 2, col: 0 })).toBe(
            'Row 2: ice at columns 1, 2 and 3.'
        )
    })

    it('formats single and multiple column lists', () => {
        expect(formatIceSlideColumns([0])).toBe('column 1')
        expect(formatIceSlideColumns([0, 2])).toBe('columns 1 and 3')
        expect(formatIceSlideColumns([0, 2, 4])).toBe('columns 1, 3 and 5')
    })
})

describe('describeIceSlideBoard', () => {
    it('describes the stage, cursor, goal and remaining crystals', () => {
        const scene = projection({
            rows: 3,
            cols: 4,
            grid: [row('#..#'), row('.S.C'), row('..G.')],
            player: { row: 1, col: 1 },
            level: 2,
            levelsTotal: 8,
            stageName: 'Corner Pocket',
            moves: 7,
        })
        expect(describeIceSlideBoard(scene)).toBe(
            'Ice Slide board: stage 2 of 8, Corner Pocket. You at row 2, column 2. Goal at row 3, column 3. 7 moves, 1 crystals remaining.'
        )
    })

    it('keeps the row descriptions in sync with a new cursor', () => {
        const before = projection({
            rows: 2,
            cols: 3,
            grid: [row('...'), row('..G')],
            player: { row: 0, col: 0 },
        })
        const after = { ...before, player: { row: 0, col: 2 } }
        expect(iceSlideRowLabels(before)[0]).toBe(
            'Row 1: you at column 1; ice at columns 2 and 3.'
        )
        expect(iceSlideRowLabels(after)[0]).toBe(
            'Row 1: ice at columns 1 and 2; you at column 3.'
        )
    })

    it('says waiting to start while idle', () => {
        expect(describeIceSlideBoard(projection({ mode: 'expedition' }))).toBe(
            'Ice Slide board: Expedition, waiting to start'
        )
        expect(iceSlideRowLabels(ICE_SLIDE_INITIAL_PROJECTION)).toEqual([])
    })
})
