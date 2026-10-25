import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import type { AchievementNotification } from '@cetus/shared/achievements'
import type { ChallengeUpdatesPayload } from '@cetus/shared/api-dto'
import { AppNotifications } from './AppNotifications'

const achievement = (
  overrides: Partial<AchievementNotification> = {}
): AchievementNotification => ({
  id: 'a1',
  name: 'First specimen',
  description: 'Score your first points',
  icon: '🎯',
  rarity: 'common',
  ...overrides,
})

const challengeUpdate = (
  overrides: Partial<ChallengeUpdatesPayload> = {}
): ChallengeUpdatesPayload => ({
  completedChallenges: [
    {
      id: 'c1',
      name: 'Warm Up',
      description: 'Play 2 games today',
      icon: '🎮',
      xpReward: 10,
    },
  ],
  xpEarned: 10,
  levelUp: false,
  ...overrides,
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// Each act step flushes the promise continuations that schedule the next
// timer (entrance -> dismissal wait -> exit -> queue gap).
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

describe('AppNotifications window bridge', () => {
  it('registers showAchievementAward/showChallengeComplete on mount and removes them on unmount', () => {
    const { unmount } = render(<AppNotifications />)
    expect(window.showAchievementAward).toBeTypeOf('function')
    expect(window.showChallengeComplete).toBeTypeOf('function')

    unmount()
    expect(window.showAchievementAward).toBeUndefined()
    expect(window.showChallengeComplete).toBeUndefined()
  })
})

describe('AppNotifications achievement queue', () => {
  it('shows queued achievements one at a time and advances after dismissal', async () => {
    render(<AppNotifications />)

    act(() => {
      window.showAchievementAward!([
        achievement(),
        achievement({ id: 'a2', name: 'Second specimen', rarity: 'epic' }),
      ])
    })

    // The first card is showing (dismissible during the entrance animation).
    const card = screen.getByRole('button', { name: 'Dismiss achievement' })
    expect(card).toHaveTextContent('First specimen')
    expect(card).toHaveAttribute('data-rarity', 'common')
    expect(screen.getByText('common')).toBeInTheDocument()

    // rAF frame -> entrance (700ms) -> auto-dismiss (5s) -> exit (500ms) -> queue gap (1s)
    await advance(16)
    await advance(700)
    await advance(5000)
    await advance(500)
    await advance(1000)

    const second = screen.getByRole('button', { name: 'Dismiss achievement' })
    expect(second).toHaveTextContent('Second specimen')
    expect(second).toHaveAttribute('data-rarity', 'epic')

    await advance(16)
    await advance(700)
    await advance(5000)
    await advance(500)
    expect(
      screen.queryByRole('button', { name: 'Dismiss achievement' })
    ).not.toBeInTheDocument()
  })

  it('dismisses the current card on click and shows the next queued one', async () => {
    render(<AppNotifications />)

    act(() => {
      window.showAchievementAward!([
        achievement(),
        achievement({ id: 'a2', name: 'Second specimen' }),
      ])
    })

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Dismiss achievement' })
      )
    })
    // Entrance still completes after dismissal, then exit + queue gap
    await advance(16)
    await advance(700)
    await advance(500)
    await advance(1000)

    expect(
      screen.getByRole('button', { name: 'Dismiss achievement' })
    ).toHaveTextContent('Second specimen')
  })

  it('accepts Enter and Space as dismissal', async () => {
    render(<AppNotifications />)
    act(() => {
      window.showAchievementAward!([achievement()])
    })

    const card = screen.getByRole('button', { name: 'Dismiss achievement' })
    await act(async () => {
      fireEvent.keyDown(card, { key: 'Enter' })
    })
    await advance(16)
    await advance(700)
    await advance(500)

    expect(
      screen.queryByRole('button', { name: 'Dismiss achievement' })
    ).not.toBeInTheDocument()
  })

  it('ignores empty notification batches', () => {
    render(<AppNotifications />)
    act(() => {
      window.showAchievementAward!([])
    })
    expect(
      screen.queryByRole('button', { name: 'Dismiss achievement' })
    ).not.toBeInTheDocument()
  })
})

describe('AppNotifications challenge complete queue', () => {
  it('shows each completed challenge in sequence and flags the level up on the last', async () => {
    render(<AppNotifications />)

    act(() => {
      window.showChallengeComplete!(
        challengeUpdate({
          completedChallenges: [
            {
              id: 'c1',
              name: 'Warm Up',
              description: 'Play 2 games today',
              icon: '🎮',
              xpReward: 10,
            },
            {
              id: 'c2',
              name: 'Marathon',
              description: 'Play 5 games today',
              icon: '🏃',
              xpReward: 20,
            },
          ],
          xpEarned: 30,
          levelUp: true,
          newLevel: 3,
        })
      )
    })

    expect(screen.getByText('Warm Up')).toBeInTheDocument()
    expect(screen.getByText('+10 XP')).toBeInTheDocument()
    // Level-up is only flagged on the last challenge.
    expect(screen.getByText(/LEVEL UP/i).parentElement).toHaveClass('hidden')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    })

    expect(screen.getByText('Marathon')).toBeInTheDocument()
    expect(screen.getByText('+20 XP')).toBeInTheDocument()
    expect(screen.getByText(/LEVEL UP/i).parentElement).not.toHaveClass(
      'hidden'
    )
    expect(screen.getByText('3')).toHaveAttribute('id', 'new-level')
  })

  it('dismisses on Escape and hides the overlay', () => {
    render(<AppNotifications />)

    act(() => {
      window.showChallengeComplete!(challengeUpdate())
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.getElementById('challenge-complete-overlay')).toHaveClass(
      'hidden'
    )
  })

  it('dismisses on click outside the card', () => {
    render(<AppNotifications />)

    act(() => {
      window.showChallengeComplete!(challengeUpdate())
    })

    act(() => {
      fireEvent.click(
        document.querySelector('[data-overlay-backdrop="true"]') as Element
      )
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('auto-dismisses the card after 5 seconds', async () => {
    render(<AppNotifications />)

    act(() => {
      window.showChallengeComplete!(challengeUpdate())
    })
    await advance(5000)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the overlay hidden and skips empty batches', () => {
    render(<AppNotifications />)

    act(() => {
      window.showChallengeComplete!(
        challengeUpdate({ completedChallenges: [] })
      )
    })

    expect(document.getElementById('challenge-complete-overlay')).toHaveClass(
      'hidden'
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
