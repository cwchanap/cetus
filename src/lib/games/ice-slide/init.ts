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
import { createIceSlideDailyRunDefinition, toIceSlideUtcDateKey } from './daily'
import { createIceSlideExpeditionRunDefinition } from './expedition'
import { cloneIceSlideRunDefinition, parseIceSlideDailyRunKey } from './run'
import { isIceSlideObjectiveMode } from './scoring'
import { ICE_SLIDE_OBJECTIVE_LABELS } from './objectives'
import type {
    IceSlideCallbacks,
    IceSlideGameData,
    IceSlidePlayableMode,
    IceSlideRunDefinition,
    IceSlideStageClearResult,
} from './types'

const runGuard = createRunGuard()

export const CELL_SIZE = 48

function createExpeditionSeed(): string {
    const words = new Uint32Array(4)
    crypto.getRandomValues(words)
    return Array.from(words, word => word.toString(16).padStart(8, '0')).join(
        ''
    )
}

export interface IceSlideUICallbacks extends IceSlideCallbacks {
    onError?: (title: string, message: string) => void
    onScoreSaved?: (gameData: IceSlideGameData) => void
}

export interface IceSlideHandle {
    start: (mode?: IceSlidePlayableMode) => Promise<void>
    playAgain: () => Promise<void>
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

function setVisible(id: string, visible: boolean): void {
    const el = document.getElementById(id)
    if (el) {
        el.classList.toggle('hidden', !visible)
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
    setVisible('game-over-overlay', true)
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}

function nextUtcDateKey(dateKey: string): string {
    const [year, month, day] = dateKey.split('-').map(Number)
    return toIceSlideUtcDateKey(new Date(Date.UTC(year, month - 1, day + 1)))
}

function starCopy(label: string, earned: boolean): string {
    return `${earned ? '✓' : '—'} ${label}`
}

function formatBonusRow(result: IceSlideStageClearResult): string {
    return result.stars.bonus
        ? starCopy(
              `Bonus: ${ICE_SLIDE_OBJECTIVE_LABELS[result.stars.bonus.id]}`,
              result.stars.bonus.earned
          )
        : '— Bonus'
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
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
    let inputLocked = false
    let currentMode: IceSlidePlayableMode = 'campaign'
    let dailyDateKey: string | null = null
    let retryRun: IceSlideRunDefinition | null = null
    runGuard.next()

    const pointerHandlers: {
        down: ((e: PointerEvent) => void) | null
        up: ((e: PointerEvent) => void) | null
    } = { down: null, up: null }

    const keyboardHandler = {
        keydown: null as ((e: KeyboardEvent) => void) | null,
    }

    const continueHandler = (): void => {
        if (!inputLocked) {
            return
        }
        hideStageClear()
        render()
        syncHud()
    }

    const hideStageClear = (): void => {
        inputLocked = false
        setVisible('stage-clear-overlay', false)
    }

    const hideRunFinalStageResult = (): void => {
        setVisible('run-final-stage-result', false)
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

    const failRun = (error: unknown): void => {
        runGuard.next()
        game?.destroy()
        game = null
        teardownRenderer()
        retryRun = null
        currentMode = 'campaign'
        dailyDateKey = null
        hideStageClear()
        hideRunFinalStageResult()
        setVisible('daily-meta', false)
        setVisible('expedition-meta', false)
        setVisible('expedition-summary', false)
        resetButtons()
        callbacks.onError?.(
            'Ice Slide Error',
            error instanceof Error ? error.message : String(error)
        )
    }

    const render = (): void => {
        if (renderer && game) {
            renderGrid(renderer, game.getState())
        }
    }

    const syncHud = (): void => {
        if (!game) {
            setVisible('daily-meta', false)
            setVisible('expedition-meta', false)
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

        const isDaily = state.mode === 'daily'
        const isExpedition = state.mode === 'expedition'
        setVisible('daily-meta', isDaily)
        setVisible('expedition-meta', isExpedition)
        if (isDaily) {
            const capturedDateKey =
                dailyDateKey ??
                parseIceSlideDailyRunKey(state.runKey)?.dateKey ??
                ''
            setText('daily-date', capturedDateKey)
            if (capturedDateKey) {
                setText(
                    'daily-reset',
                    `Resets at 00:00 UTC ${nextUtcDateKey(capturedDateKey)}`
                )
            }
            setText(
                'daily-stage-progress',
                `Stage ${state.levelIndex + 1} / ${state.stagesTotal}`
            )
            setText('daily-objective-clear', 'Clear the stage')
            setText(
                'daily-objective-efficient',
                `Efficient: ${state.parMoves} moves or fewer`
            )
            const objectiveId = state.objectiveIds[0]
            setText(
                'daily-objective-bonus',
                objectiveId
                    ? `Bonus: ${ICE_SLIDE_OBJECTIVE_LABELS[objectiveId]}`
                    : 'Bonus: —'
            )
            return
        }
        if (!isExpedition) {
            return
        }

        const seed = retryRun?.seed ?? '—'
        const tier = retryRun?.stages[state.levelIndex]?.difficulty
        const maxStars = state.stagesTotal * 3

        setText('expedition-seed', seed)
        setText(
            'expedition-stage-progress',
            `Stage ${state.levelIndex + 1} / ${state.stagesTotal}` +
                (tier ? ` · ${tier.toUpperCase()}` : '')
        )
        setText('expedition-stars', `Stars ${state.starsEarned} / ${maxStars}`)
        setText(
            'expedition-attempts',
            `Falls ${state.falls} · Resets ${state.resets}`
        )
        setText('expedition-objective-clear', 'Clear the stage')
        setText(
            'expedition-objective-efficient',
            `Efficient: ${state.parMoves} moves or fewer`
        )
        const objectiveId = state.objectiveIds[0]
        setText(
            'expedition-objective-bonus',
            objectiveId
                ? `Bonus: ${ICE_SLIDE_OBJECTIVE_LABELS[objectiveId]}`
                : 'Bonus: —'
        )
    }

    const populateStageClear = (result: IceSlideStageClearResult): void => {
        setText('stage-clear-title', `Stage ${result.stageNumber} clear`)
        setText('stage-clear-score', `+${result.scoreGained}`)
        setText('stage-clear-clear', starCopy('Clear', result.stars.clear))
        setText(
            'stage-clear-efficient',
            starCopy('Efficient', result.stars.efficient)
        )
        setText('stage-clear-bonus', formatBonusRow(result))
        setVisible('stage-clear-overlay', true)
        document.getElementById('stage-clear-continue-btn')?.focus()
    }

    const populateFinalStageResult = (
        result: IceSlideStageClearResult
    ): void => {
        setText(
            'run-final-heading',
            game?.getState().mode === 'expedition'
                ? 'Expedition stars'
                : 'Daily stars'
        )
        setText('run-final-clear', starCopy('Clear', result.stars.clear))
        setText(
            'run-final-efficient',
            starCopy('Efficient', result.stars.efficient)
        )
        setText('run-final-bonus', formatBonusRow(result))
        setVisible('run-final-stage-result', true)
    }

    const populateExpeditionSummary = (): void => {
        if (!game || game.getState().mode !== 'expedition') {
            setVisible('expedition-summary', false)
            return
        }

        const data = game.getGameData()
        setText('expedition-summary-seed', retryRun?.seed ?? '—')
        setText(
            'expedition-summary-progress',
            `${data.levelsCleared} / ${data.stagesTotal} stages`
        )
        setText(
            'expedition-summary-stars',
            `${data.starsEarned} / ${data.stagesTotal * 3} stars`
        )
        setText('expedition-summary-moves', String(data.totalMoves))
        setText('expedition-summary-crystals', String(data.crystalsCollected))
        setText(
            'expedition-summary-attempts',
            `Falls ${data.falls} · Resets ${data.resets}`
        )
        setText('expedition-summary-time', formatTime(data.elapsedSeconds))
        setVisible('expedition-summary', true)
    }

    const submitScore = (finalScore: number): void => {
        if (!game || finalScore <= 0) {
            return
        }
        const gameData = game.getGameData()
        const runId = runGuard.current()
        const isStale = () => runGuard.isStale(runId)
        const options =
            gameData.mode === 'daily'
                ? {
                      isStale,
                      context: {
                          mode: 'daily' as const,
                          competitionKey: gameData.runKey,
                          rulesetVersion: gameData.rulesetVersion,
                      },
                  }
                : gameData.mode === 'expedition'
                  ? {
                        isStale,
                        context: {
                            mode: 'expedition' as const,
                            rulesetVersion: gameData.rulesetVersion,
                        },
                    }
                  : { isStale }
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
                            detail: {
                                achievementIds: result.newAchievements,
                            },
                        })
                    )
                }
                callbacks.onScoreSaved?.(gameData)
            },
            (error, result) => {
                if (isStale()) {
                    return
                }
                if (
                    isIceSlideObjectiveMode(gameData.mode) &&
                    result?.code === 'UNAUTHENTICATED'
                ) {
                    return
                }
                callbacks.onError?.('Score not saved', formatError(error))
            },
            gameData,
            options
        )
    }

    const canAcceptMove = (): boolean =>
        !!game && game.getState().status === 'playing' && !inputLocked

    const wireInput = (): void => {
        if (!renderer || !game) {
            return
        }

        pointerHandlers.down = (event: PointerEvent) => {
            if (!canAcceptMove()) {
                pointerStart = null
                return
            }
            pointerStart = { x: event.clientX, y: event.clientY }
        }
        pointerHandlers.up = (event: PointerEvent) => {
            if (!pointerStart || !game || !canAcceptMove()) {
                pointerStart = null
                return
            }
            const dx = event.clientX - pointerStart.x
            const dy = event.clientY - pointerStart.y
            pointerStart = null
            const direction = swipeToDirection(dx, dy)
            if (direction) {
                game.move(direction)
                void afterMove().catch(failRun)
            }
        }

        renderer.app.canvas.addEventListener(
            'pointerdown',
            pointerHandlers.down
        )
        renderer.app.canvas.addEventListener('pointerup', pointerHandlers.up)

        keyboardHandler.keydown = (event: KeyboardEvent) => {
            if (!game || !canAcceptMove()) {
                return
            }
            const direction = keyToDirection(event.key)
            if (!direction) {
                return
            }
            event.preventDefault()
            game.move(direction)
            void afterMove().catch(failRun)
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

    const startRun = async (run?: IceSlideRunDefinition): Promise<void> => {
        runGuard.next()
        teardownRenderer()
        game?.destroy()
        hideStageClear()
        hideRunFinalStageResult()
        setVisible('game-over-overlay', false)
        currentMode = run?.mode ?? 'campaign'
        dailyDateKey =
            run?.mode === 'daily'
                ? (parseIceSlideDailyRunKey(run.runKey)?.dateKey ?? null)
                : null

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
            onLevelClear: result => {
                callbacks.onLevelClear(result)
                if (!game || !isIceSlideObjectiveMode(game.getState().mode)) {
                    return
                }
                if (game.getState().status === 'playing') {
                    inputLocked = true
                    populateStageClear(result)
                } else if (game.getState().status === 'won') {
                    populateFinalStageResult(result)
                }
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
                hideStageClear()
                resetButtons()
                showOverlay('MISSION COMPLETE!', finalScore)
                submitScore(finalScore)
                syncHud()
                populateExpeditionSummary()
            },
        })

        game.start(run)
        const state = game.getState()
        try {
            await ensureRenderer(state.rows, state.cols)
            render()
            syncHud()
        } catch (error) {
            failRun(error)
            throw error
        }
    }

    const handle: IceSlideHandle = {
        start: async (mode = 'campaign') => {
            if (mode === 'daily') {
                let run: IceSlideRunDefinition
                try {
                    const dateKey = toIceSlideUtcDateKey(new Date())
                    run = createIceSlideDailyRunDefinition(dateKey)
                    retryRun = cloneIceSlideRunDefinition(run)
                    dailyDateKey = dateKey
                    currentMode = 'daily'
                } catch (error) {
                    failRun(error)
                    throw error
                }
                await startRun(run)
                return
            }
            if (mode === 'expedition') {
                let run: IceSlideRunDefinition
                try {
                    const seed = createExpeditionSeed()
                    run = createIceSlideExpeditionRunDefinition(seed)
                    retryRun = cloneIceSlideRunDefinition(run)
                } catch (error) {
                    failRun(error)
                    throw error
                }
                await startRun(run)
                return
            }
            currentMode = 'campaign'
            retryRun = null
            await startRun()
        },

        playAgain: async () => {
            if (isIceSlideObjectiveMode(currentMode)) {
                if (!retryRun) {
                    throw new Error('Ice Slide retry run is unavailable')
                }
                const run = cloneIceSlideRunDefinition(retryRun)
                dailyDateKey =
                    run.mode === 'daily'
                        ? (parseIceSlideDailyRunKey(run.runKey)?.dateKey ??
                          null)
                        : null
                await startRun(run)
                return
            }

            await startRun()
        },

        stop: () => {
            if (!game) {
                return
            }
            const { status, score, mode } = game.getState()
            if (mode === 'expedition') {
                if (status !== 'playing') {
                    return
                }
                hideStageClear()
                const shouldSubmit = score > 0
                game.stop()
                resetButtons()
                showOverlay('RUN ENDED', score)
                if (shouldSubmit) {
                    submitScore(score)
                }
                syncHud()
                populateExpeditionSummary()
                return
            }

            if (mode === 'daily') {
                if (status !== 'playing') {
                    return
                }
                hideStageClear()
                game.stop()
                resetButtons()
                showOverlay('RUN ENDED', score)
                syncHud()
                return
            }

            const shouldSubmit = status === 'playing' && score > 0
            game.stop()
            resetButtons()
            if (shouldSubmit) {
                showOverlay('RUN ENDED', score)
                submitScore(score)
            }
        },

        resetLevel: () => {
            if (!game || !canAcceptMove()) {
                return
            }
            game.resetLevel()
            render()
            syncHud()
        },

        cleanup: () => {
            runGuard.next()
            game?.destroy()
            game = null
            hideStageClear()
            hideRunFinalStageResult()
            setVisible('daily-meta', false)
            setVisible('expedition-meta', false)
            teardownRenderer()
            document
                .getElementById('stage-clear-continue-btn')
                ?.removeEventListener('click', continueHandler)
            const debugWindow = window as Window & {
                iceSlideGame?: IceSlideHandle
            }
            if (debugWindow.iceSlideGame === handle) {
                delete debugWindow.iceSlideGame
            }
        },

        getGame: () => game,
    }

    ;(window as Window & { iceSlideGame?: IceSlideHandle }).iceSlideGame =
        handle
    document
        .getElementById('stage-clear-continue-btn')
        ?.addEventListener('click', continueHandler)
    return handle
}
