import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  ChallengeType,
  type UserChallengeProgress,
} from '@cetus/shared/challenges'
import { DailyMissionsPanel } from './daily-missions-panel'

const challenge = (
  overrides: Partial<UserChallengeProgress> = {}
): UserChallengeProgress => ({
  challengeId: 'play_2_games',
  name: 'Warm Up',
  description: 'Play 2 games today',
  icon: '🎮',
  type: ChallengeType.PLAY_GAMES,
  targetValue: 2,
  currentValue: 1,
  xpReward: 30,
  difficulty: 'easy',
  completed: false,
  completedAt: null,
  ...overrides,
})

const baseProps = {
  challenges: [challenge()],
  xp: 450,
  level: 4,
  xpProgress: 45,
  xpToNextLevel: 50,
  streak: 3,
  resetIn: 3661,
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('DailyMissionsPanel challenge progress', () => {
  it('renders the header, level badge and XP progress bar', () => {
    render(<DailyMissionsPanel {...baseProps} />)

    expect(screen.getByText('DAILY MISSIONS')).toBeInTheDocument()
    expect(screen.getByText('Level 4')).toBeInTheDocument()
    expect(screen.getByText('450 XP')).toBeInTheDocument()
    expect(screen.getByText('50 XP to Level 5')).toBeInTheDocument()
    const bar = document.querySelector(
      '.h-full.bg-cetus-accent.transition-all.duration-500'
    ) as HTMLElement
    expect(bar).toHaveStyle({ width: '45%' })
  })

  it('renders an in-progress challenge with progress bar and counts', () => {
    render(<DailyMissionsPanel {...baseProps} />)

    expect(screen.getByText('Warm Up')).toBeInTheDocument()
    expect(screen.getByText('EASY')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
    const bar = document.querySelector(
      '.h-full.bg-cetus-accent.transition-all.duration-300'
    ) as HTMLElement
    // 1 of 2 -> 50%
    expect(bar).toHaveStyle({ width: '50%' })
  })

  it('renders a completed challenge with a check and no progress bar', () => {
    render(
      <DailyMissionsPanel
        {...baseProps}
        challenges={[
          challenge({
            challengeId: 'play_2_games',
            completed: true,
            currentValue: 2,
          }),
        ]}
      />
    )

    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.queryByText('1/2')).not.toBeInTheDocument()
    expect(document.querySelector('.duration-300')).toBeNull()
  })

  it('caps progress at 100% and handles missing target values', () => {
    render(
      <DailyMissionsPanel
        {...baseProps}
        challenges={[
          challenge({
            challengeId: 'over',
            currentValue: 5,
            targetValue: 2,
          }),
          challenge({
            challengeId: 'zero',
            targetValue: 0,
            currentValue: 0,
          }),
        ]}
      />
    )

    const bars = Array.from(
      document.querySelectorAll<HTMLElement>('.duration-300')
    )
    expect(bars[0]).toHaveStyle({ width: '100%' })
    expect(bars[1]).toHaveStyle({ width: '0%' })
  })

  it('shows the streak only when it is positive', () => {
    const { rerender } = render(<DailyMissionsPanel {...baseProps} />)
    expect(screen.getByText('3 days')).toBeInTheDocument()

    rerender(<DailyMissionsPanel {...baseProps} streak={0} />)
    expect(screen.queryByText(/Challenge Streak/)).not.toBeInTheDocument()
  })

  it('colors the difficulty label per tier', () => {
    render(
      <DailyMissionsPanel
        {...baseProps}
        challenges={[
          challenge({ challengeId: 'a', difficulty: 'medium' }),
          challenge({ challengeId: 'b', difficulty: 'hard' }),
        ]}
      />
    )
    expect(screen.getByText('MEDIUM')).toHaveClass('text-cetus-accent-2')
    expect(screen.getByText('HARD')).toHaveClass('text-cetus-accent-3')
  })
})

describe('DailyMissionsPanel countdown', () => {
  it('formats the reset timer and ticks down each second', async () => {
    render(<DailyMissionsPanel {...baseProps} />)

    expect(screen.getByText('Resets in 01:01:01')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Resets in 01:01:00')).toBeInTheDocument()
  })

  it('announces the reset and offers a refresh prompt at zero', async () => {
    // jsdom's location.reload is non-configurable; replace the whole
    // location value to observe the reload call.
    const reload = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload },
      writable: true,
      configurable: true,
    })

    render(<DailyMissionsPanel {...baseProps} resetIn={2} />)
    expect(screen.getByText('Resets in 00:00:02')).toBeInTheDocument()

    // Tick once per act step so React can re-schedule between seconds.
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Daily missions reset')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }))
    })
    expect(reload).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })
})
