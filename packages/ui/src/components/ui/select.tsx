import { useState, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'defaultValue' | 'onChange' | 'children' | 'size'
> {
  variant?: 'default' | 'glass' | 'outline'
  size?: 'default' | 'sm' | 'lg'
  placeholder?: string
  options: Array<{ value: string; label: string }>
  /** Controlled selected value. */
  value?: string
  /** Uncontrolled initial selected value. */
  defaultValue?: string
  onValueChange?: (value: string) => void
}

const selectVariants = {
  variant: {
    default:
      'bg-cetus-surface border-cetus-hairline text-white hover:border-cetus-accent/50 focus:border-cetus-accent',
    glass:
      'bg-cetus-surface border border-cetus-hairline text-white hover:border-cetus-accent/50 focus:border-cetus-accent backdrop-blur-md',
    outline:
      'bg-transparent border-cetus-accent/50 text-cetus-accent hover:border-cetus-accent focus:border-cetus-accent',
  },
  size: {
    default: 'h-10 px-3 py-2 text-sm',
    sm: 'h-8 px-2 py-1 text-xs',
    lg: 'h-12 px-4 py-3 text-base',
  },
}

/**
 * HPA-379 React port of the former Select.astro. The custom div/listbox
 * dropdown is replaced by a styled native `<select>`: keyboard navigation,
 * focus, selection and form submission (`name`) are the browser's own, and
 * changes are reported through the `onValueChange` React callback only.
 */
export function Select({
  variant = 'default',
  size = 'default',
  placeholder = 'Select an option...',
  options,
  value,
  defaultValue,
  onValueChange,
  className,
  ...rest
}: SelectProps) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue ?? '')
  const currentValue = isControlled ? value : internalValue

  return (
    <div className="relative">
      <select
        className={cn(
          'w-full cursor-pointer appearance-none rounded-lg border pr-9 transition-all duration-200',
          'shadow-lg backdrop-blur-sm',
          'focus:outline-none focus:ring-2 focus:ring-cetus-accent/50',
          selectVariants.variant[variant],
          selectVariants.size[size],
          className
        )}
        value={currentValue}
        onChange={event => {
          const next = event.target.value
          if (!isControlled) {
            setInternalValue(next)
          }
          onValueChange?.(next)
        }}
        {...rest}
      >
        {/* Placeholder surfaces exactly when nothing matches, mirroring
                    the former server-side initial-label computation. */}
        {options.some(option => option.value === currentValue) ? null : (
          <option value="">{placeholder}</option>
        )}
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <svg
          className="h-5 w-5 text-gray-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </div>
  )
}
