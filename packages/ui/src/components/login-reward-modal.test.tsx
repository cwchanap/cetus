import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  LoginRewardClaimResponse,
  LoginRewardStatusResponse,
} from '@cetus/shared/api-dto'
import { LoginRewardModal } from './login-reward-modal'

const status = (
  overrides: Partial<LoginRewardStatusResponse> = {}
): LoginRewardStatusResponse => ({
  loginStreak: 3,
  currentCycleDay: 4,
  totalCycles: 1,
  totalConsecutiveDays: 10,
  todayReward: {
    day: 4,
    xp: 40,
    icon: '🎁',
    description: 'Day 4 - Steady signal',
  },
  alreadyClaimed: false,
  canClaim: true,
  nextMilestone: null,
  daysUntilMilestone: 3,
  ...overrides,
})

const openProps = {
  open: true,
  claimPhase: 'idle' as const,
  claimError: null,
  claimResult: null,
  onClaim: vi.fn(),
  onClose: vi.fn(),
}

describe('LoginRewardModal status rendering', () => {
  it('renders the 7-day calendar with claimed/current days from the status DTO', () => {
    render(<LoginRewardModal {...openProps} status={status()} />)

    const days = document.querySelectorAll('[data-reward-day]')
    expect(days).toHaveLength(7)
    // Days before the streak are claimed; the streak day is current.
    for (let index = 0; index < 7; index++) {
      const claimed = index < 3
      const current = index === 3
      expect(days[index]!.className).toContain(
        claimed ? 'claimed' : current ? 'current' : 'rounded-lg'
      )
      if (claimed) {
        expect(days[index]!.className).toContain('claimed')
      }
      if (current) {
        expect(days[index]!.className).toContain('current')
        expect(days[index]!.className).not.toContain('claimed')
      }
    }
    expect(screen.getByText('Day 4')).toBeInTheDocument()
  })

  it('derives reward info, streak and milestone counters from the status', () => {
    render(<LoginRewardModal {...openProps} status={status()} />)

    expect(document.getElementById('reward-icon')).toHaveTextContent('🎁')
    expect(screen.getByText('+40 XP')).toHaveAttribute('id', 'reward-xp')
    expect(screen.getByText('Day 4 - Steady signal')).toHaveAttribute(
      'id',
      'reward-description'
    )
    expect(document.getElementById('streak-count')).toHaveTextContent('4')
    expect(document.getElementById('cycles-count')).toHaveTextContent('1')
    expect(document.getElementById('days-to-milestone')).toHaveTextContent('3')
  })

  it('shows the claim button while claimable and the claimed state otherwise', () => {
    const { rerender } = render(
      <LoginRewardModal {...openProps} status={status()} />
    )
    expect(screen.getByRole('button', { name: 'Claim Reward' })).toBeVisible()
    expect(document.getElementById('already-claimed')).toHaveClass('hidden')

    rerender(
      <LoginRewardModal
        {...openProps}
        status={status({ canClaim: false, alreadyClaimed: true })}
      />
    )
    expect(screen.getByRole('button', { name: 'Claim Reward' })).toHaveClass(
      'hidden'
    )
    expect(document.getElementById('already-claimed')).not.toHaveClass('hidden')
  })

  it('hides the overlay when open=false', () => {
    render(<LoginRewardModal {...openProps} open={false} status={status()} />)
    expect(document.getElementById('login-reward-overlay')).toHaveClass(
      'hidden'
    )
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()
  })
})

describe('LoginRewardModal claim phases', () => {
  it('disables the button and shows Claiming... while claiming', () => {
    render(
      <LoginRewardModal
        {...openProps}
        claimPhase="claiming"
        status={status()}
      />
    )
    const button = screen.getByRole('button', { name: 'Claiming...' })
    expect(button).toBeDisabled()
    expect(button).toBeVisible()
  })

  it('shows the claim error message on the button', () => {
    render(
      <LoginRewardModal
        {...openProps}
        claimPhase="error"
        claimError="Network error. Please try again."
        status={status()}
      />
    )
    expect(
      screen.getByRole('button', {
        name: 'Network error. Please try again.',
      })
    ).toBeEnabled()
  })

  it('flags level up and milestone badge from the claim response', () => {
    const claimResult: LoginRewardClaimResponse = {
      success: true,
      xpEarned: 40,
      leveledUp: true,
      newLevel: 5,
      milestoneBadge: {
        totalDays: 7,
        achievementId: 'weekly_warrior',
        name: 'Weekly Warrior',
        description: 'Claimed a full week',
        icon: '🏅',
      },
    }
    render(
      <LoginRewardModal
        {...openProps}
        claimPhase="success"
        claimResult={claimResult}
        status={status({ canClaim: false, alreadyClaimed: true })}
      />
    )

    expect(document.getElementById('level-up-indicator')).not.toHaveClass(
      'hidden'
    )
    expect(screen.getByText('5')).toHaveAttribute('id', 'new-level-display')
    expect(document.getElementById('milestone-earned')).not.toHaveClass(
      'hidden'
    )
    expect(screen.getByText('Weekly Warrior')).toBeInTheDocument()
    expect(screen.getByText('🏅')).toHaveAttribute('id', 'milestone-icon')
    // Claim button hidden after success, claimed state visible.
    expect(screen.getByRole('button', { name: 'Claim Reward' })).toHaveClass(
      'hidden'
    )
    expect(document.getElementById('already-claimed')).not.toHaveClass('hidden')
  })
})

describe('LoginRewardModal focus and dismissal', () => {
  it('focuses the card when opened and closes on Escape, backdrop and close button', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <LoginRewardModal {...openProps} onClose={onClose} status={status()} />
    )

    await waitFor(() => {
      expect(document.getElementById('login-reward-card')).toHaveFocus()
    })

    // ESC (document-level listener registered while open)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    // Other keys are ignored
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(onClose).toHaveBeenCalledTimes(1)

    // Backdrop click closes; clicks inside the card do not.
    fireEvent.click(
      document.querySelector('[data-overlay-backdrop="true"]') as Element
    )
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('Daily Login Reward'))
    expect(onClose).toHaveBeenCalledTimes(2)

    // Close button
    fireEvent.click(screen.getByRole('button', { name: 'Close', hidden: true }))
    expect(onClose).toHaveBeenCalledTimes(3)

    // ESC no longer closes after the modal is closed.
    rerender(
      <LoginRewardModal
        {...openProps}
        onClose={onClose}
        open={false}
        status={status()}
      />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('invokes onClaim from the claim button', () => {
    const onClaim = vi.fn()
    render(
      <LoginRewardModal {...openProps} onClaim={onClaim} status={status()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Claim Reward' }))
    expect(onClaim).toHaveBeenCalledTimes(1)
  })
})
