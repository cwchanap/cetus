import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import { POTION_SORTER_PRESETS } from './levels'
import { isPotionSorterSolved, pourPotion } from './puzzle'
import { calculatePotionSorterScore } from './scoring'
import type {
    PotionSorterActionResult,
    PotionSorterConfig,
    PotionSorterDifficulty,
    PotionSorterState,
    PotionSorterStats,
    PotionTube,
} from './types'

export function createPotionSorterConfig(
    difficulty: PotionSorterDifficulty = 'medium'
): PotionSorterConfig {
    const preset = POTION_SORTER_PRESETS[difficulty]
    return {
        duration: preset.duration,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        preset,
    }
}

export class PotionSorterGame extends BaseGame<
    PotionSorterState,
    PotionSorterConfig,
    PotionSorterStats
> {
    private history: PotionTube[][] = []

    constructor(
        config = createPotionSorterConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.POTION_SORTER, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): PotionSorterState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            difficulty: this.config.preset.difficulty,
            tubes: this.config.preset.initialTubes.map(tube => [...tube]),
            selectedTubeIndex: null,
            movesMade: 0,
            undosUsed: 0,
            result: 'playing',
        }
    }

    newGame(
        difficulty: PotionSorterDifficulty = this.state.difficulty
    ): boolean {
        if (this.state.isActive) {
            return false
        }

        const preset = POTION_SORTER_PRESETS[difficulty]
        if (!this.setDuration(preset.duration)) {
            return false
        }

        this.config.preset = preset
        this.reset()
        return true
    }

    activateTube(index: number): PotionSorterActionResult {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.result !== 'playing'
        ) {
            return 'invalid'
        }

        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= this.state.tubes.length
        ) {
            return 'invalid'
        }

        if (this.state.selectedTubeIndex === null) {
            if (this.state.tubes[index].length === 0) {
                return 'invalid'
            }
            this.state.selectedTubeIndex = index
            this.emitStateChange()
            return 'selected'
        }

        if (this.state.selectedTubeIndex === index) {
            this.state.selectedTubeIndex = null
            this.emitStateChange()
            return 'deselected'
        }

        const sourceIndex = this.state.selectedTubeIndex
        const poured = pourPotion(this.state.tubes, sourceIndex, index)
        if (poured === null) {
            // Keep the source selected so the player can try another tube.
            return 'invalid'
        }

        this.history.push(this.state.tubes.map(tube => [...tube]))
        this.state.tubes = poured.tubes
        this.state.movesMade++
        this.state.selectedTubeIndex = null

        if (isPotionSorterSolved(this.state.tubes)) {
            this.state.result = 'solved'
            this.addScore(
                calculatePotionSorterScore(
                    this.config.preset,
                    this.state.timeRemaining,
                    this.state.movesMade,
                    true
                ),
                'puzzle_solved'
            )
            this.emitStateChange()
            void this.end().catch((err: unknown) =>
                console.error('PotionSorterGame end failed (solved)', err)
            )
            return 'poured'
        }

        this.emitStateChange()
        return 'poured'
    }

    undo(): boolean {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.result !== 'playing'
        ) {
            return false
        }

        const snapshot = this.history.pop()
        if (snapshot === undefined) {
            return false
        }

        this.state.tubes = snapshot
        this.state.undosUsed++
        this.state.selectedTubeIndex = null
        this.emitStateChange()
        return true
    }

    canUndo(): boolean {
        return (
            this.state.isActive &&
            !this.state.isGameOver &&
            this.state.result === 'playing' &&
            this.history.length > 0
        )
    }

    update(_deltaTime: number): void {
        // Potion Sorter is event-driven.
    }

    render(): void {
        // Rendering is handled by the page.
    }

    cleanup(): void {
        // No external resources to clean up.
    }

    getGameStats(): PotionSorterStats {
        const timerStatus = this.getTimerStatus()
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime),
            gameCompleted: this.state.result === 'solved',
            difficulty: this.state.difficulty,
            solved: this.state.result === 'solved',
            result: this.state.result,
            movesMade: this.state.movesMade,
            undosUsed: this.state.undosUsed,
        }
    }

    protected handleTimeUp(): void {
        this.state.result = 'timeout'
        this.state.selectedTubeIndex = null
        this.emitStateChange()
        super.handleTimeUp()
    }

    protected getGameData(): Record<string, unknown> {
        return {
            difficulty: this.state.difficulty,
            solved: this.state.result === 'solved',
            movesMade: this.state.movesMade,
            undosUsed: this.state.undosUsed,
            elapsedSeconds: Math.floor(this.getTimerStatus().elapsedTime),
        }
    }

    protected onGameStart(): void {
        this.emitStateChange()
    }

    protected onGameReset(): void {
        this.history = []
        this.emitStateChange()
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}
