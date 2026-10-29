/**
 * Bubble Shooter field-plate controller (HPA-393 Stage 4). Extracted from
 * the route's root <script>; mount() is called by the BubbleShooterScreen
 * island with the plate body as host. Plate-body lookups are host-scoped;
 * the Astro-retained chrome (field sheet, reward overlays) stays on
 * document lookups. Abort (island unmount) detaches the global listeners
 * and tears down the run the same way a non-persisted pagehide does.
 */
import {
    initBubbleShooterGameFramework,
    type BubbleShooterInitResult,
} from '@/lib/games/bubble-shooter/initFramework'
import { DEFAULT_BUBBLE_SHOOTER_CONFIG } from '@cetus/games/bubble-shooter/BubbleShooterGame'
import type {
    BubbleShooterState,
    BubbleShooterStats,
} from '@cetus/games/bubble-shooter/types'
import { getUserBestScore } from '@/lib/services/scoreService'
import { GameID } from '@cetus/shared/games'

export function mount(host: HTMLElement, signal: AbortSignal): void {
    const sheet = document.querySelector<HTMLDialogElement>('#field-sheet')!
    const pauseButton = host.querySelector<HTMLButtonElement>('#pause-btn')!
    const startButton = document.querySelector<HTMLButtonElement>('#start-btn')!
    const panels = [...sheet.querySelectorAll<HTMLElement>('[data-panel]')]
    const awardOverlay = document.getElementById('achievement-award-overlay')!
    const challengeOverlay = document.getElementById(
        'challenge-complete-overlay'
    )!
    const signedIn = host.dataset.signedIn === 'true'
    let handle: BubbleShooterInitResult | undefined
    let currentPanel = 'intro'
    let returnPanel = 'intro'
    let resumeAfterSheet = false
    let savedBest: number | null = signedIn ? null : 0
    let visitBest = 0
    let lastResult: { score: number; previousBest: number } | null = null
    let diveCount = 0
    // Set by the abort listener; a handle adopted afterwards is dropped so
    // an aborted island never leaks its renderer.
    let disposed = false

    const showSheet = (name: string) => {
        currentPanel = name
        panels.forEach(panel =>
            panel.classList.toggle('hidden', panel.dataset.panel !== name)
        )
        const heading = sheet.querySelector<HTMLElement>(
            `[data-panel="${name}"] h2`
        )!
        sheet.setAttribute('aria-labelledby', heading.id)
        if (!sheet.open) {
            sheet.showModal()
        }
        heading.setAttribute('tabindex', '-1')
        heading.focus()
    }
    const closeSheet = () => {
        currentPanel = ''
        sheet.close()
        pauseButton.textContent = 'Ⅱ'
        pauseButton.setAttribute('aria-label', 'Pause')
        handle?.renderer.getApp()?.canvas.focus()
    }
    const syncBest = () => {
        // [data-best] spans the host island and the Astro-owned sheet panels.
        const best = savedBest === null ? null : Math.max(savedBest, visitBest)
        document.querySelectorAll('[data-best]').forEach(element => {
            element.textContent = best === null ? '—' : best.toLocaleString()
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
    document
        .querySelectorAll<HTMLButtonElement>('[data-sheet]')
        .forEach(button => {
            button.addEventListener('click', () => {
                returnPanel = currentPanel
                const state = handle?.getState()
                resumeAfterSheet = Boolean(state?.isActive && !state.isPaused)
                if (resumeAfterSheet) {
                    handle?.game.pause()
                }
                showSheet(button.dataset.sheet!)
            })
        })
    sheet
        .querySelectorAll('[data-close]')
        .forEach(button => button.addEventListener('click', closeInfo))
    sheet.addEventListener('cancel', event => {
        event.preventDefault()
        if (panels.some(panel => panel.inert)) {
            return
        }
        if (currentPanel === 'help' || currentPanel === 'log') {
            closeInfo()
        } else if (currentPanel === 'pause') {
            handle?.game.resume()
        }
    })
    // A second Escape makes the browser's close watcher force-close the dialog
    // (non-cancelable), bypassing closeSheet — reopen the panel it stranded.
    sheet.addEventListener('close', () => {
        if (currentPanel) {
            showSheet(currentPanel)
        }
    })
    showSheet('intro')

    // Reward queues can advance after the player has already begun another dive.
    const rewardObserver = new MutationObserver(() => {
        const activeReward = !challengeOverlay.classList.contains('hidden')
            ? challengeOverlay
            : awardOverlay.style.display === 'flex'
              ? awardOverlay
              : null
        const wasBlocked = panels[0].inert
        if (activeReward && !sheet.open) {
            handle?.game.pause()
        }
        panels.forEach(panel => {
            panel.inert = Boolean(activeReward)
        })
        if (activeReward) {
            activeReward
                .querySelector<HTMLElement>('[data-card], button')
                ?.focus()
        } else if (wasBlocked && sheet.open) {
            showSheet(currentPanel)
        }
    })
    rewardObserver.observe(awardOverlay, {
        attributes: true,
        attributeFilter: ['style'],
    })
    rewardObserver.observe(challengeOverlay, {
        attributes: true,
        attributeFilter: ['class'],
    })

    const initialize = async () => {
        try {
            handle = await initBubbleShooterGameFramework(
                {
                    colors: [0x6fe3ff, 0xffc24a, 0xff3d8a],
                    backgroundColor: 0x08161e,
                },
                {
                    onStart: () => {
                        closeSheet()
                        pauseButton.disabled = false
                        host.querySelector('#score')!.textContent = '0'
                    },
                    onPause: () => {
                        document.getElementById('pause-score')!.textContent =
                            document.getElementById('score')!.textContent
                        showSheet('pause')
                    },
                    onResume: closeSheet,
                    onStateChange: state => {
                        const s = state as BubbleShooterState
                        host.querySelector('#bubbles-popped')!.textContent =
                            String(s.bubblesPopped)
                        host.querySelector('#largest-combo')!.textContent =
                            String(s.largestCombo)
                        const { shooterY, bubbleRadius } =
                            DEFAULT_BUBBLE_SHOOTER_CONFIG
                        const lowest = s.grid.reduce(
                            (max, row) =>
                                Math.max(max, ...row.map(b => b?.y ?? 0)),
                            0
                        )
                        const percent = Math.min(
                            100,
                            Math.round(
                                (lowest / (shooterY - bubbleRadius * 5)) * 100
                            )
                        )
                        const color =
                            percent > 86
                                ? '#ff3d8a'
                                : percent > 62
                                  ? '#ffc24a'
                                  : '#22f5d0'
                        const fill =
                            host.querySelector<HTMLElement>('#gauge-fill')!
                        fill.style.width = `${percent}%`
                        fill.style.background = color
                        const label =
                            host.querySelector<HTMLElement>('#gauge-label')!
                        label.textContent =
                            percent > 86
                                ? 'Critical'
                                : percent > 62
                                  ? 'Closing'
                                  : 'Clear'
                        label.style.color = color
                        host.querySelector('#colony-gauge')!.setAttribute(
                            'aria-valuenow',
                            String(percent)
                        )
                        if (!s.gameStarted) {
                            host.querySelector('#score')!.textContent = '0'
                            pauseButton.disabled = true
                            startButton.textContent = 'Begin the dive'
                            showSheet('intro')
                        }
                    },
                    onEnd: (score, stats) => {
                        const s = stats as BubbleShooterStats
                        pauseButton.disabled = true
                        lastResult = { score, previousBest: visitBest }
                        visitBest = Math.max(visitBest, score)
                        syncBest()
                        document
                            .getElementById('empty-log')!
                            .classList.add('hidden')
                        const row = document.createElement('li')
                        const label = document.createElement('span')
                        label.textContent = `Dive ${++diveCount} · ${Math.round(s.accuracy)}% on target · ×${s.largestCombo}`
                        const value = document.createElement('span')
                        value.className = 'mono'
                        value.textContent = score.toLocaleString()
                        row.append(label, value)
                        document.getElementById('recent-dives')!.prepend(row)
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
            startButton.disabled = false
            startButton.textContent = 'Begin the dive'
            if (signedIn) {
                savedBest = await getUserBestScore(GameID.BUBBLE_SHOOTER)
            }
            syncBest()
        } catch (error) {
            console.error('Failed to load Bubble Shooter:', error)
            document.getElementById('game-error')!.classList.remove('hidden')
            startButton.textContent = 'Plate unavailable'
        }
    }
    void initialize()
    const onPageHide = (event: PageTransitionEvent) => {
        if (event.persisted) {
            handle?.game.pause()
            return
        }
        rewardObserver.disconnect()
        handle?.cleanup()
    }
    const onVisibilityChange = () => {
        if (document.hidden) {
            handle?.game.pause()
        }
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    signal.addEventListener(
        'abort',
        () => {
            disposed = true
            window.removeEventListener('pagehide', onPageHide)
            document.removeEventListener('visibilitychange', onVisibilityChange)
            rewardObserver.disconnect()
            handle?.cleanup()
        },
        { once: true }
    )
}
