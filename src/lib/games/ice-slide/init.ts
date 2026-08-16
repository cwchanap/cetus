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
import {
    createIceSlideExpeditionRunDefinition,
    type IceSlideExpeditionRouteChoice,
} from './expedition'
import { cloneIceSlideRunDefinition, parseIceSlideDailyRunKey } from './run'
import { isIceSlideObjectiveMode } from './scoring'
import { ICE_SLIDE_OBJECTIVE_LABELS } from './objectives'
import type {
    IceSlideCallbacks,
    IceSlideGameData,
    IceSlidePlayableMode,
    IceSlideRunDefinition,
    IceSlideStageClearResult,
    IceSlideState,
} from './types'

const runGuard = createRunGuard()

export const CELL_SIZE = 48

function createExpeditionSeed(): string {
    const words = new Uint32Array(4)
    ;(
        words as unknown as { __iceSlideExpeditionSeed?: boolean }
    ).__iceSlideExpeditionSeed = true
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
    chooseExpeditionRoute: (choice: IceSlideExpeditionRouteChoice) => boolean
    undo: () => boolean
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

function formatBonusRows(
    bonuses: IceSlideStageClearResult['stars']['bonuses']
): string {
    return bonuses.length === 0
        ? '— Bonus'
        : bonuses
              .map((bonus, index) =>
                  starCopy(
                      `${index === 0 ? 'Bonus' : 'Risk Bonus'}: ${ICE_SLIDE_OBJECTIVE_LABELS[bonus.id]}`,
                      bonus.earned
                  )
              )
              .join(' · ')
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
    let activeRun: IceSlideRunDefinition | null = null
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
        const pending = game?.getState().pendingRouteChoiceAfterStage
        setVisible('stage-clear-overlay', false)
        if (pending !== null) {
            setVisible('expedition-route-choice-overlay', true)
            document.getElementById('expedition-safe-btn')?.focus()
            return
        }

        inputLocked = false
        render()
        syncHud()
    }

    const hideStageClear = (): void => {
        inputLocked = false
        setVisible('stage-clear-overlay', false)
    }

    const hideRouteChoice = (): void => {
        setVisible('expedition-route-choice-overlay', false)
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
        activeRun = null
        currentMode = 'campaign'
        dailyDateKey = null
        hideStageClear()
        hideRouteChoice()
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

    const populateObjectiveHud = (
        state: IceSlideState,
        prefix: string
    ): void => {
        setText(`${prefix}-objective-clear`, 'Clear the stage')
        setText(
            `${prefix}-objective-efficient`,
            `Efficient: ${state.parMoves} moves or fewer`
        )
        const objectiveCopy = state.objectiveIds
            .map(id => ICE_SLIDE_OBJECTIVE_LABELS[id])
            .join(' · ')
        setText(
            `${prefix}-objective-bonus`,
            objectiveCopy ? `Bonus: ${objectiveCopy}` : 'Bonus: —'
        )
    }

    const syncHud = (): void => {
        if (!game) {
            setVisible('daily-meta', false)
            setVisible('expedition-meta', false)
            setText('expedition-undo-btn', 'Undo (0)')
            const undoButton = document.getElementById(
                'expedition-undo-btn'
            ) as HTMLButtonElement | null
            if (undoButton) {
                undoButton.disabled = true
            }
            return
        }
        const state = game.getState()
        const undoButton = document.getElementById(
            'expedition-undo-btn'
        ) as HTMLButtonElement | null
        if (undoButton) {
            undoButton.textContent = `Undo (${state.undoChargesAvailable})`
            undoButton.disabled = !game.canUndo()
        }
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
            populateObjectiveHud(state, 'daily')
            return
        }
        if (!isExpedition) {
            return
        }

        const seed = retryRun?.seed ?? '—'
        const tier = activeRun?.stages[state.levelIndex]?.difficulty

        setText('expedition-seed', seed)
        setText(
            'expedition-stage-progress',
            `Stage ${state.levelIndex + 1} / ${state.stagesTotal}` +
                (tier ? ` · ${tier.toUpperCase()}` : '')
        )
        setText(
            'expedition-stars',
            `Stars ${state.starsEarned} / ${state.starsPossible}`
        )
        setText(
            'expedition-attempts',
            `Falls ${state.falls} · Resets ${state.resets}`
        )
        populateObjectiveHud(state, 'expedition')
    }

    const populateStageClear = (result: IceSlideStageClearResult): void => {
        setText('stage-clear-title', `Stage ${result.stageNumber} clear`)
        setText('stage-clear-score', `+${result.scoreGained}`)
        setText('stage-clear-clear', starCopy('Clear', result.stars.clear))
        setText(
            'stage-clear-efficient',
            starCopy('Efficient', result.stars.efficient)
        )
        setText('stage-clear-bonus', formatBonusRows(result.stars.bonuses))
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
        setText('run-final-bonus', formatBonusRows(result.stars.bonuses))
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
            `${data.starsEarned} / ${data.starsPossible} stars`
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
        hideRouteChoice()
        hideRunFinalStageResult()
        setVisible('expedition-summary', false)
        setVisible('game-over-overlay', false)
        activeRun = run ?? null
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
                hideRouteChoice()
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
                    const error = new Error(
                        'Ice Slide retry run is unavailable'
                    )
                    failRun(error)
                    throw error
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
            hideRouteChoice()
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

        chooseExpeditionRoute: choice => {
            if (!game || !inputLocked || !game.chooseExpeditionRoute(choice)) {
                return false
            }
            hideRouteChoice()
            inputLocked = false
            render()
            syncHud()
            return true
        },

        undo: () => {
            if (!game || !game.undo()) {
                return false
            }
            render()
            syncHud()
            return true
        },

        cleanup: () => {
            runGuard.next()
            game?.destroy()
            game = null
            hideStageClear()
            hideRouteChoice()
            hideRunFinalStageResult()
            setVisible('daily-meta', false)
            setVisible('expedition-meta', false)
            setVisible('expedition-summary', false)
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
