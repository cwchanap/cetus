import { Select } from '@cetus/ui'

/**
 * Achievements page game-filter island (HPA-379). Astro passes only the
 * serializable selection state; the navigation callback lives here and
 * preserves the former hidden-input listener's URL semantics: set
 * `?game=`, reset `page=1` for the paginated "all" view, drop `page`
 * otherwise, and navigate only when the destination differs.
 */
export interface AchievementsGameFilterProps {
  value: string
  options: Array<{ value: string; label: string }>
}

export function AchievementsGameFilter({
  value,
  options,
}: AchievementsGameFilterProps) {
  return (
    <Select
      id="game-filter-select"
      name="game"
      variant="glass"
      value={value}
      options={options}
      onValueChange={next => {
        const url = new URL(window.location.href)
        url.searchParams.set('game', next)
        if (next === 'all') {
          url.searchParams.set('page', '1')
        } else {
          url.searchParams.delete('page')
        }

        // Only navigate if the destination actually differs
        const nextPath = url.pathname + url.search
        const currentPath = window.location.pathname + window.location.search
        if (nextPath === currentPath) {
          return
        }

        window.location.href = url.toString()
      }}
    />
  )
}

export default AchievementsGameFilter
