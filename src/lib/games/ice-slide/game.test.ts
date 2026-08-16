import { afterEach, describe, expect, it, vi } from 'vitest'
import { IceSlideGame } from './game'
import { CAMPAIGN_RUN_KEY, createCampaignRunDefinition } from './run'
import {
    createTestDailyRun,
    createTestRun,
    createTestStage,
} from './test-fixtures'
import {
    DAILY_SCORING_CONFIG,
    EXPEDITION_SCORING_CONFIG,
    levelScore,
    timeBonus,
} from './scoring'
import { serializeBoardRows } from './transforms'
import type { IceSlideRunDefinition, IceSlideStageClearResult } from './types'

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

    it('reports an out-of-range active stage lookup', () => {
        const game = new IceSlideGame()
        game.start()

        expect(() =>
            (
                game as unknown as {
                    getStage: (index: number) => unknown
                }
            ).getStage(999)
        ).toThrow('Ice Slide stage index out of range')
        game.destroy()
    })

    it('provides five distinct canonical boards in the default Daily fixture', () => {
        const run = createTestDailyRun()
        const boardKeys = run.stages.map(stage =>
            serializeBoardRows(stage.rows)
        )

        expect(run.stages).toHaveLength(5)
        expect(new Set(boardKeys).size).toBe(5)
        expect(new Set(run.stages.map(stage => stage.signature)).size).toBe(5)
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
        game.start(
            createTestRun(stages, {
                mode: 'campaign',
                runKey: CAMPAIGN_RUN_KEY,
                seed: null,
            })
        )
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
        expect(onLevelClear).toHaveBeenCalledWith(
            expect.objectContaining({ stageNumber: 1 })
        )
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

    it('does not advance elapsed time when a timer observes an idle state', () => {
        vi.useFakeTimers()
        const onTimeUpdate = vi.fn()
        const game = new IceSlideGame({ onTimeUpdate })
        game.start()
        ;(game as unknown as { state: { status: string } }).state.status =
            'idle'
        onTimeUpdate.mockClear()
        vi.advanceTimersByTime(1000)

        expect(game.getState().elapsedSeconds).toBe(0)
        expect(onTimeUpdate).not.toHaveBeenCalled()
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

    it('tracks manual reset counters per run and per stage', () => {
        const game = new IceSlideGame()
        game.start(
            createTestRun([
                createTestStage({
                    rows: ['#####', '#S..#', '#G..#', '#####'],
                }),
            ])
        )
        game.move('E')
        const before = game.getState()

        game.resetLevel()

        const after = game.getState()
        expect(after.resets).toBe(before.resets + 1)
        expect(after.levelResets).toBe(1)
        expect(after.levelFalls).toBe(0)
        expect(after.levelMoves).toBe(0)
        game.destroy()
    })

    it('resets stage attempt counters on normal stage advance', () => {
        const onLevelClear = vi.fn()
        const game = new IceSlideGame({ onLevelClear })
        game.start(
            createTestRun([
                createTestStage({
                    id: 'daily:counter:1',
                    rows: ['#####', '#S.H#', '#G..#', '#####'],
                    parMoves: 1,
                }),
                createTestStage({
                    id: 'daily:counter:2',
                    rows: ['#####', '#S.G#', '#####'],
                    parMoves: 1,
                }),
            ])
        )

        game.move('E')
        expect(game.getState()).toMatchObject({
            levelFalls: 1,
            levelResets: 1,
            falls: 1,
            resets: 1,
        })
        game.move('S')

        const after = game.getState()
        expect(after.levelIndex).toBe(1)
        expect(after.levelFalls).toBe(0)
        expect(after.levelResets).toBe(0)
        expect(after.falls).toBe(1)
        expect(after.resets).toBe(1)
        expect(onLevelClear).toHaveBeenCalledWith(
            expect.objectContaining({
                stageNumber: 1,
                stars: expect.objectContaining({
                    bonus: null,
                }),
            })
        )
        game.destroy()
    })

    it('awards Daily clear, efficient, and bonus stars and config scoring', () => {
        const onLevelClear = vi.fn()
        const stage = createTestStage({
            id: 'daily:score:1',
            objectiveIds: ['no_falls'],
            parMoves: 1,
        })
        const game = new IceSlideGame({ onLevelClear })
        game.start(createTestDailyRun([stage]))

        game.move('E')

        const result = onLevelClear.mock.calls[0][0]
        expect(result).toEqual({
            stageNumber: 1,
            stageName: 'Test Stage',
            parMoves: 1,
            movesUsed: 1,
            crystalsCollected: 0,
            scoreGained: levelScore(
                {
                    levelNumber: 1,
                    parMoves: 1,
                    movesUsed: 1,
                    crystalsCollected: 0,
                    optionalStarsEarned: 2,
                },
                DAILY_SCORING_CONFIG
            ),
            stars: {
                clear: true,
                efficient: true,
                bonus: { id: 'no_falls', earned: true },
                earnedCount: 3,
            },
        })
        expect(game.getState().starsEarned).toBe(3)
        game.destroy()
    })

    it('awards Expedition clear, efficient, and bonus stars and config scoring', () => {
        const onLevelClear = vi.fn()
        const stage = createTestStage({
            id: 'expedition:score:1',
            objectiveIds: ['no_reset'],
            parMoves: 1,
        })
        const game = new IceSlideGame({ onLevelClear })
        game.start(createTestRun([stage]))

        game.move('E')

        const result = onLevelClear.mock.calls[0][0]
        expect(result).toEqual({
            stageNumber: 1,
            stageName: 'Test Stage',
            parMoves: 1,
            movesUsed: 1,
            crystalsCollected: 0,
            scoreGained: levelScore(
                {
                    levelNumber: 1,
                    parMoves: 1,
                    movesUsed: 1,
                    crystalsCollected: 0,
                    optionalStarsEarned: 2,
                },
                EXPEDITION_SCORING_CONFIG
            ),
            stars: {
                clear: true,
                efficient: true,
                bonus: { id: 'no_reset', earned: true },
                earnedCount: 3,
            },
        })
        expect(game.getState().starsEarned).toBe(3)
        game.destroy()
    })

    it('applies mode-specific completion time bonuses at 300 elapsed seconds', () => {
        vi.useFakeTimers()
        const oneStage = () =>
            createTestStage({
                id: 'expedition:time:1',
                objectiveIds: ['no_reset'],
                parMoves: 1,
            })
        const completeAt300 = (
            run: IceSlideRunDefinition
        ): { scoreGained: number; winScore: number } => {
            const onLevelClear = vi.fn()
            const onWin = vi.fn()
            const game = new IceSlideGame({ onLevelClear, onWin })
            game.start(run)
            vi.advanceTimersByTime(300_000)
            game.move('E')
            const result: IceSlideStageClearResult =
                onLevelClear.mock.calls[0][0]
            game.destroy()
            return {
                scoreGained: result.scoreGained,
                winScore: onWin.mock.calls[0][0],
            }
        }

        const expedition = completeAt300(createTestRun([oneStage()]))
        expect(expedition.winScore).toBe(
            expedition.scoreGained + timeBonus(300, EXPEDITION_SCORING_CONFIG)
        )
        expect(timeBonus(300, EXPEDITION_SCORING_CONFIG)).toBe(300)

        const daily = completeAt300(createTestDailyRun([oneStage()]))
        expect(daily.winScore).toBe(
            daily.scoreGained + timeBonus(300, DAILY_SCORING_CONFIG)
        )
        expect(timeBonus(300, DAILY_SCORING_CONFIG)).toBe(0)

        const campaign = completeAt300(
            createTestRun([oneStage()], {
                mode: 'campaign',
                runKey: CAMPAIGN_RUN_KEY,
                seed: null,
            })
        )
        expect(campaign.winScore).toBe(campaign.scoreGained + timeBonus(300))
        expect(timeBonus(300)).toBe(300)
    })

    it('uses stage-scoped Daily no_falls facts after an earlier fall', () => {
        const onLevelClear = vi.fn()
        const game = new IceSlideGame({ onLevelClear })
        game.start(
            createTestDailyRun([
                createTestStage({
                    id: 'daily:facts:1',
                    rows: ['#####', '#S.H#', '#G..#', '#####'],
                    objectiveIds: [],
                    parMoves: 1,
                }),
                createTestStage({
                    id: 'daily:facts:2',
                    objectiveIds: ['no_falls'],
                    parMoves: 1,
                }),
            ])
        )

        game.move('E')
        game.move('S')
        game.move('E')

        const secondResult = onLevelClear.mock.calls[1][0]
        expect(game.getState().falls).toBe(1)
        expect(secondResult.stars.bonus).toEqual({
            id: 'no_falls',
            earned: true,
        })
        game.destroy()
    })

    it('uses stage-scoped Daily no_reset facts after an earlier reset', () => {
        const onLevelClear = vi.fn()
        const game = new IceSlideGame({ onLevelClear })
        game.start(
            createTestDailyRun([
                createTestStage({
                    id: 'daily:reset-facts:1',
                    objectiveIds: [],
                }),
                createTestStage({
                    id: 'daily:reset-facts:2',
                    objectiveIds: ['no_reset'],
                }),
            ])
        )

        game.resetLevel()
        game.move('E')
        game.move('E')

        const secondResult = onLevelClear.mock.calls[1][0]
        expect(game.getState().resets).toBe(1)
        expect(secondResult.stars.bonus).toEqual({
            id: 'no_reset',
            earned: true,
        })
        game.destroy()
    })

    it('reports an inefficient Daily stage without the efficient star', () => {
        const onLevelClear = vi.fn()
        const game = new IceSlideGame({ onLevelClear })
        game.start(
            createTestDailyRun([
                createTestStage({
                    id: 'daily:over-par:1',
                    rows: ['#####', '#S..#', '#..G#', '#####'],
                    objectiveIds: ['no_falls'],
                    parMoves: 1,
                }),
            ])
        )

        game.move('S')
        game.move('E')

        expect(onLevelClear.mock.calls[0][0].stars).toEqual({
            clear: true,
            efficient: false,
            bonus: { id: 'no_falls', earned: true },
            earnedCount: 2,
        })
        game.destroy()
    })

    it('reports Daily reset and hazard objective failures', () => {
        const resetClear = vi.fn()
        const resetGame = new IceSlideGame({ onLevelClear: resetClear })
        resetGame.start(
            createTestDailyRun([
                createTestStage({
                    id: 'daily:no-reset:1',
                    objectiveIds: ['no_reset'],
                }),
            ])
        )
        resetGame.resetLevel()
        resetGame.move('E')
        expect(resetClear.mock.calls[0][0].stars).toEqual({
            clear: true,
            efficient: true,
            bonus: { id: 'no_reset', earned: false },
            earnedCount: 2,
        })
        resetGame.destroy()

        const hazardClear = vi.fn()
        const hazardGame = new IceSlideGame({ onLevelClear: hazardClear })
        hazardGame.start(
            createTestDailyRun([
                createTestStage({
                    id: 'daily:no-falls:1',
                    rows: ['#####', '#S.H#', '#G..#', '#####'],
                    objectiveIds: ['no_falls'],
                    parMoves: 1,
                }),
            ])
        )
        hazardGame.move('E')
        hazardGame.move('S')
        expect(hazardClear.mock.calls[0][0].stars).toEqual({
            clear: true,
            efficient: false,
            bonus: { id: 'no_falls', earned: false },
            earnedCount: 1,
        })
        hazardGame.destroy()
    })

    it('reports collect-all based on crystals in the source stage', () => {
        const collected = vi.fn()
        const collectedGame = new IceSlideGame({ onLevelClear: collected })
        collectedGame.start(
            createTestDailyRun([
                createTestStage({
                    id: 'daily:crystals:1',
                    rows: ['######', '#SC.G#', '######'],
                    objectiveIds: ['collect_all_crystals'],
                    parMoves: 1,
                }),
            ])
        )
        collectedGame.move('E')
        expect(collected.mock.calls[0][0].stars.bonus).toEqual({
            id: 'collect_all_crystals',
            earned: true,
        })
        collectedGame.destroy()

        const missed = vi.fn()
        const missedGame = new IceSlideGame({ onLevelClear: missed })
        missedGame.start(
            createTestDailyRun([
                createTestStage({
                    id: 'daily:crystals:2',
                    rows: ['#######', '#S..G.#', '#..C..#', '#######'],
                    objectiveIds: ['collect_all_crystals'],
                    parMoves: 1,
                }),
            ])
        )
        missedGame.move('E')
        expect(missed.mock.calls[0][0].stars.bonus).toEqual({
            id: 'collect_all_crystals',
            earned: false,
        })
        missedGame.destroy()
    })

    it('completes the default five-stage Daily run with accumulated stars', () => {
        vi.useFakeTimers()
        const events: string[] = []
        const onLevelClear = vi.fn((result: IceSlideStageClearResult) => {
            void result
            events.push('level-clear')
        })
        const onWin = vi.fn(() => events.push('win'))
        const game = new IceSlideGame({ onLevelClear, onWin })
        game.start(createTestDailyRun())
        vi.advanceTimersByTime(301_000)
        for (const stageMoves of [
            ['E'],
            ['S'],
            ['E'],
            ['S', 'E'],
            ['S', 'E'],
        ]) {
            for (const direction of stageMoves) {
                game.move(direction as 'N' | 'E' | 'S' | 'W')
            }
        }

        expect(onLevelClear).toHaveBeenCalledTimes(5)
        expect(game.getState().starsEarned).toBe(15)
        expect(game.getState().levelsCleared).toBe(5)
        expect(events).toEqual([
            'level-clear',
            'level-clear',
            'level-clear',
            'level-clear',
            'level-clear',
            'win',
        ])
        const stageScore = onLevelClear.mock.calls.reduce(
            (total, [result]) => total + result.scoreGained,
            0
        )
        expect(onWin).toHaveBeenCalledWith(
            stageScore + timeBonus(301, DAILY_SCORING_CONFIG)
        )
        game.destroy()
    })

    it('preserves Campaign scoring and does not accumulate stars', () => {
        vi.useFakeTimers()
        const events: string[] = []
        const onLevelClear = vi.fn((result: IceSlideStageClearResult) => {
            void result
            events.push('level-clear')
        })
        const onWin = vi.fn(() => events.push('win'))
        const game = new IceSlideGame({ onLevelClear, onWin })
        game.start(createCampaignRunDefinition())
        const campaignSolutions = [
            ['S'],
            ['S', 'E', 'S'],
            ['E', 'S', 'E', 'S'],
            ['E', 'S', 'W', 'S', 'E'],
            ['S', 'E', 'N', 'W', 'S', 'E'],
            ['S', 'E', 'S'],
            ['S', 'E', 'N', 'W', 'S', 'E'],
            ['S', 'E', 'N', 'W', 'S', 'E'],
        ]
        for (const stageMoves of campaignSolutions) {
            for (const direction of stageMoves) {
                game.move(direction as 'N' | 'E' | 'S' | 'W')
            }
        }

        expect(events).toEqual([
            'level-clear',
            'level-clear',
            'level-clear',
            'level-clear',
            'level-clear',
            'level-clear',
            'level-clear',
            'level-clear',
            'win',
        ])
        expect(game.getState().starsEarned).toBe(0)
        expect(onLevelClear).toHaveBeenCalledTimes(8)
        expect(onLevelClear.mock.calls[0][0]).toMatchObject({
            scoreGained: levelScore({
                levelNumber: 1,
                parMoves: 1,
                movesUsed: 1,
                crystalsCollected: 0,
            }),
            stars: {
                clear: true,
                efficient: true,
                bonus: null,
                earnedCount: 0,
            },
        })
        const stageScore = onLevelClear.mock.calls.reduce(
            (total, [result]) => total + result.scoreGained,
            0
        )
        expect(onWin).toHaveBeenCalledWith(stageScore + timeBonus(0))
        game.destroy()
    })
})
