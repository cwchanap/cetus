import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render } from '@testing-library/react'
import { GameControls } from './game-controls'

describe('GameControls', () => {
  it('default render matches the legacy imperative-script markup', () => {
    const { container } = render(<GameControls />)
    const start = container.querySelector('#start-btn') as HTMLElement
    const end = container.querySelector('#end-btn') as HTMLElement
    expect(start.textContent).toBe('Start Game')
    expect(start.style.display).toBe('')
    expect(end.style.display).toBe('none')
    expect(
      (container.querySelector('#pause-btn') as HTMLElement).textContent
    ).toBe('Pause')
    expect(container.querySelector('#reset-btn')).not.toBeNull()
    // No script-agnostic handlers serialized into SSR markup.
    for (const id of ['start-btn', 'end-btn', 'pause-btn', 'reset-btn']) {
      expect(
        container.querySelector(`#${id}`)?.getAttribute('onclick')
      ).toBeNull()
    }
  })

  it('running tri-state drives only the start/end visibility', () => {
    const { container, rerender } = render(<GameControls running />)
    expect(
      (container.querySelector('#start-btn') as HTMLElement).style.display
    ).toBe('none')
    expect(
      (container.querySelector('#end-btn') as HTMLElement).style.display
    ).toBe('')
    expect(
      (container.querySelector('#start-btn') as HTMLElement).textContent
    ).toBe('Start Game')

    rerender(<GameControls running={false} />)
    expect(
      (container.querySelector('#start-btn') as HTMLElement).style.display
    ).toBe('')
    expect(
      (container.querySelector('#end-btn') as HTMLElement).style.display
    ).toBe('none')
  })

  it('paused relabels the pause button to Resume', () => {
    const { container, rerender } = render(<GameControls paused />)
    expect(
      (container.querySelector('#pause-btn') as HTMLElement).textContent
    ).toBe('Resume')
    rerender(<GameControls paused={false} />)
    expect(
      (container.querySelector('#pause-btn') as HTMLElement).textContent
    ).toBe('Pause')
  })

  it('each controlled handler fires on its button click', () => {
    const onStart = vi.fn()
    const onEnd = vi.fn()
    const onPause = vi.fn()
    const onReset = vi.fn()
    const { container } = render(
      <GameControls
        running
        onStart={onStart}
        onEnd={onEnd}
        onPause={onPause}
        onReset={onReset}
      />
    )
    fireEvent.click(container.querySelector('#start-btn') as HTMLElement)
    fireEvent.click(container.querySelector('#end-btn') as HTMLElement)
    fireEvent.click(container.querySelector('#pause-btn') as HTMLElement)
    fireEvent.click(container.querySelector('#reset-btn') as HTMLElement)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onPause).toHaveBeenCalledTimes(1)
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
