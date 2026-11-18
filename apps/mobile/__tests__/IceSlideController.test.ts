import { IceSlideGame } from '@cetus/games/ice-slide/game'
import { slide, cloneGrid } from '@cetus/games/ice-slide/physics'
import { ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS } from '@cetus/games/ice-slide/test-fixtures'
import type {
    CellType,
    Direction,
    GridPosition,
    IceSlideState,
} from '@cetus/games/ice-slide/types'

import {
    ICE_SLIDE_INITIAL_PROJECTION,
    IceSlideController,
    type IceSlideControllerOptions,
} from '../src/games/ice-slide/controller'

const controllers: IceSlideController[] = []

afterEach(() => {
    for (const controller of controllers.splice(0)) {
        controller.cleanup()
    }
})

const DIRECTION_DELTA: Record<Direction, { row: number; col: number }> = {
    N: { row: -1, col: 0 },
    E: { row: 0, col: 1 },
    S: { row: 1, col: 0 },
    W: { row: 0, col: -1 },
}
const DIRECTIONS: Direction[] = ['N', 'E', 'S', 'W']

const SEED_A = '11111111222222223333333344444444'
const SEED_B = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const makeResults = () => ({
    beginRun: jest.fn(),
    finishAndSave: jest.fn(),
    finishLocal: jest.fn(),
    idle: jest.fn(),
})

const makeHandlers = () => ({
    onStart: jest.fn(),
    onEnd: jest.fn(),
    onIdle: jest.fn(),
    onScore: jest.fn(),
    onTime: jest.fn(),
    setProjected: jest.fn(),
})

const createController = (
    options: IceSlideControllerOptions = {},
    seedQueue: string[] = []
) => {
    const handlers = makeHandlers()
    const results = makeResults()
    const controller = new IceSlideController(
        { handlers, results },
        {
            createExpeditionSeed: () => {
                const next = seedQueue.shift()
                if (next === undefined) {
                    throw new Error('unexpected expedition seed draw')
                }
                return next
            },
            ...options,
        }
    )
    return { controller, handlers, results }
}

const gameOf = (controller: IceSlideController): IceSlideGame => {
    const game = controller.getGame()
    if (!game) {
        throw new Error('no live Ice Slide model')
    }
    return game
}

/** Breadth-first fall-free route to the goal from the live stage. */
function findRoute(current: IceSlideState): Direction[] {
    const key = (position: GridPosition) => `${position.row},${position.col}`
    const queue: Array<{
        pos: GridPosition
        path: Direction[]
        grid: CellType[][]
    }> = [
        {
            pos: current.player,
            path: [],
            grid: current.grid.map(row => [...row]),
        },
    ]
    const seen = new Set([key(current.player)])
    let cursor = 0
    while (cursor < queue.length) {
        const node = queue[cursor]
        cursor += 1
        for (const direction of DIRECTIONS) {
            const nextGrid = node.grid.map(row => [...row])
            const outcome = slide(
                nextGrid,
                node.pos,
                DIRECTION_DELTA[direction]
            )
            if (outcome.kind !== 'moved') {
                continue
            }
            const positionKey = key(outcome.end)
            if (seen.has(positionKey)) {
                continue
            }
            seen.add(positionKey)
            const path = [...node.path, direction]
            if (outcome.reachedGoal) {
                return path
            }
            queue.push({ pos: outcome.end, path, grid: nextGrid })
        }
        if (seen.size > 50_000) {
            break
        }
    }
    throw new Error('no route to the goal in this stage')
}

const clearStage = (game: IceSlideGame): void => {
    for (const direction of findRoute(game.getState())) {
        game.move(direction)
    }
}

/** A moved, non-goal slide (keeps the Expedition undo snapshot alive). */
const nonGoalDirection = (current: IceSlideState): Direction => {
    for (const direction of DIRECTIONS) {
        const nextGrid = cloneGrid(current.grid)
        const outcome = slide(
            nextGrid,
            current.player,
            DIRECTION_DELTA[direction]
        )
        if (outcome.kind === 'moved' && !outcome.reachedGoal) {
            return direction
        }
    }
    throw new Error('no non-goal slide in this stage')
}

const clearDailyFixture = (game: IceSlideGame): void => {
    for (const stage of ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS) {
        for (const direction of stage) {
            game.move(direction)
        }
    }
}

