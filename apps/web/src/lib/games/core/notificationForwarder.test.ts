import { describe, it, expect, vi, afterEach } from 'vitest'
import { forwardBaseGameResults } from './notificationForwarder'
import {
    AchievementRarity,
    type AchievementNotification,
} from '@cetus/shared/achievements'
import type {
    ChallengeUpdates,
    GameEvent,
    GameEventType,
} from '@cetus/games/core/types'

// Minimal structural stand-in for BaseGame's emitter surface (the forwarder
// only needs `on`/`off`): records listeners so tests emit through the same
// registry that `on`/`off` mutate.
class FakeBaseGame {
    private listeners = new Map<GameEventType, ((event: GameEvent) => void)[]>()

    on(eventType: GameEventType, listener: (event: GameEvent) => void): void {
        const listeners = this.listeners.get(eventType) ?? []
        listeners.push(listener)
        this.listeners.set(eventType, listeners)
    }

    off(eventType: GameEventType, listener: (event: GameEvent) => void): void {
        const listeners = this.listeners.get(eventType)
        if (!listeners) {
            return
        }
        const index = listeners.indexOf(listener)
        if (index > -1) {
            listeners.splice(index, 1)
        }
    }

    emit(eventType: GameEventType, data?: Record<string, unknown>): void {
        for (const listener of [...(this.listeners.get(eventType) ?? [])]) {
            listener({ type: eventType, data, timestamp: Date.now() })
        }
    }
}

const achievements: AchievementNotification[] = [
    {
        id: 'snake_starter',
        name: 'Snake Starter',
        description: 'Earn your first point',
        icon: 'trophy',
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'snake_master',
        name: 'Snake Master',
        description: 'Score 100 points',
        icon: 'crown',
        rarity: AchievementRarity.RARE,
    },
]

const challengeUpdates: ChallengeUpdates = {
    completedChallenges: [
        {
            id: 'first_score',
            name: 'First Score',
            description: 'Earn your first score',
            icon: 'star',
            xpReward: 10,
        },
    ],
    xpEarned: 10,
    levelUp: false,
}

const structuredEnd = {
    score: 120,
    stats: { foodsEaten: 4 },
    newAchievements: achievements,
    challengeUpdates,
}

function stubToasts() {
    const showAchievementAward = vi.fn()
    const showChallengeComplete = vi.fn()
    vi.stubGlobal('showAchievementAward', showAchievementAward)
    vi.stubGlobal('showChallengeComplete', showChallengeComplete)
    return { showAchievementAward, showChallengeComplete }
}

describe('forwardBaseGameResults', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('forwards a structured end with achievements and challenge updates exactly once', () => {
        const { showAchievementAward, showChallengeComplete } = stubToasts()
        const game = new FakeBaseGame()

        forwardBaseGameResults(game)
        game.emit('end', structuredEnd)

        expect(showAchievementAward).toHaveBeenCalledTimes(1)
        expect(showAchievementAward).toHaveBeenCalledWith(achievements)
        expect(showChallengeComplete).toHaveBeenCalledTimes(1)
        expect(showChallengeComplete).toHaveBeenCalledWith(challengeUpdates)
    })

    it('ignores the bare timer end (no payload)', () => {
        const { showAchievementAward, showChallengeComplete } = stubToasts()
        const game = new FakeBaseGame()

        forwardBaseGameResults(game)
        game.emit('end')

        expect(showAchievementAward).not.toHaveBeenCalled()
        expect(showChallengeComplete).not.toHaveBeenCalled()
    })

    it('does not toast on empty arrays or undefined reward fields', () => {
        const { showAchievementAward, showChallengeComplete } = stubToasts()
        const game = new FakeBaseGame()

        forwardBaseGameResults(game)

        // Stale-run shape (BaseGame suppresses reward payloads): undefined.
        game.emit('end', { score: 5, stats: {} })
        // Explicitly empty arrays.
        game.emit('end', {
            score: 5,
            stats: {},
            newAchievements: [],
            challengeUpdates: {
                completedChallenges: [],
                xpEarned: 0,
                levelUp: false,
            },
        })

        expect(showAchievementAward).not.toHaveBeenCalled()
        expect(showChallengeComplete).not.toHaveBeenCalled()
    })

    it('remove detaches the listener and is safe to call twice', () => {
        const { showAchievementAward, showChallengeComplete } = stubToasts()
        const game = new FakeBaseGame()

        const remove = forwardBaseGameResults(game)
        remove()
        game.emit('end', structuredEnd)
        expect(showAchievementAward).not.toHaveBeenCalled()
        expect(showChallengeComplete).not.toHaveBeenCalled()

        expect(() => remove()).not.toThrow()
    })

    it('does not throw when the toast globals are absent', () => {
        const game = new FakeBaseGame()

        forwardBaseGameResults(game)

        expect(() => game.emit('end', structuredEnd)).not.toThrow()
    })
})
