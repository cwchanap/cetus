import type { BadgeVariant } from '@cetus/ui'
import type { Game } from '@cetus/shared/games'

export function difficultyBadgeVariant(
    difficulty: Game['difficulty']
): BadgeVariant {
    switch (difficulty) {
        case 'easy':
            return 'success'
        case 'medium':
            return 'warning'
        case 'hard':
            return 'error'
        default:
            return 'outline'
    }
}
