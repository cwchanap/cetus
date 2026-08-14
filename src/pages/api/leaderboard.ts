import type { APIRoute } from 'astro'
import {
    getGameLeaderboard,
    getScopedGameLeaderboard,
    isGameLeaderboardAvailable,
    toPublicScopedLeaderboardEntry,
    type GameLeaderboardEntry,
} from '@/lib/server/db/queries'
import { getAllGames, GameID } from '@/lib/games'
import { parseIceSlideDailyRunKey } from '@/lib/games/ice-slide/run'
import {
    jsonResponse,
    badRequestResponse,
    codedErrorResponse,
    errorResponse,
} from '@/lib/server/api-utils'
import { leaderboardQuerySchema, validateQuery } from '@/lib/server/validations'

export const GET: APIRoute = async ({ url, locals }) => {
    try {
        const parsed = validateQuery(url, leaderboardQuerySchema)
        if (!parsed.success) {
            return badRequestResponse(parsed.error)
        }

        const { gameId, limit, mode, competitionKey } = parsed.data

        // If no gameId provided, return leaderboards for all games
        if (!gameId) {
            const games = getAllGames()
            const leaderboards: Record<
                string,
                Array<{
                    rank: number
                    name: string
                    score: number
                    created_at: string
                }>
            > = {}

            const results = await Promise.all(
                games.map(game => getGameLeaderboard(game.id, limit))
            )
            // A failed score-context probe is a retryable unavailable state,
            // distinct from a game genuinely having no scores (empty array).
            // The probe is global, so any unavailable result means the whole
            // batch is unavailable — surface a coded 503 instead of silently
            // returning empty leaderboards for every game.
            const unavailableResult = results.find(
                r => !isGameLeaderboardAvailable(r)
            )
            if (unavailableResult) {
                return codedErrorResponse(
                    'Score context is unavailable',
                    'SCORE_CONTEXT_UNAVAILABLE',
                    503
                )
            }

            const leaderboardResults = results as GameLeaderboardEntry[][]
            games.forEach((game, i) => {
                leaderboards[game.id] = leaderboardResults[i].map(
                    (entry, index) => ({
                        rank: index + 1,
                        ...entry,
                    })
                )
            })

            return jsonResponse({ leaderboards })
        }

        // Verify game exists
        const games = getAllGames()
        const game = games.find(g => g.id === gameId)
        if (!game) {
            return badRequestResponse('Invalid game ID')
        }

        // Scoped branch: mode present → best-per-user via scoped query
        if (mode) {
            // leaderboardQuerySchema requires the key's presence for Ice Slide
            // Daily; this route validates the Ice Slide domain grammar and
            // calendar semantics.
            if (gameId === GameID.ICE_SLIDE && mode === 'daily') {
                if (
                    !competitionKey ||
                    !parseIceSlideDailyRunKey(competitionKey)
                ) {
                    return badRequestResponse(
                        'Invalid Ice Slide Daily competitionKey'
                    )
                }
            }

            const scoped = await getScopedGameLeaderboard({
                gameId,
                mode,
                competitionKey,
                limit,
            })

            if (!scoped.success) {
                return codedErrorResponse(
                    'Scoped leaderboard is unavailable',
                    'SCOPED_LEADERBOARD_UNAVAILABLE',
                    503
                )
            }

            const viewerUserId = locals.user?.id ?? null
            const leaderboard = scoped.rows.map((row, index) => ({
                rank: index + 1,
                ...toPublicScopedLeaderboardEntry(row),
                isCurrentUser:
                    viewerUserId !== null && row.userId === viewerUserId,
            }))

            return jsonResponse({
                gameId,
                gameName: game.name,
                viewerAuthenticated: viewerUserId !== null,
                leaderboard,
            })
        }

        // Unscoped game-only branch
        const leaderboard = await getGameLeaderboard(gameId, limit)
        // A failed score-context probe is a retryable unavailable state,
        // distinct from the game genuinely having no scores (empty array).
        // Surface it as a coded 503 instead of silently reporting an empty
        // leaderboard, mirroring /api/scores/best and the scoped branch.
        if (!isGameLeaderboardAvailable(leaderboard)) {
            return codedErrorResponse(
                'Score context is unavailable',
                'SCORE_CONTEXT_UNAVAILABLE',
                503
            )
        }

        const leaderboardWithRanks = leaderboard.map((entry, index) => ({
            rank: index + 1,
            ...entry,
        }))

        return jsonResponse({
            gameId,
            gameName: game.name,
            leaderboard: leaderboardWithRanks,
        })
    } catch (_error) {
        return errorResponse('Internal server error')
    }
}
