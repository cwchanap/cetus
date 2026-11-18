import { createHandleSession } from '@cetus/app-core'
import type { BaseGameStats } from '@cetus/games'
import { GameID } from '@cetus/shared/games'
import { AchievementRarity } from '@cetus/shared/achievements'
import type { ScoreSubmissionResult } from '@cetus/shared/scores'
import type { ScoreSubmissionContext } from '@cetus/shared/validations'

import { createHandleResult } from '../src/games/handleResult'

const STATS = {
    finalScore: 100,
    timeElapsed: 10,
    gameCompleted: true,
} as BaseGameStats

const IDLE_TIME = 120

function setup(
    options: {
        submitter?: jest.Mock
        resolved?: ScoreSubmissionResult
    } = {}
) {
    const { session, handlers } = createHandleSession({
        capabilities: { pausable: false, resettable: false },
        snapshot: {
            status: 'idle',
            score: 0,
            timeRemaining: IDLE_TIME,
            projected: {},
            result: null,
        },
    })
    const submitScore =
        options.submitter ??
        jest.fn().mockResolvedValue(options.resolved ?? { success: true })
    const onRewards = jest.fn()
    const onRunStart = jest.fn()
    const state = { disposed: false }
    const results = createHandleResult({
        gameId: GameID.CIRCUIT_HACKER,
        platform: 'ios',
        submitScore,
        handlers,
        onRewards,
        onRunStart,
        isDisposed: () => state.disposed,
    })
    return {
        session,
        handlers,
        results,
        submitScore,
        onRewards,
        onRunStart,
        state,
    }
}

const flush = async () => {
    await Promise.resolve()
    await Promise.resolve()
}

