import { sql } from 'kysely'
import { db } from './client'

export interface PersistedScoreContext {
    mode: string
    competitionKey: string | null
    rulesetVersion: number
    gameDataJson: string | null
}

export type SaveGameScoreFailureCode =
    'SCORE_CONTEXT_UNAVAILABLE' | 'SCORE_WRITE_FAILED'

export type SaveGameScoreResult =
    { success: true } | { success: false; code: SaveGameScoreFailureCode }

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
    /** Platform metadata column (NOT NULL DEFAULT 'web'), additive only. */
    platform: boolean
    scopedIndex: boolean
}

export type GameScoresContextState =
    | {
          known: true
          capabilities: GameScoresContextCapabilities
      }
    | { known: false }

const INDEX_NAME = 'idx_game_scores_scoped_ranking'
const RETRY_MIN_MS = 60_000
const RETRY_MAX_MS = 3_600_000

let cachedState: GameScoresContextState | null = null
let schemaPromise: Promise<GameScoresContextState> | null = null
let indexRetryDelayMs = RETRY_MIN_MS
let nextIndexRetryAt = 0
let platformRetryDelayMs = RETRY_MIN_MS
let nextPlatformRetryAt = 0

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
        platform: names.has('platform'),
        scopedIndex: indexes.rows.some(row => row.name === INDEX_NAME),
    }
}

const MISSING_COLUMN_DEFINITIONS = [
    {
        capability: 'mode' as const,
        columnName: 'mode',
        add: () =>
            sql`ALTER TABLE game_scores ADD COLUMN mode TEXT`.execute(db),
    },
    {
        capability: 'competitionKey' as const,
        columnName: 'competition_key',
        add: () =>
            sql`
                ALTER TABLE game_scores ADD COLUMN competition_key TEXT
            `.execute(db),
    },
    {
        capability: 'rulesetVersion' as const,
        columnName: 'ruleset_version',
        add: () =>
            sql`
                ALTER TABLE game_scores ADD COLUMN ruleset_version INTEGER
            `.execute(db),
    },
    {
        capability: 'gameDataJson' as const,
        columnName: 'game_data_json',
        add: () =>
            sql`
                ALTER TABLE game_scores ADD COLUMN game_data_json TEXT
            `.execute(db),
    },
]

/**
 * Add a column, tolerating a concurrent migrator that already added it.
 *
 * A second Vercel instance can run the same migration between our initial
 * schema inspection and this ALTER TABLE; SQLite then fails with
 * "duplicate column name". Re-inspect the schema after such a failure and
 * continue when the target column now exists, otherwise rethrow so the outer
 * handler reports a genuine failure instead of a stale capability snapshot.
 */
async function addColumnToleratingConcurrentMigrator(
    add: () => Promise<unknown>,
    columnName: string
): Promise<void> {
    try {
        await add()
    } catch (error) {
        const columns = await sql<{
            name: string
        }>`PRAGMA table_info(game_scores)`.execute(db)
        const nowPresent = columns.rows.some(row => row.name === columnName)
        if (nowPresent) {
            return
        }
        throw error
    }
}

async function addMissingColumns(
    capabilities: GameScoresContextCapabilities
): Promise<void> {
    for (const definition of MISSING_COLUMN_DEFINITIONS) {
        if (!capabilities[definition.capability]) {
            await addColumnToleratingConcurrentMigrator(
                definition.add,
                definition.columnName
            )
        }
    }
}

/**
 * The platform column is additive score metadata unrelated to context
 * completeness: contextual web writes never reference it and stay
 * 'web'-labeled by the DDL default. Its ALTER therefore runs isolated
 * from the context columns — a platform-only failure must never block
 * contextual web writes or downgrade the cached capability snapshot.
 *
 * A failed attempt backs off like the scoped-index retry so probes that
 * miss the fast path for other reasons don't keep re-running (and warning
 * on) a stuck ALTER. Callers that actually need the column — non-web
 * writes via requirePlatform — bypass the backoff: their insert fails
 * without it, so each attempt is their chance to recover.
 */
