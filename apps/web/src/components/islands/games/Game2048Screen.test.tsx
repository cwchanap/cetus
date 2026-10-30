import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, waitFor } from '@testing-library/react'

const { mountMock } = vi.hoisted(() => ({
  mountMock: vi.fn(),
}))

vi.mock('@/lib/games/2048/controller', () => ({
  mount: mountMock,
}))

import Game2048Screen from './Game2048Screen'

describe('Game2048Screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts the controller on the host element with an abort signal', async () => {
    const { container } = render(<Game2048Screen signedIn={false} />)

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

    const { unmount } = render(<Game2048Screen signedIn={true} />)
    await waitFor(() => expect(mountMock).toHaveBeenCalledTimes(1))

    const [, signal] = mountMock.mock.calls[0]
    expect(signal.aborted).toBe(false)
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(signal.aborted).toBe(true)
  })

  it('keeps the frozen plate ids from the e2e block in the markup', () => {
    const { container } = render(<Game2048Screen signedIn={false} />)

    // Spot-list from the 2048 e2e block + migration checklist row: HUD,
    // ascent ladder, board frame, merge feedback and undo controls all
    // live inside the island host.
    for (const id of [
      'game-2048-container',
      'merge-feedback',
      'board-warning',
      'undo-btn',
      'undos-left',
      'pause-btn',
      'score-display',
      'next-target',
      'game-status',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
    expect(container.textContent).toContain('2048')
    // The seven-rung ascent ladder the e2e milestone assertions walk.
    expect(container.querySelectorAll('[data-milestone]')).toHaveLength(7)
    expect(container.querySelector('[data-milestone="2048"]')).not.toBeNull()
    // The four board-frame corner markers and the bare data-best stat.
    expect(container.querySelectorAll('.board-frame i')).toHaveLength(4)
    expect(container.querySelector('[data-best]')).not.toBeNull()
  })
})
