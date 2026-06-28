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
})
