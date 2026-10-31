import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render } from '@testing-library/react'
import { GameOverlay } from './game-overlay'

describe('GameOverlay', () => {
  it('default render matches the legacy imperative-script markup', () => {
    const { getByRole, container } = render(<GameOverlay />)
    const root = container.firstElementChild as HTMLElement
    expect(root.id).toBe('game-over-overlay')
    expect(root).toHaveClass('hidden')
    expect(root).toHaveClass('flex')
    expect(
      (container.querySelector('#game-over-title') as HTMLElement).textContent
    ).toBe('GAME OVER!')
    expect(
      (container.querySelector('#final-score') as HTMLElement).textContent
    ).toBe('0')
    const button = getByRole('button', { name: 'Play Again' })
    expect(button.id).toBe('play-again-btn')
    // React never serializes handlers to attributes — SSR bytes stay identical.
    expect(button.getAttribute('onclick')).toBeNull()
  })

  it('open drops the hidden class; false/undefined keep it', () => {
    const { container, rerender } = render(<GameOverlay open />)
    expect(container.firstElementChild).not.toHaveClass('hidden')
    rerender(<GameOverlay open={false} />)
    expect(container.firstElementChild).toHaveClass('hidden')
  })

  it('score renders the controlled value, undefined renders 0', () => {
    const { container, rerender } = render(<GameOverlay score={1234} />)
    expect(
      (container.querySelector('#final-score') as HTMLElement).textContent
    ).toBe('1234')
    rerender(<GameOverlay />)
    expect(
      (container.querySelector('#final-score') as HTMLElement).textContent
    ).toBe('0')
  })

  it('onButtonClick fires on play-again click', () => {
    const onButtonClick = vi.fn()
    const { getByRole } = render(<GameOverlay onButtonClick={onButtonClick} />)
    fireEvent.click(getByRole('button', { name: 'Play Again' }))
    expect(onButtonClick).toHaveBeenCalledTimes(1)
  })
})
