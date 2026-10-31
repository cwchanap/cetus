/**
 * 2048 field-plate controller (HPA-393 Stage 4). Extracted from the
 * route's root <script>; mount() is called by the Game2048Screen island
 * with the plate body as host. Plate-body lookups are host-scoped; the
 * Astro-retained chrome (field sheet, header account label, reward
 * overlays) stays on document lookups. The script's internal
 * AbortController was unified with the signal the island passes in, so
 * abort (island unmount) detaches the same listeners a non-persisted
 * pagehide used to tear down.
 */

import {
    init2048GameFramework,
    type Game2048InitResult,
} from '@/lib/games/2048/initFramework'
import type {
    Game2048State,
    Game2048Stats,
} from '@cetus/games/2048/frameworkTypes'
import { getTileColor, getTileTextColor } from '@cetus/games/2048/utils'
import { getUserBestScore } from '@/lib/services/scoreService'
import { GameID } from '@cetus/shared/games'
import { createApiClient } from '@cetus/api-client/api-client'

export function mount(host: HTMLElement, signal: AbortSignal): void {
    const api = createApiClient()

    const sheet = document.querySelector<HTMLDialogElement>('#field-sheet')!
    const panels = [...sheet.querySelectorAll<HTMLElement>('[data-panel]')]
    const startButton = document.querySelector<HTMLButtonElement>('#start-btn')!
    const pauseButton = host.querySelector<HTMLButtonElement>('#pause-btn')!
    const undoButton = host.querySelector<HTMLButtonElement>('#undo-btn')!
    const signedIn = host.dataset.signedIn === 'true'
    const setText = (id: string, value: string | number) => {
        document.getElementById(id)!.textContent = String(value)
    }
    const hex = (value: number) => '#' + value.toString(16).padStart(6, '0')
    let handle: Game2048InitResult | undefined
    let currentPanel = 'intro'
    let returnPanel = 'intro'
    let resumeAfterSheet = false
    let savedBest: number | null = signedIn ? null : 0
    let visitBest = 0
    let lastResult: { score: number; previousBest: number } | null = null
    let visits = 0
    let visitTile = 0
    let previousScore = 0
    let previousMax = 0
    let previousWon = false
    let previousUndosUsed = 0
    let sound = true
    let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    let audio: AudioContext | undefined
    // Set by the abort listener; an in-flight initialize adopts nothing so
    // an aborted island never leaks its renderer.
    let disposed = false
    const syncBest = () => {
        const best = savedBest === null ? null : Math.max(savedBest, visitBest)
        document.querySelectorAll('[data-best]').forEach(el => {
            el.textContent = best === null ? '—' : best.toLocaleString()
        })
        setText(
            'previous-best',
            savedBest === null
                ? '—'
                : Math.max(
                      savedBest,
                      lastResult?.previousBest ?? 0
                  ).toLocaleString()
        )
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
        handle?.renderer.getApp()?.canvas.focus({ preventScroll: true })
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
                c => !c.gameId || c.gameId === GameID.GAME_2048
            )
            setText(
                'commission-status',
                available.length
                    ? 'Complete a dive to record your progress.'
                    : 'No 2048 commissions today. Explore the catalogue for today’s challenges.'
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
                { gameId: GameID.GAME_2048, limit: 5 },
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
                    const state = handle?.getState()
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
    document
        .querySelectorAll('[data-close]')
        .forEach(button =>
            button.addEventListener('click', closeInfo, { signal })
        )
    pauseButton.addEventListener('click', () => handle?.game.pause(), {
        signal,
    })
    document
        .getElementById('resume-btn')!
        .addEventListener('click', () => handle?.game.resume(), { signal })
    const finish = () => {
        void handle?.endGame()
    }
    document
        .querySelectorAll('[data-end]')
        .forEach(button => button.addEventListener('click', finish, { signal }))
    document.getElementById('keep-playing-btn')!.addEventListener(
        'click',
        () => {
            if (handle?.getState().stuck) {
                if (handle.game.canUndo()) {
                    showSheet('stuck')
                } else {
                    finish()
                }
            } else {
                handle?.game.resume()
            }
        },
        { signal }
    )
    const undo = () => {
        if (handle?.undo()) {
            handle.renderer.getApp()?.canvas.focus({ preventScroll: true })
        }
    }
    undoButton.addEventListener('click', undo, { signal })
    document.getElementById('undo-stuck-btn')!.addEventListener(
        'click',
        () => {
            handle?.game.resume()
            undo()
        },
        { signal }
    )
    document
        .querySelectorAll<HTMLButtonElement>('[data-undos]')
        .forEach(button =>
            button.addEventListener(
                'click',
                () => {
                    const value = Number(button.dataset.undos)
                    handle?.game.setUndos(value)
                    document
                        .querySelectorAll<HTMLButtonElement>('[data-undos]')
                        .forEach(el =>
                            el.setAttribute(
                                'aria-pressed',
                                String(Number(el.dataset.undos) === value)
                            )
                        )
                },
                { signal }
            )
        )
    const syncPreferences = () => {
        setText('sound-state', sound ? 'On' : 'Off')
        setText('motion-state', reducedMotion ? 'On' : 'Off')
        document
            .getElementById('sound-btn')!
            .setAttribute('aria-pressed', String(sound))
        document
            .getElementById('motion-btn')!
            .setAttribute('aria-pressed', String(reducedMotion))
        sheet.dataset.reducedMotion = String(reducedMotion)
        handle?.renderer.setReducedMotion(reducedMotion)
        if (handle && reducedMotion) {
            handle.renderer.render(handle.getState())
        }
    }
    document.getElementById('sound-btn')!.addEventListener(
        'click',
        () => {
            sound = !sound
            syncPreferences()
        },
        { signal }
    )
    document.getElementById('motion-btn')!.addEventListener(
        'click',
        () => {
            reducedMotion = !reducedMotion
            syncPreferences()
        },
        { signal }
    )
    document.addEventListener(
        'keydown',
        event => {
            if (panels.some(panel => panel.inert)) {
                return
            }
            if (event.key.toLowerCase() === 'p' && currentPanel === 'pause') {
                event.preventDefault()
                handle?.game.resume()
            }
        },
        { signal }
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
    document.addEventListener(
        'visibilitychange',
        () => {
            if (
                document.hidden &&
                handle?.getState().isActive &&
                !handle.getState().isPaused
            ) {
                handle.game.pause()
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
        panels.forEach(panel => (panel.inert = Boolean(active)))
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
    const blip = () => {
        if (!sound) {
            return
        }
        try {
            audio ??= new AudioContext()
            void audio.resume()
            const oscillator = audio.createOscillator(),
                gain = audio.createGain()
            oscillator.type = 'triangle'
            oscillator.frequency.value = 420
            gain.gain.setValueAtTime(0.035, audio.currentTime)
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                audio.currentTime + 0.12
            )
            oscillator.connect(gain)
            gain.connect(audio.destination)
            oscillator.start()
            oscillator.stop(audio.currentTime + 0.12)
        } catch {
            /* Audio may be unavailable. */
        }
    }
    const tile = (
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        size: number,
        value: number
    ) => {
        context.beginPath()
        context.roundRect(x - size / 2, y - size / 2, size, size, size * 0.1)
        context.fillStyle = hex(getTileColor(value))
        if (value >= 2048) {
            context.shadowColor = context.fillStyle
            context.shadowBlur = 22
        }
        context.fill()
        context.shadowBlur = 0
        context.strokeStyle = 'rgba(234,246,255,.14)'
        context.stroke()
        context.fillStyle = hex(getTileTextColor(value))
        context.font = `500 ${Math.round(size * (value < 100 ? 0.46 : 0.3))}px "Field Display", serif`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(String(value), x, y + size * 0.03)
    }
    const paintFigures = () =>
        document
            .querySelectorAll<HTMLCanvasElement>('.rule-figure')
            .forEach(canvas => {
                const c = canvas.getContext('2d')!
                c.clearRect(0, 0, 300, 200)
                if (canvas.dataset.fig === 'goal') {
                    tile(c, 150, 100, 112, 2048)
                    return
                }
                for (const y of [52, 148]) {
                    for (let col = 0; col < 4; col++) {
                        c.beginPath()
                        c.roundRect(42 + col * 56 - 24, y - 24, 48, 48, 5)
                        c.fillStyle = '#0b1020'
                        c.fill()
                        c.strokeStyle = '#1a2a3a'
                        c.stroke()
                    }
                }
                tile(c, 98, 52, 48, 2)
                tile(c, 210, 52, 48, canvas.dataset.fig === 'slide' ? 8 : 2)
                tile(c, 42, 148, 48, canvas.dataset.fig === 'slide' ? 2 : 4)
                if (canvas.dataset.fig === 'slide') {
                    tile(c, 98, 148, 48, 8)
                }
                c.fillStyle = '#22f5d0'
                c.font = '600 18px "Field Mono",monospace'
                c.textAlign = 'center'
                c.fillText('◂', 150, 100)
                if (canvas.dataset.fig === 'merge') {
                    c.fillText('+4', 98, 148)
                }
            })
    showSheet('intro')
    syncBest()
    if (signedIn) {
        // getUserBestScore collapses failures and "no score yet" to a resolved
        // null (see scoreService), so there is no rejection path to handle; null
        // keeps the unknown-best rendering ("—", no personal-best badge).
        void getUserBestScore(GameID.GAME_2048).then(score => {
            savedBest = score
            syncBest()
        })
    }
    const initialize = async () => {
        try {
            await document.fonts.load('500 40px "Field Display"')
            paintFigures()
            handle = await init2048GameFramework(
                {
                    tileSize: 142.5,
                    gap: 14,
                    gameWidth: 640,
                    gameHeight: 640,
                    animationDuration: 110,
                },
                {
                    onStart: () => {
                        closeSheet()
                        previousScore = 0
                        previousMax = 0
                        previousWon = false
                        previousUndosUsed = 0
                        pauseButton.disabled = false
                        host.querySelector('#merge-feedback')!.textContent = ''
                        host.querySelector('#game-status')!.textContent =
                            'Dive started. Use arrow keys or swipe to slide.'
                    },
                    onPause: () => showSheet('pause'),
                    onResume: closeSheet,
                    onStateChange: state => {
                        const s = state as Game2048State
                        const next = [64, 128, 256, 512, 1024, 2048, 4096].find(
                            value => value > s.maxTile
                        )
                        host.querySelector('#next-target')!.textContent = next
                            ? `Next · ${next}`
                            : 'Beyond the chart'
                        host.querySelectorAll<HTMLElement>(
                            '[data-milestone]'
                        ).forEach(el => {
                            const value = Number(el.dataset.milestone),
                                reached = s.maxTile >= value
                            el.style.background = reached
                                ? hex(getTileColor(value))
                                : 'transparent'
                            el.style.borderColor = reached
                                ? hex(getTileColor(value))
                                : value === next
                                  ? '#22f5d0'
                                  : '#26333d'
                            el.setAttribute(
                                'aria-label',
                                `${value}${reached ? ', reached' : ''}`
                            )
                        })
                        const free = s.board
                            .flat()
                            .filter(value => !value).length
                        const directions = handle?.game.legalDirections() ?? []
                        const arrow = {
                            left: '◂',
                            right: '▸',
                            up: '▴',
                            down: '▾',
                        }
                        host.querySelector('#board-warning')!.textContent =
                            !s.isActive
                                ? ''
                                : directions.length === 1
                                  ? `One way out ${arrow[directions[0]]}`
                                  : free <= 2
                                    ? `${free} cell${free === 1 ? '' : 's'} free`
                                    : ''
                        host.querySelector('#board-warning')!.classList.toggle(
                            'urgent',
                            directions.length === 1
                        )
                        host.querySelector('#undos-left')!.textContent = String(
                            s.undosLeft
                        )
                        undoButton.disabled =
                            !handle?.game.canUndo() || s.isPaused
                        undoButton.style.visibility =
                            s.undosLeft + s.undosUsed > 0 ? 'visible' : 'hidden'
                        const gain = s.score - previousScore
                        if (gain > 0) {
                            const feedback =
                                host.querySelector('#merge-feedback')!
                            feedback.textContent = `+${gain}`
                            feedback
                                .getAnimations()
                                .forEach(animation => animation.cancel())
                            feedback.animate(
                                reducedMotion
                                    ? [{ opacity: 1 }, { opacity: 1 }]
                                    : [
                                          {
                                              opacity: 1,
                                              transform: 'translate(-50%,0)',
                                          },
                                          {
                                              opacity: 0,
                                              transform:
                                                  'translate(-50%,-50px)',
                                          },
                                      ],
                                { duration: 900 }
                            )
                            blip()
                        }
                        if (s.maxTile >= 64 && s.maxTile > previousMax) {
                            host.querySelector('#game-status')!.textContent =
                                `New highest tile: ${s.maxTile}. Score ${s.score}.`
                        }
                        if (s.undosUsed > previousUndosUsed) {
                            host.querySelector('#game-status')!.textContent =
                                `Move undone. ${
                                    s.undosLeft
                                } undo${s.undosLeft === 1 ? '' : 's'} left.`
                        }
                        previousUndosUsed = s.undosUsed
                        previousScore = s.score
                        previousMax = s.maxTile
                        document
                            .querySelectorAll('[data-best]')
                            .forEach(
                                el =>
                                    (el.textContent =
                                        savedBest === null
                                            ? '—'
                                            : String(
                                                  Math.max(
                                                      savedBest,
                                                      visitBest,
                                                      s.score
                                                  )
                                              ))
                            )
                        if (s.won && !previousWon && s.isActive) {
                            handle?.game.pause()
                            setText(
                                'win-line',
                                `${s.score} points · ${s.moveCount} move${s.moveCount === 1 ? '' : 's'}`
                            )
                            showSheet('win')
                        } else if (
                            s.stuck &&
                            handle?.game.canUndo() &&
                            s.isActive
                        ) {
                            handle.game.pause()
                            showSheet('stuck')
                        }
                        previousWon = s.won
                    },
                    onEnd: (score, stats) => {
                        const s = stats as Game2048Stats
                        pauseButton.disabled = true
                        undoButton.disabled = true
                        lastResult = { score, previousBest: visitBest }
                        visitBest = Math.max(visitBest, score)
                        syncBest()
                        setText('final-merges', s.mergeCount)
                        setText(
                            'points-per-move',
                            s.moveCount ? Math.round(score / s.moveCount) : '—'
                        )
                        setText('final-undos', s.undosUsed)
                        document
                            .getElementById('final-undos')!
                            .classList.toggle('amber', s.undosUsed > 0)
                        const finalTile =
                            document.getElementById('final-max-tile')!
                        finalTile.style.background = hex(
                            getTileColor(s.maxTile)
                        )
                        finalTile.style.color = hex(getTileTextColor(s.maxTile))
                        finalTile.style.fontSize =
                            s.maxTile < 100
                                ? '32px'
                                : s.maxTile < 1000
                                  ? '27px'
                                  : '21px'
                        setText(
                            'results-title',
                            s.maxTile >= 2048
                                ? 'A specimen of record'
                                : s.maxTile >= 512
                                  ? 'Deep, not deep enough'
                                  : 'The bed set early'
                        )
                        setText(
                            'result-advice',
                            s.maxTile >= 2048
                                ? 'A specimen of record. Past 2048 the board gets tight fast — keep the largest tile pinned in one corner and never slide away from it.'
                                : s.maxTile >= 512
                                  ? 'Close. Runs usually break when the big tile leaves its corner. Favour two directions and only use the third when forced.'
                                  : 'Pick a corner and keep your largest tile there. Sliding toward it every move builds a descending chain instead of scattered pairs.'
                        )
                        visits++
                        visitTile = Math.max(visitTile, s.maxTile)
                        setText('visit-count', visits)
                        setText('visit-tile', visitTile)
                        document
                            .getElementById('empty-log')!
                            .classList.add('hidden')
                        const row = document.createElement('li'),
                            detail = document.createElement('span'),
                            points = document.createElement('span')
                        detail.textContent = `Tile ${s.maxTile} · ${s.moveCount} move${s.moveCount === 1 ? '' : 's'}${s.undosUsed ? ` · ${s.undosUsed} undo${s.undosUsed === 1 ? '' : 's'}` : ''}`
                        points.textContent = String(score)
                        points.className = 'mono'
                        row.append(detail, points)
                        document.getElementById('recent-dives')!.prepend(row)
                        host.querySelector('#game-status')!.textContent =
                            `Dive over. Score ${score}, highest tile ${s.maxTile}.`
                        showSheet('results')
                    },
                }
            )
            if (!handle) {
                throw new Error('Renderer unavailable')
            }
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
            ;(window as Window & { game2048?: Game2048InitResult }).game2048 =
                handle
            syncPreferences()
            startButton.disabled = false
            setText('load-status', '')
        } catch (error) {
            setText(
                'load-status',
                'The plate could not start. Reload the page to try again.'
            )
            console.error(error)
        }
    }
    void initialize()
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
