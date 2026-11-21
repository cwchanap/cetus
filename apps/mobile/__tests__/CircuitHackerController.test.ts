import { CircuitHackerGame } from '@cetus/games/circuit-hacker/game'
import { DIFFICULTY_CONFIGS } from '@cetus/games/circuit-hacker/utils'

import { CircuitHackerController } from '../src/games/circuit-hacker/controller'

const controllers: CircuitHackerController[] = []

afterEach(() => {
    for (const controller of controllers.splice(0)) {
        controller.cleanup()
    }
})

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

const createController = () => {
    const handlers = makeHandlers()
    const results = makeResults()
    const controller = new CircuitHackerController(
        { handlers, results },
        'easy'
    )
    controllers.push(controller)
    return { controller, handlers, results }
}

const gameOf = (controller: CircuitHackerController): CircuitHackerGame => {
    const game = controller.getGame()
    if (!game) {
        throw new Error('no live Circuit Hacker model')
    }
    return game
}

/** Drives the production `rotateTile` path to the model's own solution. */
const solveBoard = (controller: CircuitHackerController) => {
    const game = gameOf(controller)
    const solution = (
        game as unknown as {
            puzzle: { solutionOrientations: number[][] }
        }
    ).puzzle.solutionOrientations
    const state = game.getState()
    for (let row = 0; row < state.rows; row++) {
        for (let col = 0; col < state.cols; col++) {
            const tile = state.grid[row][col]
            if (tile.locked) {
                continue
            }
            while (
                !game.getState().solved &&
                tile.orientation !== solution[row][col]
            ) {
                controller.rotateTile(row, col)
            }
            if (game.getState().solved) {
                return
            }
        }
    }
    throw new Error('board was not solved by the generated solution')
}

describe('CircuitHackerController result stats', () => {
    test('a solve finishes with populated BaseGameStats fields', () => {
        const { controller, results } = createController()
        controller.start()
        solveBoard(controller)

        expect(results.finishAndSave).toHaveBeenCalledTimes(1)
        const finish = results.finishAndSave.mock.calls[0][0]
        const stats = gameOf(controller).getStats()
        expect(finish.stats).toMatchObject({
            finalScore: stats.finalScore,
            timeElapsed:
                DIFFICULTY_CONFIGS.easy.duration - stats.secondsRemaining,
            gameCompleted: true,
            solved: true,
        })
    })

    test('a manual stop finishes locally with populated BaseGameStats fields', () => {
        const { controller, results } = createController()
        controller.start()
        controller.stop()

        expect(results.finishLocal).toHaveBeenCalledTimes(1)
        const finish = results.finishLocal.mock.calls[0][0]
        expect(finish.stats).toMatchObject({
            gameCompleted: false,
            solved: false,
        })
        expect(finish.stats.timeElapsed).toBe(
            DIFFICULTY_CONFIGS.easy.duration - finish.stats.secondsRemaining
        )
        expect(results.finishAndSave).not.toHaveBeenCalled()
    })
})
