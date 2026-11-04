/// <reference types="react-native-css/types" />
import { useEffect, useState } from 'react'
import { Switch, Text, View, type SwitchProps } from 'react-native'
import { useNativeVariable } from 'react-native-css/native'
import { cn } from '../../lib/utils'
import type { ToggleSize, ToggleVariant } from '../../variants'

export interface ToggleProps extends Omit<
  SwitchProps,
  | 'value'
  | 'onValueChange'
  | 'onChange'
  | 'trackColor'
  | 'thumbColor'
  | 'ios_backgroundColor'
  | 'className'
  | 'style'
> {
  variant?: ToggleVariant
  size?: ToggleSize
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  label?: string
  description?: string
  className?: string
  style?: SwitchProps['style']
}

const switchScale = {
  default: 1,
  sm: 0.8,
  lg: 1.25,
} satisfies Record<ToggleSize, number>

const offTrackVariable = {
  default: '--cetus-chrome-muted',
  'sci-fi': '--cetus-chrome',
} satisfies Record<ToggleVariant, string>

export function Toggle({
  variant = 'sci-fi',
  size = 'default',
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  disabled = false,
  accessibilityLabel,
  accessibilityState,
  className,
  style,
  ...rest
}: ToggleProps) {
  useEffect(() => {
    if (!label && !accessibilityLabel) {
      console.warn(
        'Toggle component requires either a "label" or "accessibilityLabel" prop for accessibility'
      )
    }
  }, [label, accessibilityLabel])

  const accent = useNativeVariable('--cetus-accent')
  const thumb = useNativeVariable('--cetus-chrome-ink')
  const offTrack = useNativeVariable(offTrackVariable[variant])

  const isControlled = checked !== undefined
  const [internalChecked, setInternalChecked] = useState(defaultChecked)
  const isChecked = isControlled ? checked : internalChecked

  const handleValueChange = (next: boolean) => {
    if (disabled) {
      return
    }
    if (!isControlled) {
      setInternalChecked(next)
    }
    onCheckedChange?.(next)
  }

  return (
    <View
      className={cn('flex-row items-center justify-between gap-4', className)}
    >
      {label || description ? (
        <View className="flex-1">
          {label ? (
            <Text className="font-sans text-sm font-medium text-cetus-ink">
              {label}
            </Text>
          ) : null}
          {description ? (
            <Text className="mt-0.5 font-sans text-xs text-cetus-ink-muted">
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Switch
        value={isChecked}
        onValueChange={handleValueChange}
        disabled={disabled}
        trackColor={{ false: offTrack, true: accent }}
        thumbColor={thumb}
        ios_backgroundColor={offTrack}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{
          checked: isChecked,
          disabled,
          ...accessibilityState,
        }}
        style={[{ transform: [{ scale: switchScale[size] }] }, style]}
        {...rest}
      />
    </View>
  )
}
