/**
 * Bejeweled field-plate controller (HPA-393 Stage 4). Extracted from the
 * route's root <script>; mount() is called by the BejeweledScreen island
 * with the plate body as host. Plate-body lookups are host-scoped; the
 * Astro-retained chrome (field sheet, header account label, reward
 * overlays) stays on document lookups. The script's internal
 * AbortController was unified with the signal the island passes in, so
 * abort (island unmount) detaches the same listeners the non-persisted
 * pagehide used to tear down.
 */
import {
    initBejeweledGame,
    type BejeweledInitResult,
} from '@/lib/games/bejeweled/init'
import type {
    BejeweledState,
    BejeweledStats,
} from '@cetus/games/bejeweled/types'
import { findLegalSwap } from '@cetus/games/bejeweled/utils'
import { isEditableTarget } from '@/lib/keyboard'
import { getUserBestScore } from '@/lib/services/scoreService'
import { GameID } from '@cetus/shared/games'
import { createApiClient } from '@cetus/api-client/api-client'

export function mount(host: HTMLElement, signal: AbortSignal): void {
    const api = createApiClient()

    const sheet = document.querySelector<HTMLDialogElement>('#field-sheet')!
    const panels = [...sheet.querySelectorAll<HTMLElement>('[data-panel]')]
    const startButton = document.querySelector<HTMLButtonElement>('#start-btn')!
    const pauseButton = host.querySelector<HTMLButtonElement>('#pause-btn')!
    const hintButton = host.querySelector<HTMLButtonElement>('#hint-btn')!
    const signedIn = host.dataset.signedIn === 'true'
    const setText = (id: string, value: string | number) => {
        document.getElementById(id)!.textContent = String(value)
    }
    let handle: BejeweledInitResult | undefined
    let currentPanel = 'intro'
    let returnPanel = 'intro'
    let resumeAfterSheet = false
    let savedBest: number | null = signedIn ? null : 0
    let visitBest = 0
    let lastResult: { score: number; previousBest: number } | null = null
    let visits = 0
    let visitChain = 0
    let pace: 'swift' | 'measured' = 'swift'
    let glyphs = false
    let sound = true
    let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    let audio: AudioContext | undefined
    // Set by the abort listener; an in-flight initialize adopts nothing so
    // an aborted island never leaks its renderer.
    let disposed = false

    const syncBest = () => {
        const best = savedBest === null ? null : Math.max(savedBest, visitBest)
        // [data-best] spans the host island and the Astro-owned sheet panels.
        document.querySelectorAll('[data-best]').forEach(el => {
            el.textContent = best === null ? '—' : best.toLocaleString()
        })
        document
            .getElementById('personal-best')!
            .classList.toggle(
                'hidden',
                savedBest === null ||
                    lastResult === null ||
                    lastResult.score <=
                        Math.max(savedBest, lastResult.previousBest)
            )
    }
    const showSheet = (panel: string) => {
        currentPanel = panel
        panels.forEach(el =>
            el.classList.toggle('hidden', el.dataset.panel !== panel)
        )
        sheet.dataset.panel = panel
        sheet.setAttribute(
            'aria-labelledby',
            `${panel === 'intro' ? 'intro' : panel}-title`
        )
        if (!sheet.open) {
            sheet.showModal()
        }
        const heading = sheet.querySelector<HTMLElement>(
            `:scope > [data-panel="${panel}"] h2`
        )!
        heading.tabIndex = -1
        heading.focus({ preventScroll: true })
        sheet.scrollTop = 0
    }
    const closeSheet = () => {
        currentPanel = ''
        sheet.close()
        handle?.renderer.getApp()?.canvas.focus()
    }
    const closeInfo = () => {
        if (resumeAfterSheet) {
            resumeAfterSheet = false
            handle?.game.resume()
        } else if (returnPanel) {
            showSheet(returnPanel)
        } else {
            closeSheet()
        }
    }
    const refreshAccount = async () => {
        if (!signedIn) {
            return
        }
        try {
            const data = await api.getChallenges({ signal })
            setText('account-label', `LV ${data.level}`)
            setText('xp-label', `Level ${data.level} · ${data.xp} XP`)
            setText('xp-next', `${data.xpToNextLevel} to next level`)
            setText('streak', `${data.streak} days`)
            document.getElementById('xp-panel')!.classList.remove('hidden')
            document.querySelector<HTMLProgressElement>('#xp-fill')!.value =
                data.xpProgress
            const available = data.challenges.filter(
                c => !c.gameId || c.gameId === GameID.BEJEWELED
            )
            setText(
                'commission-status',
                available.length
                    ? 'Complete a dive to record your progress.'
                    : 'No Bejeweled commissions today. Explore the catalogue for today’s challenges.'
            )
            const container = document.getElementById('commissions')!
            container.replaceChildren()
            available.forEach(challenge => {
                const fragment = document
                    .querySelector<HTMLTemplateElement>('#commission-template')!
                    .content.cloneNode(true) as DocumentFragment
                fragment.querySelector('[data-icon]')!.textContent =
                    challenge.icon
                fragment.querySelector('[data-name]')!.textContent =
                    challenge.name
                fragment.querySelector('[data-xp]')!.textContent =
                    `+${challenge.xpReward} XP`
                fragment.querySelector('[data-description]')!.textContent =
                    challenge.description
                fragment.querySelector('progress')!.value = Math.min(
                    100,
                    (challenge.currentValue / challenge.targetValue) * 100
                )
                fragment.querySelector('[data-progress]')!.textContent =
                    challenge.completed
                        ? 'Completed'
                        : `${challenge.currentValue} / ${challenge.targetValue}`
                container.append(fragment)
            })
        } catch {
            if (!signal.aborted) {
                setText(
                    'commission-status',
                    'Commissions are unavailable. Open this panel again to retry.'
                )
            }
        }
    }
    const refreshLeaderboard = async () => {
        try {
            const data = await api.getLeaderboard(
                { gameId: GameID.BEJEWELED, limit: 5 },
                { signal }
            )
            if (!('leaderboard' in data)) {
                throw new Error('Leaderboard unavailable')
            }
            const list = document.getElementById('leaderboard')!
            list.replaceChildren()
            data.leaderboard.forEach(entry => {
                const row = document.createElement('li')
                const name = document.createElement('span')
                name.textContent = `${entry.rank}. ${entry.name}`
                const score = document.createElement('span')
                score.className = 'mono'
                score.textContent = entry.score.toLocaleString()
                row.append(name, score)
                list.append(row)
            })
            setText(
                'leaderboard-status',
                data.leaderboard.length ? '' : 'No recorded dives yet.'
            )
        } catch {
            if (!signal.aborted) {
                setText(
                    'leaderboard-status',
                    'The leaderboard is unavailable. Open the field log again to retry.'
                )
            }
        }
    }
    document
        .querySelectorAll<HTMLButtonElement>('[data-sheet]')
        .forEach(button =>
            button.addEventListener(
                'click',
                () => {
                    returnPanel = currentPanel
                    const state = handle?.game.getState()
                    resumeAfterSheet = Boolean(
                        state?.isActive && !state.isPaused
                    )
                    if (resumeAfterSheet) {
                        handle?.game.pause()
                    }
                    showSheet(button.dataset.sheet!)
                    if (currentPanel === 'log') {
                        void refreshLeaderboard()
                        void refreshAccount()
                    }
                    if (currentPanel === 'commission') {
                        void refreshAccount()
                    }
                },
                { signal }
            )
        )
    sheet
        .querySelectorAll('[data-close]')
        .forEach(button =>
            button.addEventListener('click', closeInfo, { signal })
        )
    sheet.addEventListener(
        'cancel',
        event => {
            event.preventDefault()
            if (panels.some(panel => panel.inert)) {
                return
            }
            if (['help', 'log', 'commission'].includes(currentPanel)) {
                closeInfo()
            } else if (currentPanel === 'pause') {
                handle?.game.resume()
            }
        },
        { signal }
    )
    // A second Escape makes the browser's close watcher force-close the dialog
    // (non-cancelable), bypassing closeSheet — reopen the panel it stranded.
    sheet.addEventListener(
        'close',
        () => {
            if (currentPanel) {
                showSheet(currentPanel)
            }
        },
        { signal }
    )
    const awards = document.getElementById('achievement-award-overlay')!
    const challenges = document.getElementById('challenge-complete-overlay')!
    const rewardObserver = new MutationObserver(() => {
        const active = !challenges.classList.contains('hidden')
            ? challenges
            : awards.style.display === 'flex'
              ? awards
              : null
        const wasBlocked = panels[0].inert
        if (active && !sheet.open) {
            handle?.game.pause()
        }
        panels.forEach(panel => {
            panel.inert = Boolean(active)
        })
        if (active) {
            active.querySelector<HTMLElement>('[data-card], button')?.focus()
        } else if (wasBlocked && sheet.open) {
            showSheet(currentPanel)
        }
    })
    rewardObserver.observe(awards, {
        attributes: true,
        attributeFilter: ['style'],
    })
    rewardObserver.observe(challenges, {
        attributes: true,
        attributeFilter: ['class'],
    })

    const preferences = () => {
        handle?.renderer.setPreferences(pace, glyphs, reducedMotion)
        document
            .querySelectorAll<HTMLButtonElement>('[data-pace]')
            .forEach(button =>
                button.setAttribute(
                    'aria-pressed',
                    String(button.dataset.pace === pace)
                )
            )
        for (const [id, value] of [
            ['glyphs-btn', glyphs],
            ['sound-btn', sound],
            ['motion-btn', reducedMotion],
        ] as const) {
            const button = document.getElementById(id)!
            button.setAttribute('aria-pressed', String(value))
            button.querySelector('[data-state]')!.textContent = value
                ? 'On'
                : 'Off'
        }
    }
    document
        .querySelectorAll<HTMLButtonElement>('[data-pace]')
        .forEach(button =>
            button.addEventListener(
                'click',
                () => {
                    pace = button.dataset.pace as typeof pace
                    preferences()
                },
                { signal }
            )
        )
    document.getElementById('glyphs-btn')!.addEventListener(
        'click',
        () => {
            glyphs = !glyphs
            preferences()
        },
        { signal }
    )
    document.getElementById('sound-btn')!.addEventListener(
        'click',
        () => {
            sound = !sound
            preferences()
        },
        { signal }
    )
    document.getElementById('motion-btn')!.addEventListener(
        'click',
        () => {
            reducedMotion = !reducedMotion
            preferences()
        },
        { signal }
    )
    pauseButton.addEventListener('click', () => handle?.game.pause(), {
        signal,
    })
    document
        .getElementById('resume-btn')!
        .addEventListener('click', () => handle?.game.resume(), { signal })
    document.getElementById('reset-btn')!.addEventListener(
        'click',
        () => {
            handle?.renderer.cancelAnimations()
            handle?.game.reset()
            handle?.game.start()
        },
        { signal }
    )
    const hint = () => {
        const state = handle?.game.getState()
        if (!state?.isActive || state.isPaused || state.isAnimating) {
            return
        }
        if (state.selected) {
            handle!.game.clickCell(state.selected.row, state.selected.col)
        }
        const move = findLegalSwap(state.grid)
        handle!.renderer.showHint(move ?? [])
        setText(
            'board-notice',
            move
                ? `Swap row ${move[0].row + 1}, column ${move[0].col + 1} with row ${move[1].row + 1}, column ${move[1].col + 1}`
                : 'No legal swaps — pause to start a fresh dive'
        )
    }
    hintButton.addEventListener('click', hint, { signal })
    document.addEventListener(
        'keydown',
        event => {
            if (
                isEditableTarget(event.target) ||
                event.target instanceof HTMLButtonElement ||
                event.target instanceof HTMLAnchorElement
            ) {
                return
            }
            if (panels.some(panel => panel.inert)) {
                return
            }
            if (event.key.toLowerCase() === 'p') {
                if (currentPanel === 'pause') {
                    event.preventDefault()
                    handle?.game.resume()
                } else if (!sheet.open) {
                    event.preventDefault()
                    handle?.game.pause()
                }
                return
            }
            if (sheet.open) {
                return
            }
            if (event.key.toLowerCase() === 'h') {
                event.preventDefault()
                hint()
                return
            }
            const delta = {
                ArrowUp: [-1, 0],
                ArrowDown: [1, 0],
                ArrowLeft: [0, -1],
                ArrowRight: [0, 1],
            }[event.key]
            if (delta) {
                event.preventDefault()
                handle?.renderer.moveCursor(delta[0], delta[1])
            } else if (event.key === 'Enter' || event.code === 'Space') {
                event.preventDefault()
                handle?.renderer.selectCursor()
            }
        },
        { signal }
    )
    const blip = () => {
        if (!sound) {
            return
        }
        try {
            audio ??= new AudioContext()
            void audio.resume().catch(() => {})
            const oscillator = audio.createOscillator(),
                gain = audio.createGain()
            oscillator.type = 'triangle'
            oscillator.frequency.value = 540
            gain.gain.setValueAtTime(0.035, audio.currentTime)
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                audio.currentTime + 0.14
            )
            oscillator.connect(gain)
            gain.connect(audio.destination)
            oscillator.start()
            oscillator.stop(audio.currentTime + 0.14)
        } catch {
            /* Audio may be unavailable in the browser. */
        }
    }
    const setTime = (time: number) => {
        const bar = host.querySelector<HTMLProgressElement>('#time-fill')!
        bar.value = time
        for (const el of [bar, host.querySelector('#time-remaining')!]) {
            el.classList.toggle('amber', time <= 20 && time > 10)
            el.classList.toggle('urgent', time <= 10)
        }
    }
    showSheet('intro')
    const initialize = async () => {
        try {
            handle = await initBejeweledGame(
                {},
                {
                    onStart: () => {
                        closeSheet()
                        pauseButton.disabled = false
                        hintButton.disabled = false
                        setText('score', 0)
                        setText('time-remaining', 60)
                        setTime(60)
                        setText('board-notice', 'Drag a gem onto its neighbour')
                    },
                    onPause: () => showSheet('pause'),
                    onResume: closeSheet,
                    onTimeUpdate: setTime,
                    onScoreUpdate: score => {
                        if (score > 0) {
                            blip()
                        }
                    },
                    onStateChange: state => {
                        const s = state as BejeweledState
                        setText(
                            'board-notice',
                            s.isAnimating
                                ? 'Chain in motion'
                                : 'Drag a gem onto its neighbour'
                        )
                        setText('moves', s.movesMade)
                        setText(
                            'cascade-label',
                            s.combo > 0
                                ? `×${s.combo} chain`
                                : s.isAnimating
                                  ? 'Swapping'
                                  : 'Idle'
                        )
                        setText(
                            'max-combo',
                            `×${handle?.game.getGameStats().maxCombo ?? 0}`
                        )
                        const cascadeLabel =
                            host.querySelector('#cascade-label')!
                        cascadeLabel.classList.toggle(
                            'accent',
                            s.combo > 0 && s.combo < 3
                        )
                        cascadeLabel.classList.toggle('amber', s.combo >= 3)
                        host.querySelectorAll('#cascade-pips span').forEach(
                            (pip, i) =>
                                pip.classList.toggle('active', i < s.combo)
                        )
                        hintButton.disabled = !s.isActive || s.isAnimating
                    },
                    onEnd: (score, stats) => {
                        const s = stats as BejeweledStats
                        pauseButton.disabled = true
                        hintButton.disabled = true
                        lastResult = { score, previousBest: visitBest }
                        visitBest = Math.max(visitBest, score)
                        syncBest()
                        setText('final-moves', s.movesMade)
                        setText('final-combo', `×${s.maxCombo}`)
                        setText('final-largest', s.largestMatch)
                        setText('final-matches', s.totalMatches)
                        setText(
                            'per-move',
                            s.movesMade ? Math.round(score / s.movesMade) : '—'
                        )
                        setText(
                            'results-title',
                            s.maxCombo >= 3
                                ? 'A chain reaction'
                                : 'The tide turns'
                        )
                        visits++
                        visitChain = Math.max(visitChain, s.maxCombo)
                        setText('visit-count', visits)
                        setText('visit-chain', `×${visitChain}`)
                        document
                            .getElementById('empty-log')!
                            .classList.add('hidden')
                        const row = document.createElement('li'),
                            label = document.createElement('span'),
                            value = document.createElement('span')
                        label.textContent = `Dive ${visits} · ${s.movesMade} moves · ×${s.maxCombo}`
                        value.className = 'mono'
                        value.textContent = score.toLocaleString()
                        row.append(label, value)
                        document.getElementById('recent-dives')!.prepend(row)
                        showSheet('results')
                    },
                },
                {
                    width: 640,
                    height: 640,
                    responsive: false,
                    gridPadding: 0,
                    cellPadding: 12.8,
                    backgroundColor: 0x070b16,
                }
            )
            if (disposed) {
                handle.cleanup()
                return
            }
            // onEnd fires before the score save resolves, so account state (XP,
            // challenge labels) refreshes off the post-save structured end event.
            // The event.data guard skips bare end events forwarded from the timer.
            handle.game.on('end', event => {
                if (event.data) {
                    void refreshAccount()
                }
            })
            preferences()
            startButton.disabled = false
            startButton.textContent = 'Begin the dive'
            if (signedIn) {
                savedBest = await getUserBestScore(GameID.BEJEWELED)
            }
            syncBest()
            void refreshAccount()
        } catch (error) {
            console.error('Failed to initialize Bejeweled:', error)
            document.getElementById('game-error')!.classList.remove('hidden')
            startButton.textContent = 'Plate unavailable'
        }
    }
    void initialize()
    document.addEventListener(
        'visibilitychange',
        () => {
            if (document.hidden) {
                handle?.game.pause()
            }
        },
        { signal }
    )
    window.addEventListener(
        'pagehide',
        event => {
            if (event.persisted) {
                handle?.game.pause()
                return
            }
            rewardObserver.disconnect()
            handle?.cleanup()
            void audio?.close()
        },
        { signal }
    )
    signal.addEventListener(
        'abort',
        () => {
            disposed = true
            rewardObserver.disconnect()
            handle?.cleanup()
            void audio?.close()
        },
        { once: true }
    )
}
