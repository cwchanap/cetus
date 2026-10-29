import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { initializeSatelliteSyncMock } = vi.hoisted(() => ({
  initializeSatelliteSyncMock: vi.fn(),
}))

vi.mock('@/lib/games/satellite-sync/init', () => ({
  initializeSatelliteSync: initializeSatelliteSyncMock,
}))

import SatelliteSyncScreen from './SatelliteSyncScreen'

interface SatelliteSyncCallbacks {
  onGameStart: () => void
  onTimeUpdate: (seconds: number) => void
  onScoreUpdate: (score: number) => void
  onLock: (info: { combo: number; multiplier: number }) => void
  onComboReset: () => void
  onLevelClear: (levelNumber: number) => void
  onFail: (levelNumber: number, finalScore: number) => void
  onWin: (finalScore: number) => void
  onError?: (title: string, message: string) => void
}

type WindowWithSatelliteSyncGame = Window & {
  satelliteSyncGame?: { cleanup: () => void }
}
type WindowWithToasts = Window & {
  showAchievementAward?: ReturnType<typeof vi.fn>
  showChallengeComplete?: ReturnType<typeof vi.fn>
}

async function mountAndInit() {
  const view = render(<SatelliteSyncScreen />)
  await waitFor(() => {
    expect(initializeSatelliteSyncMock).toHaveBeenCalledTimes(1)
  })
  const [host, callbacks] = initializeSatelliteSyncMock.mock.calls[0]
  return {
    view,
    host: host as HTMLElement,
    callbacks: callbacks as SatelliteSyncCallbacks,
  }
}

