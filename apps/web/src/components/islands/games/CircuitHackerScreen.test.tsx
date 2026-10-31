import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CircuitHackerStats } from '@cetus/games/circuit-hacker/types'

const { initializeCircuitHackerGameMock } = vi.hoisted(() => ({
  initializeCircuitHackerGameMock: vi.fn(),
}))

vi.mock('@/lib/games/circuit-hacker/init', () => ({
  initializeCircuitHackerGame: initializeCircuitHackerGameMock,
}))

import CircuitHackerScreen from './CircuitHackerScreen'

interface CircuitHackerCallbacks {
  onTimeUpdate: (t: number) => void
  onRotation: (n: number) => void
  onStart: () => void
  onEnd: (
    stats: CircuitHackerStats,
    outcome: { title: string; reason?: string }
  ) => void
  onError?: (title: string, message: string) => void
}

type WindowWithCircuitHackerGame = Window & {
  circuitHackerGame?: { cleanup: () => void }
}
type WindowWithToasts = Window & {
  showAchievementAward?: ReturnType<typeof vi.fn>
  showChallengeComplete?: ReturnType<typeof vi.fn>
}

const fakeStats: CircuitHackerStats = {
  finalScore: 850,
  difficulty: 'easy',
  secondsRemaining: 42,
  rotationsUsed: 7,
  solved: true,
}

async function mountAndInit() {
  const view = render(<CircuitHackerScreen />)
  await waitFor(() => {
    expect(initializeCircuitHackerGameMock).toHaveBeenCalledTimes(1)
  })
  const [host, callbacks] = initializeCircuitHackerGameMock.mock.calls[0]
  return {
    view,
    host: host as HTMLElement,
    callbacks: callbacks as CircuitHackerCallbacks,
  }
}

