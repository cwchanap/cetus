import { GameID } from '@/lib/games'
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import {
    countCapturedCells,
    createChromaticTideBoard,
    floodChromaticTideBoard,
} from './board'
import { calculateChromaticTideScore } from './scoring'
import {
    CHROMATIC_TIDE_PALETTE,
    CHROMATIC_TIDE_RULES,
    createChromaticTideConfig,
    type ChromaticTideConfig,
    type ChromaticTideColor,
    type ChromaticTideGameData,
    type ChromaticTideState,
    type ChromaticTideStats,
} from './types'

export class ChromaticTideGame extends BaseGame<
    ChromaticTideState,
    ChromaticTideConfig,
    ChromaticTideStats
> {
    constructor(
        config: ChromaticTideConfig = createChromaticTideConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.CHROMATIC_TIDE, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): ChromaticTideState {
        const board = createChromaticTideBoard(this.config.rng)
        const initialCapturedCells = countCapturedCells(board)

        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            outcome: 'playing',
            board,
            territoryColor: board[0][0].color,
            movesUsed: 0,
            capturedCells: initialCapturedCells,
            initialCapturedCells,
        }
    }

    chooseColor(color: ChromaticTideColor): boolean {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.outcome !== 'playing' ||
            !CHROMATIC_TIDE_PALETTE.includes(color) ||
            color === this.state.territoryColor
        ) {
            return false
        }

        const board = floodChromaticTideBoard(this.state.board, color)
        this.state.movesUsed++
        this.state.board = board
        this.state.territoryColor = color
        this.state.capturedCells = countCapturedCells(board)

        const totalCells = CHROMATIC_TIDE_RULES.rows * CHROMATIC_TIDE_RULES.cols
        if (this.state.capturedCells === totalCells) {
            this.state.outcome = 'cleared'
        }

        this.synchronizeScore()
        this.emitStateChange()

        if (this.state.outcome === 'cleared') {
            void this.end().catch((error: unknown) =>
                console.error('ChromaticTideGame end failed', error)
            )
        }

        return true
    }

    update(_deltaTime: number): void {}

    render(): void {}

    getGameStats(): ChromaticTideStats {
        const timerStatus = this.getTimerStatus()
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime),
            gameCompleted: this.state.isGameOver,
            outcome: this.state.outcome,
            movesUsed: this.state.movesUsed,
            capturedCells: this.state.capturedCells,
            initialCapturedCells: this.state.initialCapturedCells,
            secondsRemaining: Math.floor(timerStatus.currentTime),
        }
    }

    cleanup(): void {}

    protected override handleTimeUp(): void {
        this.state.outcome = 'timeout'
        this.synchronizeScore()
        this.emitStateChange()
        super.handleTimeUp()
    }

    protected override getGameData(): Record<string, unknown> {
        const data = {
            cleared: this.state.outcome === 'cleared',
            movesUsed: this.state.movesUsed,
            capturedCells: this.state.capturedCells,
            initialCapturedCells: this.state.initialCapturedCells,
            secondsRemaining: Math.floor(this.getTimerStatus().currentTime),
        } satisfies ChromaticTideGameData
        return data
    }

    private synchronizeScore(): void {
        const target = calculateChromaticTideScore({
            cleared: this.state.outcome === 'cleared',
            movesUsed: this.state.movesUsed,
            capturedCells: this.state.capturedCells,
            initialCapturedCells: this.state.initialCapturedCells,
            secondsRemaining: this.getTimerStatus().currentTime,
        })
        const delta = target - this.state.score
        if (delta > 0) {
            this.addScore(delta, 'chromatic_tide_progress')
        }
    }

    private emitStateChange(): void {
        this.callbacks.onStateChange?.(this.getState())
        this.emit('state-change', { state: this.getState() })
    }
}
