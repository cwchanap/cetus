import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  type RenderResult,
} from '@testing-library/react'

const { initializeIceSlideMock, createLeaderboardControllerMock } = vi.hoisted(
  () => ({
    initializeIceSlideMock: vi.fn(),
    createLeaderboardControllerMock: vi.fn(),
  })
)

vi.mock('@/lib/games/ice-slide/init', () => ({
  initializeIceSlide: initializeIceSlideMock,
}))

vi.mock('@/lib/games/ice-slide/daily-leaderboard', () => ({
  createDailyLeaderboardController: createLeaderboardControllerMock,
}))

import IceSlideScreen from './IceSlideScreen'
import {
  createIceSlideDailyCompetitionKey,
  toIceSlideUtcDateKey,
} from '@cetus/games/ice-slide/daily'

interface IceSlideCallbacks {
  onGameStart: () => void
  onMove: (info: { moves: number; levelMoves: number }) => void
  onCrystal: (total: number) => void
  onLevelClear: (result: unknown) => void
  onHazard: () => void
  onScoreUpdate: (score: number) => void
  onTimeUpdate: (seconds: number) => void
  onWin: (finalScore: number) => void
  onError?: (title: string, message: string) => void
  onScoreSaved?: (gameData: { mode: string; runKey: string }) => void
  onHudSync?: (hud: {
    score: number
    level: number
    moves: number
    crystals: number
    timeText: string
    levelName: string
  }) => void
  onRunEnded?: (title: string, finalScore: number, completed: boolean) => void
}

interface FakeGameState {
  mode: 'campaign' | 'daily' | 'expedition'
  runKey: string
  status: string
}

type WindowWithIceSlideGame = Window & {
  iceSlideGame?: { cleanup: () => void }
}
type WindowWithToasts = Window & {
  showAchievementAward?: ReturnType<typeof vi.fn>
  showChallengeComplete?: ReturnType<typeof vi.fn>
}

async function mountAndInit(
  props?: Parameters<typeof IceSlideScreen>[0]
): Promise<{
  view: RenderResult
  callbacks: IceSlideCallbacks
  host: HTMLElement
  loadMock: ReturnType<typeof vi.fn>
  hideMock: ReturnType<typeof vi.fn>
}> {
  const view = render(<IceSlideScreen {...props} />)
  await waitFor(() => {
    expect(initializeIceSlideMock).toHaveBeenCalledTimes(1)
  })
  const [host, callbacks] = initializeIceSlideMock.mock.calls[0]
  const loadMock = createLeaderboardControllerMock.mock.results[0]?.value.load
  const hideMock = createLeaderboardControllerMock.mock.results[0]?.value.hide
  return {
    view,
    host: host as HTMLElement,
    callbacks: callbacks as IceSlideCallbacks,
    loadMock: loadMock as ReturnType<typeof vi.fn>,
    hideMock: hideMock as ReturnType<typeof vi.fn>,
  }
}

