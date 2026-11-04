// Native package entry point (HPA-182): reached through the `react-native`
// export condition in packages/ui/package.json. Only components with real
// native implementations are exported — the HPA-182 pilots below. Native
// imports of unimplemented components (Select, Toggle, Badge, Heading,
// Avatar, Container/Section until ported; game chrome, Slider, Pagination
// and UserDropdown permanently) must FAIL to resolve rather than fall
// through to web DOM/CSS/react-dom code — see the './components/*'
// react-native target in package.json, which maps only existing
// *.native.tsx modules.
export { cn } from './lib/utils'
export type { ButtonVariant, ButtonSize, CardVariant } from './variants'
export { Button, type ButtonProps } from './components/ui/button.native'
export { Card, type CardProps } from './components/ui/card.native'
