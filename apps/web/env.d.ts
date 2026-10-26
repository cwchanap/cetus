/// <reference path="../.astro/types.d.ts" />

declare namespace App {
    // Note: 'import {} from ""' syntax does not work in .d.ts files.
    interface Locals {
        user: import('better-auth').User | null
        session: import('better-auth').Session | null
    }
}

interface ImportMetaEnv {
    readonly TURSO_DATABASE_URL: string
    readonly TURSO_AUTH_TOKEN: string
    readonly BETTER_AUTH_SECRET: string
    readonly BETTER_AUTH_URL?: string
    readonly GOOGLE_CLIENT_ID?: string
    readonly GOOGLE_CLIENT_SECRET?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

interface Window {
    memoryMatrixGame?: import('@/lib/games/memory-matrix/initFramework').MemoryMatrixInitResult
    showAchievementAward?: (
        achievements: import('@cetus/shared/achievements').AchievementNotification[]
    ) => void
    showChallengeComplete?: (
        challengeUpdates: import('@cetus/games').ChallengeUpdates
    ) => void
    /** Pre-hydration buffer filled by the AppLayout inline stubs and
        drained by the AppNotifications island on mount. */
    __cetusNotificationBacklog?: {
        achievements: import('@cetus/shared/achievements').AchievementNotification[]
        challenges: import('@cetus/games').ChallengeUpdates[]
    }
}
