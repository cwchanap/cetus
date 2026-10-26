import { describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AchievementsGameFilter } from './AchievementsGameFilter'

const options = [
  { value: 'all', label: 'All games' },
  { value: 'snake', label: 'Snake' },
]

// jsdom's Location is non-configurable; replace the whole window.location
// value so the island's `window.location.href = ...` navigation lands on a
// plain object we can inspect. `pathname`/`search` mirror the initial URL.
const replaceLocation = (initialHref: string) => {
  const originalLocation = window.location
  const initial = new URL(initialHref)
  let current = initial.href
  const assignments: string[] = []

  Object.defineProperty(window, 'location', {
    value: {
      get href() {
        return current
      },
      set href(next: string) {
        assignments.push(next)
        current = next
      },
      pathname: initial.pathname,
      search: initial.search,
    },
    writable: true,
    configurable: true,
  })

  return {
    assignments,
    restore: () => {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    },
  }
}

let restoreLocation: (() => void) | undefined

afterEach(() => {
  restoreLocation?.()
  restoreLocation = undefined
})

describe('AchievementsGameFilter island', () => {
  it('renders the select with the current value and options', () => {
    const loc = replaceLocation('http://localhost:4325/achievements?game=all')
    restoreLocation = loc.restore

    render(<AchievementsGameFilter value="all" options={options} />)

    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('all')
    expect(select).toHaveAttribute('name', 'game')
    expect(screen.getByRole('option', { name: 'Snake' })).toBeInTheDocument()
  })

  it('navigates with game=all and resets page=1 for the paginated view', () => {
    const loc = replaceLocation(
      'http://localhost:4325/achievements?game=snake&page=3'
    )
    restoreLocation = loc.restore

    render(<AchievementsGameFilter value="snake" options={options} />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'all' },
    })

    expect(loc.assignments).toEqual([
      'http://localhost:4325/achievements?game=all&page=1',
    ])
  })

  it('navigates with the selected game and drops the page param', () => {
    const loc = replaceLocation(
      'http://localhost:4325/achievements?game=all&page=2'
    )
    restoreLocation = loc.restore

    render(<AchievementsGameFilter value="all" options={options} />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'snake' },
    })

    expect(loc.assignments).toEqual([
      'http://localhost:4325/achievements?game=snake',
    ])
  })

  it('does not navigate when the destination equals the current URL', () => {
    const loc = replaceLocation('http://localhost:4325/achievements?game=snake')
    restoreLocation = loc.restore

    // Picking 'snake' resolves to the URL already in the address bar, so the
    // island returns before assigning window.location.href.
    render(<AchievementsGameFilter value="all" options={options} />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'snake' },
    })

    expect(loc.assignments).toEqual([])
  })
})
