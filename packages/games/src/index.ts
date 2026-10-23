/**
 * `@cetus/games` — portable game simulation package.
 *
 * Pure re-export barrel for the core framework (BaseGame lifecycle, timer,
 * scoring, run guard, errors). Individual game rules live in per-game
 * subpaths (e.g. `@cetus/games/tetris/TetrisGame`) and the shared
 * deterministic helpers on `@cetus/games/shared/*` subpaths; renderers and
 * DOM controllers stay in the web host. Never add executable logic to this
 * file.
 */

export { BaseGame } from './core/BaseGame'
export { GameEventEmitter } from './core/EventEmitter'
export { GameTimer } from './core/GameTimer'
export { ScoreManager } from './core/ScoreManager'
export { createRunGuard } from './core/runGuard'
export type { RunGuard } from './core/runGuard'
export {
    GameError,
    GameInitializationError,
    RenderError,
    DOMElementNotFoundError,
    InvalidGameStateError,
    InvalidConfigError,
    GameTimeoutError,
    GameErrorCodes,
    isGameError,
    wrapError,
    handleGameError,
} from './core/errors'
export type { GameErrorCode } from './core/errors'
export type {
    BaseGameState,
    BaseGameConfig,
    BaseGameCallbacks,
    BaseGameStats,
    ScoringConfig,
    ChallengeUpdates,
    GameEventType,
    GameEvent,
} from './core/types'