describe('SatelliteSyncScreen', () => {
  let startMock: ReturnType<typeof vi.fn>
  let stopMock: ReturnType<typeof vi.fn>
  let cleanupMock: ReturnType<typeof vi.fn>
  let fakeHandle: {
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    cleanup: ReturnType<typeof vi.fn>
    getGame: () => null
  }

  beforeEach(() => {
    vi.clearAllMocks()
    startMock = vi.fn().mockResolvedValue(undefined)
    stopMock = vi.fn()
    cleanupMock = vi.fn()
    fakeHandle = {
      start: startMock,
      stop: stopMock,
      cleanup: cleanupMock,
      getGame: () => null,
    }
    initializeSatelliteSyncMock.mockResolvedValue(fakeHandle)
    // Toast spies: the island must never install a second toast path.
    ;(window as WindowWithToasts).showAchievementAward = vi.fn()
    ;(window as WindowWithToasts).showChallengeComplete = vi.fn()
  })

  afterEach(() => {
    delete (window as WindowWithToasts).showAchievementAward
    delete (window as WindowWithToasts).showChallengeComplete
  })

  it('mounts the initializer on the ref host element and publishes the debug handle', async () => {
    const { host } = await mountAndInit()

    // SSR/host markup keeps the frozen e2e selectors.
    expect(host.id).toBe('game-canvas-container')
    // Idle HUD is byte-equal to the legacy route: pre-start prompt visible,
    // score 0, initial time 60, level 1, combo ×1, start shown / end hidden.
    expect(document.querySelector('#game-status')).not.toHaveClass('hidden')
    expect(document.querySelector('#score')?.textContent).toBe('0')
    expect(document.querySelector('#time-remaining')?.textContent).toBe('60')
    expect(document.querySelector('#level')?.textContent).toBe('1')
    expect(document.querySelector('#combo')?.textContent).toBe('×1')
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#end-btn')).not.toBeVisible()
    expect((window as WindowWithSatelliteSyncGame).satelliteSyncGame).toBe(
      fakeHandle
    )
  })

  it('starts through the handle and hides start during setup', async () => {
    let resolveStart: () => void = () => {}
    startMock.mockReturnValue(
      new Promise<void>(resolve => {
        resolveStart = resolve
      })
    )
    await mountAndInit()

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    // The legacy double-click guard: start hides synchronously while the
    // Pixi setup inside handle.start() is pending.
    await waitFor(() => {
      expect(startMock).toHaveBeenCalledTimes(1)
    })
    expect(document.querySelector('#start-btn')).toHaveStyle({
      display: 'none',
    })
    // The end button stays hidden until the game reports onGameStart.
    expect(document.querySelector('#end-btn')).not.toBeVisible()

    resolveStart()
    await waitFor(() => {
      expect(document.querySelector('#start-btn')).toBeVisible()
    })
  })

  it('drives the run chrome from onGameStart and projects time/score/combo callbacks', async () => {
    const { callbacks } = await mountAndInit()

    // A stale error banner from a previous save failure is cleared by the
    // legacy onGameStart toggles.
    callbacks.onError?.('Score Not Saved', 'network down')
    callbacks.onGameStart()
    await waitFor(() => {
      expect(document.querySelector('#start-btn')).toHaveStyle({
        display: 'none',
      })
    })
    expect(document.querySelector('#end-btn')).toBeVisible()
    expect(document.querySelector('#game-status')).toHaveClass('hidden')
    expect(document.querySelector('#game-error')).toHaveClass('hidden')

    callbacks.onTimeUpdate(55)
    callbacks.onScoreUpdate(250)
    callbacks.onLock({ combo: 2, multiplier: 1.5 })
    await waitFor(() => {
      expect(document.querySelector('#time-remaining')?.textContent).toBe('55')
    })
    expect(document.querySelector('#score')?.textContent).toBe('250')
    expect(document.querySelector('#combo')?.textContent).toBe('×1.5')

    // Repeated identical locks keep the projection stable without
    // breaking the display.
    callbacks.onLock({ combo: 2, multiplier: 1.5 })
    expect(document.querySelector('#combo')?.textContent).toBe('×1.5')

    // Combo reset returns to ×1; a level clear advances the level and
    // resets the combo — byte-equal to the deleted init DOM writes (the
    // game passes the 1-based cleared level, so clearing level 1 shows 2).
    callbacks.onComboReset()
    await waitFor(() => {
      expect(document.querySelector('#combo')?.textContent).toBe('×1')
    })
    callbacks.onLevelClear(1)
    await waitFor(() => {
      expect(document.querySelector('#level')?.textContent).toBe('2')
    })
    expect(document.querySelector('#combo')?.textContent).toBe('×1')
  })

  it('opens the mission-complete overlay with the final score on win and never toasts from the display result', async () => {
    const { callbacks } = await mountAndInit()

    act(() => {
      callbacks.onGameStart()
      callbacks.onWin(1250)
    })

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'MISSION COMPLETE!'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('1250')
    // Display-only result: the saveGameScore path inside the initializer
    // stays the ONE toast owner — the island forwards nothing.
    const achievementToast = (window as WindowWithToasts)
      .showAchievementAward as ReturnType<typeof vi.fn>
    const challengeToast = (window as WindowWithToasts)
      .showChallengeComplete as ReturnType<typeof vi.fn>
    expect(achievementToast).not.toHaveBeenCalled()
    expect(challengeToast).not.toHaveBeenCalled()
    // Ending is not a run: buttons return to idle, prompt stays behind the
    // overlay (legacy only re-shows it via Play Again).
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#end-btn')).not.toBeVisible()
    // The combo resets to ×1 on the end (legacy resetCombo).
    expect(document.querySelector('#combo')?.textContent).toBe('×1')
  })

  it("opens the TIME'S UP! overlay with the final score on fail", async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onFail(0, 300)

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      "TIME'S UP!"
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('300')
  })

  it('stops through the handle and returns to the pre-start prompt', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onGameStart()
    await waitFor(() => {
      expect(document.querySelector('#end-btn')).toBeVisible()
    })
    // Advance the level so the test proves a manual stop keeps it (the
    // game passes the 1-based cleared level: clearing level 2 shows 3).
    callbacks.onLevelClear(1)
    await waitFor(() => {
      expect(document.querySelector('#level')?.textContent).toBe('2')
    })

    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))
    expect(stopMock).toHaveBeenCalledTimes(1)

    // Legacy end click: prompt back, start shown, end hidden, combo reset.
    // The game fires no callback, so the island drives the transition;
    // the level keeps its value (only the combo resets).
    await waitFor(() => {
      expect(document.querySelector('#game-status')).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#end-btn')).toHaveStyle({ display: 'none' })
    expect(document.querySelector('#combo')?.textContent).toBe('×1')
    expect(document.querySelector('#level')?.textContent).toBe('2')
  })

  it('closes the overlay via Play Again and keeps the final score until the next end', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onWin(1250)
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
        'hidden'
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }))
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
    // Legacy play-again state: prompt visible, start shown, end hidden.
    expect(document.querySelector('#game-status')).not.toHaveClass('hidden')
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#end-btn')).not.toBeVisible()
    // Final stats keep their last values until the next end (legacy).
    expect(document.querySelector('#final-score')?.textContent).toBe('1250')
  })

  it('surfaces score-save failures through the legacy message-only banner', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onGameStart()
    callbacks.onError?.('Score Not Saved', 'network down')

    const errorSurface = document.querySelector('#game-error')
    await waitFor(() => {
      expect(errorSurface).not.toHaveClass('hidden')
    })
    // Legacy onError drops the title and shows the message only.
    expect(errorSurface?.textContent).toBe('network down')
  })

  it('keeps the overlay open when an error fires after the end', async () => {
    const { callbacks } = await mountAndInit()

    // Score-save failure after solve: onWin opens the success overlay
    // first, then the save path reports the failure via onError. Unlike
    // Circuit Hacker, the legacy Satellite Sync error path never closed
    // the overlay.
    act(() => {
      callbacks.onWin(1250)
      callbacks.onError?.('Score Not Saved', 'network down')
    })

    const errorSurface = document.querySelector('#game-error')
    await waitFor(() => {
      expect(errorSurface).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
      'hidden'
    )
  })

  it('restores the buttons when handle.start rejects', async () => {
    startMock.mockRejectedValueOnce(new Error('boom'))
    await mountAndInit()

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    const errorSurface = document.querySelector('#game-error')
    await waitFor(() => {
      expect(errorSurface).not.toHaveClass('hidden')
    })
    expect(errorSurface?.textContent).toBe('boom')
    expect(document.querySelector('#start-btn')).toBeVisible()
  })

  it('cleans up the handle and deletes the debug handle on unmount', async () => {
    const { view } = await mountAndInit()
    expect(
      (window as WindowWithSatelliteSyncGame).satelliteSyncGame
    ).toBeDefined()

    view.unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithSatelliteSyncGame).satelliteSyncGame
    ).toBeUndefined()
  })
})
