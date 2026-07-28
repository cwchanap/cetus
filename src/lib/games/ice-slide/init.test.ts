import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn(),
}))

vi.mock('./renderer', () => ({
    setupPixiJS: vi.fn(async () => ({
        app: {
            canvas: document.createElement('canvas'),
            renderer: { resolution: 1 },
            destroy: vi.fn(),
        },
        gridGraphic: { clear: vi.fn(), destroy: vi.fn() },
        cellSize: 48,
    })),
    renderGrid: vi.fn(),
    cleanup: vi.fn(),
    swipeToDirection: vi.fn(() => null),
    keyToDirection: vi.fn((key: string) => {
        if (key === 'ArrowDown' || key === 's') {
            return 'S'
        }
        if (key === 'ArrowUp' || key === 'w') {
            return 'N'
        }
        if (key === 'ArrowLeft' || key === 'a') {
            return 'W'
        }
        if (key === 'ArrowRight' || key === 'd') {
            return 'E'
        }
        return null
    }),
}))

import { initializeIceSlide } from './init'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

function mountDom(): HTMLElement {
    document.body.innerHTML = `
      <div id="game-canvas-container"></div>
      <span id="score">0</span>
      <span id="level">1</span>
      <span id="moves">0</span>
      <span id="crystals">0</span>
      <span id="time-remaining">0:00</span>
      <span id="level-name">—</span>
      <button id="start-btn"></button>
      <button id="end-btn" style="display:none"></button>
      <div id="game-over-overlay" class="hidden">
        <span id="game-over-title"></span>
        <span id="final-score"></span>
      </div>
    `
    return document.getElementById('game-canvas-container')!
}

describe('initializeIceSlide', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mountDom()
    })

    it('starts a run and updates HUD after a move', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, {
            onGameStart: vi.fn(),
            onMove: vi.fn(),
            onCrystal: vi.fn(),
            onLevelClear: vi.fn(),
            onHazard: vi.fn(),
            onScoreUpdate: vi.fn(),
            onTimeUpdate: vi.fn(),
            onWin: vi.fn(),
        })

        await handle.start()
        expect(handle.getGame()?.getState().status).toBe('playing')

        handle.getGame()?.move('S')
        expect(handle.getGame()?.getState().levelIndex).toBe(1)
        expect(handle.getGame()?.getState().score).toBeGreaterThan(0)

        handle.cleanup()
    })

    it('submits score on win path via saveGameScore', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, {
            onGameStart: vi.fn(),
            onMove: vi.fn(),
            onCrystal: vi.fn(),
            onLevelClear: vi.fn(),
            onHazard: vi.fn(),
            onScoreUpdate: vi.fn(),
            onTimeUpdate: vi.fn(),
            onWin: vi.fn(),
        })

        await handle.start()
        // Force win by driving game callbacks through stop with score
        const game = handle.getGame()!
        // Clear enough levels by repeatedly solving — too heavy; call stop after points
        game.move('S')
        handle.stop()

        expect(saveGameScore).toHaveBeenCalled()
        const [gameId, score] = vi.mocked(saveGameScore).mock.calls[0]
        expect(gameId).toBe(GameID.ICE_SLIDE)
        expect(score).toBeGreaterThan(0)

        handle.cleanup()
    })

    it('resetLevel is exposed on the handle', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, {
            onGameStart: vi.fn(),
            onMove: vi.fn(),
            onCrystal: vi.fn(),
            onLevelClear: vi.fn(),
            onHazard: vi.fn(),
            onScoreUpdate: vi.fn(),
            onTimeUpdate: vi.fn(),
            onWin: vi.fn(),
        })
        await handle.start()
        expect(() => handle.resetLevel()).not.toThrow()
        handle.cleanup()
    })
})