describe('Ice Slide controller — mode binding and start', () => {
    test('idle projects Campaign and zero-argument Start launches Campaign', () => {
        const { controller, handlers, results } = createController()
        expect(controller.getGame()).toBeNull()
        expect(controller.getProjection()).toMatchObject({
            mode: 'campaign',
            status: 'idle',
            rows: 0,
            canChooseMode: true,
            canMove: false,
        })

        controller.start()
        const game = gameOf(controller)
        expect(game.getState().mode).toBe('campaign')
        expect(game.getState().status).toBe('playing')
        expect(game.getState().levelIndex).toBe(0)
        expect(results.beginRun).toHaveBeenCalledWith(0)
        expect(handlers.setProjected).toHaveBeenLastCalledWith(
            expect.objectContaining({
                mode: 'campaign',
                status: 'playing',
                rows: 5,
                cols: 5,
                level: 1,
                levelsTotal: 8,
                canMove: true,
                canChooseMode: false,
            })
        )
        expect(results.finishAndSave).not.toHaveBeenCalled()
        controller.cleanup()
    })

    test('mode selection is pre-run only and switching drops the finished scene', () => {
        const { controller, results } = createController()
        controller.selectMode('daily')
        expect(controller.getProjection().mode).toBe('daily')
        controller.start()
        expect(gameOf(controller).getState().mode).toBe('daily')
        expect(controller.getProjection().canChooseMode).toBe(false)

        // Selecting a different mode while playing is a no-op.
        controller.selectMode('expedition')
        expect(controller.getMode()).toBe('daily')
        expect(controller.getProjection().mode).toBe('daily')

        // Daily early stop idles; a mode change then clears the board.
        controller.stop()
        expect(controller.getGame()).toBeNull()
        expect(results.idle).toHaveBeenCalledTimes(1)
        controller.selectMode('campaign')
        expect(controller.getProjection()).toMatchObject({
            mode: 'campaign',
            status: 'idle',
            rows: 0,
            canChooseMode: true,
        })
        controller.cleanup()
    })

    test('Daily binds the UTC date at every Start, including Play again after midnight', () => {
        let now = new Date('2026-08-12T23:59:59Z')
        const { controller, results } = createController({ now: () => now })
        controller.selectMode('daily')
        controller.start()
        const game = gameOf(controller)
        expect(game.getState().runKey).toBe('ice-slide:daily:2026-08-12:g1:r1')
        expect(controller.getProjection().dailyDateKey).toBe('2026-08-12')

        clearDailyFixture(game)
        expect(game.getState().status).toBe('won')
        expect(game.getState().score).toBeGreaterThan(0)
        expect(results.finishAndSave).toHaveBeenCalledTimes(1)
        expect(results.finishAndSave).toHaveBeenCalledWith(
            expect.objectContaining({
                context: {
                    mode: 'daily',
                    competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
                    rulesetVersion: 1,
                },
                gameData: expect.objectContaining({
                    mode: 'daily',
                    solved: true,
                }),
            })
        )

        // Midnight passes while the result sits on screen: Play again is a
        // NEW Start, so it binds the new UTC daily (yesterday's run is not
        // retained for Daily).
        now = new Date('2026-08-13T00:00:01Z')
        controller.start()
        expect(gameOf(controller).getState().runKey).toBe(
            'ice-slide:daily:2026-08-13:g1:r1'
        )
        expect(controller.getProjection().dailyDateKey).toBe('2026-08-13')

        // A Daily early stop never saves; the next Start is a fresh same-day
        // run bound to the current UTC date.
        controller.stop()
        expect(results.finishAndSave).toHaveBeenCalledTimes(1)
        expect(results.idle).toHaveBeenCalled()
        controller.start()
        expect(gameOf(controller).getState().runKey).toBe(
            'ice-slide:daily:2026-08-13:g1:r1'
        )
        controller.cleanup()
    })
})

