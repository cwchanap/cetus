import { afterEach, describe, expect, it, vi } from 'vitest'
import { rectOverlap } from '@/lib/games/shared/utils'
import { GravityFlipGame } from './GravityFlipGame'
import {
    GRAVITY_FLIP_HAZARD_CATALOG,
    createGravityFlipConfig,
    getGravityFlipMoverBounds,
    type GravityFlipConfig,
} from './types'

function createGame(overrides: Partial<GravityFlipConfig> = {}) {
    return new GravityFlipGame(
        createGravityFlipConfig({
            achievementIntegration: false,
            rng: () => 0,
            ...overrides,
        })
    )
}

function expectRailsDisjointFromMover(config: GravityFlipConfig): void {
    const { minY, maxY } = getGravityFlipMoverBounds(config)
    const playerLeft = config.playerX - config.playerSize / 2
    const ceilingPlayer = {
        x: playerLeft,
        y: config.corridorInset,
        width: config.playerSize,
        height: config.playerSize,
    }
    const floorPlayer = {
        x: playerLeft,
        y: config.canvasHeight - config.corridorInset - config.playerSize,
        width: config.playerSize,
        height: config.playerSize,
    }
    const moverAtTop = {
        x: playerLeft,
        y: minY,
        width: config.moverSize,
        height: config.moverSize,
    }
    const moverAtBottom = { ...moverAtTop, y: maxY }

    expect(rectOverlap(ceilingPlayer, moverAtTop)).toBe(false)
    expect(rectOverlap(floorPlayer, moverAtBottom)).toBe(false)
}

