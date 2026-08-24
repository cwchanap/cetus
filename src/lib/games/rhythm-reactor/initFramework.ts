import {
    RhythmReactorGame,
    createRhythmReactorConfig,
} from './RhythmReactorGame'
import {
    createRhythmReactorRendererConfig,
    RhythmReactorRenderer,
} from './RhythmReactorRenderer'
import type {
    RhythmReactorLane,
    RhythmReactorState,
    RhythmReactorStats,
} from './types'
import type {
    BaseGameCallbacks,
    BaseGameState,
    BaseGameStats,
    ChallengeUpdates,
} from '@/lib/games/core/types'
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'
import { isEditableTarget } from '@/lib/games/shared/utils'
import type { AchievementNotification } from '@/lib/achievements'

export interface RhythmReactorInitResult {
    game: RhythmReactorGame
    renderer: RhythmReactorRenderer
    getGame: () => RhythmReactorGame
    getState: () => ReturnType<RhythmReactorGame['getState']>
    cleanup: () => void
}

const KEY_TO_LANE: Record<string, RhythmReactorLane> = {
    d: 0,
    f: 1,
    j: 2,
    k: 3,
}

export async function initRhythmReactorGameFramework(): Promise<
    RhythmReactorInitResult | undefined
> {
    const container = document.getElementById('rhythm-reactor-container')
    if (!container) {
        handleGameError(
            new DOMElementNotFoundError('rhythm-reactor-container'),
            'RhythmReactor'
        )
        return undefined
    }

    const config = createRhythmReactorConfig()
    const renderer = new RhythmReactorRenderer(
        createRhythmReactorRendererConfig(config)
    )
    try {
        await renderer.initialize()
    } catch (error) {
        handleGameError(
            error instanceof Error ? error : new Error(String(error)),
            'RhythmReactor'
        )
        try {
            renderer.destroy()
        } catch (cleanupError) {
            handleGameError(cleanupError, 'RhythmReactor')
        }
        return undefined
    }

    const trackedListeners: Array<{
        target: EventTarget
        type: string
        handler: EventListener
    }> = []

    const listen = (
        target: EventTarget | null,
        type: string,
        handler: EventListener
    ): void => {
        if (!target) {
            return
        }
        target.addEventListener(type, handler)
        trackedListeners.push({ target, type, handler })
    }

    const setText = (id: string, value: string): void => {
        const element = document.getElementById(id)
        if (element) {
            element.textContent = value
        }
    }

    const hideOverlay = (): void => {
        document.getElementById('game-over-overlay')?.classList.add('hidden')
    }

    const showOverlay = (): void => {
        document.getElementById('game-over-overlay')?.classList.remove('hidden')
    }

    const setStartVisible = (visible: boolean): void => {
        const startButton = document.getElementById(
            'start-btn'
        ) as HTMLButtonElement | null
        if (startButton) {
            startButton.style.display = visible ? 'inline-flex' : 'none'
        }
    }

    const announce = (message: string): void => {
        setText('rhythm-reactor-status', message)
    }

    const syncHud = (state: RhythmReactorState): void => {
        const hits = state.perfectHits + state.goodHits
        const judgment = state.lastJudgment?.toUpperCase() ?? 'READY'
        setText('rhythm-reactor-combo', String(state.combo))
        setText('rhythm-reactor-hits', String(hits))
        setText('rhythm-reactor-judgment', judgment)
        setText('rhythm-reactor-stability', String(state.stability))
        setText('score', String(state.score))
        setText('time-remaining', String(state.timeRemaining))
    }

    const laneButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
            '#rhythm-reactor-controls [data-rhythm-lane]'
        )
    )

    const syncControls = (state: RhythmReactorState): void => {
        for (const button of laneButtons) {
            button.disabled = !state.isActive || state.isGameOver
        }
    }

    let lastJudgmentAnnouncement = ''
    let lastAnnouncedStrayPresses = 0
    const trackAnnouncements = (state: RhythmReactorState): void => {
        if (!state.lastJudgment) {
            lastJudgmentAnnouncement = `${state.perfectHits}:${state.goodHits}:${state.misses}:${state.strayPresses}:`
            lastAnnouncedStrayPresses = state.strayPresses
            return
        }

        const announcementKey = `${state.perfectHits}:${state.goodHits}:${state.misses}:${state.strayPresses}:${state.lastJudgment}`
        if (announcementKey !== lastJudgmentAnnouncement) {
            announce(
                state.strayPresses > lastAnnouncedStrayPresses
                    ? 'Stray press.'
                    : `${state.lastJudgment.toUpperCase()} hit.`
            )
        }
        lastJudgmentAnnouncement = announcementKey
        lastAnnouncedStrayPresses = state.strayPresses
    }

    const enhancedCallbacks: BaseGameCallbacks = {
        onStateChange: (state: BaseGameState) => {
            const rhythmReactorState = state as RhythmReactorState
            syncHud(rhythmReactorState)
            syncControls(rhythmReactorState)
            trackAnnouncements(rhythmReactorState)
        },
        onScoreUpdate: (score: number) => setText('score', String(score)),
        onTimeUpdate: (timeRemaining: number) =>
            setText('time-remaining', String(timeRemaining)),
        onStart: () => {
            lastJudgmentAnnouncement = ''
            setStartVisible(false)
            hideOverlay()
            announce('Rhythm Reactor started.')
        },
        onEnd: (finalScore: number, stats: BaseGameStats) => {
            const rhythmReactorStats = stats as RhythmReactorStats
            setStartVisible(true)
            syncControls(game.getState())
            setText('final-score', String(finalScore))
            setText('final-hits', String(rhythmReactorStats.hits))
            setText('final-misses', String(rhythmReactorStats.misses))
            setText(
                'final-stray-presses',
                String(rhythmReactorStats.strayPresses)
            )
            setText('final-perfect', String(rhythmReactorStats.perfectHits))
            setText('final-good', String(rhythmReactorStats.goodHits))
            setText('final-max-combo', String(rhythmReactorStats.maxCombo))
            setText(
                'final-accuracy',
                `${rhythmReactorStats.accuracy.toFixed(1)}%`
            )
            setText(
                'final-stability',
                String(rhythmReactorStats.finalStability)
            )
            showOverlay()
            announce('Run complete.')
        },
    }

    const game = new RhythmReactorGame(config, enhancedCallbacks)

    const onGameEnd = (event: unknown): void => {
        const data = (event as { data?: unknown }).data as
            | {
                  newAchievements?: AchievementNotification[]
                  challengeUpdates?: ChallengeUpdates
              }
            | undefined
        const globalWindow = window as Window & {
            showAchievementAward?: (
                achievements: AchievementNotification[]
            ) => void
            showChallengeComplete?: (updates: ChallengeUpdates) => void
        }
        if (data?.newAchievements?.length) {
            globalWindow.showAchievementAward?.(data.newAchievements)
        }
        if (data?.challengeUpdates?.completedChallenges?.length) {
            globalWindow.showChallengeComplete?.(data.challengeUpdates)
        }
    }
    game.on('end', onGameEnd)

    const startButton = document.getElementById('start-btn')
    const resetButton = document.getElementById('reset-btn')
    const playAgainButton = document.getElementById('play-again-btn')
    const laneControls = document.getElementById('rhythm-reactor-controls')
    const canvas = renderer.getApp()?.canvas ?? null

    if (canvas) {
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
    }

    const startHandler: EventListener = () => game.start()
    const resetHandler: EventListener = () => {
        game.reset()
        renderer.render(game.getState())
        syncHud(game.getState())
        syncControls(game.getState())
        hideOverlay()
        setStartVisible(true)
        lastJudgmentAnnouncement = ''
        announce('Ready.')
    }
    const playAgainHandler: EventListener = () => {
        hideOverlay()
        game.start()
    }
    const laneClickHandler: EventListener = event => {
        const target = event.target instanceof Element ? event.target : null
        const button = target?.closest('[data-rhythm-lane]')
        if (!button || !laneControls?.contains(button)) {
            return
        }
        game.hitLane(Number((button as HTMLElement).dataset.rhythmLane))
    }
    const keyboardHandler: EventListener = event => {
        const keyboardEvent = event as KeyboardEvent
        if (
            keyboardEvent.repeat ||
            keyboardEvent.ctrlKey ||
            keyboardEvent.metaKey ||
            keyboardEvent.altKey ||
            isEditableTarget(keyboardEvent.target)
        ) {
            return
        }
        // Enter/Space on a focused button synthesizes a click, which would
        // double-fire lane hits through laneClickHandler. Lane keys (D/F/J/K)
        // must stay reachable while a lane button holds focus.
        if (
            keyboardEvent.target instanceof HTMLButtonElement &&
            (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ')
        ) {
            return
        }
        const laneIndex = KEY_TO_LANE[keyboardEvent.key.toLowerCase()]
        if (laneIndex === undefined) {
            return
        }
        if (game.hitLane(laneIndex).accepted) {
            keyboardEvent.preventDefault()
        }
    }
    const beforeUnloadHandler: EventListener = event => {
        if (!game.getState().isActive) {
            return
        }
        event.preventDefault()
        ;(event as BeforeUnloadEvent).returnValue =
            'You have a game in progress. Are you sure you want to leave?'
    }

    listen(startButton, 'click', startHandler)
    listen(resetButton, 'click', resetHandler)
    listen(playAgainButton, 'click', playAgainHandler)
    listen(laneControls, 'click', laneClickHandler)
    listen(document, 'keydown', keyboardHandler)
    listen(window, 'beforeunload', beforeUnloadHandler)

    renderer.render(game.getState())
    syncHud(game.getState())
    syncControls(game.getState())
    setStartVisible(true)

    let frameId: number | null = null
    let lastFrameTime: number | null = null

    const frame = (timestamp: number): void => {
        const delta =
            lastFrameTime === null
                ? 0
                : Math.min(
                      (timestamp - lastFrameTime) / 1000,
                      config.maxUpdateDelta
                  )
        lastFrameTime = timestamp
        const state = game.getState()
        if (state.isActive && !state.isPaused) {
            game.update(delta)
        }
        renderer.render(game.getState())
        frameId = requestAnimationFrame(frame)
    }
    frameId = requestAnimationFrame(frame)

    let cleanedUp = false
    const cleanup = (): void => {
        if (cleanedUp) {
            return
        }
        cleanedUp = true
        if (frameId !== null) {
            cancelAnimationFrame(frameId)
            frameId = null
        }
        for (const { target, type, handler } of trackedListeners) {
            target.removeEventListener(type, handler)
        }
        game.off('end', onGameEnd)
        renderer.destroy()
        game.destroy()
    }

    return {
        game,
        renderer,
        getGame: () => game,
        getState: () => game.getState(),
        cleanup,
    }
}
