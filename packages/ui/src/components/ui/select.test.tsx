import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { Select } from './select'

const options = [
  { value: 'game1', label: '🎮 Game 1' },
  { value: 'game2', label: '🎯 Game 2' },
  { value: 'all', label: 'All Games' },
]

describe('Select', () => {
  it('renders options and shows the selected label', () => {
    const { getByRole } = render(
      <Select options={options} defaultValue="game2" />
    )
    const select = getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('game2')
    expect(select.selectedOptions[0].textContent).toBe('🎯 Game 2')
  })

  it('renders the placeholder when no value matches', () => {
    const { getByRole } = render(<Select options={options} />)
    const select = getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('')
    expect(select.selectedOptions[0].textContent).toBe('Select an option...')
  })

  it('reports changes through onValueChange', () => {
    const onValueChange = vi.fn()
    const { getByRole } = render(
      <Select
        options={options}
        defaultValue="game1"
        onValueChange={onValueChange}
      />
    )
    fireEvent.change(getByRole('combobox'), { target: { value: 'all' } })
    expect(onValueChange).toHaveBeenCalledWith('all')
  })

  it('stays controlled when the parent ignores updates', () => {
    const onValueChange = vi.fn()
    const { getByRole } = render(
      <Select options={options} value="game1" onValueChange={onValueChange} />
    )
    const select = getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'game2' } })
    expect(onValueChange).toHaveBeenCalledWith('game2')
    expect(select.value).toBe('game1')
  })

  it('follows the controlled value when the parent re-renders', () => {
    function Harness() {
      const [value, setValue] = useState('game1')
      return <Select options={options} value={value} onValueChange={setValue} />
    }
    const { getByRole } = render(<Harness />)
    const select = getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'game2' } })
    expect(select.value).toBe('game2')
  })

  it('updates internally in uncontrolled mode', () => {
    const { getByRole } = render(
      <Select options={options} defaultValue="game1" />
    )
    const select = getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'game2' } })
    expect(select.value).toBe('game2')
  })

  it('submits the selected value under its native name', () => {
    const { getByTestId } = render(
      <form data-testid="form">
        <Select options={options} name="game" defaultValue="game1" />
      </form>
    )
    const data = new FormData(getByTestId('form') as HTMLFormElement)
    expect(data.get('game')).toBe('game1')
  })

  it('renders variant and size classes with cetus tokens', () => {
    const { getByRole } = render(
      <Select options={options} variant="glass" size="lg" />
    )
    const select = getByRole('combobox')
    expect(select.className).toContain('bg-cetus-surface')
    expect(select.className).toContain('border-cetus-hairline')
    expect(select.className).toContain('backdrop-blur-md')
    expect(select.className).not.toMatch(/border-cyan-400/)
    expect(select.className).toContain('h-12 px-4 py-3 text-base')
  })

  it('renders the outline variant with accent tokens', () => {
    const { getByRole } = render(<Select options={options} variant="outline" />)
    const select = getByRole('combobox')
    expect(select.className).toContain('bg-transparent')
    expect(select.className).toContain('border-cetus-accent/50')
    expect(select.className).toContain('text-cetus-accent')
  })

  it('renders sm and default size classes', () => {
    const { getByRole } = render(<Select options={options} size="sm" />)
    expect(getByRole('combobox').className).toContain('h-8 px-2 py-1 text-xs')
  })
  it('honors disabled and forwards root DOM props', () => {
    const { getByRole } = render(
      <Select
        options={options}
        disabled
        id="game-filter-select"
        data-testid="filter"
      />
    )
    const select = getByRole('combobox') as HTMLSelectElement
    expect(select).toBeDisabled()
    expect(select.id).toBe('game-filter-select')
    expect(select.getAttribute('data-testid')).toBe('filter')
  })

  it('keeps keyboard interaction native (select element is focusable)', () => {
    const { getByRole } = render(<Select options={options} />)
    const select = getByRole('combobox')
    select.focus()
    expect(select).toHaveFocus()
  })
})