describe('Ice Slide controller — Expedition seeds and routes', () => {
    test('Play again replays the retained seed; New Expedition draws a new one', () => {
        const { controller, handlers, results } = createController({}, [
            SEED_A,
            SEED_B,
        ])
        controller.selectMode('expedition')
        controller.start()
        const first = gameOf(controller)
        expect(controller.getProjection().seed).toBe(SEED_A)
        const firstRunKey = first.getState().runKey
        expect(controller.getProjection().seed).toBe(SEED_A)

        // Clear stage 1 so the early Stop carries a positive score.
        clearStage(first)
        expect(first.getState().score).toBeGreaterThan(0)
        controller.stop()
        expect(first.getState().status).toBe('idle')
        expect(results.finishAndSave).toHaveBeenCalledTimes(1)
        expect(results.finishAndSave).toHaveBeenCalledWith(
            expect.objectContaining({
                context: { mode: 'expedition', rulesetVersion: 2 },
                gameData: expect.objectContaining({
                    mode: 'expedition',
                    solved: false,
                }),
            })
        )

        // Play again (zero-argument start) keeps the seed and run key.
        controller.start()
        const replay = gameOf(controller)
        expect(controller.getProjection().seed).toBe(SEED_A)
        expect(replay.getState().runKey).toBe(firstRunKey)
        expect(handlers.setProjected).toHaveBeenLastCalledWith(
            expect.objectContaining({ seed: SEED_A, status: 'playing' })
        )
        expect(results.finishAndSave).toHaveBeenCalledTimes(1)
        controller.cleanup()
    })

    test('New Expedition starts a fresh seed instead of the retained run', () => {
        const { controller } = createController({}, [SEED_A, SEED_B])
        controller.selectMode('expedition')
        controller.start()
        const firstRunKey = gameOf(controller).getState().runKey
        clearStage(gameOf(controller))
        controller.stop()

        controller.newExpedition()
        const fresh = gameOf(controller)
        expect(controller.getProjection().seed).toBe(SEED_B)
        expect(fresh.getState().runKey).not.toBe(firstRunKey)
        expect(fresh.getState().status).toBe('playing')
        expect(controller.getProjection().seed).toBe(SEED_B)
        controller.cleanup()
    })

    test('route choices are deterministic and charge-gate Undo', () => {
        const { controller, handlers, results } = createController({}, [SEED_A])
        controller.selectMode('expedition')
        controller.start()
        const game = gameOf(controller)

        clearStage(game)
        clearStage(game)
        const pending = game.getState()
        expect(pending.levelIndex).toBe(2)
        expect(pending.pendingRouteChoiceAfterStage).toBe(2)
        expect(controller.getProjection().pendingRouteChoice).toBe(2)
        expect(controller.getProjection().canMove).toBe(false)

        // The model blocks movement until a route is chosen.
        const movesBefore = pending.moves
        controller.move('N')
        expect(game.getState().moves).toBe(movesBefore)

        expect(controller.chooseExpeditionRoute('safe')).toBe(true)
        expect(game.getState().pendingRouteChoiceAfterStage).toBeNull()
        expect(game.getState().undoChargesAvailable).toBe(1)
        expect(game.getState().routeChoices).toEqual(['safe'])
        expect(handlers.setProjected).toHaveBeenLastCalledWith(
            expect.objectContaining({
                pendingRouteChoice: null,
                undoCharges: 1,
                canMove: true,
            })
        )

        // Undo is charge- and snapshot-gated; no model callback fires.
        const playerBefore = { ...game.getState().player }
        controller.move(nonGoalDirection(game.getState()))
        const movesAfterMove = game.getState().moves
        expect(movesAfterMove).toBeGreaterThan(movesBefore)
        expect(controller.getProjection().canUndo).toBe(true)
        const projectedCalls = handlers.setProjected.mock.calls.length
        expect(controller.undo()).toBe(true)
        expect(handlers.setProjected.mock.calls.length).toBe(projectedCalls + 1)
        expect(handlers.setProjected).toHaveBeenLastCalledWith(
            expect.objectContaining({
                player: playerBefore,
                undoCharges: 0,
                canUndo: false,
            })
        )
        expect(game.getState().player).toEqual(playerBefore)
        expect(game.getState().moves).toBe(movesAfterMove)
        expect(controller.undo()).toBe(false)

        // Stage 4 offers the second choice; Risky raises stage 5.
        clearStage(game)
        clearStage(game)
        const stageFour = game.getState()
        expect(stageFour.pendingRouteChoiceAfterStage).toBe(4)
        expect(controller.chooseExpeditionRoute('risky')).toBe(true)
        const risked = game.getState()
        expect(risked.routeChoices).toEqual(['safe', 'risky'])
        const riskedData = game.getGameData()
        expect(riskedData.stageScoreMultipliersBps[4]).toBe(12_500)
        expect(riskedData.stageObjectiveIds[4]).toHaveLength(2)
        expect(results.finishAndSave).not.toHaveBeenCalled()
        controller.cleanup()
    })
})

