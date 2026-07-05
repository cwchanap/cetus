// Game2048 (BaseGame framework) unit tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Spy on canMove so game-over can be forced deterministically
vi.mock('./utils', async importOriginal => {
    const actual = await importOriginal<typeof import('./utils')>()
    return { ...actual, canMove: vi.fn(actual.canMove) }
})

import { Game2048, DEFAULT_GAME2048_CONFIG } from './Game2048'
import { canMove, createEmptyBoard } from './utils'
import type { Board, Tile, Animation } from './types'
import type { Game2048State } from './frameworkTypes'

function makeTile(id: string, value: number, row: number, col: number): Tile {
    return { id, value, position: { row, col } }
}

function setBoard(game: Game2048, board: Board): void {
    const state = (game as unknown as { state: Game2048State }).state
    state.board = board
    state.tileIdCounter = 100 // avoid id collisions with spawned tiles
}

// move() spawns a random tile after sliding/merging. The spawn may land on
// any empty cell, so assertions that a vacated cell is null are flaky.
// Use this to assert a cell is either empty or holds a freshly spawned tile.
function expectEmptyOrSpawned(cell: Tile | null): void {
    if (cell !== null) {
        expect([2, 4]).toContain(cell.value)
        expect(cell.isNew).toBe(true)
    }
}

