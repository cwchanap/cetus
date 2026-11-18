import type { ChallengeUpdates } from '@cetus/games'
import type { AchievementNotification } from '@cetus/shared/achievements'

/** One committed reward delivery: what a finished run's save actually
 *  earned. BaseGame and handle producers both emit this shape. */
export interface NativeRewardDelivery {
    achievements?: AchievementNotification[]
    challenges?: ChallengeUpdates
}

/** Latest committed reward delivery shown in one mounted-account banner. */
export interface NativeRewardBanner {
    achievements?: AchievementNotification[]
    challenges?: ChallengeUpdates
}

const mergeById = <T extends { id: string }>(
    existing: T[],
    incoming: T[]
): T[] => {
    const seen = new Set(existing.map(item => item.id))
    return [...existing, ...incoming.filter(item => !seen.has(item.id))]
}

/**
 * ONE banner merge rule shared by both producers. Deliveries append by id
 * (never duplicate a late-settling award), keep the latest challenge
 * metadata, and return the input reference untouched when a delivery
 * carries nothing to show — the session's no-change discipline.
 */
export function mergeRewardBanner(
    current: NativeRewardBanner | null,
    delivery: NativeRewardDelivery
): NativeRewardBanner | null {
    const achievements = delivery.achievements ?? []
    const challenges = delivery.challenges?.completedChallenges ?? []
    if (achievements.length === 0 && challenges.length === 0) {
        return current
    }
    const next: NativeRewardBanner = {}
    if (current?.achievements || achievements.length > 0) {
        next.achievements = mergeById(current?.achievements ?? [], achievements)
    }
    if (delivery.challenges) {
        next.challenges = {
            ...delivery.challenges,
            completedChallenges: mergeById(
                current?.challenges?.completedChallenges ?? [],
                challenges
            ),
        }
    } else if (current?.challenges) {
        next.challenges = current.challenges
    }
    return next
}
