/**
 * Base error class for all game-related errors
 */
export class GameError extends Error {
    public readonly code: string
    public readonly context?: Record<string, unknown>
    public readonly recoverable: boolean

    constructor(
        message: string,
        code: string,
        options?: {
            context?: Record<string, unknown>
            recoverable?: boolean
            cause?: Error
        }
    ) {
        super(message)
        this.name = 'GameError'
        this.code = code
        this.context = options?.context
        this.recoverable = options?.recoverable ?? true
        if (options?.cause) {
            this.cause = options.cause
        }
    }
}

/**
 * Error thrown when game initialization fails
 */
export class GameInitializationError extends GameError {
    constructor(
        message: string,
        options?: {
            context?: Record<string, unknown>
            cause?: Error
        }
    ) {
        super(message, 'GAME_INIT_ERROR', {
            ...options,
            recoverable: true,
        })
        this.name = 'GameInitializationError'
    }
}

/**
 * Error thrown when renderer fails to initialize or render
 */
export class RenderError extends GameError {
    constructor(
        message: string,
        options?: {
            context?: Record<string, unknown>
            cause?: Error
        }
    ) {
        super(message, 'RENDER_ERROR', {
            ...options,
            recoverable: true,
        })
        this.name = 'RenderError'
    }
}

/**
 * Error thrown when required DOM elements are not found
 */
export class DOMElementNotFoundError extends GameError {
    constructor(
        elementId: string,
        options?: {
            context?: Record<string, unknown>
            cause?: Error
        }
    ) {
        super(`DOM element not found: ${elementId}`, 'DOM_ELEMENT_NOT_FOUND', {
            ...options,
            context: { ...options?.context, elementId },
            recoverable: false,
        })
        this.name = 'DOMElementNotFoundError'
    }
}

/**
 * Error thrown when game state is invalid
 */
export class InvalidGameStateError extends GameError {
    constructor(
        message: string,
        options?: {
            context?: Record<string, unknown>
            cause?: Error
        }
    ) {
        super(message, 'INVALID_GAME_STATE', {
            ...options,
            recoverable: true,
        })
        this.name = 'InvalidGameStateError'
    }
}

/**
 * Error thrown when game configuration is invalid
 */
export class InvalidConfigError extends GameError {
    constructor(
        message: string,
        options?: {
            context?: Record<string, unknown>
            cause?: Error
        }
    ) {
        super(message, 'INVALID_CONFIG', {
            ...options,
            recoverable: false,
        })
        this.name = 'InvalidConfigError'
    }
}

/**
 * Error thrown when an operation times out
 */
export class GameTimeoutError extends GameError {
    constructor(
        operation: string,
        options?: {
            context?: Record<string, unknown>
            cause?: Error
        }
    ) {
        super(`Operation timed out: ${operation}`, 'GAME_TIMEOUT', {
            ...options,
            context: { ...options?.context, operation },
            recoverable: true,
        })
        this.name = 'GameTimeoutError'
    }
}

/**
 * Error codes for quick identification
 */
export const GameErrorCodes = {
    GAME_INIT_ERROR: 'GAME_INIT_ERROR',
    RENDER_ERROR: 'RENDER_ERROR',
    DOM_ELEMENT_NOT_FOUND: 'DOM_ELEMENT_NOT_FOUND',
    INVALID_GAME_STATE: 'INVALID_GAME_STATE',
    INVALID_CONFIG: 'INVALID_CONFIG',
    GAME_TIMEOUT: 'GAME_TIMEOUT',
} as const

export type GameErrorCode = (typeof GameErrorCodes)[keyof typeof GameErrorCodes]

/**
 * Type guard to check if an error is a GameError
 */
export function isGameError(error: unknown): error is GameError {
    return error instanceof GameError
}

/**
 * Helper to wrap unknown errors in GameError
 */
export function wrapError(
    error: unknown,
    fallbackMessage: string = 'An unexpected error occurred'
): GameError {
    if (isGameError(error)) {
        return error
    }

    if (error instanceof Error) {
        return new GameError(
            error.message || fallbackMessage,
            'UNKNOWN_ERROR',
            {
                cause: error,
                recoverable: true,
            }
        )
    }

    return new GameError(
        typeof error === 'string' ? error : fallbackMessage,
        'UNKNOWN_ERROR',
        { recoverable: true }
    )
}

/**
 * Default error handler that logs errors consistently
 */
export function handleGameError(
    error: unknown,
    context?: string
): { error: GameError; shouldRetry: boolean } {
    const gameError = wrapError(error)

    const logContext = context ? `[${context}]` : ''
    console.error(
        `${logContext} ${gameError.name}: ${gameError.message}`,
        gameError.context ?? {}
    )

    return {
        error: gameError,
        shouldRetry: gameError.recoverable,
    }
}
