import { useId, useState, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface ToggleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange' | 'checked'
> {
  variant?: 'default' | 'sci-fi'
  size?: 'default' | 'sm' | 'lg'
  /** Controlled switch state. */
  checked?: boolean
  /** Uncontrolled initial switch state. */
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  /** Visible label rendered beside the switch. */
  label?: string
  description?: string
  /** Native form field name; submits "true"/"false". */
  name?: string
}

const toggleVariants = {
  variant: {
    default: 'bg-gray-600 data-[checked]:bg-cetus-accent',
    'sci-fi':
      'bg-cetus-surface border border-cetus-hairline data-[checked]:bg-cetus-accent data-[checked]:border-cetus-accent/50',
  },
  size: {
    default: 'w-11 h-6',
    sm: 'w-9 h-5',
    lg: 'w-14 h-7',
  },
}

const knobSizes = {
  default: 'w-5 h-5',
  sm: 'w-4 h-4',
  lg: 'w-6 h-6',
}

const knobTranslate = {
  default: 'data-[checked]:translate-x-5',
  sm: 'data-[checked]:translate-x-4',
  lg: 'data-[checked]:translate-x-7',
}

/**
 * HPA-379 React port of the former Toggle.astro. State flows through the
 * `checked`/`onCheckedChange` React props (no `toggle-change` CustomEvent,
 * no expando component handle); the hidden input stays in sync via React
 * render so native form submission keeps reporting "true"/"false".
 */
export function Toggle({
  variant = 'sci-fi',
  size = 'default',
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  name,
  disabled = false,
  id,
  'aria-label': ariaLabel,
  className,
  ...rest
}: ToggleProps) {
  if (!label && !ariaLabel) {
    console.warn(
      'Toggle component requires either a "label" or "aria-label" prop for accessibility'
    )
  }

  const generatedId = useId()
  const isControlled = checked !== undefined
  const [internalChecked, setInternalChecked] = useState(defaultChecked)
  const isChecked = isControlled ? checked : internalChecked

  const uniqueId = id || (label ? `toggle-${generatedId}` : undefined)

  const handleClick = () => {
    if (disabled) {
      return
    }
    const next = !isChecked
    if (!isControlled) {
      setInternalChecked(next)
    }
    onCheckedChange?.(next)
  }

  const toggleClasses = cn(
    'relative inline-flex items-center rounded-full transition-all duration-300 cursor-pointer',
    'focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-gray-900',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    toggleVariants.variant[variant],
    toggleVariants.size[size]
  )

  const knobClasses = cn(
    'inline-block rounded-full bg-white shadow-lg transform transition-transform duration-300 ml-0.5',
    'data-[checked]:shadow-cyan-400/50',
    knobTranslate[size],
    knobSizes[size]
  )

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <label
              id={uniqueId ? `${uniqueId}-label` : undefined}
              htmlFor={uniqueId}
              className="text-sm font-medium text-gray-300 block cursor-pointer"
            >
              {label}
            </label>
          )}
          {description && (
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
      )}
      <input
        type="hidden"
        name={name}
        value={isChecked ? 'true' : 'false'}
        disabled={disabled}
        data-toggle-input
      />
      <button
        type="button"
        role="switch"
        aria-checked={isChecked}
        aria-labelledby={label && uniqueId ? `${uniqueId}-label` : undefined}
        aria-label={!label ? ariaLabel || 'Toggle switch' : undefined}
        data-checked={isChecked ? '' : undefined}
        data-toggle
        className={toggleClasses}
        disabled={disabled}
        id={uniqueId}
        onClick={handleClick}
        {...rest}
      >
        <span
          className={knobClasses}
          data-checked={isChecked ? '' : undefined}
          data-toggle-knob
        />
      </button>
    </div>
  )
}
