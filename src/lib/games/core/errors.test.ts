import { describe, it, expect, vi } from 'vitest'
import {
    GameError,
    GameInitializationError,
    RenderError,
    DOMElementNotFoundError,
    InvalidGameStateError,
    InvalidConfigError,
    GameTimeoutError,
    isGameError,
    wrapError,
    handleGameError,
    GameErrorCodes,
} from './errors'

describe('GameError', () => {
    it('should create error with message and code', () => {
        const error = new GameError('Test error', GameErrorCodes.UNKNOWN_ERROR)

        expect(error.message).toBe('Test error')
        expect(error.code).toBe(GameErrorCodes.UNKNOWN_ERROR)
        expect(error.name).toBe('GameError')
        expect(error.recoverable).toBe(true)
    })

    it('should accept context and cause', () => {
        const cause = new Error('Original error')
        const error = new GameError(
            'Test error',
            GameErrorCodes.UNKNOWN_ERROR,
            {
                context: { key: 'value' },
                cause,
            }
        )

        expect(error.context).toEqual({ key: 'value' })
        expect(error.cause).toBe(cause)
    })

    it('should allow setting recoverable to false', () => {
        const error = new GameError(
            'Test error',
            GameErrorCodes.UNKNOWN_ERROR,
            {
                recoverable: false,
            }
        )

        expect(error.recoverable).toBe(false)
    })
})

describe('GameInitializationError', () => {
    it('should have correct name and code', () => {
        const error = new GameInitializationError('Init failed')

        expect(error.name).toBe('GameInitializationError')
        expect(error.code).toBe('GAME_INIT_ERROR')
        expect(error.recoverable).toBe(true)
    })
})

describe('RenderError', () => {
    it('should have correct name and code', () => {
        const error = new RenderError('Render failed')

        expect(error.name).toBe('RenderError')
        expect(error.code).toBe('RENDER_ERROR')
        expect(error.recoverable).toBe(true)
    })
})

describe('DOMElementNotFoundError', () => {
    it('should include element ID in message', () => {
        const error = new DOMElementNotFoundError('game-container')

        expect(error.message).toBe('DOM element not found: game-container')
        expect(error.code).toBe('DOM_ELEMENT_NOT_FOUND')
        expect(error.context?.elementId).toBe('game-container')
        expect(error.recoverable).toBe(false)
    })
})

describe('InvalidGameStateError', () => {
    it('should have correct name and code', () => {
        const error = new InvalidGameStateError('Invalid state')

        expect(error.name).toBe('InvalidGameStateError')
        expect(error.code).toBe('INVALID_GAME_STATE')
        expect(error.recoverable).toBe(true)
    })
})

describe('InvalidConfigError', () => {
    it('should have correct name and code', () => {
        const error = new InvalidConfigError('Invalid config')

        expect(error.name).toBe('InvalidConfigError')
        expect(error.code).toBe('INVALID_CONFIG')
        expect(error.recoverable).toBe(false)
    })
})

describe('GameTimeoutError', () => {
    it('should include operation in message', () => {
        const error = new GameTimeoutError('loading assets')

        expect(error.message).toBe('Operation timed out: loading assets')
        expect(error.code).toBe('GAME_TIMEOUT')
        expect(error.context?.operation).toBe('loading assets')
        expect(error.recoverable).toBe(true)
    })
})

describe('isGameError', () => {
    it('should return true for GameError instances', () => {
        expect(
            isGameError(new GameError('test', GameErrorCodes.UNKNOWN_ERROR))
        ).toBe(true)
        expect(isGameError(new GameInitializationError('test'))).toBe(true)
        expect(isGameError(new RenderError('test'))).toBe(true)
    })

    it('should return false for non-GameError instances', () => {
        expect(isGameError(new Error('test'))).toBe(false)
        expect(isGameError('test')).toBe(false)
        expect(isGameError(null)).toBe(false)
        expect(isGameError(undefined)).toBe(false)
    })
})

describe('wrapError', () => {
    it('should return GameError as-is', () => {
        const original = new GameError('test', GameErrorCodes.UNKNOWN_ERROR)
        const wrapped = wrapError(original)

        expect(wrapped).toBe(original)
    })

    it('should wrap Error instances', () => {
        const original = new Error('test error')
        const wrapped = wrapError(original)

        expect(wrapped).toBeInstanceOf(GameError)
        expect(wrapped.message).toBe('test error')
        expect(wrapped.cause).toBe(original)
    })

    it('should wrap string errors', () => {
        const wrapped = wrapError('string error')

        expect(wrapped).toBeInstanceOf(GameError)
        expect(wrapped.message).toBe('string error')
    })

    it('should use fallback message for unknown types', () => {
        const wrapped = wrapError(null, 'Fallback message')

        expect(wrapped.message).toBe('Fallback message')
    })
})

describe('handleGameError', () => {
    it('should log error and return error with retry flag', () => {
        const consoleSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        const error = new GameError('test', GameErrorCodes.UNKNOWN_ERROR, {
            recoverable: true,
        })

        const result = handleGameError(error, 'TestContext')

        expect(result.error).toBe(error)
        expect(result.shouldRetry).toBe(true)
        expect(consoleSpy).toHaveBeenCalled()

        consoleSpy.mockRestore()
    })

    it('should wrap non-GameError before handling', () => {
        const consoleSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})
        const error = new Error('regular error')

        const result = handleGameError(error)

        expect(result.error).toBeInstanceOf(GameError)
        expect(result.error.message).toBe('regular error')

        consoleSpy.mockRestore()
    })
})

describe('GameErrorCodes', () => {
    it('should have all expected error codes', () => {
        expect(GameErrorCodes.GAME_INIT_ERROR).toBe('GAME_INIT_ERROR')
        expect(GameErrorCodes.RENDER_ERROR).toBe('RENDER_ERROR')
        expect(GameErrorCodes.DOM_ELEMENT_NOT_FOUND).toBe(
            'DOM_ELEMENT_NOT_FOUND'
        )
        expect(GameErrorCodes.INVALID_GAME_STATE).toBe('INVALID_GAME_STATE')
        expect(GameErrorCodes.INVALID_CONFIG).toBe('INVALID_CONFIG')
        expect(GameErrorCodes.GAME_TIMEOUT).toBe('GAME_TIMEOUT')
    })
})
