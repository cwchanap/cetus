import type { PotionSorterDifficulty, PotionSorterPreset } from './types'

export const POTION_SORTER_PRESETS: Record<
    PotionSorterDifficulty,
    PotionSorterPreset
> = {
    easy: {
        difficulty: 'easy',
        duration: 180,
        moveTarget: 10,
        completionBase: 1_000,
        initialTubes: [
            ['cyan', 'magenta', 'amber', 'cyan'],
            ['magenta', 'amber', 'cyan', 'magenta'],
            ['amber', 'cyan', 'magenta', 'amber'],
            [],
            [],
        ],
    },
    medium: {
        difficulty: 'medium',
        duration: 300,
        moveTarget: 20,
        completionBase: 2_000,
        initialTubes: [
            ['magenta', 'magenta', 'amber', 'cyan'],
            ['amber', 'violet', 'violet', 'cyan'],
            ['lime', 'lime', 'amber', 'cyan'],
            ['violet', 'violet', 'cyan', 'lime'],
            ['magenta', 'magenta', 'lime', 'amber'],
            [],
            [],
        ],
    },
    hard: {
        difficulty: 'hard',
        duration: 480,
        moveTarget: 28,
        completionBase: 3_000,
        initialTubes: [
            ['cyan', 'magenta', 'cyan', 'magenta'],
            ['amber', 'amber', 'amber', 'azure'],
            ['lime', 'lime', 'coral', 'magenta'],
            ['violet', 'violet', 'lime', 'cyan'],
            ['coral', 'coral', 'coral', 'violet'],
            ['azure', 'violet', 'magenta', 'cyan'],
            ['azure', 'azure', 'amber', 'lime'],
            [],
            [],
        ],
    },
}