describe('createHandleResult', () => {
    test('beginRun resets visible score and time and clears a previous result', () => {
        const { session, results, onRunStart } = setup()

        results.beginRun(IDLE_TIME)
        results.finishLocal({ score: 55, stats: STATS })
        expect(session.getCachedSnapshot().status).toBe('finished')
        expect(session.getCachedSnapshot().score).toBe(55)

        results.beginRun(180)
        const snapshot = session.getCachedSnapshot()
        expect(snapshot.status).toBe('running')
        expect(snapshot.score).toBe(0)
        expect(snapshot.timeRemaining).toBe(180)
        expect(snapshot.result).toBeNull()
        expect(onRunStart).toHaveBeenCalledTimes(2)
    })

    test('a scored finish publishes pending, POSTs once, then settles saved with one reward delivery', async () => {
        let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
        const submitScore = jest.fn(
            () =>
                new Promise<ScoreSubmissionResult>(resolve => {
                    releaseSave = resolve
                })
        )
        const { session, results, onRewards } = setup({
            submitter: submitScore,
        })
        const context: ScoreSubmissionContext = {
            mode: 'daily',
            competitionKey: '2026-11-18',
            rulesetVersion: 1,
        }

        results.beginRun(IDLE_TIME)
        results.finishAndSave({
            score: 100,
            stats: STATS,
            gameData: { difficulty: 'easy' },
            context,
        })

        expect(session.getCachedSnapshot().result).toMatchObject({
            score: 100,
            saveStatus: 'pending',
        })
        expect(submitScore).toHaveBeenCalledTimes(1)
        expect(submitScore).toHaveBeenCalledWith({
            gameId: GameID.CIRCUIT_HACKER,
            score: 100,
            gameData: { difficulty: 'easy' },
            context,
            platform: 'ios',
        })

        releaseSave?.({
            success: true,
            newAchievements: [
                {
                    id: 'a1',
                    name: 'A',
                    description: 'd',
                    icon: 'x',
                    rarity: AchievementRarity.RARE,
                },
            ],
            challengeUpdates: {
                completedChallenges: [
                    {
                        id: 'c1',
                        name: 'C',
                        description: 'd',
                        icon: 'x',
                        xpReward: 5,
                    },
                ],
                xpEarned: 5,
                levelUp: false,
            },
        })
        await flush()

        expect(session.getCachedSnapshot().result).toMatchObject({
            saveStatus: 'saved',
            score: 100,
        })
        expect(onRewards).toHaveBeenCalledTimes(1)
        expect(onRewards).toHaveBeenCalledWith({
            achievements: [expect.objectContaining({ id: 'a1' })],
            challenges: expect.objectContaining({
                completedChallenges: [expect.objectContaining({ id: 'c1' })],
            }),
        })
        expect(submitScore).toHaveBeenCalledTimes(1)
    })

    test('a failed save reports unconfirmed with its code, never rewards, never re-POSTs', async () => {
        const submitScore = jest
            .fn()
            .mockResolvedValue({ success: false, code: 'NETWORK_ERROR' })
        const { session, results, onRewards } = setup({
            submitter: submitScore,
        })

        results.beginRun(IDLE_TIME)
        results.finishAndSave({
            score: 40,
            stats: STATS,
            gameData: { difficulty: 'easy' },
        })
        await flush()

        expect(session.getCachedSnapshot().result).toMatchObject({
            saveStatus: 'unconfirmed',
            saveCode: 'NETWORK_ERROR',
        })
        expect(onRewards).not.toHaveBeenCalled()
        expect(submitScore).toHaveBeenCalledTimes(1)
    })

    test('a throwing submitter settles unconfirmed without a code and never retries', async () => {
        const submitScore = jest.fn().mockRejectedValue(new Error('offline'))
        const { session, results, onRewards } = setup({
            submitter: submitScore,
        })

        results.beginRun(IDLE_TIME)
        results.finishAndSave({
            score: 40,
            stats: STATS,
            gameData: { difficulty: 'easy' },
        })
        await flush()

        expect(session.getCachedSnapshot().result).toMatchObject({
            saveStatus: 'unconfirmed',
        })
        expect(session.getCachedSnapshot().result?.saveCode).toBeUndefined()
        expect(onRewards).not.toHaveBeenCalled()
        expect(submitScore).toHaveBeenCalledTimes(1)
    })

    test('a late same-account save never overwrites the new run result but still forwards rewards once', async () => {
        let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
        const submitScore = jest.fn(
            () =>
                new Promise<ScoreSubmissionResult>(resolve => {
                    releaseSave = resolve
                })
        )
        const { session, results, onRewards } = setup({
            submitter: submitScore,
        })

        results.beginRun(IDLE_TIME)
        results.finishAndSave({
            score: 100,
            stats: STATS,
            gameData: { difficulty: 'easy' },
        })
        // Replay starts the next run while the old save is in flight.
        results.beginRun(180)
        expect(session.getCachedSnapshot().status).toBe('running')
        expect(session.getCachedSnapshot().result).toBeNull()

        releaseSave?.({
            success: true,
            newAchievements: [
                {
                    id: 'late',
                    name: 'Late',
                    description: 'd',
                    icon: 'x',
                    rarity: AchievementRarity.RARE,
                },
            ],
        })
        await flush()

        const snapshot = session.getCachedSnapshot()
        expect(snapshot.status).toBe('running')
        expect(snapshot.score).toBe(0)
        expect(snapshot.result).toBeNull()
        expect(onRewards).toHaveBeenCalledTimes(1)
        expect(onRewards).toHaveBeenCalledWith(
            expect.objectContaining({
                achievements: [expect.objectContaining({ id: 'late' })],
            })
        )
    })

    test('disposal suppresses late UI updates and rewards', async () => {
        let releaseSave: ((value: ScoreSubmissionResult) => void) | undefined
        const submitScore = jest.fn(
            () =>
                new Promise<ScoreSubmissionResult>(resolve => {
                    releaseSave = resolve
                })
        )
        const { results, onRewards, state } = setup({ submitter: submitScore })

        results.beginRun(IDLE_TIME)
        results.finishAndSave({
            score: 100,
            stats: STATS,
            gameData: { difficulty: 'easy' },
        })
        state.disposed = true
        releaseSave?.({
            success: true,
            newAchievements: [
                {
                    id: 'gone',
                    name: 'Gone',
                    description: 'd',
                    icon: 'x',
                    rarity: AchievementRarity.RARE,
                },
            ],
        })
        await flush()

        expect(onRewards).not.toHaveBeenCalled()
    })

    test('a finish after disposal never POSTs', () => {
        const { results, submitScore, state } = setup()
        state.disposed = true

        results.beginRun(IDLE_TIME)
        results.finishAndSave({
            score: 10,
            stats: STATS,
            gameData: {},
        })

        expect(submitScore).not.toHaveBeenCalled()
    })

    test('a local finish omits saveStatus entirely and never POSTs', () => {
        const { session, results, submitScore } = setup()

        results.beginRun(IDLE_TIME)
        results.finishLocal({ score: 0, stats: STATS })

        const result = session.getCachedSnapshot().result
        expect(session.getCachedSnapshot().status).toBe('finished')
        expect(result).toMatchObject({ score: 0 })
        expect(result).not.toHaveProperty('saveStatus')
        expect(result).not.toHaveProperty('saveCode')
        expect(submitScore).not.toHaveBeenCalled()
    })

    test('duplicate finish callbacks for one run never issue a second POST', async () => {
        const { results, submitScore } = setup()

        results.beginRun(IDLE_TIME)
        results.finishAndSave({ score: 10, stats: STATS, gameData: {} })
        results.finishAndSave({ score: 10, stats: STATS, gameData: {} })
        await flush()

        expect(submitScore).toHaveBeenCalledTimes(1)
    })
})