describe('IceSlideScreen', () => {
  let startMock: ReturnType<typeof vi.fn>
  let playAgainMock: ReturnType<typeof vi.fn>
  let stopMock: ReturnType<typeof vi.fn>
  let resetLevelMock: ReturnType<typeof vi.fn>
  let cleanupMock: ReturnType<typeof vi.fn>
  let getGameMock: ReturnType<typeof vi.fn>
  let loadMock: ReturnType<typeof vi.fn>
  let hideMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    startMock = vi.fn().mockResolvedValue(undefined)
    playAgainMock = vi.fn().mockResolvedValue(undefined)
    stopMock = vi.fn()
    resetLevelMock = vi.fn()
    cleanupMock = vi.fn()
    getGameMock = vi.fn(() => null)
    loadMock = vi.fn()
    hideMock = vi.fn()
    createLeaderboardControllerMock.mockReturnValue({
      load: loadMock,
      hide: hideMock,
    })
    initializeIceSlideMock.mockImplementation(async () => ({
      start: startMock,
      playAgain: playAgainMock,
      stop: stopMock,
      resetLevel: resetLevelMock,
      chooseExpeditionRoute: vi.fn(),
      undo: vi.fn(),
      cleanup: cleanupMock,
      getGame: getGameMock,
    }))
    // Toast spies: the island must never install a second toast path.
    ;(window as WindowWithToasts).showAchievementAward = vi.fn()
    ;(window as WindowWithToasts).showChallengeComplete = vi.fn()
  })

  afterEach(() => {
    delete (window as WindowWithToasts).showAchievementAward
    delete (window as WindowWithToasts).showChallengeComplete
  })

  it('mounts the initializer on the ref host and publishes the debug handle', async () => {
    const { host } = await mountAndInit()

    expect(host.id).toBe('game-canvas-container')
    // Idle chrome byte-equal to the legacy route: prompt visible, score 0,
    // clock '0', level 1, moves 0, crystals 0, sector '—', start shown /
    // end hidden / reset shown, overlay + New Expedition hidden.
    expect(document.querySelector('#game-status')).not.toHaveClass('hidden')
    expect(document.querySelector('#score')?.textContent).toBe('0')
    expect(document.querySelector('#time-remaining')?.textContent).toBe('0')
    expect(document.querySelector('#level')?.textContent).toBe('1')
    expect(document.querySelector('#moves')?.textContent).toBe('0')
    expect(document.querySelector('#crystals')?.textContent).toBe('0')
    expect(document.querySelector('#level-name')?.textContent).toBe('—')
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#end-btn')).not.toBeVisible()
    expect(document.querySelector('#reset-btn')).toBeVisible()
    expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    expect(document.querySelector('#game-error')).toHaveClass('hidden')
    expect(document.querySelector('#new-expedition-btn')).toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Play Again' })).toBeVisible()
    // Static bespoke structure survives with its frozen ids.
    for (const id of [
      'ice-slide-mode-selector',
      'stage-clear-overlay',
      'stage-clear-continue-btn',
      'expedition-route-choice-overlay',
      'expedition-safe-btn',
      'expedition-risk-btn',
      'expedition-undo-btn',
      'daily-meta',
      'expedition-meta',
      'daily-leaderboard',
      'run-final-stage-result',
      'expedition-summary',
      'change-mode-btn',
    ]) {
      expect(document.getElementById(id)).not.toBeNull()
    }
    // Campaign is the default preselection.
    expect(
      document.querySelector<HTMLInputElement>('input[value="campaign"]')
    ).toBeChecked()
    expect(
      document.querySelector<HTMLInputElement>('input[value="daily"]')
    ).not.toBeChecked()
    // Non-daily idle hides the leaderboard panel (legacy init tail).
    expect(hideMock).toHaveBeenCalled()
    expect((window as WindowWithIceSlideGame).iceSlideGame).toBeDefined()
  })

  it('preselects the queried mode and loads the current Daily ranking', async () => {
    await mountAndInit({ initialMode: 'daily' })

    expect(
      document.querySelector<HTMLInputElement>('input[value="daily"]')
    ).toBeChecked()
    expect(
      document.querySelector<HTMLInputElement>('input[value="campaign"]')
    ).not.toBeChecked()
    expect(loadMock).toHaveBeenCalledWith(
      createIceSlideDailyCompetitionKey(toIceSlideUtcDateKey(new Date()))
    )
  })

  it('hides start synchronously on click and shows the end button on game start', async () => {
    let resolveStart: () => void = () => {}
    startMock.mockReturnValue(
      new Promise<void>(resolve => {
        resolveStart = resolve
      })
    )
    const { callbacks } = await mountAndInit()

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    await waitFor(() => {
      expect(startMock).toHaveBeenCalledWith('campaign')
    })
    // Legacy double-click guard: both buttons hidden while setup pends.
    expect(document.querySelector('#start-btn')).toHaveStyle({
      display: 'none',
    })
    expect(document.querySelector('#end-btn')).toHaveStyle({ display: 'none' })
    // Mode controls lock during the pending window.
    expect(
      document.querySelector<HTMLInputElement>('input[value="campaign"]')
    ).toBeDisabled()

    resolveStart()
    callbacks.onGameStart()
    await waitFor(() => {
      expect(document.querySelector('#end-btn')).toBeVisible()
    })
    expect(document.querySelector('#start-btn')).toHaveStyle({
      display: 'none',
    })
    expect(document.querySelector('#game-status')).toHaveClass('hidden')
    expect(
      document.querySelector<HTMLInputElement>('input[value="campaign"]')
    ).toBeDisabled()
  })

  it('projects HUD values from onHudSync and the clock from onTimeUpdate', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onHudSync?.({
      score: 250,
      level: 2,
      moves: 7,
      crystals: 3,
      timeText: '0:42',
      levelName: 'Glacier Run',
    })
    await waitFor(() => {
      expect(document.querySelector('#score')?.textContent).toBe('250')
    })
    expect(document.querySelector('#level')?.textContent).toBe('2')
    expect(document.querySelector('#moves')?.textContent).toBe('7')
    expect(document.querySelector('#crystals')?.textContent).toBe('3')
    expect(document.querySelector('#level-name')?.textContent).toBe(
      'Glacier Run'
    )

    callbacks.onTimeUpdate(95)
    await waitFor(() => {
      expect(document.querySelector('#time-remaining')?.textContent).toBe(
        '1:35'
      )
    })

    // Repeated identical payloads keep the projection stable.
    callbacks.onHudSync?.({
      score: 250,
      level: 2,
      moves: 7,
      crystals: 3,
      timeText: '1:35',
      levelName: 'Glacier Run',
    })
    expect(document.querySelector('#score')?.textContent).toBe('250')
  })

  it('opens the mission-complete overlay on win and never toasts from the display result', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onGameStart()
    callbacks.onRunEnded?.('MISSION COMPLETE!', 1250, true)
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
        'hidden'
      )
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'MISSION COMPLETE!'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('1250')
    // Buttons return to idle; the prompt stays hidden behind the overlay.
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#end-btn')).not.toBeVisible()
    expect(document.querySelector('#game-status')).toHaveClass('hidden')
    // Display-only result: the saveGameScore path inside the initializer
    // stays the ONE toast owner — the island forwards nothing.
    const achievementToast = (window as WindowWithToasts)
      .showAchievementAward as ReturnType<typeof vi.fn>
    const challengeToast = (window as WindowWithToasts)
      .showChallengeComplete as ReturnType<typeof vi.fn>
    expect(achievementToast).not.toHaveBeenCalled()
    expect(challengeToast).not.toHaveBeenCalled()
  })

  it('opens the RUN ENDED overlay from a scoring stop and keeps the prompt hidden', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onGameStart()
    // onStart flips the session to running asynchronously; wait for the
    // re-render before clicking (act-safe callback invocation).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'End Game' })).toBeVisible()
    })
    stopMock.mockImplementation(() => {
      callbacks.onRunEnded?.('RUN ENDED', 120, false)
    })
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))

    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
        'hidden'
      )
    })
    expect(document.querySelector('#game-over-title')?.textContent).toBe(
      'RUN ENDED'
    )
    expect(document.querySelector('#final-score')?.textContent).toBe('120')
    expect(stopMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to idle without an overlay when a stop is local and scoreless', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onGameStart()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'End Game' })).toBeVisible()
    })
    // Campaign zero-score stop: the initializer fires no onRunEnded.
    fireEvent.click(screen.getByRole('button', { name: 'End Game' }))

    await waitFor(() => {
      expect(document.querySelector('#start-btn')).toBeVisible()
    })
    expect(document.querySelector('#end-btn')).toHaveStyle({ display: 'none' })
    expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    // Legacy: the prompt stays hidden after a plain end; only Change Mode
    // brings it back. Mode controls restore with the checked radio focused.
    expect(document.querySelector('#game-status')).toHaveClass('hidden')
    expect(
      document.querySelector<HTMLInputElement>('input[value="campaign"]')
    ).toBeEnabled()
    // Focus contract: in a real browser focusIdleControl lands on the
    // checked radio (e2e 'restores mode controls ...' pins toBeFocused).
    // jsdom can't take that branch (no layout), and at this point the
    // #start-btn fallback is still display:none until React flushes, so
    // its focus() is a no-op in jsdom's focusable-area check.
  })

  it('relabels Play Again to Retry Seed and reveals New Expedition for expedition runs', async () => {
    const { callbacks } = await mountAndInit()

    getGameMock.mockReturnValue({
      getState: (): FakeGameState => ({
        mode: 'expedition',
        runKey: 'expedition:seed',
        status: 'won',
      }),
    })
    callbacks.onGameStart()
    callbacks.onRunEnded?.('MISSION COMPLETE!', 900, true)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Retry Seed' })).toBeVisible()
    })
    expect(document.querySelector('#new-expedition-btn')).not.toHaveClass(
      'hidden'
    )
  })

  it('surfaces errors through the message-only banner and restores the idle controls', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onGameStart()
    callbacks.onError?.('Ice Slide Error', 'renderer exploded')

    const errorSurface = await waitFor(() => {
      const el = document.querySelector('#game-error')
      expect(el).not.toHaveClass('hidden')
      return el
    })
    expect(errorSurface?.textContent).toBe('renderer exploded')
    // Legacy failRun semantics: buttons reset, mode controls re-enabled.
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#end-btn')).toHaveStyle({ display: 'none' })
    expect(
      document.querySelector<HTMLInputElement>('input[value="campaign"]')
    ).toBeEnabled()
  })

  it('keeps the overlay open when a score-save error fires after the end', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onGameStart()
    callbacks.onRunEnded?.('MISSION COMPLETE!', 1250, true)
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
        'hidden'
      )
    })

    callbacks.onError?.('Score not saved', 'network down')

    const errorSurface = await waitFor(() => {
      const el = document.querySelector('#game-error')
      expect(el).not.toHaveClass('hidden')
      return el
    })
    expect(errorSurface?.textContent).toBe('network down')
    // Legacy guard: the error path never closed the result overlay.
    expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
      'hidden'
    )
    // The overlay guard also skips the mode-control restore (radios stay
    // locked until Change Mode).
    expect(
      document.querySelector<HTMLInputElement>('input[value="campaign"]')
    ).toBeDisabled()
  })

  it('restores the buttons when handle.start rejects', async () => {
    startMock.mockRejectedValueOnce(new Error('pixi down'))
    await mountAndInit()

    fireEvent.click(screen.getByRole('button', { name: 'Start Game' }))

    const errorSurface = await waitFor(() => {
      const el = document.querySelector('#game-error')
      expect(el).not.toHaveClass('hidden')
      return el
    })
    expect(errorSurface?.textContent).toBe('pixi down')
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#end-btn')).toHaveStyle({ display: 'none' })
  })

  it('retries through Play Again and refreshes the Daily leaderboard for the replayed run', async () => {
    const { callbacks } = await mountAndInit({ initialMode: 'daily' })
    // Start captures the active daily run key.
    getGameMock.mockReturnValue({
      getState: (): FakeGameState => ({
        mode: 'daily',
        runKey: 'ice-slide:daily:2026-08-12:g1:r1',
        status: 'idle',
      }),
    })
    callbacks.onGameStart()
    await waitFor(() => {
      expect(document.querySelector('#end-btn')).toBeVisible()
    })

    callbacks.onRunEnded?.('RUN ENDED', 400, false)
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
        'hidden'
      )
    })

    getGameMock.mockReturnValue({
      getState: (): FakeGameState => ({
        mode: 'daily',
        runKey: 'ice-slide:daily:2026-08-12:g1:r1',
        status: 'playing',
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }))

    // Overlay closes and the restart window shows the end button.
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    })
    expect(playAgainMock).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(document.querySelector('#end-btn')).toBeVisible()
    })
    expect(document.querySelector('#start-btn')).toHaveStyle({
      display: 'none',
    })
    // The replayed run's key refreshed the ranking.
    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledWith('ice-slide:daily:2026-08-12:g1:r1')
    })
  })

  it('resets every surface from Change Mode and refocuses the checked radio', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onGameStart()
    getGameMock.mockReturnValue({
      getState: (): FakeGameState => ({
        mode: 'expedition',
        runKey: 'expedition:seed',
        status: 'playing',
      }),
    })
    callbacks.onRunEnded?.('RUN ENDED', 300, false)
    await waitFor(() => {
      expect(document.querySelector('#game-over-overlay')).not.toHaveClass(
        'hidden'
      )
    })
    // Meta panels were revealed by the run (simulated imperatively).
    document.getElementById('daily-meta')?.classList.remove('hidden')
    document.getElementById('expedition-meta')?.classList.remove('hidden')
    document
      .getElementById('run-final-stage-result')
      ?.classList.remove('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Change Mode' }))

    await waitFor(() => {
      expect(document.querySelector('#game-status')).not.toHaveClass('hidden')
    })
    expect(document.querySelector('#game-over-overlay')).toHaveClass('hidden')
    expect(document.querySelector('#daily-meta')).toHaveClass('hidden')
    expect(document.querySelector('#expedition-meta')).toHaveClass('hidden')
    expect(document.querySelector('#run-final-stage-result')).toHaveClass(
      'hidden'
    )
    expect(document.querySelector('#game-error')).toHaveClass('hidden')
    expect(document.querySelector('#new-expedition-btn')).toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Play Again' })).toBeVisible()
    expect(
      document.querySelector<HTMLInputElement>('input[value="campaign"]')
    ).toBeEnabled()
    // jsdom has no layout: the checked-radio focus branch falls through to
    // #start-btn here (e2e pins the radio branch via toBeFocused).
    expect(document.querySelector('#start-btn')).toHaveFocus()
    expect(document.querySelector('#start-btn')).toBeVisible()
    expect(document.querySelector('#end-btn')).toHaveStyle({ display: 'none' })
  })

  it('stops an open route choice before resetting on Change Mode', async () => {
    const { callbacks } = await mountAndInit()

    callbacks.onGameStart()
    document
      .getElementById('expedition-route-choice-overlay')
      ?.classList.remove('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Change Mode' }))

    expect(stopMock).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(document.querySelector('#game-status')).not.toHaveClass('hidden')
    })
  })

  it('routes the React-owned Reset click through the handle', async () => {
    const chooseMock = vi.fn()
    const undoMock = vi.fn()
    initializeIceSlideMock.mockImplementation(async () => ({
      start: startMock,
      playAgain: playAgainMock,
      stop: stopMock,
      resetLevel: resetLevelMock,
      chooseExpeditionRoute: chooseMock,
      undo: undoMock,
      cleanup: cleanupMock,
      getGame: getGameMock,
    }))
    await mountAndInit()

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(resetLevelMock).toHaveBeenCalledTimes(1)
    // The route-choice and undo buttons carry NO React onClick: the
    // initializer wires them (tracked listeners, Signal Switch gate
    // precedent) — their click coverage lives in init.test.ts.
  })

  it('cleans up the handle and deletes the debug handle on unmount', async () => {
    const { view } = await mountAndInit()
    expect((window as WindowWithIceSlideGame).iceSlideGame).toBeDefined()

    view.unmount()

    expect(cleanupMock).toHaveBeenCalledTimes(1)
    expect((window as WindowWithIceSlideGame).iceSlideGame).toBeUndefined()
  })

  it('surfaces an initializer failure through the load-error banner', async () => {
    initializeIceSlideMock.mockRejectedValueOnce(new Error('boom'))
    render(<IceSlideScreen />)

    const errorSurface = await waitFor(() => {
      const el = document.querySelector('#game-error')
      expect(el).not.toHaveClass('hidden')
      return el
    })
    expect(errorSurface?.textContent).toBe('boom')
    expect((window as WindowWithIceSlideGame).iceSlideGame).toBeUndefined()
  })

  it('uses the legacy non-Error load-failure fallback message', async () => {
    initializeIceSlideMock.mockRejectedValueOnce('string failure')
    render(<IceSlideScreen />)

    const errorSurface = await waitFor(() => {
      const el = document.querySelector('#game-error')
      expect(el).not.toHaveClass('hidden')
      return el
    })
    expect(errorSurface?.textContent).toBe('Failed to load Ice Slide')
  })
})
