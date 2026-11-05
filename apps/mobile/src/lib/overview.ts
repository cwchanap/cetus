import type { UserOverviewResponse } from '@cetus/shared/api-dto'

const isNullableString = (value: unknown): value is string | null =>
    value === null || typeof value === 'string'

const isNonNegativeFinite = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0

// Runtime shape check for GET /api/user/profile. The api client returns a
// typed cast over whatever JSON arrived; screens must treat a malformed
// payload as an error state, not destructure it into a crash.
export function userOverviewResponseFor(
    data: unknown
): UserOverviewResponse | null {
    if (data === null || typeof data !== 'object') {
        return null
    }
    const candidate = data as Partial<UserOverviewResponse>
    const { profile, stats } = candidate
    if (profile === null || typeof profile !== 'object') {
        return null
    }
    if (
        typeof profile.name !== 'string' ||
        !isNullableString(profile.displayName) ||
        !isNullableString(profile.username) ||
        !isNullableString(profile.image) ||
        typeof profile.createdAt !== 'string'
    ) {
        return null
    }
    if (stats === null || typeof stats !== 'object') {
        return null
    }
    if (
        !isNonNegativeFinite(stats.totalGamesPlayed) ||
        !isNonNegativeFinite(stats.totalScore) ||
        !isNullableString(stats.favoriteGame) ||
        !isNonNegativeFinite(stats.streakDays) ||
        !isNonNegativeFinite(stats.xp) ||
        !isNonNegativeFinite(stats.level)
    ) {
        return null
    }
    if (
        !Array.isArray(candidate.earnedAchievementIds) ||
        !candidate.earnedAchievementIds.every(id => typeof id === 'string')
    ) {
        return null
    }
    return candidate as UserOverviewResponse
}
