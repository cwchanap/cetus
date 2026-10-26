import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, act } from '@testing-library/react'
import {
  AchievementRarity,
  type AchievementNotification,
} from '@cetus/shared/achievements'
import type { ChallengeUpdatesPayload } from '@cetus/shared/api-dto'
import { AppNotifications } from './AppNotifications'

const achievement = (
  overrides: Partial<AchievementNotification> = {}
): AchievementNotification => ({
  id: 'a1',
  name: 'First specimen',
  description: 'Score your first points',
  icon: '🎯',
  rarity: AchievementRarity.COMMON,
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

  it('replays the pre-hydration backlog filled by the AppLayout stubs', () => {
    window.__cetusNotificationBacklog = {
      achievements: [achievement()],
      challenges: [challengeUpdate()],
    }
    render(<AppNotifications />)

    expect(window.__cetusNotificationBacklog).toBeUndefined()
    expect(window.showAchievementAward).toBeTypeOf('function')
    expect(
      screen.getByRole('button', { name: 'Dismiss achievement' })
    ).toHaveTextContent('First specimen')
    expect(document.getElementById('challenge-name')).toHaveTextContent(
      'Warm Up'
    )
  })
})

describe('AppNotifications achievement queue', () => {
  it('shows queued achievements one at a time and advances after dismissal', async () => {
    render(<AppNotifications />)

    act(() => {
      window.showAchievementAward!([
        achievement(),
        achievement({
          id: 'a2',
          name: 'Second specimen',
          rarity: AchievementRarity.EPIC,
        }),
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

  it('marks the queue idle after draining the last achievement', async () => {
    render(<AppNotifications />)

    act(() => {
      window.showAchievementAward!([achievement()])
    })

    await advance(16)
    await advance(700)
    await advance(5000)
    await advance(500)
    // The 1s queue-gap re-check runs against the now-empty queue.
    await advance(1000)

    expect(
      screen.queryByRole('button', { name: 'Dismiss achievement' })
    ).not.toBeInTheDocument()
  })

  it('abandons the award cycle when unmounted after dismissal resolves', async () => {
    const { unmount } = render(<AppNotifications />)

    act(() => {
      window.showAchievementAward!([achievement()])
    })
    await advance(16)
    await advance(700)

    // Dismissal resolves the wait; unmounting before the continuation runs
    // flips the cancelled flag so the exit animation never starts.
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss achievement' }))
    unmount()
    await act(async () => {})
  })

  it('abandons the award cycle when unmounted during the exit wait', async () => {
    const { unmount } = render(<AppNotifications />)

    act(() => {
      window.showAchievementAward!([achievement()])
    })
    await advance(16)
    await advance(700)

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Dismiss achievement' })
      )
    })
    // run() is parked in the 500ms exit wait; unmount cancels the rest.
    unmount()
    await advance(500)
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

  it('skips batches whose completedChallenges payload is not an array', () => {
    render(<AppNotifications />)

    act(() => {
      window.showChallengeComplete!(
        challengeUpdate({
          completedChallenges:
            null as unknown as ChallengeUpdatesPayload['completedChallenges'],
        })
      )
    })

    expect(document.getElementById('challenge-complete-overlay')).toHaveClass(
      'hidden'
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AppNotifications challenge focus trap', () => {
  // jsdom reports offsetParent as null for every element, which would keep
  // the card's focusable list empty; mock it non-null to exercise the
  // first/last wrap-around branches.
  const mockOffsetParent = () => {
    const original = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetParent'
    )
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      get() {
        return document.body
      },
      configurable: true,
    })
    return () => {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, 'offsetParent', original)
      }
    }
  }

  it('ignores non-Tab keys and swallows Tab when no element is focusable', async () => {
    render(<AppNotifications />)

    act(() => {
      window.showChallengeComplete!(challengeUpdate())
    })

    // Non-Tab keys return early without preventDefault.
    expect(fireEvent.keyDown(document, { key: 'a' })).toBe(true)
    // With jsdom's null offsetParent the focusable list is empty, so Tab is
    // swallowed and focus is moved onto the card container.
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(
      document.getElementById('challenge-complete-card')
    )
  })

  it('wraps Tab and Shift+Tab around the card focusable elements', async () => {
    const restoreOffsetParent = mockOffsetParent()
    render(<AppNotifications />)

    act(() => {
      window.showChallengeComplete!(challengeUpdate())
    })

    const card = document.getElementById('challenge-complete-card')
    const continueButton = screen.getByRole('button', { name: 'Continue' })

    // Focus is still outside the card before the entrance rAF lands: Tab
    // wraps to the first focusable element.
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(continueButton)

    // rAF also targets the Continue button; it is both first and last.
    await advance(16)
    expect(document.activeElement).toBe(continueButton)
    expect(card?.contains(document.activeElement)).toBe(true)

    // Tab on the last element wraps back to the first.
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(continueButton)

    // Shift+Tab on the first element wraps to the last.
    expect(fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })).toBe(
      false
    )
    expect(document.activeElement).toBe(continueButton)

    restoreOffsetParent()
  })
})
