import { SatelliteSyncGame } from './game'
import {
    setupScene,
    render,
    pointerToSatellite,
    pixelToWorld,
    cleanup as rendererCleanup,
    type RendererState,
} from './renderer'
import { polarToWorld, bearing } from './geometry'
import { SATELLITE_SYNC_LEVELS } from './levels'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'
import type { SatelliteSyncCallbacks } from './types'

export interface SatelliteSyncHandle {
    start: () => Promise<void>
    stop: () => void
    cleanup: () => void
    getGame: () => SatelliteSyncGame | null
}

export interface SatelliteSyncUICallbacks extends SatelliteSyncCallbacks {
    onError?: (title: string, message: string) => void
}

const KEYBOARD_STEP_DEG = 3
const KEYBOARD_KEYS = new Set(['Tab', 'ArrowLeft', 'ArrowRight', 'Enter', ' '])

function setText(id: string, value: string): void {
    const el = document.getElementById(id)
    if (el) {
        el.textContent = value
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

export async function initializeSatelliteSync(
    container: HTMLElement,
    callbacks: SatelliteSyncUICallbacks
): Promise<SatelliteSyncHandle> {
    let game: SatelliteSyncGame | null = null
    let renderer: RendererState | null = null
    let draggingSatId: string | null = null
    let keyboardSelectedId: string | null = null
    let rafId: number | null = null
    let lastFrame = 0

    const pointerHandlers: {
        down: ((e: PointerEvent) => void) | null
        move: ((e: PointerEvent) => void) | null
        up: ((e: PointerEvent) => void) | null
    } = { down: null, move: null, up: null }

    const keyboardHandlers: {
        keydown: ((e: KeyboardEvent) => void) | null
    } = { keydown: null }

    const teardownRenderer = (): void => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId)
            rafId = null
        }
        if (renderer) {
            if (pointerHandlers.down) {
                renderer.app.canvas.removeEventListener(
                    'pointerdown',
                    pointerHandlers.down
                )
            }
            if (pointerHandlers.move) {
                window.removeEventListener('pointermove', pointerHandlers.move)
            }
            if (pointerHandlers.up) {
                window.removeEventListener('pointerup', pointerHandlers.up)
            }
            rendererCleanup(renderer)
            renderer = null
        }
        if (keyboardHandlers.keydown) {
            window.removeEventListener('keydown', keyboardHandlers.keydown)
        }
        pointerHandlers.down = null
        pointerHandlers.move = null
        pointerHandlers.up = null
        keyboardHandlers.keydown = null
        keyboardSelectedId = null
        while (container.firstChild) {
            container.removeChild(container.firstChild)
        }
    }

    const loop = (ts: number): void => {
        if (!game || !renderer) {
            return
        }
        if (lastFrame === 0) {
            lastFrame = ts
        }
        const dt = ts - lastFrame
        lastFrame = ts
        game.update(dt)
        render(renderer, game.getState())
        if (game.getState().status === 'playing') {
            rafId = requestAnimationFrame(loop)
        }
    }

    const submitScore = async (score: number): Promise<void> => {
        if (!game) {
            return
        }
        const surfaceError = (message: string) =>
            callbacks.onError?.(
                'Score Not Saved',
                `Score could not be submitted: ${message}`
            )
        try {
            await saveGameScore(
                GameID.SATELLITE_SYNC,
                score,
                result => {
                    if (result.newAchievements?.length) {
                        window.dispatchEvent(
                            new CustomEvent('achievementsEarned', {
                                detail: {
                                    achievementIds: result.newAchievements,
                                },
                            })
                        )
                    }
                },
                error =>
                    surfaceError(
                        typeof error === 'string' ? error : 'Unknown error'
                    ),
                game.getGameData()
            )
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error'
            surfaceError(message)
        }
    }

    const start = async (): Promise<void> => {
        if (game) {
            game.cleanup()
        }
        teardownRenderer()

        const sceneRings = Math.max(...SATELLITE_SYNC_LEVELS.map(l => l.rings))
        renderer = await setupScene(container, sceneRings)

        game = new SatelliteSyncGame({
            onGameStart: () => {
                callbacks.onGameStart()
                lastFrame = 0
                rafId = requestAnimationFrame(loop)
            },
            onTimeUpdate: t => {
                setText('time-remaining', t.toString())
                callbacks.onTimeUpdate(t)
            },
            onScoreUpdate: sc => {
                setText('score', sc.toString())
                callbacks.onScoreUpdate(sc)
            },
            onLock: info => callbacks.onLock(info),
            onLevelClear: level => {
                setText('level', level.toString())
                if (renderer && game) {
                    render(renderer, game.getState())
                }
                callbacks.onLevelClear(level)
            },
            onFail: (level, finalScore) => {
                if (rafId !== null) {
                    cancelAnimationFrame(rafId)
                    rafId = null
                }
                showOverlay("TIME'S UP!", finalScore)
                callbacks.onFail(level, finalScore)
                void submitScore(finalScore)
            },
            onWin: finalScore => {
                if (rafId !== null) {
                    cancelAnimationFrame(rafId)
                    rafId = null
                }
                showOverlay('MISSION COMPLETE!', finalScore)
                callbacks.onWin(finalScore)
                void submitScore(finalScore)
            },
        })

        const toPointerSat = (event: PointerEvent): string | null => {
            if (!renderer) {
                return null
            }
            const rect = renderer.app.canvas.getBoundingClientRect()
            const scaleX = rect.width / renderer.app.canvas.width
            const scaleY = rect.height / renderer.app.canvas.height
            const px = (event.clientX - rect.left) / scaleX
            const py = (event.clientY - rect.top) / scaleY
            return pointerToSatellite(
                px,
                py,
                game!.getState().satellites,
                renderer.layout
            )
        }

        const aimAngleFromPointer = (
            event: PointerEvent,
            satId: string
        ): number => {
            if (!renderer || !game) {
                return 0
            }
            const rect = renderer.app.canvas.getBoundingClientRect()
            const scaleX = rect.width / renderer.app.canvas.width
            const scaleY = rect.height / renderer.app.canvas.height
            const px = (event.clientX - rect.left) / scaleX
            const py = (event.clientY - rect.top) / scaleY
            const sat = game.getState().satellites.find(s => s.id === satId)
            if (!sat) {
                return 0
            }
            const satWorld = polarToWorld(sat.ring, sat.angle)
            const pointerWorld = pixelToWorld(px, py, renderer.layout)
            return bearing(satWorld, pointerWorld)
        }

        pointerHandlers.down = (event: PointerEvent) => {
            if (!game || game.getState().status !== 'playing') {
                return
            }
            const satId = toPointerSat(event)
            if (satId) {
                draggingSatId = satId
                game.beginAim(satId)
                game.updateAim(satId, aimAngleFromPointer(event, satId))
            }
        }
        pointerHandlers.move = (event: PointerEvent) => {
            if (!game || !draggingSatId) {
                return
            }
            game.updateAim(
                draggingSatId,
                aimAngleFromPointer(event, draggingSatId)
            )
        }
        pointerHandlers.up = () => {
            if (!game || !draggingSatId) {
                return
            }
            game.endAim(draggingSatId)
            draggingSatId = null
        }

        keyboardHandlers.keydown = (event: KeyboardEvent) => {
            if (!game || game.getState().status !== 'playing') {
                return
            }
            if (draggingSatId || !KEYBOARD_KEYS.has(event.key)) {
                return
            }
            event.preventDefault()
            const sats = game.getState().satellites
            if (sats.length === 0) {
                return
            }
            if (event.key === 'Tab') {
                if (keyboardSelectedId) {
                    game.endAim(keyboardSelectedId)
                }
                const idx = sats.findIndex(s => s.id === keyboardSelectedId)
                const next = sats[(idx + 1) % sats.length]
                keyboardSelectedId = next.id
                game.beginAim(next.id)
                game.updateAim(next.id, next.aimAngle)
            } else if (
                event.key === 'ArrowLeft' ||
                event.key === 'ArrowRight'
            ) {
                if (!keyboardSelectedId) {
                    return
                }
                const sat = sats.find(s => s.id === keyboardSelectedId)
                if (!sat) {
                    return
                }
                const step =
                    event.key === 'ArrowLeft'
                        ? -KEYBOARD_STEP_DEG
                        : KEYBOARD_STEP_DEG
                const newAim = (sat.aimAngle + step + 360) % 360
                game.updateAim(keyboardSelectedId, newAim)
            } else if (event.key === 'Enter' || event.key === ' ') {
                if (!keyboardSelectedId) {
                    return
                }
                game.endAim(keyboardSelectedId)
                keyboardSelectedId = null
            }
        }

        renderer.app.canvas.addEventListener(
            'pointerdown',
            pointerHandlers.down
        )
        window.addEventListener('pointermove', pointerHandlers.move)
        window.addEventListener('pointerup', pointerHandlers.up)
        window.addEventListener('keydown', keyboardHandlers.keydown)

        game.start()
        setText('level', '1')
        render(renderer, game.getState())
    }

    const stop = (): void => {
        game?.stop()
    }

    const cleanup = (): void => {
        game?.cleanup()
        game = null
        teardownRenderer()
    }

    return { start, stop, cleanup, getGame: () => game }
}
