import type { ComponentType } from 'react'
import { GameID } from '@cetus/shared/games'
import type { ScoreSubmitter } from '@cetus/shared/scores'
import type { ScorePlatform } from '@cetus/shared/validations'
import type { BaseGame, BaseGameState } from '@cetus/games'

/**
 * Host-injected transport every native game run receives: the cookie-backed
 * `/api/scores` submitter plus the OS label that lands on `ScoreData`.
 */
export interface NativeGameHostDeps {
    submitScore: ScoreSubmitter
    platform: ScorePlatform
}

/**
 * Serializable visible-state snapshot a native view renders (copied cell
 * values, never board references). `clock` is the optional elapsed-time HUD
 * (Sudoku counts up instead of down); the shared chrome prefers it over the
 * session's `timeRemaining` snapshot when present.
 */
export interface NativeGameProjection {
    clock?: number
    [key: string]: unknown
}

export interface NativeGameViewProps {
    projected: NativeGameProjection
}

/**
 * One game's native port. Stage 2/3 commits fill this in per game; until a
 * port lands the host renders an honest arriving notice — no session, no
 * score submission, no pretend gameplay.
 */
export interface NativeGamePort {
    createGame(deps: NativeGameHostDeps): BaseGame
    project(state: BaseGameState): NativeGameProjection
    view: ComponentType<NativeGameViewProps>
}

export interface NativeGameEntry {
    port?: NativeGamePort
}

/**
 * The single native game registry (HPA-425 wave 1). Keys are computed from
 * the imported `GameID` enum members — never bare id strings — and presence
 * in this map is what the Games hub, the detail Play button and the play
 * route all consult. Eight playable, fifteen disabled.
 */
export const NATIVE_GAMES: Partial<Record<GameID, NativeGameEntry>> = {
    [GameID.MEMORY_MATRIX]: {},
    [GameID.MINE_GRID]: {},
    [GameID.PATTERN_PULSE]: {},
    [GameID.POTION_SORTER]: {},
    [GameID.QUICK_MATH]: {},
    [GameID.SUDOKU]: {},
    [GameID.WORD_SCRAMBLE]: {},
    [GameID.CHROMATIC_TIDE]: {},
}

/** Own-key lookup so unknown strings (even "__proto__") never resolve. */
export function getNativeGameEntry(
    gameId: string
): NativeGameEntry | undefined {
    return Object.hasOwn(NATIVE_GAMES, gameId)
        ? NATIVE_GAMES[gameId as GameID]
        : undefined
}

export function isNativePlayable(gameId: string): boolean {
    return getNativeGameEntry(gameId) !== undefined
}
