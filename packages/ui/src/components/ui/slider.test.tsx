import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { Slider } from './slider'

describe('Slider', () => {
  it('renders a native range input with min/max/step and its value', () => {
    const { getByRole } = render(
      <Slider
        ariaLabel="Master Volume"
        min={0}
        max={100}
        step={5}
        defaultValue={70}
        unit="%"
      />
    )
    const slider = getByRole('slider') as HTMLInputElement
    expect(slider.type).toBe('range')
    expect(slider.min).toBe('0')
    expect(slider.max).toBe('100')
    expect(slider.step).toBe('5')
    expect(slider.value).toBe('70')
    expect(slider.getAttribute('aria-label')).toBe('Master Volume')
  })

  it('shows the current value with its unit next to the label', () => {
    const { getByRole, getByText } = render(
      <Slider label="Master Volume" defaultValue={70} unit="%" />
    )
    const slider = getByRole('slider')
    expect(slider.getAttribute('aria-labelledby')).toBe(
      getByText('Master Volume').id
    )
    expect(getByText('70%')).toBeTruthy()
  })

  it('can hide the value readout', () => {
    const { queryByText } = render(
      <Slider ariaLabel="Volume" defaultValue={30} showValue={false} />
    )
    expect(queryByText('30')).toBeNull()
  })

  it('reports numeric changes through onValueChange', () => {
    const onValueChange = vi.fn()
    const { getByRole } = render(
      <Slider
        ariaLabel="Volume"
        defaultValue={70}
        onValueChange={onValueChange}
      />
    )
    fireEvent.change(getByRole('slider'), { target: { value: '45' } })
    expect(onValueChange).toHaveBeenCalledWith(45)
  })

  it('stays controlled when the parent ignores updates', () => {
    const onValueChange = vi.fn()
    const { getByRole, getByText } = render(
      <Slider ariaLabel="Volume" value={70} onValueChange={onValueChange} />
    )
    const slider = getByRole('slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '10' } })
    expect(onValueChange).toHaveBeenCalledWith(10)
    expect(slider.value).toBe('70')
    expect(getByText('70')).toBeTruthy()
  })

  it('follows the controlled value when the parent re-renders', () => {
    function Harness() {
      const [value, setValue] = useState(50)
      return (
        <Slider ariaLabel="Volume" value={value} onValueChange={setValue} />
      )
    }
    const { getByRole, getByText } = render(<Harness />)
    fireEvent.change(getByRole('slider'), { target: { value: '65' } })
    expect((getByRole('slider') as HTMLInputElement).value).toBe('65')
    expect(getByText('65')).toBeTruthy()
  })

  it('updates internally in uncontrolled mode', () => {
    const { getByRole } = render(
      <Slider ariaLabel="Volume" defaultValue={50} />
    )
    const slider = getByRole('slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '20' } })
    expect(slider.value).toBe('20')
  })

  it('disables interaction and omits the form name when disabled', () => {
    const onValueChange = vi.fn()
    const { getByRole } = render(
      <Slider
        ariaLabel="Volume"
        name="volume"
        defaultValue={50}
        disabled
        onValueChange={onValueChange}
      />
    )
    const slider = getByRole('slider') as HTMLInputElement
    expect(slider).toBeDisabled()
    expect(slider.getAttribute('name')).toBeNull()
    fireEvent.change(slider, { target: { value: '20' } })
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('submits its value under its native name', () => {
    const { getByTestId } = render(
      <form data-testid="form">
        <Slider ariaLabel="Volume" name="volume" defaultValue={45} />
      </form>
    )
    const data = new FormData(getByTestId('form') as HTMLFormElement)
    expect(data.get('volume')).toBe('45')
  })

  it('clamps the fill percentage for out-of-range values', () => {
    const { getByRole } = render(<Slider ariaLabel="Volume" value={150} />)
    const slider = getByRole('slider') as HTMLInputElement
    // Controlled out-of-range value: browser clamps the DOM value to max.
    expect(slider.value).toBe('100')
    expect(slider.style.background).toContain('100%')
  })
})
