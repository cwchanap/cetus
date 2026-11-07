// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createStableProjector } from './createStableProjector'

interface BoardState {
    board: number[][]
    clock: number
}

const selectBoard = (state: BoardState) => ({
    board: state.board.map(row => [...row]),
})

describe('createStableProjector', () => {
    it('reuses the previous reference while the serialized projection is unchanged', () => {
        const project = createStableProjector(selectBoard)
        const state: BoardState = {
            board: [
                [1, 2],
                [3, 4],
            ],
            clock: 0,
        }
        const first = project(state)

        // Timer tick with no board change: same content, same reference.
        state.clock = 1
        expect(project(state)).toBe(first)
        expect(project(state)).toBe(first)
    })

    it('produces a new projection after an in-place nested cell mutation', () => {
        const project = createStableProjector(selectBoard)
        const state: BoardState = {
            board: [
                [1, 2],
                [3, 4],
            ],
            clock: 0,
        }
        const first = project(state)

        // The model mutated its own nested cell; the copied snapshot the
        // select returns must surface the change as a new reference.
        state.board[0][1] = 9
        const next = project(state)

        expect(next).not.toBe(first)
        expect(next.board).toEqual([
            [1, 9],
            [3, 4],
        ])
    })

    it('returns the fresh snapshot on first use and stays serializable', () => {
        const project = createStableProjector(selectBoard)
        const state: BoardState = { board: [[0]], clock: 0 }
        const first = project(state)

        expect(first).toEqual({ board: [[0]] })
        expect(JSON.stringify(first)).toBe('{"board":[[0]]}')
    })

    it('keeps a separately stabilized grid reference across clock ticks (Sudoku pattern)', () => {
        // Sudoku's elapsed-time clock is a lightweight HUD field, not part
        // of the stabilized board prop: compose a second projector for the
        // grid so a timer tick changes the top-level projection without
        // invalidating the memoized grid or its stable input callbacks.
        const projectGrid = createStableProjector((state: BoardState) =>
            state.board.map(row => [...row])
        )
        const project = createStableProjector((state: BoardState) => ({
            grid: projectGrid(state),
            clock: state.clock,
        }))
        const state: BoardState = {
            board: [
                [1, 2],
                [3, 4],
            ],
            clock: 10,
        }
        const first = project(state)

        // Timer-only tick: the top-level projection changes (clock moved)...
        state.clock = 11
        const ticked = project(state)
        expect(ticked).not.toBe(first)
        // ...but the memoized grid keeps its reference identity.
        expect(ticked.grid).toBe(first.grid)

        // An in-place number edit invalidates the grid reference itself.
        state.board[1][0] = 7
        const edited = project(state)
        expect(edited.grid).not.toBe(first.grid)
        expect(edited.grid).toEqual([
            [1, 2],
            [7, 4],
        ])
    })
})
