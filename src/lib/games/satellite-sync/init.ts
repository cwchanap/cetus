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
import { createRunGuard } from '@/lib/games/core'
import type { SatelliteSyncCallbacks } from './types'

// Module-scope guard so a second init call invalidates pending callbacks
// from a prior instance (e.g., view-transition remount without cleanup).
const runGuard = createRunGuard()

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
const KEYBOARD_KEYS = new Set(['q', 'ArrowLeft', 'ArrowRight', 'Enter', ' '])

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
    runGuard.next()

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
        const state = game.getState()
        render(renderer, state)
        if (state.status === 'playing') {
            rafId = requestAnimationFrame(loop)
        }
    }

    const submitScore = async (score: number): Promise<void> => {
        if (!game) {
            return
        }
        const runId = runGuard.current()
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
                game.getGameData(),
                { isStale: () => runGuard.isStale(runId) }
            )
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error'
            surfaceError(message)
        }
    }

    const start = async (): Promise<void> => {
        runGuard.next()
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
            onComboReset: () => callbacks.onComboReset(),
            onLevelClear: level => {
                setText(
                    'level',
                    Math.min(level + 1, SATELLITE_SYNC_LEVELS.length).toString()
                )
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
            if (!renderer || !game) {
                return null
            }
            const rect = renderer.app.canvas.getBoundingClientRect()
            const scaleX = rect.width / renderer.app.screen.width
            const scaleY = rect.height / renderer.app.screen.height
            const px = (event.clientX - rect.left) / scaleX
            const py = (event.clientY - rect.top) / scaleY
            return pointerToSatellite(
                px,
                py,
                game.getState().satellites,
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
            const scaleX = rect.width / renderer.app.screen.width
            const scaleY = rect.height / renderer.app.screen.height
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
            const sats = game.getState().satellites
            if (sats.length === 0) {
                return
            }
            if (event.key === 'q') {
                // Cycle to the next UNLOCKED satellite. Skipping locked
                // satellites prevents q from re-selecting a satellite that
                // already has a locked target — beginAim would unlock it
                // and reset the combo, so a keyboard player could never
                // advance past the first lock.
                const len = sats.length
                const startIdx = sats.findIndex(
                    s => s.id === keyboardSelectedId
                )
                let nextIdx = -1
                for (let i = 1; i <= len; i++) {
                    const candidate = (startIdx + i) % len
                    if (!sats[candidate].lockedTargetId) {
                        nextIdx = candidate
                        break
                    }
                }
                if (nextIdx === -1) {
                    return
                }
                // A satellite will be selected — only now suppress native
                // behavior so we don't block browser shortcuts when no
                // action is possible.
                event.preventDefault()
                const next = sats[nextIdx]
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
                // An aim adjustment will run — suppress default scrolling.
                event.preventDefault()
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
                // A lock will commit — suppress default button activation
                // only when we actually consume the key for the game. This
                // keeps the End Game button reachable by keyboard when no
                // satellite is selected.
                event.preventDefault()
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
        if (rafId !== null) {
            cancelAnimationFrame(rafId)
            rafId = null
        }
        game?.stop()
    }

    const cleanup = (): void => {
        game?.cleanup()
        game = null
        teardownRenderer()
    }

    return { start, stop, cleanup, getGame: () => game }
}
