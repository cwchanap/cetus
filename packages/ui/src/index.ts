// Package entry point: HPA-379 Stage 2 React component surface.
// Static primitives and catalog components are SSR-only (passive) — no
// client: directives anywhere.
export { cn } from './lib/utils'
export { Button, type ButtonProps } from './components/ui/button'
export { Card, type CardProps } from './components/ui/card'
export { Badge, type BadgeProps } from './components/ui/badge'
export { Heading, type HeadingProps } from './components/ui/heading'
export { Avatar, type AvatarProps } from './components/ui/avatar'
export { Container, type ContainerProps } from './components/ui/container'
export { Section, type SectionProps } from './components/ui/section'
export { Pagination, type PaginationProps } from './components/ui/pagination'
export { Organism, type OrganismProps } from './components/organism'
export {
    SpecimenCard,
    type SpecimenCardProps,
} from './components/specimen-card'
