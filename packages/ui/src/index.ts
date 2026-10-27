// Package entry point: HPA-379 Stage 2/3 React component surface.
// Static primitives and catalog components are SSR-only (passive); the
// interactive primitives (Select, Toggle) carry controlled/
// uncontrolled React state via onValueChange/onCheckedChange callbacks.
//
// Only CSS-free modules live here: per-page CSS collection follows a
// page's whole import graph, so a component that imports './x.css' must
// be consumed via its deep path ('@cetus/ui/components/<name>') or every
// barrel consumer ships its stylesheet too.
export { cn } from './lib/utils'
export { displayFontStyle } from './lib/styles'
export { Button, type ButtonProps } from './components/ui/button'
export { Card, type CardProps } from './components/ui/card'
export { Badge, type BadgeProps } from './components/ui/badge'
export { Heading, type HeadingProps } from './components/ui/heading'
export { Avatar, type AvatarProps } from './components/ui/avatar'
export { Container, type ContainerProps } from './components/ui/container'
export { Section, type SectionProps } from './components/ui/section'
export { Pagination, type PaginationProps } from './components/ui/pagination'
export { Select, type SelectProps } from './components/ui/select'
export { Toggle, type ToggleProps } from './components/ui/toggle'
export { GameOverlay, type GameOverlayProps } from './components/game-overlay'
export { GameTitle, type GameTitleProps } from './components/game-title'
export {
    GameBreadcrumb,
    type GameBreadcrumbProps,
} from './components/game-breadcrumb'
export { GameStats, type GameStatsProps } from './components/game-stats'
export {
    GameControls,
    type GameControlsProps,
} from './components/game-controls'
export {
    DailyMissionsPanel,
    type DailyMissionsPanelProps,
} from './components/daily-missions-panel'
export {
    UserDropdown,
    type UserDropdownProps,
} from './components/user-dropdown'
