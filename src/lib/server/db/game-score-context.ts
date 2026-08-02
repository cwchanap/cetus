import { sql } from 'kysely'
import { db } from './client'

export interface PersistedScoreContext {
    mode: string
    competitionKey: string | null
    rulesetVersion: number
    gameDataJson: string | null
}

export type SaveGameScoreFailureCode =
    | 'SCORE_CONTEXT_UNAVAILABLE'
    | 'SCORE_WRITE_FAILED'

export type SaveGameScoreResult =
    | { success: true }
    | { success: false; code: SaveGameScoreFailureCode }

export type SaveGameScoreWithAchievementsResult =
    | { success: true; newAchievements: string[] }
    | {
          success: false
          newAchievements: []
          code: SaveGameScoreFailureCode
      }

export interface GameScoresContextCapabilities {
    mode: boolean
    competitionKey: boolean
    rulesetVersion: boolean
    gameDataJson: boolean
    scopedIndex: boolean
}

export type GameScoresContextState =
    | {
          known: true
          capabilities: GameScoresContextCapabilities
      }
    | { known: false }

const INDEX_NAME = 'idx_game_scores_scoped_ranking'
const INDEX_RETRY_MIN_MS = 60_000
const INDEX_RETRY_MAX_MS = 3_600_000

let cachedState: GameScoresContextState | null = null
let schemaPromise: Promise<GameScoresContextState> | null = null
let indexRetryDelayMs = INDEX_RETRY_MIN_MS
let nextIndexRetryAt = 0

export function hasCompleteGameScoresContextColumns(
    capabilities: GameScoresContextCapabilities
): boolean {
    return (
        capabilities.mode &&
        capabilities.competitionKey &&
        capabilities.rulesetVersion &&
        capabilities.gameDataJson
    )
}

export function getCachedGameScoresContextState(): GameScoresContextState | null {
    return cachedState
}

async function inspectCapabilities(): Promise<GameScoresContextCapabilities> {
    const columns = await sql<{
        name: string
    }>`PRAGMA table_info(game_scores)`.execute(db)
    const names = new Set(columns.rows.map(row => row.name))

    const indexes = await sql<{ name: string }>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'index' AND tbl_name = 'game_scores'
    `.execute(db)

    return {
        mode: names.has('mode'),
        competitionKey: names.has('competition_key'),
        rulesetVersion: names.has('ruleset_version'),
        gameDataJson: names.has('game_data_json'),
        scopedIndex: indexes.rows.some(row => row.name === INDEX_NAME),
    }
}

async function addMissingColumns(
    capabilities: GameScoresContextCapabilities
): Promise<void> {
    if (!capabilities.mode) {
        await sql`ALTER TABLE game_scores ADD COLUMN mode TEXT`.execute(db)
    }
    if (!capabilities.competitionKey) {
        await sql`
            ALTER TABLE game_scores ADD COLUMN competition_key TEXT
        `.execute(db)
    }
    if (!capabilities.rulesetVersion) {
        await sql`
            ALTER TABLE game_scores ADD COLUMN ruleset_version INTEGER
        `.execute(db)
    }
    if (!capabilities.gameDataJson) {
        await sql`
            ALTER TABLE game_scores ADD COLUMN game_data_json TEXT
        `.execute(db)
    }
}

async function createScopedIndexIfDue(
    capabilities: GameScoresContextCapabilities
): Promise<GameScoresContextCapabilities> {
    if (
        !hasCompleteGameScoresContextColumns(capabilities) ||
        capabilities.scopedIndex ||
        Date.now() < nextIndexRetryAt
    ) {
        return capabilities
    }

    try {
        await sql`
            CREATE INDEX IF NOT EXISTS idx_game_scores_scoped_ranking
            ON game_scores (
                game_id,
                mode,
                competition_key,
                score DESC,
                created_at ASC
            )
        `.execute(db)

        indexRetryDelayMs = INDEX_RETRY_MIN_MS
        nextIndexRetryAt = 0
        return { ...capabilities, scopedIndex: true }
    } catch (error) {
        console.warn('[game-score-context] index creation failed:', error)
        nextIndexRetryAt = Date.now() + indexRetryDelayMs
        indexRetryDelayMs = Math.min(indexRetryDelayMs * 2, INDEX_RETRY_MAX_MS)
        return capabilities
    }
}

async function inspectAndMigrate(): Promise<GameScoresContextState> {
    try {
        let capabilities = await inspectCapabilities()
        cachedState = { known: true, capabilities }

        if (!hasCompleteGameScoresContextColumns(capabilities)) {
            await addMissingColumns(capabilities)
            capabilities = await inspectCapabilities()
            cachedState = { known: true, capabilities }
        }

        capabilities = await createScopedIndexIfDue(capabilities)
        cachedState = { known: true, capabilities }
        return cachedState
    } catch (error) {
        console.warn('[game-score-context] capability probe failed:', error)
        return cachedState ?? { known: false }
    }
}

export function ensureGameScoresContextSchema(): Promise<GameScoresContextState> {
    const cachedCapabilities =
        cachedState?.known === true ? cachedState.capabilities : null

    if (
        cachedCapabilities &&
        hasCompleteGameScoresContextColumns(cachedCapabilities) &&
        (cachedCapabilities.scopedIndex || Date.now() < nextIndexRetryAt)
    ) {
        return Promise.resolve(cachedState as GameScoresContextState)
    }

    if (!schemaPromise) {
        schemaPromise = inspectAndMigrate().finally(() => {
            schemaPromise = null
        })
    }

    return schemaPromise
}
