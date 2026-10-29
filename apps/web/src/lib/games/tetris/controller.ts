/**
 * Tetris Challenge field-plate controller (HPA-393 Stage 4). Extracted from
 * the route's root <script>; mount() is called by the TetrisScreen island
 * with the plate body as host. Plate-body lookups are host-scoped; the
 * Astro-retained chrome (field sheet, header account label, reward
 * overlays) stays on document lookups. The script's internal
 * AbortController was unified with the signal the island passes in, so
 * abort (island unmount) detaches the same listeners a non-persisted
 * pagehide used to tear down.
 */
import {
    initTetrisGameFramework,
    type TetrisInitResult,
} from '@/lib/games/tetris/initFramework'
import type { TetrisState, TetrisStats } from '@cetus/games/tetris/types'
import { LINE_CLEAR_BASE_SCORE } from '@cetus/games/tetris/TetrisGame'
import { getUserBestScore } from '@/lib/services/scoreService'
import { GameID } from '@cetus/shared/games'
import { createApiClient } from '@cetus/api-client/api-client'

export function mount(host: HTMLElement, signal: AbortSignal): void {
    const api = createApiClient()

    const sheet = document.querySelector<HTMLDialogElement>('#field-sheet')!
    const panels = [...sheet.querySelectorAll<HTMLElement>('[data-panel]')]
    const startButton = document.querySelector<HTMLButtonElement>('#start-btn')!
    const pauseButton = host.querySelector<HTMLButtonElement>('#pause-btn')!
    const holdButton = host.querySelector<HTMLButtonElement>('#hold-btn')!
    const signedIn = host.dataset.signedIn === 'true'
    const setText = (id: string, value: string | number) => {
        document.getElementById(id)!.textContent = String(value)
    }
    let handle: TetrisInitResult | undefined
    let currentPanel = 'intro'
    let returnPanel = 'intro'
    let resumeAfterSheet = false
    let savedBest: number | null = signedIn ? null : 0
    let visitBest = 0
    let lastResult: { score: number; previousBest: number } | null = null
    let visits = 0
    let visitTetrises = 0
    let lastLines = 0
    let startingLevel = 1
    let ghost = true
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
                c => !c.gameId || c.gameId === GameID.TETRIS
            )
            setText(
                'commission-status',
                available.length
                    ? 'Complete a dive to record your progress.'
                    : 'No Tetris Challenge commissions today. Explore the catalogue for today’s challenges.'
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
                { gameId: GameID.TETRIS, limit: 5 },
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
        handle?.setPreferences(ghost, glyphs)
        host.classList.toggle('reduced-motion', reducedMotion)
        document
            .querySelectorAll<HTMLButtonElement>('[data-level]')
            .forEach(button =>
                button.setAttribute(
                    'aria-pressed',
                    String(Number(button.dataset.level) === startingLevel)
                )
            )
        for (const [id, value] of [
            ['ghost-btn', ghost],
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
        .querySelectorAll<HTMLButtonElement>('[data-level]')
        .forEach(button =>
            button.addEventListener(
                'click',
                () => {
                    startingLevel = Number(button.dataset.level)
                    handle?.game.setStartingLevel(startingLevel)
                    preferences()
                },
                { signal }
            )
        )
    document.getElementById('ghost-btn')!.addEventListener(
        'click',
        () => {
            ghost = !ghost
            preferences()
        },
        { signal }
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
    document
        .getElementById('resume-btn')!
        .addEventListener('click', () => handle?.game.resume(), { signal })
    holdButton.addEventListener(
        'click',
        () => {
            handle?.game.holdPiece()
            handle?.renderer.getApp()?.canvas.focus()
        },
        { signal }
    )
    document.addEventListener(
        'keydown',
        event => {
            if (
                event.key.toLowerCase() === 'p' &&
                currentPanel === 'pause' &&
                !panels.some(panel => panel.inert)
            ) {
                event.preventDefault()
                handle?.game.resume()
            }
        },
        { signal }
    )
    document.addEventListener(
        'visibilitychange',
        () => {
            if (document.hidden) {
                handle?.game.pause()
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
    document
        .querySelectorAll<HTMLCanvasElement>('canvas.rule-figure')
        .forEach(cv => {
            const c = cv.getContext('2d')
            if (!c) {
                return
            }
            const W = cv.width
            const H = cv.height
            c.clearRect(0, 0, W, H)
            const cell = 20
            const cols = 10
            const originX = (W - cols * cell) / 2
            const cellRect = (
                col: number,
                row: number,
                fill: string | null,
                stroke?: string
            ) => {
                const x = originX + col * cell
                const y = H - (row + 1) * cell - 20
                if (fill) {
                    c.fillStyle = fill
                    c.fillRect(x + 1, y + 1, cell - 2, cell - 2)
                }
                if (stroke) {
                    c.strokeStyle = stroke
                    c.lineWidth = 1.5
                    c.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3)
                }
            }
            c.strokeStyle = 'rgba(234,246,255,0.07)'
            c.lineWidth = 1
            for (let col = 0; col <= cols; col++) {
                const x = originX + col * cell
                c.beginPath()
                c.moveTo(x, 20)
                c.lineTo(x, H - 20)
                c.stroke()
            }
            const fig = cv.dataset.fig
            if (fig === 'line') {
                // a full row, about to clear, with the piece that completed it
                for (let col = 0; col < cols; col++) {
                    cellRect(
                        col,
                        0,
                        col === 4 || col === 5
                            ? '#ffff00'
                            : 'rgba(111,227,255,0.5)'
                    )
                }
                cellRect(4, 1, '#ffff00')
                cellRect(5, 1, '#ffff00')
                c.strokeStyle = '#22F5D0'
                c.lineWidth = 2.5
                c.beginPath()
                c.moveTo(originX - 6, H - cell - 20 + cell / 2)
                c.lineTo(originX + cols * cell + 6, H - cell - 20 + cell / 2)
                c.stroke()
            } else if (fig === 'ghost') {
                // the T piece up top, its landing outlined below
                cellRect(4, 7, '#800080')
                cellRect(3, 6, '#800080')
                cellRect(4, 6, '#800080')
                cellRect(5, 6, '#800080')
                cellRect(4, 1, null, 'rgba(234,246,255,0.55)')
                cellRect(3, 0, null, 'rgba(234,246,255,0.55)')
                cellRect(4, 0, null, 'rgba(234,246,255,0.55)')
                cellRect(5, 0, null, 'rgba(234,246,255,0.55)')
                c.strokeStyle = 'rgba(234,246,255,0.3)'
                c.setLineDash([3, 5])
                c.lineWidth = 1.5
                c.beginPath()
                c.moveTo(originX + 4.5 * cell, H - 7 * cell - 20)
                c.lineTo(originX + 4.5 * cell, H - 2 * cell - 20)
                c.stroke()
                c.setLineDash([])
            } else {
                // four rows going at once with the I piece standing in the well
                for (let row = 0; row < 4; row++) {
                    for (let col = 0; col < cols; col++) {
                        cellRect(
                            col,
                            row,
                            col === 9 ? '#00ffff' : 'rgba(111,227,255,0.38)'
                        )
                    }
                }
                c.strokeStyle = '#FFC24A'
                c.lineWidth = 2.5
                c.strokeRect(
                    originX + 1,
                    H - 4 * cell - 20 + 1,
                    cols * cell - 2,
                    4 * cell - 2
                )
            }
        })
    showSheet('intro')
    const initialize = async () => {
        try {
            handle = await initTetrisGameFramework(
                {
                    blockSize: 32,
                    gameWidth: 320,
                    gameHeight: 640,
                    backgroundColor: 0x070b16,
                    gridColor: 0xeaf6ff,
                },
                {
                    onStart: () => {
                        closeSheet()
                        lastLines = 0
                        pauseButton.disabled = false
                        host.querySelector('#line-feedback')!.textContent = ''
                        host.querySelectorAll('#clear-flash span').forEach(el =>
                            el.classList.remove('flash')
                        )
                    },
                    onPause: () => showSheet('pause'),
                    onResume: closeSheet,
                    onScoreUpdate: score => {
                        if (score > 0) {
                            blip()
                        }
                    },
                    onStateChange: state => {
                        const s = state as TetrisState
                        host.querySelector('#clear-streak')!.textContent =
                            `×${s.stats.consecutiveLineClears}`
                        host.querySelector('#drop-rate')!.textContent =
                            `${(s.dropInterval / 1000).toFixed(2)} s`
                        host.querySelector('#next-level')!.textContent =
                            `${10 - (s.lines % 10)} lines to level ${s.level + 1}`
                        const bar =
                            host.querySelector<HTMLProgressElement>(
                                '#rate-fill'
                            )!
                        bar.value = Math.max(
                            4,
                            ((1000 - s.dropInterval) / 950) * 100
                        )
                        for (const el of [
                            bar,
                            host.querySelector('#drop-rate')!,
                        ]) {
                            el.classList.toggle(
                                'amber',
                                s.dropInterval <= 550 && s.dropInterval > 250
                            )
                            el.classList.toggle('urgent', s.dropInterval <= 250)
                        }
                        holdButton.disabled =
                            !s.isActive || s.isPaused || s.holdUsed
                        host.querySelector('#hold-state')!.textContent =
                            s.holdUsed ? 'Used' : 'Ready'
                        host.querySelector('#hold-state')!.classList.toggle(
                            'accent',
                            !s.holdUsed
                        )
                        const count = s.lines - lastLines
                        if (count > 0) {
                            const feedback =
                                host.querySelector('#line-feedback')!
                            feedback.textContent = `${['', 'Single', 'Double', 'Triple', 'Tetris'][count]} +${(LINE_CLEAR_BASE_SCORE[count] ?? 0) * s.level}`
                            feedback.classList.toggle('amber', count === 4)
                            feedback.getAnimations().forEach(a => a.cancel())
                            feedback.animate(
                                reducedMotion
                                    ? [{ opacity: 1 }, { opacity: 1 }]
                                    : [
                                          {
                                              opacity: 1,
                                              transform: 'translate(-50%, 0)',
                                          },
                                          {
                                              opacity: 0,
                                              transform:
                                                  'translate(-50%, -60px)',
                                          },
                                      ],
                                { duration: 900 }
                            )
                            host.querySelectorAll<HTMLElement>(
                                '#clear-flash span'
                            ).forEach((el, row) => {
                                el.classList.remove('flash')
                                void el.offsetWidth
                                if (
                                    !reducedMotion &&
                                    s.clearedRows.includes(row)
                                ) {
                                    el.classList.add('flash')
                                }
                            })
                        }
                        lastLines = s.lines
                    },
                    onEnd: (score, stats) => {
                        const s = stats as TetrisStats
                        pauseButton.disabled = true
                        holdButton.disabled = true
                        lastResult = { score, previousBest: visitBest }
                        visitBest = Math.max(visitBest, score)
                        syncBest()
                        setText(
                            'final-streak',
                            `×${s.maxConsecutiveLineClears}`
                        )
                        setText(
                            'per-form',
                            s.pieces ? Math.round(score / s.pieces) : '—'
                        )
                        setText(
                            'results-title',
                            s.tetrises
                                ? 'A clean four'
                                : s.lines >= 10
                                  ? 'Steady quarrying'
                                  : 'The stack won'
                        )
                        setText(
                            'result-advice',
                            s.tetrises
                                ? 'Four at once is where the score lives — that single clear paid as much as thirty singles. Keep a well open on one side and feed it the long form.'
                                : s.lines >= 10
                                  ? 'Good volume, thin value. Singles pay 40; four together pay 1,200. Stack flat and hold one column open.'
                                  : 'The stack outran you. Use the landing outline and drop early — a clean floor is worth more than a fast one.'
                        )
                        const clears = [
                                s.singles,
                                s.doubles,
                                s.triples,
                                s.tetrises,
                            ],
                            max = Math.max(1, ...clears)
                        document
                            .querySelectorAll<HTMLElement>('[data-clear-bar]')
                            .forEach((el, i) => {
                                el.style.height = `${(clears[i] / max) * 100}%`
                            })
                        document
                            .querySelectorAll('[data-clear-count]')
                            .forEach((el, i) => {
                                el.textContent = String(clears[i])
                            })
                        visits++
                        visitTetrises += s.tetrises
                        setText('visit-count', visits)
                        setText('visit-tetrises', visitTetrises)
                        document
                            .getElementById('empty-log')!
                            .classList.add('hidden')
                        const row = document.createElement('li'),
                            label = document.createElement('span'),
                            value = document.createElement('span')
                        label.textContent = `Dive ${visits} · ${s.lines} lines · lv ${s.level}`
                        value.className = 'mono'
                        value.textContent = score.toLocaleString()
                        row.append(label, value)
                        document.getElementById('recent-dives')!.prepend(row)
                        showSheet('results')
                    },
                }
            )
            if (!handle) {
                throw new Error('Tetris renderer unavailable')
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
            ;(window as Window & { tetrisGame?: TetrisInitResult }).tetrisGame =
                handle
            const canvas = handle.renderer.getApp()!.canvas
            let touch:
                | {
                      x: number
                      y: number
                      id: number
                      moved: boolean
                      columns: number
                  }
                | undefined
            canvas.addEventListener(
                'pointerdown',
                event => {
                    if (
                        !handle?.game.getState().isActive ||
                        handle.game.getState().isPaused
                    ) {
                        return
                    }
                    canvas.focus()
                    canvas.setPointerCapture(event.pointerId)
                    touch = {
                        x: event.clientX,
                        y: event.clientY,
                        id: event.pointerId,
                        moved: false,
                        columns: 0,
                    }
                },
                { signal }
            )
            canvas.addEventListener(
                'pointermove',
                event => {
                    if (!touch || event.pointerId !== touch.id) {
                        return
                    }
                    const size = canvas.getBoundingClientRect().width / 10
                    const dx = event.clientX - touch.x
                    const dy = event.clientY - touch.y
                    touch.moved ||= Math.abs(dx) > 8 || Math.abs(dy) > 8
                    if (Math.abs(dx) >= Math.abs(dy)) {
                        const columns = Math.round(dx / size)
                        const steps = columns - touch.columns
                        for (let i = 0; i < Math.abs(steps); i++) {
                            if (steps > 0) {
                                handle?.game.moveRight()
                            } else {
                                handle?.game.moveLeft()
                            }
                        }
                        touch.columns = columns
                    }
                },
                { signal }
            )
            canvas.addEventListener(
                'pointerup',
                event => {
                    if (!touch || event.pointerId !== touch.id) {
                        return
                    }
                    const dx = event.clientX - touch.x
                    const dy = event.clientY - touch.y
                    if (dy > 36 && dy > Math.abs(dx)) {
                        handle?.game.hardDrop()
                    } else if (
                        !touch.moved &&
                        Math.abs(dx) <= 8 &&
                        Math.abs(dy) <= 8
                    ) {
                        handle?.game.rotate()
                    }
                    touch = undefined
                },
                { signal }
            )
            canvas.addEventListener(
                'pointercancel',
                () => {
                    touch = undefined
                },
                { signal }
            )
            preferences()
            startButton.disabled = false
            startButton.textContent = 'Begin the dive'
            if (signedIn) {
                savedBest = await getUserBestScore(GameID.TETRIS)
            }
            syncBest()
            void refreshAccount()
        } catch (error) {
            console.error('Failed to initialize Tetris Challenge:', error)
            document.getElementById('game-error')!.classList.remove('hidden')
            startButton.textContent = 'Plate unavailable'
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
