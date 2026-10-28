import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { GameStats } from './game-stats'

describe('GameStats', () => {
  it('default render matches the legacy imperative-script markup', () => {
    const { container } = render(<GameStats />)
    expect((container.querySelector('#score') as HTMLElement).textContent).toBe(
      '0'
    )
    expect(
      (container.querySelector('#time-remaining') as HTMLElement).textContent
    ).toBe('60')
  })

  it('omitted time renders initialTime', () => {
    const { container } = render(<GameStats initialTime={90} />)
    expect(
      (container.querySelector('#time-remaining') as HTMLElement).textContent
    ).toBe('90')
  })

  it('controlled score/time render their values', () => {
    const { container } = render(<GameStats score={4321} time={17} />)
    expect((container.querySelector('#score') as HTMLElement).textContent).toBe(
      '4321'
    )
    expect(
      (container.querySelector('#time-remaining') as HTMLElement).textContent
    ).toBe('17')
  })
})
