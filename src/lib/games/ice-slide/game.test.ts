import { afterEach, describe, expect, it, vi } from 'vitest'
import { IceSlideGame } from './game'
import { CAMPAIGN_RUN_KEY } from './run'
import { createTestRun, createTestStage } from './test-fixtures'

function expectRunMetadataPreserved(
    before: ReturnType<IceSlideGame['getState']>,
    after: ReturnType<IceSlideGame['getState']>
): void {
    expect(after).toMatchObject({
        mode: before.mode,
        runKey: before.runKey,
        runSchemaVersion: before.runSchemaVersion,
        generatorVersion: before.generatorVersion,
        rulesetVersion: before.rulesetVersion,
        stagesTotal: before.stagesTotal,
        starsEarned: before.starsEarned,
        falls: before.falls,
        resets: before.resets,
    })
    expect(after.stageSignatures).toEqual(before.stageSignatures)
}

describe('IceSlideGame', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('exposes complete Campaign metadata while idle', () => {
        const game = new IceSlideGame()
        const state = game.getState()
        const data = game.getGameData()

        expect(state).toMatchObject({
            status: 'idle',
            mode: 'campaign',
            runKey: CAMPAIGN_RUN_KEY,
            runSchemaVersion: 1,
            generatorVersion: 1,
            rulesetVersion: 1,
            stagesTotal: 8,
            starsEarned: 0,
            falls: 0,
            resets: 0,
        })
        expect(state.stageSignatures).toHaveLength(8)
        expect(data).toMatchObject({
            solved: false,
            stagesTotal: 8,
            starsEarned: 0,
            falls: 0,
            resets: 0,
        })
        expect(data.stageSignatures).toEqual(state.stageSignatures)
        expect(data.stageSignatures).not.toBe(state.stageSignatures)
        game.destroy()
    })

    it('constructs and starts the default Campaign without throwing', () => {
        const game = new IceSlideGame()
        expect(() => game.start()).not.toThrow()
        expect(game.getState().levelName).toBe('First Frost')
        game.destroy()
    })

    it('plays an explicit run according to its own stage count', () => {
        const stages = [
            createTestStage({
                id: 'test:1',
                name: 'First Test',
                rows: ['#####', '#S.G#', '#####'],
            }),
            createTestStage({
                id: 'test:2',
                name: 'Second Test',
                rows: ['#####', '#S.G#', '#####'],
            }),
        ]
        const game = new IceSlideGame()
        game.start(createTestRun(stages))

        expect(game.getState().levelName).toBe('First Test')
        game.move('E')
        expect(game.getState().levelName).toBe('Second Test')
        game.move('E')
        expect(game.getState().status).toBe('won')
        expect(game.getState().levelsCleared).toBe(2)
        game.destroy()
    })

    it('rejects an invalid explicit run before mutating prior state', () => {
        const game = new IceSlideGame()
        const before = game.getState()
        const invalid = createTestRun()
        invalid.runKey = 'invalid key'

        expect(() => game.start(invalid)).toThrow()
        expect(game.getState()).toEqual(before)
        game.destroy()
    })

    it('isolates the active run from caller mutation', () => {
        const run = createTestRun()
        const game = new IceSlideGame()
        game.start(run)

        run.stages[0].rows[1] = '#...#'
        run.stages[0].name = 'Mutated'
        run.stages[0].objectiveIds.push('no_reset')

        expect(game.getState().levelName).toBe('Test Stage')
        expect(game.getState().rows).toBe(3)
        game.destroy()
    })

    it('preserves run metadata across a normal stage advance', () => {
        const stages = [
            createTestStage({
                id: 'test:1',
                name: 'First Test',
                rows: ['#####', '#S.G#', '#####'],
            }),
            createTestStage({
                id: 'test:2',
                name: 'Second Test',
                rows: ['#####', '#S.G#', '#####'],
            }),
        ]
        const game = new IceSlideGame()
        game.start(createTestRun(stages))
        const before = game.getState()
        game.move('E')
        expect(game.getState().levelName).toBe('Second Test')
        expectRunMetadataPreserved(before, game.getState())
        game.destroy()
    })

    it('preserves run metadata across a manual resetLevel', () => {
        const game = new IceSlideGame()
        game.start(
            createTestRun([
                createTestStage({
                    id: 'reset:1',
                    name: 'Reset Test',
                    rows: ['#####', '#S..#', '#G..#', '#####'],
                }),
            ])
        )
        game.move('E')
        expect(game.getState().levelMoves).toBe(1)
        const before = game.getState()
        game.resetLevel()
        expectRunMetadataPreserved(before, game.getState())
        game.destroy()
    })

    it('preserves run metadata across a hazard reload', () => {
        const onHazard = vi.fn()
        const game = new IceSlideGame({ onHazard })
        game.start(
            createTestRun([
                createTestStage({
                    id: 'hazard:1',
                    name: 'Hazard Test',
                    rows: ['#####', '#S.H#', '#####'],
                }),
            ])
        )
        const before = game.getState()
        game.move('E')
        expect(onHazard).toHaveBeenCalled()
        expectRunMetadataPreserved(before, game.getState())
        game.destroy()
    })

    it('starts on level 1 and clears First Frost in one move', () => {
        const onLevelClear = vi.fn()
        const onWin = vi.fn()
        const game = new IceSlideGame({ onLevelClear, onWin })
        game.start()

        const state = game.getState()
        expect(state.status).toBe('playing')
        expect(state.levelIndex).toBe(0)
        expect(state.levelName).toBe('First Frost')

        game.move('S')
        expect(onLevelClear).toHaveBeenCalledWith(1)
        expect(game.getState().levelIndex).toBe(1)
        expect(game.getState().levelsCleared).toBe(1)
        expect(game.getState().score).toBeGreaterThan(0)
        expect(onWin).not.toHaveBeenCalled()
        game.destroy()
    })

    it('does not count blocked moves', () => {
        const game = new IceSlideGame()
        game.start()
        game.move('N')
        expect(game.getState().moves).toBe(0)
        game.destroy()
    })

    it('resetLevel restores player to start without wiping run score', () => {
        const onHazard = vi.fn()
        const game = new IceSlideGame({ onHazard })
        game.start()
        game.move('S') // clear level 1
        const scoreAfter = game.getState().score
        expect(scoreAfter).toBeGreaterThan(0)

        // Level 2 start is blocked to the east; move south instead.
        game.move('S')
        expect(game.getState().levelMoves).toBeGreaterThan(0)
        game.resetLevel()
        expect(onHazard).not.toHaveBeenCalled()
        expect(game.getState().player).toEqual(game.getState().start)
        expect(game.getState().levelMoves).toBe(0)
        expect(game.getState().score).toBe(scoreAfter)
        game.destroy()
    })

    it('tracks elapsed time while playing', () => {
        vi.useFakeTimers()
        const onTimeUpdate = vi.fn()
        const game = new IceSlideGame({ onTimeUpdate })
        game.start()
        vi.advanceTimersByTime(3000)
        expect(game.getState().elapsedSeconds).toBe(3)
        expect(onTimeUpdate).toHaveBeenCalled()
        game.destroy()
    })

    it('timer ticks are ignored after stop', () => {
        vi.useFakeTimers()
        const onTimeUpdate = vi.fn()
        const game = new IceSlideGame({ onTimeUpdate })
        game.start()
        game.stop()
        onTimeUpdate.mockClear()
        vi.advanceTimersByTime(3000)
        expect(onTimeUpdate).not.toHaveBeenCalled()
        expect(game.getState().elapsedSeconds).toBe(0)
        game.destroy()
    })

    it('exposes gameData shape for score submission', () => {
        const game = new IceSlideGame()
        game.start()
        game.move('S')
        const data = game.getGameData()
        expect(data).toMatchObject({
            levelsCleared: 1,
            totalMoves: 1,
            crystalsCollected: 0,
            solved: false,
            perfectLevels: 1,
        })
        expect(typeof data.elapsedSeconds).toBe('number')
        game.destroy()
    })
})
