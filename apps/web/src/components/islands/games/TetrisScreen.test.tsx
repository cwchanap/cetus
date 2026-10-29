import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, waitFor } from '@testing-library/react'

const { mountMock } = vi.hoisted(() => ({
  mountMock: vi.fn(),
}))

vi.mock('@/lib/games/tetris/controller', () => ({
  mount: mountMock,
}))

import TetrisScreen from './TetrisScreen'

describe('TetrisScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts the controller on the host element with an abort signal', async () => {
    const { container } = render(<TetrisScreen signedIn={false} />)

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

    const { unmount } = render(<TetrisScreen signedIn={true} />)
    await waitFor(() => expect(mountMock).toHaveBeenCalledTimes(1))

    const [, signal] = mountMock.mock.calls[0]
    expect(signal.aborted).toBe(false)
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(signal.aborted).toBe(true)
  })

  it('keeps the frozen plate ids from the e2e block in the markup', () => {
    const { container } = render(<TetrisScreen signedIn={false} />)

    // Spot-list from the tetris-challenge e2e block: HUD, trays, board,
    // clear feedback and level controls all live inside the island host.
    for (const id of [
      'tetris-container',
      'clear-flash',
      'line-feedback',
      'next-canvas',
      'hold-canvas',
      'hold-btn',
      'hold-state',
      'pause-btn',
      'score',
      'lines',
      'clear-streak',
      'level',
      'drop-rate',
      'rate-fill',
      'next-level',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
    expect(container.textContent).toContain('Tetris Challenge')
    // The 20-row clear-flash grid the e2e block counts flashes in.
    expect(container.querySelectorAll('#clear-flash span')).toHaveLength(20)
  })
})
