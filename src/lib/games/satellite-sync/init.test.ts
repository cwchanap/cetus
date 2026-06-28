import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeSatelliteSync } from './init'

vi.mock('pixi.js', () => {
    const mockApp = {
        canvas: document.createElement('canvas'),
        init: vi.fn().mockResolvedValue(undefined),
        stage: { addChild: vi.fn() },
        destroy: vi.fn(),
    }
    return {
        Application: vi.fn(() => mockApp),
        Graphics: vi.fn(function (this: unknown) {
            return {
                clear: vi.fn(),
                circle: vi.fn().mockReturnThis(),
                moveTo: vi.fn().mockReturnThis(),
                lineTo: vi.fn().mockReturnThis(),
                stroke: vi.fn().mockReturnThis(),
                fill: vi.fn().mockReturnThis(),
                destroy: vi.fn(),
            }
        }),
    }
})

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn(
        (
            _id: unknown,
            _score: unknown,
            onSuccess?: (r: { newAchievements?: string[] }) => void
        ) => {
            onSuccess?.({ newAchievements: [] })
            return Promise.resolve()
        }
    ),
}))

function setupDom(): HTMLElement {
    document.body.innerHTML = `
        <div id="game-canvas-container"></div>
        <span id="score">0</span>
        <span id="time-remaining">--</span>
        <span id="level">1</span>
        <button id="start-btn"></button>
        <button id="end-btn" style="display:none"></button>
        <div id="game-over-overlay" class="hidden">
            <h2 id="game-over-title"></h2>
            <span id="final-score">0</span>
            <button id="play-again-btn"></button>
        </div>
    `
    return document.getElementById('game-canvas-container')!
}

describe('initializeSatelliteSync', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    it('returns a handle with start/stop/cleanup/getGame', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, {
            onGameStart: vi.fn(),
            onTimeUpdate: vi.fn(),
            onScoreUpdate: vi.fn(),
            onLock: vi.fn(),
            onLevelClear: vi.fn(),
            onFail: vi.fn(),
            onWin: vi.fn(),
        })
        expect(typeof handle.start).toBe('function')
        expect(typeof handle.stop).toBe('function')
        expect(typeof handle.cleanup).toBe('function')
        expect(typeof handle.getGame).toBe('function')
        handle.cleanup()
    })

    it('starts the game and updates the time element', async () => {
        const container = setupDom()
        const onTime = vi.fn()
        const handle = await initializeSatelliteSync(container, {
            onGameStart: vi.fn(),
            onTimeUpdate: onTime,
            onScoreUpdate: vi.fn(),
            onLock: vi.fn(),
            onLevelClear: vi.fn(),
            onFail: vi.fn(),
            onWin: vi.fn(),
        })
        await handle.start()
        const timeEl = document.getElementById('time-remaining')!
        expect(timeEl.textContent).toBe('60')
        handle.cleanup()
    })

    it('submits the score and shows the overlay on fail', async () => {
        const { saveGameScore } = await import('@/lib/services/scoreService')
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, {
            onGameStart: vi.fn(),
            onTimeUpdate: vi.fn(),
            onScoreUpdate: vi.fn(),
            onLock: vi.fn(),
            onLevelClear: vi.fn(),
            onFail: vi.fn(),
            onWin: vi.fn(),
        })
        await handle.start()
        vi.advanceTimersByTime(61_000)
        await Promise.resolve()
        expect(saveGameScore).toHaveBeenCalled()
        expect(
            document
                .getElementById('game-over-overlay')!
                .classList.contains('hidden')
        ).toBe(false)
        handle.cleanup()
    })

    it('surfaces a score-save failure via onError without throwing', async () => {
        const { saveGameScore } = await import('@/lib/services/scoreService')
        const container = setupDom()
        const onError = vi.fn()
        const handle = await initializeSatelliteSync(container, {
            onGameStart: vi.fn(),
            onTimeUpdate: vi.fn(),
            onScoreUpdate: vi.fn(),
            onLock: vi.fn(),
            onLevelClear: vi.fn(),
            onFail: vi.fn(),
            onWin: vi.fn(),
            onError,
        })
        vi.mocked(saveGameScore).mockImplementationOnce(
            (_id, _score, _onSuccess, onErrorCb) => {
                onErrorCb?.('Network down')
                return Promise.resolve()
            }
        )
        await handle.start()
        vi.advanceTimersByTime(61_000)
        await Promise.resolve()
        expect(onError).toHaveBeenCalledWith(
            'Score Not Saved',
            expect.stringContaining('Network down')
        )
        handle.cleanup()
    })

    it('survives a double start without throwing', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, {
            onGameStart: vi.fn(),
            onTimeUpdate: vi.fn(),
            onScoreUpdate: vi.fn(),
            onLock: vi.fn(),
            onLevelClear: vi.fn(),
            onFail: vi.fn(),
            onWin: vi.fn(),
        })
        await handle.start()
        await handle.start()
        handle.cleanup()
    })

    it('updates the level badge to the next level after a clear', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, {
            onGameStart: vi.fn(),
            onTimeUpdate: vi.fn(),
            onScoreUpdate: vi.fn(),
            onLock: vi.fn(),
            onLevelClear: vi.fn(),
            onFail: vi.fn(),
            onWin: vi.fn(),
        })
        await handle.start()
        const game = handle.getGame()!
        // Greedily clear level 1: for each target, try free satellites
        // until one locks it.
        game.update(0)
        const targetIds = game.getState().targets.map(t => t.id)
        for (const targetId of targetIds) {
            if (game.getState().targets.find(t => t.id === targetId)!.locked) {
                continue
            }
            for (const sat of game.getState().satellites) {
                if (sat.lockedTargetId) {
                    continue
                }
                game.beginAim(sat.id)
                game.aimAtTarget(sat.id, targetId)
                game.endAim(sat.id)
                if (
                    game.getState().targets.find(t => t.id === targetId)!.locked
                ) {
                    break
                }
            }
        }
        const levelEl = document.getElementById('level')!
        expect(levelEl.textContent).toBe('2')
        handle.cleanup()
    })
})