describe('CircuitHackerScreen', () => {
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
    initializeCircuitHackerGameMock.mockResolvedValue(fakeHandle)
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
    expect(document.querySelector('#difficulty-select')).not.toBeNull()
    for (const label of [
      'Easy (5×5)',
      'Medium (7×7)',
      'Hard (9×9)',
      'Expert (11×11)',
    ]) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    }
    // Idle HUD is byte-equal to the legacy route: pre-start prompt visible,
    // rotation count 0, initial time 180, start shown / stop hidden.
    expect(document.querySelector('#game-status')).not.toHaveClass('hidden')
    expect(document.querySelector('#rotation-count')?.textContent).toBe('0')
    expect(document.querySelector('#time-remaining')?.textContent).toBe('180')
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#stop-btn')).not.toBeVisible()
    expect((window as WindowWithCircuitHackerGame).circuitHackerGame).toBe(
      fakeHandle
    )
  })

  it('starts the selected difficulty through the handle and hides start during setup', async () => {
    let resolveStart: () => void = () => {}
    startMock.mockReturnValue(
      new Promise<void>(resolve => {
        resolveStart = resolve
      })
    )
    await mountAndInit()
    const select = document.querySelector(
      '#difficulty-select'
    ) as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'easy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    // The legacy double-click guard: start hides synchronously while
    // setupPixiJS is pending.
    await waitFor(() => {
      expect(startMock).toHaveBeenCalledWith('easy')
    })
    expect(document.querySelector('#start-btn')).toHaveStyle({
      display: 'none',
    })

    resolveStart()
    await waitFor(() => {
      expect(document.querySelector('#start-btn')).toBeVisible()
    })
  })

  it('drives the run chrome from onStart and projects time/rotation callbacks', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onStart()
    await waitFor(() => {
      expect(document.querySelector('#start-btn')).toHaveStyle({
        display: 'none',
      })
    })
    expect(document.querySelector('#stop-btn')).toBeVisible()
    expect(document.querySelector('#game-status')).toHaveClass('hidden')
    const select = document.querySelector(
      '#difficulty-select'
    ) as HTMLSelectElement
    expect(select.value).toBe('medium')
    expect(select).toBeDisabled()

    callbacks.onTimeUpdate(119)
    callbacks.onRotation(3)
    await waitFor(() => {
      expect(document.querySelector('#time-remaining')?.textContent).toBe('119')
    })
    expect(document.querySelector('#rotation-count')?.textContent).toBe('3')

    // Repeated identical rotations keep the projection stable without
    // breaking the display.
    callbacks.onRotation(3)
    expect(document.querySelector('#rotation-count')?.textContent).toBe('3')
  })

  it('opens the overlay with the final stats on end and never toasts from the display result', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onEnd(fakeStats, { title: 'CIRCUIT POWERED!' })

    const overlay = document.querySelector('#game-over-overlay')
    await waitFor(() => {
      expect(overlay).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'CIRCUIT POWERED!'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('850')
    expect(document.querySelector('#final-time')?.textContent).toBe('42s')
    expect(document.querySelector('#final-rotations')?.textContent).toBe('7')
    // Display-only result: the saveGameScore path inside the initializer
    // stays the ONE toast owner — the island forwards nothing.
    const achievementToast = (window as WindowWithToasts)
      .showAchievementAward as ReturnType<typeof vi.fn>
    const challengeToast = (window as WindowWithToasts)
      .showChallengeComplete as ReturnType<typeof vi.fn>
    expect(achievementToast).not.toHaveBeenCalled()
    expect(challengeToast).not.toHaveBeenCalled()
    // Ending is not a run: buttons return to idle, prompt stays hidden.
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#stop-btn')).not.toBeVisible()
  })

  it('stops through the handle and returns to the pre-start prompt via Play Again', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onStart()
    await waitFor(() => {
      expect(document.querySelector('#stop-btn')).toBeVisible()
    })

    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))
    expect(stopMock).toHaveBeenCalledTimes(1)

    callbacks.onEnd(fakeStats, { title: 'GAME OVER', reason: 'manual' })
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
        'hidden'
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }))
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
    // Legacy play-again state: prompt visible, start shown, stop hidden,
    // difficulty re-enabled. Final stats keep their last values until the
    // next end (legacy behavior).
    expect(document.querySelector('#game-status')).not.toHaveClass('hidden')
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#stop-btn')).not.toBeVisible()
    expect(
      document.querySelector('#difficulty-select') as HTMLSelectElement
    ).toBeEnabled()
    expect(document.querySelector('#final-score')?.textContent).toBe('850')
  })

  it('surfaces score-save failures through the legacy error overlay', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onError?.('Score Not Saved', 'network down')

    const errorSurface = document.querySelector('#game-error')
    await waitFor(() => {
      expect(errorSurface).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-error-title')?.textContent).toBe(
      'Score Not Saved'
    )
    expect(document.querySelector('#game-error-message')?.textContent).toBe(
      'network down'
    )
    // Legacy showError also hides the status prompt.
    expect(document.querySelector('#game-status')).toHaveClass('hidden')
  })

  it('closes the overlay when an error fires after the end', async () => {
    const { callbacks } = await mountAndInit()

    // Score-save failure after solve: onEnd opens the success overlay
    // first, then the save path reports the failure via onError.
    act(() => {
      callbacks.onEnd(fakeStats, { title: 'CIRCUIT POWERED!' })
      callbacks.onError?.('Score Not Saved', 'network down')
    })

    const errorSurface = document.querySelector('#game-error')
    await waitFor(() => {
      expect(errorSurface).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-error-title')?.textContent).toBe(
      'Score Not Saved'
    )
    // Legacy showError semantics: the error surface must not be buried
    // under the z-50 overlay — the overlay is closed.
    expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
  })

  it('restores the buttons when handle.start rejects', async () => {
    startMock.mockRejectedValueOnce(new Error('boom'))
    await mountAndInit()

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    const errorSurface = document.querySelector('#game-error')
    await waitFor(() => {
      expect(errorSurface).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-error-title')?.textContent).toBe(
      'Failed to Start Game'
    )
    expect(document.querySelector('#game-error-message')?.textContent).toBe(
      'boom'
    )
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(
      document.querySelector('#difficulty-select') as HTMLSelectElement
    ).toBeEnabled()
  })

  it('cleans up the handle and deletes the debug handle on unmount', async () => {
    const { view } = await mountAndInit()
    expect(
      (window as WindowWithCircuitHackerGame).circuitHackerGame
    ).toBeDefined()

    view.unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect(
      (window as WindowWithCircuitHackerGame).circuitHackerGame
    ).toBeUndefined()
  })
})
