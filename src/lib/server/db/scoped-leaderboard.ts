import { sql } from 'kysely'
import { db } from './client'
import {
    ensureGameScoresContextSchema,
    hasCompleteGameScoresContextColumns,
} from './game-score-context'

export interface ScopedLeaderboardQuery {
    gameId: string
    mode: string
    competitionKey?: string
    limit?: number
}

export interface ScopedLeaderboardRow {
    userId: string
    name: string
    username: string | null
    image: string | null
    score: number
    created_at: string
    mode: string
    competitionKey: string | null
    rulesetVersion: number
    elapsedSeconds: number | null
    totalMoves: number | null
}

export type ScopedLeaderboardEntry = Omit<ScopedLeaderboardRow, 'userId'>

export type ScopedLeaderboardResult =
    | { success: true; rows: ScopedLeaderboardRow[] }
    | {
          success: false
          code: 'SCOPED_LEADERBOARD_UNAVAILABLE'
      }

export function toPublicScopedLeaderboardEntry(
    row: ScopedLeaderboardRow
): ScopedLeaderboardEntry {
    const { userId: _userId, ...entry } = row
    return entry
}

interface RawScopedLeaderboardRow {
    user_id: string
    name: string | null
    username: string | null
    image: string | null
    score: number
    created_at: string | Date
    mode: string
    competition_key: string | null
    ruleset_version: number
    elapsed_seconds: number | null
    total_moves: number | null
}

export async function getScopedGameLeaderboard(
    query: ScopedLeaderboardQuery
): Promise<ScopedLeaderboardResult> {
    const state = await ensureGameScoresContextSchema()
    if (
        !state.known ||
        !hasCompleteGameScoresContextColumns(state.capabilities)
    ) {
        return {
            success: false,
            code: 'SCOPED_LEADERBOARD_UNAVAILABLE',
        }
    }

    const competitionFilter =
        query.competitionKey === undefined
            ? sql``
            : sql`AND gs.competition_key = ${query.competitionKey}`
    const limit = query.limit ?? 10

    try {
        const result = await sql<RawScopedLeaderboardRow>`
            WITH scoped AS (
                SELECT
                    gs.id,
                    gs.user_id,
                    gs.score,
                    gs.created_at,
                    gs.mode,
                    gs.competition_key,
                    gs.ruleset_version,
                    CASE
                        WHEN json_valid(gs.game_data_json) = 1
                        THEN gs.game_data_json
                        ELSE NULL
                    END AS valid_json
                FROM game_scores AS gs
                WHERE gs.game_id = ${query.gameId}
                  AND gs.mode = ${query.mode}
                  AND gs.ruleset_version IS NOT NULL
                  ${competitionFilter}
            ),
            metrics AS (
                SELECT
                    *,
                    CASE
                        WHEN json_type(
                            valid_json,
                            '$.elapsedSeconds'
                        ) = 'integer'
                         AND json_extract(
                            valid_json,
                            '$.elapsedSeconds'
                         ) >= 0
                        THEN CAST(
                            json_extract(
                                valid_json,
                                '$.elapsedSeconds'
                            ) AS INTEGER
                        )
                        ELSE NULL
                    END AS elapsed_seconds,
                    CASE
                        WHEN json_type(
                            valid_json,
                            '$.totalMoves'
                        ) = 'integer'
                         AND json_extract(
                            valid_json,
                            '$.totalMoves'
                         ) >= 0
                        THEN CAST(
                            json_extract(
                                valid_json,
                                '$.totalMoves'
                            ) AS INTEGER
                        )
                        ELSE NULL
                    END AS total_moves
                FROM scoped
            ),
            ranked AS (
                SELECT
                    *,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id
                        ORDER BY
                            score DESC,
                            CASE
                                WHEN elapsed_seconds IS NULL
                                THEN 1
                                ELSE 0
                            END ASC,
                            elapsed_seconds ASC,
                            CASE
                                WHEN total_moves IS NULL
                                THEN 1
                                ELSE 0
                            END ASC,
                            total_moves ASC,
                            created_at ASC,
                            id ASC
                    ) AS user_attempt_rank
                FROM metrics
            ),
            best AS (
                SELECT *
                FROM ranked
                WHERE user_attempt_rank = 1
            )
            SELECT
                best.user_id AS user_id,
                COALESCE(
                    "user".displayName,
                    "user".username,
                    "user".name,
                    'Anonymous'
                ) AS name,
                "user".username AS username,
                "user".image AS image,
                best.score AS score,
                best.created_at AS created_at,
                best.mode AS mode,
                best.competition_key AS competition_key,
                best.ruleset_version AS ruleset_version,
                best.elapsed_seconds AS elapsed_seconds,
                best.total_moves AS total_moves
            FROM best
            LEFT JOIN "user" ON "user".id = best.user_id
            ORDER BY
                best.score DESC,
                CASE
                    WHEN best.elapsed_seconds IS NULL
                    THEN 1
                    ELSE 0
                END ASC,
                best.elapsed_seconds ASC,
                CASE
                    WHEN best.total_moves IS NULL
                    THEN 1
                    ELSE 0
                END ASC,
                best.total_moves ASC,
                best.created_at ASC,
                best.id ASC
            LIMIT ${limit}
        `.execute(db)

        return {
            success: true,
            rows: result.rows.map(row => ({
                userId: row.user_id,
                name: row.name ?? 'Anonymous',
                username: row.username ?? null,
                image: row.image ?? null,
                score: Number(row.score),
                created_at: new Date(row.created_at).toISOString(),
                mode: row.mode,
                competitionKey: row.competition_key ?? null,
                rulesetVersion: Number(row.ruleset_version),
                elapsedSeconds:
                    row.elapsed_seconds === null
                        ? null
                        : Number(row.elapsed_seconds),
                totalMoves:
                    row.total_moves === null ? null : Number(row.total_moves),
            })),
        }
    } catch (error) {
        console.error(
            '[getScopedGameLeaderboard] Database error:',
            error instanceof Error ? error.message : String(error)
        )
        return {
            success: false,
            code: 'SCOPED_LEADERBOARD_UNAVAILABLE',
        }
    }
}