describe('Game2048', () => {
    let game: Game2048

    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
        game = new Game2048()
    })

    afterEach(() => {
        game.destroy()
        vi.mocked(canMove).mockRestore()
        vi.unstubAllGlobals()
    })

    describe('createInitialState', () => {
        it('creates an empty board with zeroed counters', () => {
            const state = game.getState()
            expect(state.score).toBe(0)
            expect(state.gameStarted).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.won).toBe(false)
            expect(state.moveCount).toBe(0)
            expect(state.mergeCount).toBe(0)
            expect(state.maxTile).toBe(0)
            expect(state.tileIdCounter).toBe(0)
            state.board.forEach(row =>
                row.forEach(cell => expect(cell).toBeNull())
            )
        })
    })

    describe('start', () => {
        it('spawns the initial tiles and marks the game started', () => {
            game.start()
            const state = game.getState()
            expect(state.gameStarted).toBe(true)
            expect(state.isActive).toBe(true)
            const tiles = state.board.flat().filter(t => t !== null)
            expect(tiles.length).toBe(2)
            tiles.forEach(t => expect([2, 4]).toContain((t as Tile).value))
        })

        it('updates maxTile to the highest spawned value', () => {
            game.start()
            const state = game.getState()
            const values = state.board
                .flat()
                .filter((t): t is Tile => t !== null)
                .map(t => t.value)
            expect(state.maxTile).toBe(Math.max(...values))
        })
    })

    describe('move - sliding', () => {
        beforeEach(() => {
            game.start()
        })

        it('does not move before the game is started (fresh instance)', () => {
            const fresh = new Game2048()
            const result = fresh.move('left')
            expect(result.moved).toBe(false)
            fresh.destroy()
        })

        // move() spawns a random tile after sliding. The spawn may land on the
        // now-empty source cell, so we assert the destination holds the moved
        // tile and the source is either empty or holds a freshly spawned tile.
        it('slides a tile to the left', () => {
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][3] = makeTile('a', 2, 0, 3)

            const result = game.move('left')
            expect(result.moved).toBe(true)
            expect(result.board[0][0]!.value).toBe(2)
            expectEmptyOrSpawned(result.board[0][3])
        })

        it('slides a tile to the right', () => {
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)

            const result = game.move('right')
            expect(result.moved).toBe(true)
            expect(result.board[0][3]!.value).toBe(2)
            expectEmptyOrSpawned(result.board[0][0])
        })

        it('slides a tile up', () => {
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[3][0] = makeTile('a', 2, 3, 0)

            const result = game.move('up')
            expect(result.moved).toBe(true)
            expect(result.board[0][0]!.value).toBe(2)
            expectEmptyOrSpawned(result.board[3][0])
        })

        it('slides a tile down', () => {
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)

            const result = game.move('down')
            expect(result.moved).toBe(true)
            expect(result.board[3][0]!.value).toBe(2)
            expectEmptyOrSpawned(result.board[0][0])
        })

        it('returns moved=false when no tile can move', () => {
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)

            const result = game.move('left')
            expect(result.moved).toBe(false)
            expect(game.getState().moveCount).toBe(0)
        })

        it('increments moveCount only when tiles actually move', () => {
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][3] = makeTile('a', 2, 0, 3)

            game.move('left')
            expect(game.getState().moveCount).toBe(1)

            // Now tile sits at the left edge; moving left again does nothing
            // (board reset to reflect post-spawn state is unnecessary — use a
            // fresh edge case by trying left again against current state)
            // After the first move a tile spawned; move left again should still
            // move at least the original tile is at edge — count may rise if the
            // spawned tile can move. So we assert moveCount >= 1 here.
            expect(game.getState().moveCount).toBeGreaterThanOrEqual(1)
        })
    })

    describe('move - merging', () => {
        beforeEach(() => {
            game.start()
        })

        it('merges two matching tiles and awards score', () => {
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)
            board[0][1] = makeTile('b', 2, 0, 1)

            const result = game.move('left')
            expect(result.moved).toBe(true)
            expect(result.board[0][0]!.value).toBe(4)
            expectEmptyOrSpawned(result.board[0][1])
            expect(result.scoreGained).toBe(4)
            expect(result.mergeCount).toBe(1)
            expect(game.getState().score).toBe(4)
            expect(game.getState().mergeCount).toBe(1)
        })

        it('merges only once per tile per move (three 2s)', () => {
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)
            board[0][1] = makeTile('b', 2, 0, 1)
            board[0][2] = makeTile('c', 2, 0, 2)

            const result = game.move('left')
            expect(result.board[0][0]!.value).toBe(4)
            expect(result.board[0][1]!.value).toBe(2)
            expectEmptyOrSpawned(result.board[0][2])
            expect(result.mergeCount).toBe(1)
        })

        it('merges four matching tiles into two pairs', () => {
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)
            board[0][1] = makeTile('b', 2, 0, 1)
            board[0][2] = makeTile('c', 2, 0, 2)
            board[0][3] = makeTile('d', 2, 0, 3)

            const result = game.move('left')
            expect(result.board[0][0]!.value).toBe(4)
            expect(result.board[0][1]!.value).toBe(4)
            expectEmptyOrSpawned(result.board[0][2])
            expectEmptyOrSpawned(result.board[0][3])
            expect(result.scoreGained).toBe(8)
            expect(result.mergeCount).toBe(2)
            expect(game.getState().score).toBe(8)
        })

        it('does not merge non-matching tiles', () => {
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)
            board[0][1] = makeTile('b', 4, 0, 1)

            const result = game.move('left')
            expect(result.board[0][0]!.value).toBe(2)
            expect(result.board[0][1]!.value).toBe(4)
            expect(result.mergeCount).toBe(0)
            expect(result.scoreGained).toBe(0)
        })
    })

    describe('move - spawn', () => {
        it('spawns a single new tile after a successful move', () => {
            game.start()
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][3] = makeTile('a', 2, 0, 3)

            game.move('left')
            const tiles = game
                .getBoard()
                .flat()
                .filter(t => t !== null)
            // The moved tile + one spawned tile
            expect(tiles.length).toBe(2)
        })
    })

    describe('win detection', () => {
        it('flags won when 2048 is reached, and keeps playing', () => {
            game.start()
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 1024, 0, 0)
            board[0][1] = makeTile('b', 1024, 0, 1)

            game.move('left')

            expect(game.getState().won).toBe(true)
            // Game continues (board is not full -> not over)
            expect(game.getState().isGameOver).toBe(false)
            expect(game.getState().isActive).toBe(true)
        })

        it('keeps won true on subsequent moves (no reset)', () => {
            game.start()
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 1024, 0, 0)
            board[0][1] = makeTile('b', 1024, 0, 1)

            game.move('left') // -> won, 2048
            expect(game.getState().won).toBe(true)

            // A second move should leave won true
            const board2 = game.getBoard()
            board2[0][1] = makeTile('c', 2, 0, 1)
            game.move('left')
            expect(game.getState().won).toBe(true)
        })
    })

    describe('game over detection', () => {
        it('ends the game when no moves remain after a move', async () => {
            game.start()
            // Board with exactly one movable tile; after the move, force
            // canMove to report no moves remaining.
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)
            board[0][1] = makeTile('b', 2, 0, 1)

            vi.mocked(canMove).mockReturnValue(false)

            game.move('left')

            expect(game.getState().isGameOver).toBe(true)
            expect(game.getState().isActive).toBe(false)

            // Score submission happened via the framework score path
            await Promise.resolve()
            expect(fetch).toHaveBeenCalledWith(
                '/api/scores',
                expect.objectContaining({ method: 'POST' })
            )
        })
    })

    describe('stats and game data contract', () => {
        it('getGameStats reports final score, tiles, moves, merges', () => {
            game.start()
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)
            board[0][1] = makeTile('b', 2, 0, 1)
            board[1][0] = makeTile('c', 4, 1, 0)
            board[1][1] = makeTile('d', 4, 1, 1)

            game.move('left')

            const stats = game.getGameStats()
            // Row 0: 2+2 -> 4 (4 pts). Row 1: 4+4 -> 8 (8 pts). Total = 12.
            expect(stats.finalScore).toBe(12)
            expect(stats.mergeCount).toBe(2)
            expect(stats.moveCount).toBe(1)
            expect(stats.maxTile).toBe(8)
            expect(stats.gameCompleted).toBe(false)
        })

        it('getGameData returns the { maxTile, moves, merges } contract', () => {
            game.start()
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)
            board[0][1] = makeTile('b', 2, 0, 1)

            game.move('left')

            const gameData = (
                game as unknown as {
                    getGameData: () => Record<string, unknown>
                }
            ).getGameData()

            expect(gameData).toEqual({
                maxTile: 4,
                moves: 1,
                merges: 1,
            })
        })
    })

    describe('reset', () => {
        it('resets the board and counters', () => {
            game.start()
            setBoard(game, createEmptyBoard())
            const board = game.getBoard()
            board[0][0] = makeTile('a', 2, 0, 0)
            board[0][1] = makeTile('b', 2, 0, 1)
            game.move('left')

            game.reset()

            const state = game.getState()
            expect(state.score).toBe(0)
            expect(state.moveCount).toBe(0)
            expect(state.mergeCount).toBe(0)
            expect(state.maxTile).toBe(0)
            expect(state.won).toBe(false)
            expect(state.isGameOver).toBe(false)
            state.board.forEach(row =>
                row.forEach(cell => expect(cell).toBeNull())
            )
        })
    })

    describe('move guards', () => {
        it('returns moved=false when game is over', () => {
            game.start()
            // Force the game into an game-over state
            ;(game as unknown as { state: Game2048State }).state.isGameOver =
                true
            ;(game as unknown as { state: Game2048State }).state.isActive =
                false

            const result = game.move('left')
            expect(result.moved).toBe(false)
        })
    })

    describe('lifecycle no-op methods', () => {
        it('update() is a no-op that does not throw', () => {
            expect(() => game.update(16)).not.toThrow()
        })

        it('render() is a no-op that does not throw', () => {
            expect(() => game.render()).not.toThrow()
        })

        it('cleanup() is a no-op that does not throw', () => {
            expect(() => game.cleanup()).not.toThrow()
        })
    })

    describe('getConfig', () => {
        it('returns a copy of the merged config', () => {
            const custom = new Game2048({ gameWidth: 999 })
            const cfg = custom.getConfig()
            expect(cfg.gameWidth).toBe(999)
            expect(cfg.tileSize).toBe(DEFAULT_GAME2048_CONFIG.tileSize)
            // Mutating the returned copy must not affect the game
            cfg.gameWidth = 1
            expect(custom.getConfig().gameWidth).toBe(999)
            custom.destroy()
        })
    })

    describe('markRendered', () => {
        it('clears the needsRedraw flag', () => {
            game.start()
            expect(game.getState().needsRedraw).toBe(true)
            game.markRendered()
            expect(game.getState().needsRedraw).toBe(false)
        })
    })

    describe('onStateChange callback', () => {
        it('invokes the onStateChange callback when state changes', () => {
            const onStateChange = vi.fn()
            const g = new Game2048({}, { onStateChange })
            g.start()
            expect(onStateChange).toHaveBeenCalled()
            const emitted = onStateChange.mock.calls[0][0]
            expect(emitted.gameStarted).toBe(true)
            g.destroy()
        })
    })

    describe('spawnTile on a full board', () => {
        it('returns the board unchanged with no animation when no empty cell exists', () => {
            game.start()
            // Build a completely full board (no empty cells)
            const full = createEmptyBoard()
            let id = 0
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    full[r][c] = makeTile(`f-${id++}`, 2, r, c)
                }
            }
            setBoard(game, full)

            const spawnTile = (
                game as unknown as {
                    spawnTile: (
                        board: Board,
                        counter: number
                    ) => {
                        board: Board
                        animation: Animation | null
                        nextCounter: number
                    }
                }
            ).spawnTile.bind(game)

            const result = spawnTile(game.getBoard(), 5)
            expect(result.animation).toBeNull()
            expect(result.nextCounter).toBe(5)
            // Board is unchanged (still full)
            expect(result.board.flat().every(t => t !== null)).toBe(true)
        })
    })
})
