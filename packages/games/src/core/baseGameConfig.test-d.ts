import type { BaseGameConfig } from './types'
import type { ScoreSubmitter } from '@cetus/shared/scores'

/**
 * Negative TypeScript fixture (HPA-447 Stage 2): `BaseGameConfig.submitScore`
 * is REQUIRED — a config without it must fail to compile. Verified by the
 * package typecheck (`tsc --noEmit`), not executed at runtime.
 */

const validSubmitter: ScoreSubmitter = async () => ({ success: true })

export const validConfig: BaseGameConfig = {
    duration: 60,
    pausable: true,
    resettable: true,
    submitScore: validSubmitter,
}

// @ts-expect-error — submitScore is required on BaseGameConfig; omitting it
// must be a compile error so no host can construct a game without a transport.
export const missingSubmitter: BaseGameConfig = {
    duration: 60,
    pausable: true,
    resettable: true,
}