async function addPlatformColumnBestEffort(
    capabilities: GameScoresContextCapabilities,
    force: boolean
): Promise<GameScoresContextCapabilities> {
    if (capabilities.platform || (!force && Date.now() < nextPlatformRetryAt)) {
        return capabilities
    }

    try {
        await addColumnToleratingConcurrentMigrator(
            () =>
                sql`
                    ALTER TABLE game_scores ADD COLUMN platform TEXT NOT NULL DEFAULT 'web'
                `.execute(db),
            'platform'
        )
    } catch (error) {
        console.warn('[game-score-context] platform migration failed:', error)
        nextPlatformRetryAt = Date.now() + platformRetryDelayMs
        platformRetryDelayMs = Math.min(platformRetryDelayMs * 2, RETRY_MAX_MS)
        return capabilities
    }

    platformRetryDelayMs = RETRY_MIN_MS
    nextPlatformRetryAt = 0
    return { ...capabilities, platform: true }
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

        indexRetryDelayMs = RETRY_MIN_MS
        nextIndexRetryAt = 0
        return { ...capabilities, scopedIndex: true }
    } catch (error) {
        console.warn('[game-score-context] index creation failed:', error)
        nextIndexRetryAt = Date.now() + indexRetryDelayMs
        indexRetryDelayMs = Math.min(indexRetryDelayMs * 2, RETRY_MAX_MS)
        return capabilities
    }
}

async function inspectAndMigrate(
    options: { requirePlatform?: boolean } = {}
): Promise<GameScoresContextState> {
    try {
        let capabilities = await inspectCapabilities()
        cachedState = { known: true, capabilities }

        if (!hasCompleteGameScoresContextColumns(capabilities)) {
            await addMissingColumns(capabilities)
            capabilities = await inspectCapabilities()
            cachedState = { known: true, capabilities }
        }

        capabilities = await addPlatformColumnBestEffort(
            capabilities,
            options.requirePlatform === true
        )
        cachedState = { known: true, capabilities }

        capabilities = await createScopedIndexIfDue(capabilities)
        cachedState = { known: true, capabilities }
        return cachedState
    } catch (error) {
        console.warn('[game-score-context] capability probe failed:', error)
        // Reuse the cached state only when its context columns are confirmed
        // complete. Returning an incomplete snapshot after a failed refresh is
        // unsafe across Vercel instances: another instance may have finished
        // the migration and started accepting scoped rows, and an incomplete
        // capability set causes applyUnscopedContextIsolation to leave the
        // query unfiltered, leaking scoped rows into unscoped leaderboards and
        // bypassing the SCORE_CONTEXT_UNAVAILABLE 503 path. Fail closed.
        if (
            cachedState?.known === true &&
            hasCompleteGameScoresContextColumns(cachedState.capabilities)
        ) {
            return cachedState
        }
        return { known: false }
    }
}

export function ensureGameScoresContextSchema(
    options: { requirePlatform?: boolean } = {}
): Promise<GameScoresContextState> {
    const cachedCapabilities =
        cachedState?.known === true ? cachedState.capabilities : null

    if (
        cachedCapabilities &&
        hasCompleteGameScoresContextColumns(cachedCapabilities) &&
        // A cached snapshot without platform is not "migrated" for callers
        // that need the column: they must re-run the (idempotent) migration
        // instead of taking the fast path and failing on insert.
        (!options.requirePlatform || cachedCapabilities.platform) &&
        (cachedCapabilities.scopedIndex || Date.now() < nextIndexRetryAt)
    ) {
        return Promise.resolve(cachedState as GameScoresContextState)
    }

    if (!schemaPromise) {
        schemaPromise = inspectAndMigrate(options).finally(() => {
            schemaPromise = null
        })
    }

    return schemaPromise
}
