import { GameID } from '@/lib/games'
import type { BaseGameCallbacks, BaseGameStats } from '@/lib/games/core/types'
import { BejeweledGame } from './game'
import { JEWEL_TYPES, type BejeweledConfig } from './types'
import { BejeweledRenderer, type BejeweledRendererConfig } from './renderer'

const DEFAULT_CONFIG: BejeweledConfig = {
    duration: 60,
    achievementIntegration: true,
    pausable: true,
    resettable: true,
    rows: 8,
    cols: 8,
    jewelTypes: JEWEL_TYPES,
    minMatch: 3,
    pointsPerJewel: 10,
}

const DEFAULT_RENDERER_CONFIG: BejeweledRendererConfig = {
    type: 'canvas',
    container: '#bejeweled-container',
    responsive: true,
    backgroundColor: 0x070b16,
    antialias: true,
    gridPadding: 12,
    cellPadding: 6,
}

export interface BejeweledInitResult {
    game: BejeweledGame
    renderer: BejeweledRenderer
    cleanup: () => void
}

export async function initBejeweledGame(
    customConfig?: Partial<BejeweledConfig>,
    customCallbacks?: BaseGameCallbacks,
    customRendererConfig?: Partial<BejeweledRendererConfig>
): Promise<BejeweledInitResult> {
    const config: BejeweledConfig = { ...DEFAULT_CONFIG, ...customConfig }
    const rendererConfig: BejeweledRendererConfig = {
        ...DEFAULT_RENDERER_CONFIG,
        ...customRendererConfig,
    }

    const renderer = new BejeweledRenderer(rendererConfig)
    await renderer.initialize()

    // Enhance callbacks to wire up rendering + UI updates
    const enhancedCallbacks: BaseGameCallbacks = {
        ...customCallbacks,
        onStateChange: state => {
            renderer.render(state)
            customCallbacks?.onStateChange?.(state)
        },
        onScoreUpdate: score => {
            const scoreEl = document.getElementById('score')
            if (scoreEl) {
                scoreEl.textContent = String(score)
            }
            customCallbacks?.onScoreUpdate?.(score)
        },
        onTimeUpdate: time => {
            const timeEl = document.getElementById('time-remaining')
            if (timeEl) {
                timeEl.textContent = String(time)
            }
            customCallbacks?.onTimeUpdate?.(time)
        },
        onStart: () => {
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement | null
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement | null
            if (startBtn && endBtn) {
                startBtn.style.display = 'none'
                endBtn.style.display = 'inline-flex'
            }
            const overlay = document.getElementById('game-over-overlay')
            if (overlay) {
                overlay.classList.add('hidden')
            }
            customCallbacks?.onStart?.()
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement | null
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement | null
            if (startBtn && endBtn) {
                startBtn.style.display = 'inline-flex'
                endBtn.style.display = 'none'
            }
            const overlay = document.getElementById('game-over-overlay')
            if (overlay) {
                overlay.classList.remove('hidden')
            }
            const finalScoreEl = document.getElementById('final-score')
            if (finalScoreEl) {
                finalScoreEl.textContent = String(finalScore)
            }
            customCallbacks?.onEnd?.(finalScore, stats)
        },
    }

    const game = new BejeweledGame(GameID.BEJEWELED, config, enhancedCallbacks)

    // Wire renderer input to game action
    renderer.setCellClickCallback((row, col) => {
        game.clickCell(row, col)
    })

    // Hook up standard buttons
    const startBtn = document.getElementById(
        'start-btn'
    ) as HTMLButtonElement | null
    if (startBtn) {
        startBtn.addEventListener('click', () => game.start())
    }

    const endBtn = document.getElementById(
        'end-btn'
    ) as HTMLButtonElement | null
    if (endBtn) {
        endBtn.addEventListener('click', () => game.end())
    }

    const playAgainBtn = document.getElementById(
        'play-again-btn'
    ) as HTMLButtonElement | null
    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', () => {
            const overlay = document.getElementById('game-over-overlay')
            if (overlay) {
                overlay.classList.add('hidden')
            }
            game.reset()
        })
    }

    // Initial render
    renderer.render(game.getState())

    return {
        game,
        renderer,
        cleanup: () => {
            renderer.cleanup()
            game.destroy()
        },
    }
}
