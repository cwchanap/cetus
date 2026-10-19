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

/**
 * Shared exponential-backoff state for lazy DDL retries: a failed attempt is
 * retried after the current delay, which doubles on each failure up to
 * RETRY_MAX_MS and resets on success.
 */
function createRetryBackoff(): {
    isDue: () => boolean
    onSuccess: () => void
    onFailure: () => void
} {
    let delayMs = RETRY_MIN_MS
    let nextRetryAt = 0
    return {
        isDue: () => Date.now() >= nextRetryAt,
        onSuccess: () => {
            delayMs = RETRY_MIN_MS
            nextRetryAt = 0
        },
        onFailure: () => {
            nextRetryAt = Date.now() + delayMs
            delayMs = Math.min(delayMs * 2, RETRY_MAX_MS)
        },
    }
}

const indexBackoff = createRetryBackoff()
const platformBackoff = createRetryBackoff()
// Forced (requirePlatform) attempts bypass the exponential backoff — the
// caller's insert fails without the column — but still respect a minimum
// interval so an authenticated client cannot drive one DDL attempt plus a
// warning log per request while the migration is persistently failing.
let lastPlatformAlterAttemptAt = 0

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
 * writes via requirePlatform — bypass the exponential backoff: their
 * insert fails without it, so each attempt is their chance to recover.
 * Forced attempts still respect a minimum interval between ALTER tries so
 * a client can't turn every request into a DDL attempt.
 */
async function addPlatformColumnBestEffort(
    capabilities: GameScoresContextCapabilities,
    force: boolean
): Promise<GameScoresContextCapabilities> {
    if (capabilities.platform) {
        return capabilities
    }
    if (
        force
            ? Date.now() - lastPlatformAlterAttemptAt < RETRY_MIN_MS
            : !platformBackoff.isDue()
    ) {
        return capabilities
    }
    lastPlatformAlterAttemptAt = Date.now()

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
        platformBackoff.onFailure()
        return capabilities
    }

    platformBackoff.onSuccess()
    return { ...capabilities, platform: true }
}

async function createScopedIndexIfDue(
    capabilities: GameScoresContextCapabilities
): Promise<GameScoresContextCapabilities> {
    if (
        !hasCompleteGameScoresContextColumns(capabilities) ||
        capabilities.scopedIndex ||
        !indexBackoff.isDue()
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

        indexBackoff.onSuccess()
        return { ...capabilities, scopedIndex: true }
    } catch (error) {
        console.warn('[game-score-context] index creation failed:', error)
        indexBackoff.onFailure()
        return capabilities
    }
}

async function inspectAndMigrate(
    options: { requirePlatform?: boolean } = {}
): Promise<GameScoresContextState> {
    try {
        let capabilities = await inspectCapabilities()
        cachedState = { known: true, capabilities }

        try {
            if (!hasCompleteGameScoresContextColumns(capabilities)) {
                await addMissingColumns(capabilities)
                capabilities = await inspectCapabilities()
                cachedState = { known: true, capabilities }
            }
        } finally {
            // The platform column is unrelated to context completeness, so it
            // must still be attempted when a context-column migration throws —
            // otherwise every non-web write fails on insert even when it
            // carries no context at all.
            capabilities = await addPlatformColumnBestEffort(
                capabilities,
                options.requirePlatform === true
            )
            cachedState = { known: true, capabilities }
        }

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
        (cachedCapabilities.scopedIndex || !indexBackoff.isDue())
    ) {
        return Promise.resolve(cachedState as GameScoresContextState)
    }

    if (!schemaPromise) {
        schemaPromise = inspectAndMigrate(options).finally(() => {
            schemaPromise = null
        })
    } else if (options.requirePlatform) {
        // A probe started without requirePlatform may skip the platform
        // ALTER while unforced backoff is armed, so joining it as-is could
        // hand back platform:false and fail the caller's non-web insert.
        // Follow the joined probe with a forced re-probe (itself
        // single-flighted via schemaPromise) whenever the column is still
        // missing.
        return schemaPromise.then(state => {
            if (state.known && state.capabilities.platform) {
                return state
            }
            if (!schemaPromise) {
                schemaPromise = inspectAndMigrate(options).finally(() => {
                    schemaPromise = null
                })
            }
            return schemaPromise
        })
    }

    return schemaPromise
}