describe('initializeSatelliteSync interaction wiring', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    function baseCallbacks() {
        return {
            onGameStart: vi.fn(),
            onTimeUpdate: vi.fn(),
            onScoreUpdate: vi.fn(),
            onLock: vi.fn(),
            onLevelClear: vi.fn(),
            onFail: vi.fn(),
            onWin: vi.fn(),
        }
    }

    // The mocked PixiJS canvas has default dimensions; stub its bounding rect
    // and intrinsic size so pointer-to-satellite math resolves to real coords.
    function prepCanvas(container: HTMLElement): HTMLCanvasElement {
        const canvas = container.querySelector('canvas') as HTMLCanvasElement
        canvas.width = 520
        canvas.height = 520
        canvas.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                width: 520,
                height: 520,
                right: 520,
                bottom: 520,
                x: 0,
                y: 0,
            }) as DOMRect
        return canvas
    }

    // Pixel coordinates of a point that grabs satellite 0 (ring 0, angle 0)
    // AND aims it toward target 0 (ring 1, angle 60). We nudge 0.2 world
    // units from the satellite along the bearing to the target so the aim
    // angle lands within the 8° snap threshold.
    function grabAndAimPixel(): { x: number; y: number } {
        // layout = buildLayout(520,520,3): scale = 520*0.42 / ringRadius(2)
        // ringRadius(2) = 0.8 + 2*0.55 = 1.9; scale = 218.4/1.9 ≈ 114.947
        const scale = (520 * 0.42) / 1.9
        const cx = 260
        const cy = 260
        // sat-0 world = { 0, -0.8 }; nudge toward target-0 bearing (~84°).
        const wx = 0.199
        const wy = -0.779
        return { x: cx + wx * scale, y: cy + wy * scale }
    }

    it('stop() cancels the raf loop and stops the game without throwing', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, baseCallbacks())
        await handle.start()
        expect(handle.getGame()?.getState().status).toBe('playing')
        expect(() => handle.stop()).not.toThrow()
        expect(handle.getGame()?.getState().status).toBe('idle')
        handle.cleanup()
    })

    it('pointer down/move/up drive beginAim/updateAim/endAim on the game', async () => {
        const container = setupDom()
        const onLock = vi.fn()
        const cbs = baseCallbacks()
        cbs.onLock = onLock
        const handle = await initializeSatelliteSync(container, cbs)
        await handle.start()
        const canvas = prepCanvas(container)
        const game = handle.getGame()!
        game.update(0)
        const { x, y } = grabAndAimPixel()

        // pointerdown grabs satellite 0 and aims at target 0 -> snap candidate.
        canvas.dispatchEvent(
            new MouseEvent('pointerdown', { clientX: x, clientY: y })
        )
        expect(game.getState().satellites[0].snapCandidateId).toBe('target-0')

        // pointermove -> updateAim with a new angle (nudge further right).
        window.dispatchEvent(
            new MouseEvent('pointermove', { clientX: x + 5, clientY: y })
        )

        // pointerup -> endAim commits the lock and clears the snap candidate.
        window.dispatchEvent(new MouseEvent('pointerup', {}))
        expect(game.getState().satellites[0].snapCandidateId).toBeNull()
        expect(game.getState().targets[0].locked).toBe(true)
        handle.cleanup()
    })

    it('pointermove/up are no-ops when no satellite is being dragged', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, baseCallbacks())
        await handle.start()
        prepCanvas(container)
        // No prior pointerdown — these should not throw or mutate state.
        window.dispatchEvent(
            new MouseEvent('pointermove', { clientX: 10, clientY: 10 })
        )
        window.dispatchEvent(new MouseEvent('pointerup', {}))
        expect(
            handle.getGame()?.getState().satellites[0].lockedTargetId
        ).toBeNull()
        handle.cleanup()
    })

    it('pointerdown is ignored when the game is not playing', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, baseCallbacks())
        await handle.start()
        const canvas = prepCanvas(container)
        const { x, y } = grabAndAimPixel()
        // Stop the game -> status idle. The pointerdown handler must bail out.
        handle.stop()
        const lockedBefore = handle.getGame()?.getState().targets[0].locked
        expect(() =>
            canvas.dispatchEvent(
                new MouseEvent('pointerdown', { clientX: x, clientY: y })
            )
        ).not.toThrow()
        expect(handle.getGame()?.getState().targets[0].locked).toBe(
            lockedBefore
        )
        handle.cleanup()
    })

    it('keyboard Tab selects a satellite and arrows adjust the aim', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, baseCallbacks())
        await handle.start()
        prepCanvas(container)
        const game = handle.getGame()!
        game.update(0)
        // Pre-aim satellite 0 at target 0 so Tab's updateAim re-snaps to it.
        game.aimAtTarget('sat-0', 'target-0')
        expect(game.getState().satellites[0].snapCandidateId).toBe('target-0')

        // Tab selects the first satellite -> beginAim + updateAim (re-snap).
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
        expect(game.getState().satellites[0].snapCandidateId).toBe('target-0')

        const aimBefore = game.getState().satellites[0].aimAngle
        // ArrowRight nudges the aim by +3deg (still within snap threshold).
        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight' })
        )
        expect(game.getState().satellites[0].aimAngle).toBe(
            (aimBefore + 3 + 360) % 360
        )
        // ArrowLeft nudges by -3deg (back to the original aim).
        const aimAfterRight = game.getState().satellites[0].aimAngle
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
        expect(game.getState().satellites[0].aimAngle).toBe(
            (aimAfterRight - 3 + 360) % 360
        )

        // Enter commits the aim (endAim) and clears the keyboard selection.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        expect(game.getState().satellites[0].snapCandidateId).toBeNull()
        expect(game.getState().targets[0].locked).toBe(true)
        handle.cleanup()
    })

    it('keyboard Tab cycles to the next satellite on repeated presses', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, baseCallbacks())
        await handle.start()
        prepCanvas(container)
        const game = handle.getGame()!
        game.update(0)
        // Pre-aim satellite 0 at target 0 so the second Tab's endAim commits.
        game.aimAtTarget('sat-0', 'target-0')

        // First Tab selects satellite 0.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
        expect(game.getState().satellites[0].snapCandidateId).toBe('target-0')
        // Second Tab: endAim on satellite 0 (locks target 0), then select next.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
        expect(game.getState().targets[0].locked).toBe(true)
        expect(game.getState().satellites[0].snapCandidateId).toBeNull()
        handle.cleanup()
    })

    it('arrow keys and Enter are no-ops when no satellite is keyboard-selected', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, baseCallbacks())
        await handle.start()
        prepCanvas(container)
        const game = handle.getGame()!
        game.update(0)
        const aimBefore = game.getState().satellites[0].aimAngle

        // No Tab yet — arrows and Enter should bail out without mutating.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight' })
        )
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
        expect(game.getState().satellites[0].aimAngle).toBe(aimBefore)
        handle.cleanup()
    })

    it('keydown is ignored when the game is not playing', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, baseCallbacks())
        await handle.start()
        prepCanvas(container)
        // Stop -> status idle. keydown must bail out without throwing.
        handle.stop()
        const aimBefore = handle.getGame()?.getState().satellites[0].aimAngle
        expect(() =>
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
        ).not.toThrow()
        expect(handle.getGame()?.getState().satellites[0].aimAngle).toBe(
            aimBefore
        )
        handle.cleanup()
    })

    it('keydown is ignored while a pointer drag is active', async () => {
        const container = setupDom()
        const handle = await initializeSatelliteSync(container, baseCallbacks())
        await handle.start()
        const canvas = prepCanvas(container)
        const game = handle.getGame()!
        game.update(0)
        const { x, y } = grabAndAimPixel()

        // Start a pointer drag on satellite 0.
        canvas.dispatchEvent(
            new MouseEvent('pointerdown', { clientX: x, clientY: y })
        )
        const aimBefore = game.getState().satellites[0].aimAngle
        // While dragging, keyboard Tab must be ignored (no selection change).
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
        expect(game.getState().satellites[0].aimAngle).toBe(aimBefore)
        handle.cleanup()
    })

    it('dispatches achievementsEarned when the score save yields new achievements', async () => {
        const { saveGameScore } = await import('@/lib/services/scoreService')
        vi.mocked(saveGameScore).mockImplementationOnce(
            (_id, _score, onSuccess) => {
                onSuccess?.({ newAchievements: ['satellite_sync_combo'] })
                return Promise.resolve()
            }
        )
        const container = setupDom()
        const achievementsSpy = vi.fn()
        window.addEventListener('achievementsEarned', achievementsSpy)
        const handle = await initializeSatelliteSync(container, baseCallbacks())
        await handle.start()
        // Let the level-1 timer expire -> onFail -> submitScore.
        vi.advanceTimersByTime(61_000)
        await Promise.resolve()
        expect(achievementsSpy).toHaveBeenCalled()
        const detail = (achievementsSpy.mock.calls[0][0] as CustomEvent).detail
        expect(detail.achievementIds).toContain('satellite_sync_combo')
        window.removeEventListener('achievementsEarned', achievementsSpy)
        handle.cleanup()
    })

    it('surfaces a non-string score-save error as "Unknown error"', async () => {
        const { saveGameScore } = await import('@/lib/services/scoreService')
        vi.mocked(saveGameScore).mockImplementationOnce(
            (_id, _score, _onSuccess, onErrorCb) => {
                // Non-string error exercises the typeof fallback branch.
                onErrorCb?.({ status: 500 } as unknown as string)
                return Promise.resolve()
            }
        )
        const container = setupDom()
        const onError = vi.fn()
        const handle = await initializeSatelliteSync(container, {
            ...baseCallbacks(),
            onError,
        })
        await handle.start()
        vi.advanceTimersByTime(61_000)
        await Promise.resolve()
        expect(onError).toHaveBeenCalledWith(
            'Score Not Saved',
            expect.stringContaining('Unknown error')
        )
        handle.cleanup()
    })

    it('surfaces a thrown score-save error via onError', async () => {
        const { saveGameScore } = await import('@/lib/services/scoreService')
        vi.mocked(saveGameScore).mockImplementationOnce(() =>
            Promise.reject(new Error('server exploded'))
        )
        const container = setupDom()
        const onError = vi.fn()
        const handle = await initializeSatelliteSync(container, {
            ...baseCallbacks(),
            onError,
        })
        await handle.start()
        vi.advanceTimersByTime(61_000)
        await Promise.resolve()
        await Promise.resolve()
        expect(onError).toHaveBeenCalledWith(
            'Score Not Saved',
            expect.stringContaining('server exploded')
        )
        handle.cleanup()
    })

    it('shows the mission-complete overlay and submits the score on a full win', async () => {
        const { saveGameScore } = await import('@/lib/services/scoreService')
        const container = setupDom()
        const onWin = vi.fn()
        const handle = await initializeSatelliteSync(container, {
            ...baseCallbacks(),
            onWin,
        })
        await handle.start()
        const game = handle.getGame()!
        // Solve all 8 levels directly through the game instance.
        for (let lvl = 0; lvl < 8; lvl++) {
            game.update(0)
            const targetIds = game.getState().targets.map(t => t.id)
            for (const targetId of targetIds) {
                if (
                    game.getState().targets.find(t => t.id === targetId)!.locked
                ) {
                    continue
                }
                for (const sat of game.getState().satellites) {
                    if (sat.lockedTargetId) {
                        continue
                    }
                    game.beginAim(sat.id)
                    game.aimAtTarget(sat.id, targetId)
                    game.endAim(sat.id)
                    if (
                        game.getState().targets.find(t => t.id === targetId)!
                            .locked
                    ) {
                        break
                    }
                }
            }
        }
        await Promise.resolve()
        expect(game.getState().status).toBe('won')
        expect(onWin).toHaveBeenCalled()
        expect(saveGameScore).toHaveBeenCalled()
        expect(
            document
                .getElementById('game-over-overlay')!
                .classList.contains('hidden')
        ).toBe(false)
        expect(document.getElementById('game-over-title')!.textContent).toBe(
            'MISSION COMPLETE!'
        )
        handle.cleanup()
    })
})
