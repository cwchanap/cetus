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

/**
 * Normalize a SQLite/libSQL `created_at` value to an ISO-8601 UTC string.
 *
 * SQLite `CURRENT_TIMESTAMP` stores `'YYYY-MM-DD HH:MM:SS'` with no timezone
 * suffix. `new Date()` parses that form as LOCAL time, which would silently
 * shift timestamps across zones. We therefore treat the bare form as UTC by
 * appending a `Z` before parsing. Values that already carry a timezone offset
 * (`Z`, `+HH:MM`, `-HH:MM`) are parsed as-is. Unparseable values fall back to
 * `null` so a single malformed row cannot poison the whole result set.
 */
function normalizeCreatedAtToIso(value: string | Date): string | null {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString()
    }
    const raw = value.trim()
    if (raw === '') {
        return null
    }
    // Already has a timezone designator (Z or numeric offset) → parse directly.
    const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(raw)
    const parsed = hasTimezone ? new Date(raw) : new Date(`${raw}Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
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
    // Performance note: when competitionKey is omitted (mode-only query) the
    // scoped CTE matches every row for the game/mode, the ranked CTE numbers
    // all of them, and LIMIT is applied only after best-per-user selection.
    // Work therefore scales with the total matching row count for the game +
    // mode, not with `limit`. If per-game/mode attempt volumes grow large,
    // add a created_at retention window/filter to the scoped CTE, or back this
    // view with a materialized best-per-user table that preserves the
    // (score DESC, elapsedSeconds ASC, totalMoves ASC, created_at ASC, id ASC)
    // ranking order.

    try {
        // json_valid / json_type / json_extract are SQLite/libSQL JSON1
        // functions. json_valid returns 1 for parseable JSON; json_type
        // returns the declared type of a path element (here 'integer'), which
        // also rejects fractional numbers and strings; json_extract returns
        // the raw value, which we CAST to INTEGER for stable ordering.
        const result = await sql<RawScopedLeaderboardRow>`
            WITH scoped AS (
                -- Filter to the requested game/mode/competition and project
                -- game_data_json only when it is valid JSON; otherwise NULL so
                -- malformed payloads are excluded from metric extraction.
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
                -- Extract elapsedSeconds/totalMoves as non-negative integers.
                -- Anything missing, fractional, negative, or wrong-typed
                -- becomes NULL; the ranking CTEs order NULLs LAST via the
                -- CASE guards so valid metrics always sort ahead of missing.
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
                -- Number each user's attempts 1..N so the next CTE can keep
                -- only their single best. Tie-break order mirrors the global
                -- ranking: score DESC, then elapsed_seconds ASC (NULLs last),
                -- then total_moves ASC (NULLs last), then created_at ASC,
                -- then id ASC as the final deterministic tie-breaker.
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
                -- One row per user: their highest-ranked attempt.
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
                created_at:
                    normalizeCreatedAtToIso(row.created_at) ??
                    String(row.created_at),
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
