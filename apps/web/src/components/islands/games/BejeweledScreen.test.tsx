import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, waitFor } from '@testing-library/react'

const { mountMock } = vi.hoisted(() => ({
  mountMock: vi.fn(),
}))

vi.mock('@/lib/games/bejeweled/controller', () => ({
  mount: mountMock,
}))

import BejeweledScreen from './BejeweledScreen'

describe('BejeweledScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts the controller on the host element with an abort signal', async () => {
    const { container } = render(<BejeweledScreen signedIn={false} />)

    await waitFor(() => expect(mountMock).toHaveBeenCalledTimes(1))

    const [host, signal] = mountMock.mock.calls[0]
    expect(host).toBeInstanceOf(HTMLDivElement)
    expect(host).toBe(container.firstElementChild)
    expect(host.className).toBe('plate-width field-plate')
    expect(host.dataset.signedIn).toBe('false')
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })

  it('unmount calls the controller cleanup and aborts the signal', async () => {
    const cleanup = vi.fn()
    mountMock.mockReturnValue(cleanup)

    const { unmount } = render(<BejeweledScreen signedIn={true} />)
    await waitFor(() => expect(mountMock).toHaveBeenCalledTimes(1))

    const [, signal] = mountMock.mock.calls[0]
    expect(signal.aborted).toBe(false)
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(signal.aborted).toBe(true)
  })

  it('keeps the frozen plate ids from the e2e block in the markup', () => {
    const { container } = render(<BejeweledScreen signedIn={false} />)

    // Spot-list from the Bejeweled e2e block + checklist row: HUD (score,
    // countdown, best, moves), cascade cues, board tray, hint and pause
    // controls all live inside the island host.
    for (const id of [
      'bejeweled-container',
      'time-remaining',
      'time-fill',
      'score',
      'moves',
      'cascade-label',
      'cascade-pips',
      'max-combo',
      'board-notice',
      'hint-btn',
      'pause-btn',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
    expect(container.textContent).toContain('Bejeweled')
    // The five cascade pips the e2e assertions count and recolor.
    expect(container.querySelectorAll('#cascade-pips span')).toHaveLength(5)
    // The four plate-frame corner markers and the bare data-best stat.
    expect(container.querySelectorAll('.plate-frame .corner')).toHaveLength(4)
    expect(container.querySelector('[data-best]')).not.toBeNull()
    // Pre-hydration HUD snapshot matches the pre-migration plate body.
    expect(container.querySelector('#score')?.textContent).toBe('0')
    expect(container.querySelector('#time-remaining')?.textContent).toBe('60')
    expect(container.querySelector('#cascade-label')?.textContent).toBe('Idle')
    expect(container.querySelector('#max-combo')?.textContent).toBe('×0')
    expect(container.textContent).toContain('Drag a gem onto its neighbour')
  })
})
