/// <reference types="react-native-css/types" />
import { useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
} from 'react-native'
import { cn } from '../../lib/utils'
import type { SelectSize, SelectVariant } from '../../variants'

export interface SelectProps extends Omit<
  PressableProps,
  'children' | 'className' | 'style' | 'onPress' | 'disabled'
> {
  variant?: SelectVariant
  size?: SelectSize
  placeholder?: string
  options: Array<{ value: string; label: string }>
  /** Controlled selected value. */
  value?: string
  /** Uncontrolled initial selected value. */
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  className?: string
}

const selectVariants = {
  variant: {
    default: 'bg-cetus-surface border-cetus-hairline',
    glass: 'bg-cetus-surface border-cetus-hairline',
    outline: 'bg-transparent border-cetus-accent/50',
  },
  size: {
    default: 'h-10 px-3 py-2',
    sm: 'h-8 px-2 py-1',
    lg: 'h-12 px-4 py-3',
  },
} satisfies {
  variant: Record<SelectVariant, string>
  size: Record<SelectSize, string>
}

const labelVariants = {
  size: {
    default: 'text-sm',
    sm: 'text-xs',
    lg: 'text-base',
  },
} satisfies {
  size: Record<SelectSize, string>
}

export function Select({
  variant = 'default',
  size = 'default',
  placeholder = 'Select an option...',
  options,
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  className,
  accessibilityState,
  ...rest
}: SelectProps) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(defaultValue ?? '')
  const currentValue = isControlled ? value : internalValue
  const [open, setOpen] = useState(false)

  const selected = options.find(option => option.value === currentValue)
  const displayLabel = selected?.label ?? placeholder

  const choose = (next: string) => {
    if (!isControlled) {
      setInternalValue(next)
    }
    onValueChange?.(next)
    setOpen(false)
  }

  return (
    <View>
      <Pressable
        accessibilityRole="combobox"
        accessibilityState={{
          expanded: open,
          disabled,
          ...accessibilityState,
        }}
        disabled={disabled}
        onPress={() => {
          if (!disabled) {
            setOpen(true)
          }
        }}
        className={cn(
          'w-full flex-row items-center justify-between rounded-lg border active:opacity-80 disabled:opacity-50',
          selectVariants.variant[variant],
          selectVariants.size[size],
          className
        )}
        {...rest}
      >
        <Text
          numberOfLines={1}
          className={cn(
            'flex-1',
            labelVariants.size[size],
            selected
              ? variant === 'outline'
                ? 'text-cetus-accent'
                : 'text-cetus-ink'
              : 'text-cetus-muted'
          )}
        >
          {displayLabel}
        </Text>
        <Text
          className="ml-2 text-xs text-cetus-muted"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          ▾
        </Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <Pressable
            accessibilityLabel="Dismiss"
            className="absolute inset-0"
            onPress={() => setOpen(false)}
          />
          <View className="max-h-[70%] rounded-t-2xl border-t border-cetus-hairline bg-cetus-bg">
            <ScrollView>
              {options.map(option => {
                const isSelected = option.value === currentValue
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="menuitem"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => choose(option.value)}
                    className="flex-row items-center justify-between border-b border-cetus-hairline px-4 py-3 active:bg-cetus-surface"
                  >
                    <Text
                      className={cn(
                        'text-sm',
                        isSelected
                          ? 'font-bold text-cetus-accent'
                          : 'text-cetus-ink'
                      )}
                    >
                      {option.label}
                    </Text>
                    {isSelected ? (
                      <Text
                        className="text-cetus-accent"
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      >
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}
