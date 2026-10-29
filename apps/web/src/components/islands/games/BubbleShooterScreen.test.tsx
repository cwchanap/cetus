import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, waitFor } from '@testing-library/react'

const { mountMock } = vi.hoisted(() => ({
  mountMock: vi.fn(),
}))

vi.mock('@/lib/games/bubble-shooter/controller', () => ({
  mount: mountMock,
}))

import BubbleShooterScreen from './BubbleShooterScreen'

describe('BubbleShooterScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts the controller on the host element with an abort signal', async () => {
    const { container } = render(<BubbleShooterScreen signedIn={false} />)

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

    const { unmount } = render(<BubbleShooterScreen signedIn={true} />)
    await waitFor(() => expect(mountMock).toHaveBeenCalledTimes(1))

    const [, signal] = mountMock.mock.calls[0]
    expect(signal.aborted).toBe(false)
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(signal.aborted).toBe(true)
  })

  it('keeps the frozen plate ids from the e2e block in the markup', () => {
    const { container } = render(<BubbleShooterScreen signedIn={false} />)

    // Spot-list from the bubble-shooter play-coverage e2e block: board,
    // HUD, gauge, tray and controls all live inside the island host.
    for (const id of [
      'game-container',
      'score',
      'bubbles-popped',
      'largest-combo',
      'gauge-label',
      'colony-gauge',
      'gauge-fill',
      'current-bubble',
      'next-bubble',
      'end-btn',
      'pause-btn',
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
    expect(container.innerHTML).toContain('Collection limit')
    expect(container.innerHTML).toContain('grows a row every 5 shots')
  })
})
