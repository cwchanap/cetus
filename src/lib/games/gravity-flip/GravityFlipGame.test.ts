import { afterEach, describe, expect, it, vi } from 'vitest'
import { GravityFlipGame } from './GravityFlipGame'
import { createGravityFlipConfig, type GravityFlipConfig } from './types'

function createGame(overrides: Partial<GravityFlipConfig> = {}) {
    return new GravityFlipGame(
        createGravityFlipConfig({
            achievementIntegration: false,
            rng: () => 0,
            ...overrides,
        })
    )
}

describe('GravityFlipGame', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it('starts floor-resting with downward gravity and zero velocity', () => {
        const game = createGame()
        const state = game.getState()

        expect(state.gravity).toBe('down')
        expect(state.player).toEqual({
            x: 150,
            y: 270,
            velocityY: 0,
            size: 28,
        })
        expect(state.hazards).toEqual([])
        expect(state.stars).toEqual([])
        expect(state.distance).toBe(0)
        expect(state.starsCollected).toBe(0)
        expect(state.flips).toBe(0)
        expect(state.worldSpeed).toBe(220)
    })

    it('flipGravity reverses direction, increments flips, and preserves velocityY', () => {
        const game = createGame()
        game.start()
        expect(game.flipGravity()).toBe(true)
        game.update(0.05)

        const velocityY = game.getState().player.velocityY
        expect(velocityY).toBeLessThan(0)
        expect(game.flipGravity()).toBe(true)

        expect(game.getState()).toMatchObject({
            gravity: 'down',
            flips: 2,
            player: { velocityY },
        })
        game.destroy()
    })

    it('rejects flips before start and after end', async () => {
        const game = createGame()

        expect(game.flipGravity()).toBe(false)
        game.start()
        await game.end()
        expect(game.flipGravity()).toBe(false)
    })

    it('clamps player to the floor/ceiling rails', () => {
        const game = createGame()
        game.start()

        game.update(0.1)
        expect(game.getState().player).toMatchObject({
            y: 270,
            velocityY: 0,
        })

        expect(game.flipGravity()).toBe(true)
        for (let i = 0; i < 20; i++) {
            game.update(0.1)
        }
        expect(game.getState().player).toMatchObject({
            y: 50,
            velocityY: 0,
        })
        game.destroy()
    })

    it('emits state-change callback/event when gravity changes', () => {
        const onStateChange = vi.fn()
        const game = new GravityFlipGame(
            createGravityFlipConfig({
                achievementIntegration: false,
                rng: () => 0,
            }),
            { onStateChange }
        )
        const onEvent = vi.fn()
        game.on('state-change', onEvent)
        game.start()
        onStateChange.mockClear()
        onEvent.mockClear()

        expect(game.flipGravity()).toBe(true)

        expect(onStateChange).toHaveBeenCalledWith(
            expect.objectContaining({ gravity: 'up', flips: 1 })
        )
        expect(onEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'state-change',
                data: {
                    state: expect.objectContaining({ gravity: 'up', flips: 1 }),
                },
            })
        )
        game.destroy()
    })

    it('ramps from 220 toward 360 by repeated update calls without advancing Date', () => {
        const game = createGame()
        game.start()

        expect(game.getState().worldSpeed).toBe(220)
        for (let i = 0; i < 300; i++) {
            game.update(0.1)
        }
        expect(game.getState().worldSpeed).toBeCloseTo(290)

        for (let i = 0; i < 300; i++) {
            game.update(0.1)
        }
        expect(game.getState().worldSpeed).toBeCloseTo(360)
        game.destroy()
    })

    it('does not jump difficulty when wall-clock time advances without update calls', () => {
        const now = Date.now()
        const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now)
        const game = createGame()
        game.start()
        dateNow.mockReturnValue(now + 30_000)

        expect(game.getState().worldSpeed).toBe(220)
        game.destroy()
    })

    it('produces the same score for 10x0.01s and 1x0.1s distance updates', () => {
        const config = {
            initialWorldSpeed: 5000,
            finalWorldSpeed: 5000,
        }
        const fragmented = createGame(config)
        const combined = createGame(config)
        fragmented.start()
        combined.start()

        for (let i = 0; i < 10; i++) {
            fragmented.update(0.01)
        }
        combined.update(0.1)

        expect(fragmented.getState().score).toBe(100)
        expect(fragmented.getState().score).toBe(combined.getState().score)
        fragmented.destroy()
        combined.destroy()
    })

    it('timeout marks survived before BaseGame end', async () => {
        vi.useFakeTimers()
        const onEnd = vi.fn()
        const game = new GravityFlipGame(
            createGravityFlipConfig({
                achievementIntegration: false,
                duration: 1,
                rng: () => 0,
            }),
            { onEnd }
        )
        game.start()

        await vi.advanceTimersByTimeAsync(1000)
        await Promise.resolve()

        expect(game.getState()).toMatchObject({
            outcome: 'survived',
            isGameOver: true,
            isActive: false,
        })
        expect(game.getGameStats()).toMatchObject({
            outcome: 'survived',
            gameCompleted: true,
        })
        expect(onEnd).toHaveBeenCalledWith(
            0,
            expect.objectContaining({ outcome: 'survived' })
        )
    })
})
