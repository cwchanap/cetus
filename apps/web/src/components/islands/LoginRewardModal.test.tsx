import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import type {
  LoginRewardClaimResponse,
  LoginRewardStatusResponse,
} from '@cetus/shared/api-dto'

const { claimLoginRewardMock } = vi.hoisted(() => ({
  claimLoginRewardMock: vi.fn(),
}))

vi.mock('@cetus/api-client/api-client', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@cetus/api-client/api-client')>()
  return {
    ...actual,
    createApiClient: vi.fn(() => ({
      claimLoginReward: claimLoginRewardMock,
    })),
  }
})

import { ApiClientError } from '@cetus/api-client/api-client'
import { LoginRewardModal } from './LoginRewardModal'

const status = (
  overrides: Partial<LoginRewardStatusResponse> = {}
): LoginRewardStatusResponse => ({
  loginStreak: 0,
  currentCycleDay: 1,
  totalCycles: 0,
  totalConsecutiveDays: 1,
  todayReward: {
    day: 1,
    xp: 10,
    icon: '🌟',
    description: 'Day 1 - Welcome back!',
  },
  alreadyClaimed: false,
  canClaim: true,
  nextMilestone: null,
  daysUntilMilestone: 7,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('LoginRewardModal island auto-show', () => {
  it('auto-opens after 500ms when the reward is claimable', async () => {
    vi.useFakeTimers()
    render(<LoginRewardModal status={status()} />)

    expect(document.getElementById('login-reward-overlay')).toHaveClass(
      'hidden'
    )

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(document.getElementById('login-reward-overlay')).not.toHaveClass(
      'hidden'
    )
  })

  it('stays closed when the reward was already claimed', async () => {
    vi.useFakeTimers()
    render(
      <LoginRewardModal
        status={status({ canClaim: false, alreadyClaimed: true })}
      />
    )

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(document.getElementById('login-reward-overlay')).toHaveClass(
      'hidden'
    )
  })

  it('does not auto-open after unmount', async () => {
    vi.useFakeTimers()
    const { unmount } = render(<LoginRewardModal status={status()} />)
    unmount()

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(claimLoginRewardMock).not.toHaveBeenCalled()
  })
})

describe('LoginRewardModal island claim flow', () => {
  it('updates the UI with the updated status after a successful claim and auto-closes', async () => {
    const updatedStatus = status({
      canClaim: false,
      alreadyClaimed: true,
      loginStreak: 1,
      currentCycleDay: 2,
    })
    const claimResult: LoginRewardClaimResponse = {
      success: true,
      xpEarned: 10,
      newTotalXP: 120,
      updatedStatus,
    }
    claimLoginRewardMock.mockResolvedValue(claimResult)

    vi.useFakeTimers()
    render(<LoginRewardModal status={status()} />)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Claim Reward' }))
    })

    expect(document.getElementById('already-claimed')).not.toHaveClass('hidden')
    expect(screen.getByText('2')).toHaveAttribute('id', 'streak-count')
    expect(claimLoginRewardMock).toHaveBeenCalledTimes(1)

    // Auto-close after 3s of success.
    await act(async () => {
      vi.advanceTimersByTime(3000)
    })
    expect(document.getElementById('login-reward-overlay')).toHaveClass(
      'hidden'
    )
  })

  it('shows the API error on the button and resets it after 2s', async () => {
    claimLoginRewardMock.mockResolvedValue({
      success: false,
      error: 'Reward already claimed',
    })

    vi.useFakeTimers()
    render(<LoginRewardModal status={status()} />)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Claim Reward' }))
    })

    expect(
      screen.getByRole('button', { name: 'Reward already claimed' })
    ).toBeInTheDocument()

    // Button resets to its idle label after 2s.
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(
      screen.getByRole('button', { name: 'Claim Reward' })
    ).toBeInTheDocument()
  })

  it('maps non-network ApiClientError to the retry message', async () => {
    claimLoginRewardMock.mockRejectedValue(
      new ApiClientError('boom', 500, 'server')
    )

    vi.useFakeTimers()
    render(<LoginRewardModal status={status()} />)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Claim Reward' }))
    })

    expect(
      screen.getByRole('button', {
        name: 'Claim failed. Please try again later.',
      })
    ).toBeInTheDocument()
  })

  it('maps network failures to the network error message', async () => {
    claimLoginRewardMock.mockRejectedValue(
      new ApiClientError('offline', 0, 'network')
    )

    vi.useFakeTimers()
    render(<LoginRewardModal status={status()} />)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Claim Reward' }))
    })

    expect(
      screen.getByRole('button', {
        name: 'Network error. Please try again.',
      })
    ).toBeInTheDocument()
  })
})
