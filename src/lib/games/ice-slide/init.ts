import { IceSlideGame } from './game'
import {
    setupPixiJS,
    renderGrid,
    cleanup as rendererCleanup,
    swipeToDirection,
    keyToDirection,
    type RendererState,
} from './renderer'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'
import { createRunGuard } from '@/lib/games/core'
import type { IceSlideCallbacks } from './types'

const runGuard = createRunGuard()

export const CELL_SIZE = 48

export interface IceSlideUICallbacks extends IceSlideCallbacks {
    onError?: (title: string, message: string) => void
}

export interface IceSlideHandle {
    start: () => Promise<void>
    stop: () => void
    resetLevel: () => void
    cleanup: () => void
    getGame: () => IceSlideGame | null
}

function setText(id: string, value: string): void {
    const el = document.getElementById(id)
    if (el) {
        el.textContent = value
    }
}

function resetButtons(): void {
    const startBtn = document.getElementById('start-btn')
    const endBtn = document.getElementById('end-btn')
    if (startBtn) {
        startBtn.style.display = 'inline-flex'
    }
    if (endBtn) {
        endBtn.style.display = 'none'
    }
}

function showOverlay(title: string, score: number): void {
    setText('game-over-title', title)
    setText('final-score', score.toString())
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}

export async function initializeIceSlide(
    container: HTMLElement,
    callbacks: IceSlideUICallbacks
): Promise<IceSlideHandle> {
    let game: IceSlideGame | null = null
    let renderer: RendererState | null = null
    let renderedRows = 0
    let renderedCols = 0
    let pointerStart: { x: number; y: number } | null = null
    runGuard.next()

    const pointerHandlers: {
        down: ((e: PointerEvent) => void) | null
        up: ((e: PointerEvent) => void) | null
    } = { down: null, up: null }

    const keyboardHandler = {
        keydown: null as ((e: KeyboardEvent) => void) | null,
    }

    const teardownRenderer = (): void => {
        if (renderer) {
            if (pointerHandlers.down) {
                renderer.app.canvas.removeEventListener(
                    'pointerdown',
                    pointerHandlers.down
                )
            }
            if (pointerHandlers.up) {
                renderer.app.canvas.removeEventListener(
                    'pointerup',
                    pointerHandlers.up
                )
            }
            rendererCleanup(renderer)
            renderer = null
        }
        if (keyboardHandler.keydown) {
            window.removeEventListener('keydown', keyboardHandler.keydown)
        }
        pointerHandlers.down = null
        pointerHandlers.up = null
        keyboardHandler.keydown = null
        pointerStart = null
        renderedRows = 0
        renderedCols = 0
        while (container.firstChild) {
            container.removeChild(container.firstChild)
        }
    }

    const render = (): void => {
        if (renderer && game) {
            renderGrid(renderer, game.getState())
        }
    }

    const syncHud = (): void => {
        if (!game) {
            return
        }
        const state = game.getState()
        setText('score', state.score.toString())
        setText('level', String(state.levelIndex + 1))
        setText('moves', state.moves.toString())
        setText('crystals', state.crystalsCollected.toString())
        setText('time-remaining', formatTime(state.elapsedSeconds))
        const levelName = document.getElementById('level-name')
        if (levelName) {
            levelName.textContent = state.levelName
        }
    }

    const submitScore = (finalScore: number): void => {
        if (!game || finalScore <= 0) {
            return
        }
        const gameData = game.getGameData()
        const isStale = runGuard.isStale
        saveGameScore(
            GameID.ICE_SLIDE,
            finalScore,
            result => {
                if (isStale()) {
                    return
                }
                if (result.newAchievements?.length) {
                    window.dispatchEvent(
                        new CustomEvent('achievementsEarned', {
                            detail: result.newAchievements,
                        })
                    )
                }
            },
            error => {
                if (isStale()) {
                    return
                }
                callbacks.onError?.(
                    'Score not saved',
                    error instanceof Error ? error.message : String(error)
                )
            },
            gameData,
            { isStale }
        )
    }

    const wireInput = (): void => {
        if (!renderer || !game) {
            return
        }

        pointerHandlers.down = (event: PointerEvent) => {
            pointerStart = { x: event.clientX, y: event.clientY }
        }
        pointerHandlers.up = (event: PointerEvent) => {
            if (!pointerStart || !game) {
                return
            }
            const dx = event.clientX - pointerStart.x
            const dy = event.clientY - pointerStart.y
            pointerStart = null
            const direction = swipeToDirection(dx, dy)
            if (direction) {
                game.move(direction)
                void afterMove()
            }
        }

        renderer.app.canvas.addEventListener(
            'pointerdown',
            pointerHandlers.down
        )
        renderer.app.canvas.addEventListener('pointerup', pointerHandlers.up)

        keyboardHandler.keydown = (event: KeyboardEvent) => {
            if (!game) {
                return
            }
            const direction = keyToDirection(event.key)
            if (!direction) {
                return
            }
            event.preventDefault()
            game.move(direction)
            void afterMove()
        }
        window.addEventListener('keydown', keyboardHandler.keydown)
    }

    const ensureRenderer = async (
        rows: number,
        cols: number
    ): Promise<void> => {
        if (renderer && renderedRows === rows && renderedCols === cols) {
            return
        }
        teardownRenderer()
        renderer = await setupPixiJS(container, rows, cols, CELL_SIZE)
        renderedRows = rows
        renderedCols = cols
        wireInput()
    }

    const afterMove = async (): Promise<void> => {
        if (!game) {
            return
        }
        const state = game.getState()
        if (state.status === 'playing') {
            await ensureRenderer(state.rows, state.cols)
        }
        render()
        syncHud()
    }

    return {
        start: async () => {
            runGuard.next()
            teardownRenderer()
            game?.destroy()

            game = new IceSlideGame({
                onGameStart: () => {
                    callbacks.onGameStart()
                    syncHud()
                },
                onMove: info => {
                    callbacks.onMove(info)
                },
                onCrystal: total => {
                    callbacks.onCrystal(total)
                },
                onLevelClear: level => {
                    callbacks.onLevelClear(level)
                },
                onHazard: () => {
                    callbacks.onHazard()
                },
                onScoreUpdate: score => {
                    callbacks.onScoreUpdate(score)
                },
                onTimeUpdate: seconds => {
                    callbacks.onTimeUpdate(seconds)
                    setText('time-remaining', formatTime(seconds))
                },
                onWin: finalScore => {
                    callbacks.onWin(finalScore)
                    resetButtons()
                    showOverlay('MISSION COMPLETE!', finalScore)
                    submitScore(finalScore)
                    syncHud()
                },
            })

            game.start()
            const state = game.getState()
            await ensureRenderer(state.rows, state.cols)
            render()
            syncHud()
        },

        stop: () => {
            if (!game) {
                return
            }
            const score = game.getState().score
            game.stop()
            resetButtons()
            if (score > 0) {
                showOverlay('RUN ENDED', score)
                submitScore(score)
            }
        },

        resetLevel: () => {
            game?.resetLevel()
            render()
            syncHud()
        },

        cleanup: () => {
            runGuard.next()
            game?.destroy()
            game = null
            teardownRenderer()
        },

        getGame: () => game,
    }
}
