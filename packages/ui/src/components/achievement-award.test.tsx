import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AchievementRarity,
  type AchievementNotification,
} from '@cetus/shared/achievements'
import { AchievementAwardCard } from './achievement-award'

const achievement: AchievementNotification = {
  id: 'tetris_novice',
  name: 'Tetris Novice',
  description: 'Score 100 points in Tetris',
  icon: '🔰',
  rarity: AchievementRarity.COMMON,
}

describe('AchievementAwardCard', () => {
  it('renders icon, name, description and rarity from the notification', () => {
    const { getByRole, getByText } = render(
      <AchievementAwardCard achievement={achievement} onDismiss={vi.fn()} />
    )

    const card = getByRole('button', { name: 'Dismiss achievement' })
    expect(card).toHaveAttribute('data-rarity', 'common')
    expect(card).toHaveTextContent('🔰')
    expect(getByText('Tetris Novice')).toBeInTheDocument()
    expect(getByText('Score 100 points in Tetris')).toBeInTheDocument()
    expect(getByText('common')).toBeInTheDocument()
  })

  it('dismisses on click, Enter and Space', () => {
    const onDismiss = vi.fn()
    const { getByRole } = render(
      <AchievementAwardCard achievement={achievement} onDismiss={onDismiss} />
    )
    const card = getByRole('button', { name: 'Dismiss achievement' })

    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    // Any other key is ignored.
    fireEvent.keyDown(card, { key: 'Tab' })

    expect(onDismiss).toHaveBeenCalledTimes(3)
  })
})

describe('AchievementAwardCard source retint', () => {
  it('uses cetus tokens, not Orbitron or hardcoded cyan', () => {
    // The ui vitest project runs from the repo root.
    const base = resolve('packages/ui/src/components')
    const source = readFileSync(resolve(base, 'achievement-award.tsx'), 'utf-8')
    const css = readFileSync(resolve(base, 'achievement-award.css'), 'utf-8')
    for (const text of [source, css]) {
      expect(text).not.toMatch(/font-orbitron/)
      expect(text).not.toMatch(/text-cyan-400/)
      expect(text).not.toMatch(/bg-glass-strong/)
    }
  })
})
