// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { forwardBaseGameResults } from './forwardBaseGameResults'
import type { BaseGame, GameEvent, GameEventType } from '@cetus/games'
import {
    AchievementRarity,
    type AchievementNotification,
} from '@cetus/shared/achievements'

// Minimal structural stand-in for BaseGame's emitter surface (the forwarder
// only needs `on`/`off`): records listeners so tests emit through the same
// registry that `on`/`off` mutate.
class FakeBaseGame implements Pick<BaseGame, 'on' | 'off'> {
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
]

const challengeUpdates = {
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

describe('forwardBaseGameResults (portable)', () => {
    it('ignores the bare timer end (no payload)', () => {
        const onAchievements = vi.fn()
        const onChallenges = vi.fn()
        const game = new FakeBaseGame()

        forwardBaseGameResults(game, { onAchievements, onChallenges })
        game.emit('end')

        expect(onAchievements).not.toHaveBeenCalled()
        expect(onChallenges).not.toHaveBeenCalled()
    })

    it('delivers each reward exactly once through the injected sinks', () => {
        const onAchievements = vi.fn()
        const onChallenges = vi.fn()
        const game = new FakeBaseGame()

        forwardBaseGameResults(game, { onAchievements, onChallenges })
        game.emit('end', {
            score: 120,
            stats: { foodsEaten: 4 },
            runId: 1,
            save: { success: true },
            newAchievements: achievements,
            challengeUpdates,
        })

        expect(onAchievements).toHaveBeenCalledTimes(1)
        expect(onAchievements).toHaveBeenCalledWith(achievements)
        expect(onChallenges).toHaveBeenCalledTimes(1)
        expect(onChallenges).toHaveBeenCalledWith(challengeUpdates)
    })

    it('does not deliver empty or undefined reward fields', () => {
        const onAchievements = vi.fn()
        const onChallenges = vi.fn()
        const game = new FakeBaseGame()

        forwardBaseGameResults(game, { onAchievements, onChallenges })

        // Stale-run shape (reward fields stripped): undefined.
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

        expect(onAchievements).not.toHaveBeenCalled()
        expect(onChallenges).not.toHaveBeenCalled()
    })

    it('forwards rewards for a same-account stale run (runId no longer current)', () => {
        // A save that resolved after a newer run started still emits its
        // structured end with the old runId; the committed rewards belong
        // to the same account and must still reach the banner sinks.
        // Stale score/results suppression is the session adapter's job.
        const onAchievements = vi.fn()
        const onChallenges = vi.fn()
        const game = new FakeBaseGame()

        forwardBaseGameResults(game, { onAchievements, onChallenges })
        game.emit('end', {
            score: 40,
            stats: {},
            runId: 41,
            save: { success: true },
            newAchievements: achievements,
            challengeUpdates,
        })

        expect(onAchievements).toHaveBeenCalledTimes(1)
        expect(onChallenges).toHaveBeenCalledTimes(1)
    })

    it('removes the listener on dispose and is safe to call twice', () => {
        const onAchievements = vi.fn()
        const onChallenges = vi.fn()
        const game = new FakeBaseGame()

        const remove = forwardBaseGameResults(game, {
            onAchievements,
            onChallenges,
        })
        remove()
        game.emit('end', {
            score: 120,
            stats: { foodsEaten: 4 },
            newAchievements: achievements,
            challengeUpdates,
        })
        expect(onAchievements).not.toHaveBeenCalled()
        expect(onChallenges).not.toHaveBeenCalled()

        expect(() => remove()).not.toThrow()
    })
})
