// Shared variant/size NAME unions (HPA-182). These are the contract every
// platform's component API must honor: web and native tables map the same
// names to platform-specific class values via `satisfies Record<...>` in
// each component file, so a missing or renamed name fails typechecking.
// Type unions only — no shared styling lives here.
//
// Scoped to the components HPA-182's native screens consume. Deferred
// components (game chrome, AchievementAward, ChallengeComplete, Slider,
// Pagination, UserDropdown) get no union until a native consumer exists.

export type ButtonVariant =
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
    | 'primary'

export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

export type CardVariant = 'default' | 'sci-fi' | 'glass' | 'elevated'

export type BadgeVariant =
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'outline'
    | 'success'
    | 'warning'
    | 'error'

export type BadgeSize = 'default' | 'sm' | 'lg'

export type HeadingVariant = 'default' | 'hero' | 'section' | 'subsection'

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export type HeadingAlign = 'left' | 'center' | 'right'

export type AvatarSize = 'sm' | 'default' | 'lg' | 'xl'

export type AvatarVariant =
    'default' | 'cyan-purple' | 'purple-pink' | 'pink-cyan' | 'solid'

export type SectionVariant = 'default' | 'hero' | 'features' | 'cta'

export type SelectVariant = 'default' | 'glass' | 'outline'

export type SelectSize = 'default' | 'sm' | 'lg'

export type ToggleVariant = 'default' | 'sci-fi'

export type ToggleSize = 'default' | 'sm' | 'lg'
