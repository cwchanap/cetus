/// <reference types="react-native-css/types" />
import { Children, type ReactNode } from 'react'
import { Pressable, Text, type PressableProps } from 'react-native'
import { cn } from '../../lib/utils'
import type { ButtonSize, ButtonVariant } from '../../variants'

export interface ButtonProps extends Omit<
  PressableProps,
  'children' | 'className' | 'style'
> {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  style?: PressableProps['style']
  children?: ReactNode
}

const buttonVariants = {
  variant: {
    default: 'bg-cetus-surface border border-cetus-hairline',
    destructive: 'bg-red-600',
    outline: 'border-2 border-cetus-accent',
    secondary: 'bg-slate-700 border border-slate-600',
    ghost: 'active:bg-cetus-surface',
    link: '',
    primary: 'bg-cetus-accent',
  },
  size: {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
    icon: 'h-10 w-10',
  },
} satisfies {
  variant: Record<ButtonVariant, string>
  size: Record<ButtonSize, string>
}

const textVariants = {
  variant: {
    default: 'text-cetus-ink',
    destructive: 'text-white',
    outline: 'text-cetus-accent',
    secondary: 'text-white',
    ghost: 'text-cetus-ink',
    link: 'text-cetus-accent underline',
    primary: 'text-slate-900',
  },
} satisfies {
  variant: Record<ButtonVariant, string>
}

export function Button({
  variant = 'default',
  size = 'default',
  className,
  children,
  ...rest
}: ButtonProps) {
  const textClassName = cn('text-sm font-bold', textVariants.variant[variant])
  const items = Children.toArray(children)
  const allScalar =
    items.length > 0 &&
    items.every(item => typeof item === 'string' || typeof item === 'number')
  return (
    <Pressable
      className={cn(
        'flex-row items-center justify-center rounded-md active:opacity-80 disabled:opacity-50',
        buttonVariants.variant[variant],
        buttonVariants.size[size],
        className
      )}
      {...rest}
    >
      {allScalar ? (
        <Text className={textClassName}>{children}</Text>
      ) : (
        items.map((item, index) =>
          typeof item === 'string' || typeof item === 'number' ? (
            <Text key={index} className={textClassName}>
              {item}
            </Text>
          ) : (
            item
          )
        )
      )}
    </Pressable>
  )
}