describe('Ice Slide controller — no-callback actions refresh the HUD', () => {
    test('resetLevel republishes the start cursor and level moves', () => {
        const { controller, handlers } = createController()
        controller.start()
        const game = gameOf(controller)
        const start = { ...game.getState().start }
        controller.move('E')
        expect(game.getState().player).not.toEqual(start)

        const calls = handlers.setProjected.mock.calls.length
        controller.resetLevel()
        expect(handlers.setProjected.mock.calls.length).toBe(calls + 1)
        expect(handlers.setProjected).toHaveBeenLastCalledWith(
            expect.objectContaining({
                player: start,
                levelMoves: 0,
                moves: game.getState().moves,
            })
        )
        expect(game.getState().resets).toBe(1)
        controller.cleanup()
    })

    test('a zero-score stop idles with a reset HUD and no save', () => {
        const { controller, handlers, results } = createController()
        controller.start()
        controller.move('N')
        controller.stop()

        expect(controller.getGame()).toBeNull()
        expect(results.idle).toHaveBeenCalledTimes(1)
        expect(results.finishAndSave).not.toHaveBeenCalled()
        expect(results.finishLocal).not.toHaveBeenCalled()
        expect(handlers.onScore).toHaveBeenLastCalledWith(0)
        expect(handlers.onTime).toHaveBeenLastCalledWith(0)
        expect(handlers.setProjected).toHaveBeenLastCalledWith(
            expect.objectContaining({
                status: 'idle',
                rows: 0,
                canChooseMode: true,
                canMove: false,
            })
        )
        controller.cleanup()
    })

    test('Campaign and Expedition stops save only with a positive score', () => {
        const campaign = createController()
        campaign.controller.start()
        campaign.controller.stop()
        expect(campaign.results.finishAndSave).not.toHaveBeenCalled()
        expect(campaign.results.idle).toHaveBeenCalledTimes(1)
        campaign.controller.cleanup()

        const scored = createController()
        scored.controller.start()
        clearStage(gameOf(scored.controller))
        scored.controller.stop()
        expect(scored.results.finishAndSave).toHaveBeenCalledTimes(1)
        expect(scored.results.finishAndSave).toHaveBeenCalledWith({
            score: expect.any(Number),
            stats: expect.objectContaining({ gameCompleted: false }),
            gameData: expect.objectContaining({ mode: 'campaign' }),
            context: undefined,
        })
        expect(scored.results.finishAndSave.mock.calls[0][0].score).toBe(
            gameOf(scored.controller).getState().score
        )
        scored.controller.cleanup()
    })

    test('an already-stopped Stop clears the result instead of saving again', () => {
        const { controller, results } = createController({}, [SEED_A])
        controller.selectMode('expedition')
        controller.start()
        clearStage(gameOf(controller))
        controller.stop()
        expect(results.finishAndSave).toHaveBeenCalledTimes(1)

        controller.stop()
        expect(results.finishAndSave).toHaveBeenCalledTimes(1)
        expect(results.idle).toHaveBeenCalledTimes(1)
        expect(controller.getGame()).toBeNull()
        // No replay is offered after an idle stop, so the seed is dropped.
        expect(controller.getProjection()).toMatchObject({
            status: 'idle',
            seed: null,
            canChooseMode: true,
        })
        controller.cleanup()
    })
})

describe('Ice Slide initial projection', () => {
    test('matches the controller idle state and stays JSON-serializable', () => {
        const { controller } = createController()
        expect(controller.getProjection()).toEqual(ICE_SLIDE_INITIAL_PROJECTION)
        expect(
            JSON.parse(JSON.stringify(ICE_SLIDE_INITIAL_PROJECTION))
        ).toEqual(ICE_SLIDE_INITIAL_PROJECTION)
        controller.cleanup()
    })
})
