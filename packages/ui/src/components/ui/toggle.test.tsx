import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { Toggle } from './toggle'

describe('Toggle', () => {
  it('renders a switch with accessible name from the label', () => {
    const { getByRole, getByText } = render(<Toggle label="Sound Enabled" />)
    const toggle = getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(toggle.getAttribute('aria-labelledby')).toBe(
      getByText('Sound Enabled').id
    )
    expect(toggle).not.toBeDisabled()
  })

  it('falls back to aria-label and warns without any accessible name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { getByRole } = render(<Toggle />)
    expect(getByRole('switch').getAttribute('aria-label')).toBe('Toggle switch')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('toggles uncontrolled state on click and reports it', () => {
    const onCheckedChange = vi.fn()
    const { getByRole } = render(
      <Toggle label="Sound" defaultChecked onCheckedChange={onCheckedChange} />
    )
    const toggle = getByRole('switch')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(onCheckedChange).toHaveBeenCalledWith(false)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)
  })

  it('stays controlled when the parent ignores updates', () => {
    const onCheckedChange = vi.fn()
    const { getByRole } = render(
      <Toggle label="Sound" checked onCheckedChange={onCheckedChange} />
    )
    const toggle = getByRole('switch')
    fireEvent.click(toggle)
    expect(onCheckedChange).toHaveBeenCalledWith(false)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
  })

  it('follows the controlled value when the parent re-renders', () => {
    function Harness() {
      const [checked, setChecked] = useState(false)
      return (
        <Toggle label="Sound" checked={checked} onCheckedChange={setChecked} />
      )
    }
    const { getByRole } = render(<Harness />)
    fireEvent.click(getByRole('switch'))
    expect(getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('ignores clicks while disabled', () => {
    const onCheckedChange = vi.fn()
    const { getByRole } = render(
      <Toggle label="Sound" disabled onCheckedChange={onCheckedChange} />
    )
    const toggle = getByRole('switch')
    expect(toggle).toBeDisabled()
    fireEvent.click(toggle)
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('submits "true"/"false" under its native name', () => {
    const { getByRole, getByTestId } = render(
      <form data-testid="form">
        <Toggle label="Sound" name="soundEnabled" defaultChecked />
      </form>
    )
    const data = new FormData(getByTestId('form') as HTMLFormElement)
    expect(data.get('soundEnabled')).toBe('true')

    fireEvent.click(getByRole('switch'))
    const after = new FormData(getByTestId('form') as HTMLFormElement)
    expect(after.get('soundEnabled')).toBe('false')
  })

  it('excludes the hidden input from submission while disabled', () => {
    const { getByTestId } = render(
      <form data-testid="form">
        <Toggle label="Sound" name="soundEnabled" defaultChecked disabled />
      </form>
    )
    const data = new FormData(getByTestId('form') as HTMLFormElement)
    expect(data.get('soundEnabled')).toBeNull()
  })

  it('renders the description and the sci-fi variant classes', () => {
    const { getByText, getByRole } = render(
      <Toggle
        label="Reduced Motion"
        description="Minimize animations"
        variant="sci-fi"
        size="lg"
      />
    )
    expect(getByText('Minimize animations')).toBeTruthy()
    const toggle = getByRole('switch')
    expect(toggle.className).toContain('bg-cetus-surface')
    expect(toggle.className).toContain('border-cetus-hairline')
    expect(toggle.className).toContain('w-14 h-7')
  })

  it('labels the switch for the button so clicking the label toggles it', () => {
    const onCheckedChange = vi.fn()
    const { getByText } = render(
      <Toggle label="Sound" onCheckedChange={onCheckedChange} />
    )
    fireEvent.click(getByText('Sound'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})