describe('GravityFlipGame', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it('has exactly one descriptor for all five kinds', () => {
        expect(Object.keys(GRAVITY_FLIP_HAZARD_CATALOG).sort()).toEqual([
            'ceiling-gap',
            'ceiling-spike',
            'floor-gap',
            'floor-spike',
            'mover',
        ])
    })

    it('keeps default rail-resting player disjoint from mover extrema', () => {
        const config = createGravityFlipConfig()
        expect(getGravityFlipMoverBounds(config)).toEqual({
            minY: 64,
            maxY: 216,
        })
        expectRailsDisjointFromMover(config)
    })

    it('derives mover clearance from a larger player body', () => {
        const config = createGravityFlipConfig({ playerSize: 40 })
        expect(getGravityFlipMoverBounds(config)).toEqual({
            minY: 76,
            maxY: 204,
        })
        expectRailsDisjointFromMover(config)
    })

    it('fresh start authors floor-spike first with stable hazard-0 id', () => {
        const game = createGame()
        game.start()

        expect(game.getState().hazards[0]).toMatchObject({
            id: 'hazard-0',
            kind: 'floor-spike',
            x: 880,
        })
        game.destroy()
    })

    it('waits the simulation-time interpolated spacing before the next spawn', () => {
        const game = createGame({
            duration: 10,
            playerX: -1000,
            initialWorldSpeed: 100,
            finalWorldSpeed: 100,
            initialChallengeSpacing: 100,
            finalChallengeSpacing: 50,
        })
        game.start()

        for (let i = 0; i < 9; i++) {
            game.update(0.1)
        }
        expect(game.getState().hazards).toHaveLength(1)

        game.update(0.1)
        expect(game.getState().hazards).toHaveLength(2)
        game.destroy()
    })

    it('reads RNG exactly once per random challenge', () => {
        const rng = vi.fn(() => 0)
        const game = createGame({
            rng,
            playerX: -1000,
            initialWorldSpeed: 500,
            finalWorldSpeed: 500,
            initialChallengeSpacing: 50,
            finalChallengeSpacing: 50,
        })
        game.start()

        expect(rng).not.toHaveBeenCalled()
        game.update(0.1)

        expect(game.getState().hazards).toHaveLength(2)
        expect(rng).toHaveBeenCalledTimes(1)
        game.destroy()
    })

    it('does not select mover before 15 simulated seconds', () => {
        const game = createGame({
            rng: () => 0.999,
            playerX: -1000,
        })
        game.start()

        for (let i = 0; i < 149; i++) {
            game.update(0.1)
        }

        expect(
            game.getState().hazards.some(({ kind }) => kind === 'mover')
        ).toBe(false)
        game.destroy()
    })

    it('can select mover after 15 simulated seconds', () => {
        const game = createGame({
            rng: () => 0.999,
            playerX: -1000,
            initialWorldSpeed: 100,
            finalWorldSpeed: 100,
            initialChallengeSpacing: 50,
            finalChallengeSpacing: 50,
        })
        game.start()

        for (let i = 0; i < 156; i++) {
            game.update(0.1)
        }

        expect(
            game.getState().hazards.some(({ kind }) => kind === 'mover')
        ).toBe(true)
        game.destroy()
    })

    it('puts a star on the opposite surface when the surface descriptor hasStar', () => {
        const game = createGame({
            rng: () => 0.75,
            playerX: -1000,
            initialWorldSpeed: 500,
            finalWorldSpeed: 500,
            initialChallengeSpacing: 50,
            finalChallengeSpacing: 50,
        })
        game.start()
        game.update(0.1)

        expect(game.getState().hazards).toContainEqual(
            expect.objectContaining({ kind: 'ceiling-gap', x: 880 })
        )
        expect(game.getState().stars).toContainEqual(
            expect.objectContaining({
                id: 'star-3',
                x: 925,
                y: 270,
            })
        )
        game.destroy()
    })

    it('collects an overlapping star once', () => {
        const game = createGame({
            initialWorldSpeed: 0,
            finalWorldSpeed: 0,
        })
        game.start()

        expect(game.getState().stars).toHaveLength(1)
        const star = game.getState().stars[0]
        if (!star) {
            game.destroy()
            return
        }
        star.x = game.getState().player.x
        star.y = game.getState().player.y

        game.update(0.01)
        expect(game.getState().starsCollected).toBe(1)
        expect(game.getState().stars).toHaveLength(0)

        game.update(0.01)
        expect(game.getState().starsCollected).toBe(1)
        game.destroy()
    })

    it('floor/ceiling gaps only kill on their typed surface using configured tolerance', () => {
        const config = {
            gapRailTolerance: 2,
            gravityAcceleration: 0,
            initialWorldSpeed: 0,
            finalWorldSpeed: 0,
        }
        const baseConfig = createGravityFlipConfig(config)
        const half = baseConfig.playerSize / 2
        const ceilingY = baseConfig.corridorInset + half
        const floorY = baseConfig.canvasHeight - baseConfig.corridorInset - half
        const cases = [
            {
                kind: 'floor-gap' as const,
                playerY: floorY - 1.75,
                lethal: true,
            },
            { kind: 'floor-gap' as const, playerY: ceilingY, lethal: false },
            {
                kind: 'ceiling-gap' as const,
                playerY: ceilingY + 1.75,
                lethal: true,
            },
            { kind: 'ceiling-gap' as const, playerY: floorY, lethal: false },
        ]

        for (const { kind, playerY, lethal } of cases) {
            const game = createGame(config)
            game.start()
            const state = game.getState()
            expect(state.hazards).toHaveLength(1)
            const hazard = state.hazards[0]
            if (!hazard) {
                game.destroy()
                return
            }
            hazard.kind = kind
            hazard.x = state.player.x
            hazard.width = baseConfig.gapWidth
            hazard.height = baseConfig.gapHeight
            state.player.y = playerY

            game.update(0.01)
            expect(game.getState().outcome).toBe(
                lethal ? 'collision' : 'playing'
            )
            game.destroy()
        }
    })

    it('mover clamps/reverses at both safe bounds', () => {
        const config = {
            rng: () => 0.999,
            playerX: -1000,
            moverUnlockSeconds: 0,
            initialWorldSpeed: 100,
            finalWorldSpeed: 100,
            initialChallengeSpacing: 10,
            finalChallengeSpacing: 10,
        }
        const game = createGame(config)
        game.start()
        game.update(0.1)

        const mover = game
            .getState()
            .hazards.find(({ kind }) => kind === 'mover')
        expect(mover).toBeDefined()
        if (!mover) {
            game.destroy()
            return
        }
        const bounds = getGravityFlipMoverBounds(
            createGravityFlipConfig(config)
        )
        mover.y = bounds.minY - 1
        mover.verticalVelocity = -180
        game.update(createGravityFlipConfig(config).maxPhysicsStep)
        expect(mover).toMatchObject({
            y: bounds.minY,
            verticalVelocity: 180,
        })

        mover.y = bounds.maxY + 1
        mover.verticalVelocity = 180
        game.update(createGravityFlipConfig(config).maxPhysicsStep)
        expect(mover).toMatchObject({
            y: bounds.maxY,
            verticalVelocity: -180,
        })
        game.destroy()
    })

    it('overlapping lethal records still end once', () => {
        const game = createGame({
            initialWorldSpeed: 0,
            finalWorldSpeed: 0,
        })
        game.start()
        const state = game.getState()
        expect(state.hazards).toHaveLength(1)
        const hazard = state.hazards[0]
        if (!hazard) {
            game.destroy()
            return
        }
        hazard.x = state.player.x
        state.hazards.push({ ...hazard, id: 'hazard-overlap' })
        const end = vi.spyOn(game, 'end')

        game.update(0.01)

        expect(game.getState()).toMatchObject({
            outcome: 'collision',
            isGameOver: true,
            isActive: false,
        })
        expect(end).toHaveBeenCalledTimes(1)
        game.destroy()
    })

    it('collides with an 8px spike that a single 0.1s endpoint check would skip', () => {
        const game = createGame({
            canvasWidth: 164,
            spawnOffsetX: 0,
            playerX: 150,
            spikeWidth: 8,
            initialWorldSpeed: 360,
            finalWorldSpeed: 360,
        })

        game.start()
        expect(game.getState().hazards[0]).toMatchObject({
            kind: 'floor-spike',
            x: 164,
            width: 8,
        })

        game.update(0.1)

        expect(game.getState().outcome).toBe('collision')
        expect(game.getState().isGameOver).toBe(true)
        game.destroy()
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
        const game = createGame({ playerX: -1000 })
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
