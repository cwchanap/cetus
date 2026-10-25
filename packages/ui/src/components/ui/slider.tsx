import { useId, useState, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'
import './slider.css'

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  | 'type'
  | 'value'
  | 'defaultValue'
  | 'onChange'
  | 'min'
  | 'max'
  | 'step'
  | 'size'
> {
  variant?: 'default' | 'sci-fi'
  min?: number
  max?: number
  step?: number
  /** Controlled thumb position. */
  value?: number
  /** Uncontrolled initial thumb position. */
  defaultValue?: number
  onValueChange?: (value: number) => void
  /** Visible label rendered above the track. */
  label?: string
  ariaLabel?: string
  showValue?: boolean
  unit?: string
}

/**
 * HPA-379 React port of the former Slider.astro. The custom
 * track/thumb/drag implementation is replaced by a native
 * `<input type="range">`: pointer drag, track jumps, keyboard steps
 * (arrows, Home/End, PageUp/PageDown), focus and form submission
 * (`name`) are the browser's own. Changes are reported through the
 * `onValueChange` React callback only — no `slider-change` CustomEvent.
 */
export function Slider({
  variant = 'sci-fi',
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  label,
  ariaLabel,
  showValue = true,
  unit = '',
  id,
  name,
  className,
  ...rest
}: SliderProps) {
  const generatedId = useId()
  const uniqueId = id || `slider-${generatedId}`

  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue ?? 50)
  const currentValue = isControlled ? value : internalValue

  const percentage =
    max === min
      ? 0
      : Math.max(0, Math.min(100, ((currentValue - min) / (max - min)) * 100))

  // Fill the track up to the thumb; the remainder is the bare track color
  // (sci-fi uses the hairline token, the plain variant uses gray-600).
  const trackColor = variant === 'sci-fi' ? 'var(--cetus-hairline)' : '#4b5563'
  const trackStyle = {
    background: `linear-gradient(to right, var(--cetus-accent) ${percentage}%, ${trackColor} ${percentage}%)`,
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && (
            <label
              id={`${uniqueId}-label`}
              htmlFor={uniqueId}
              className="text-sm font-medium text-gray-300"
            >
              {label}
            </label>
          )}
          {showValue && (
            <span
              className="text-sm text-cetus-accent font-mono"
              data-slider-value
            >
              {currentValue}
              {unit}
            </span>
          )}
        </div>
      )}
      <div className="relative flex items-center">
        <input
          type="range"
          id={uniqueId}
          name={disabled ? undefined : name}
          className="cetus-slider"
          style={trackStyle}
          min={min}
          max={max}
          step={step}
          value={currentValue}
          disabled={disabled}
          aria-labelledby={label ? `${uniqueId}-label` : undefined}
          aria-label={!label ? ariaLabel || 'Slider' : undefined}
          onChange={event => {
            // Native inputs reject user interaction while disabled;
            // the guard also blocks programmatic events (jsdom).
            if (disabled) {
              return
            }
            const next = Number(event.target.value)
            if (!isControlled) {
              setInternalValue(next)
            }
            onValueChange?.(next)
          }}
          {...rest}
        />
      </div>
    </div>
  )
}
