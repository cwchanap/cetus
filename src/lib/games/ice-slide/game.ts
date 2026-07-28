import {
    DIRECTION_DELTA,
    type Direction,
    type IceSlideCallbacks,
    type IceSlideGameData,
    type IceSlideState,
} from './types'
import { cloneGrid, findStart, parseGrid, slide } from './physics'
import { getLevel, ICE_SLIDE_LEVELS } from './levels'
import { levelScore, timeBonus } from './scoring'

export class IceSlideGame {
    private state: IceSlideState
    private elapsedTimer: ReturnType<typeof setInterval> | null = null
    private callbacks: Partial<IceSlideCallbacks>

    constructor(callbacks: Partial<IceSlideCallbacks> = {}) {
        this.callbacks = callbacks
        this.state = this.createIdleState()
    }

    private createIdleState(): IceSlideState {
        return {
            levelIndex: 0,
            levelName: '',
            rows: 0,
            cols: 0,
            grid: [],
            player: { row: 0, col: 0 },
            start: { row: 0, col: 0 },
            moves: 0,
            levelMoves: 0,
            crystalsCollected: 0,
            levelCrystalsCollected: 0,
            score: 0,
            elapsedSeconds: 0,
            status: 'idle',
            perfectLevels: 0,
            levelsCleared: 0,
            lastSlidePath: [],
        }
    }

    getState(): IceSlideState {
        return {
            ...this.state,
            grid: cloneGrid(this.state.grid),
            player: { ...this.state.player },
            start: { ...this.state.start },
            lastSlidePath: this.state.lastSlidePath.map(p => ({ ...p })),
        }
    }

    getGameData(): IceSlideGameData {
        return {
            levelsCleared: this.state.levelsCleared,
            totalMoves: this.state.moves,
            crystalsCollected: this.state.crystalsCollected,
            elapsedSeconds: this.state.elapsedSeconds,
            solved: this.state.status === 'won',
            perfectLevels: this.state.perfectLevels,
        }
    }

    start(): void {
        this.stopTimer()
        this.state = this.createIdleState()
        this.state.status = 'playing'
        this.loadLevel(0)
        this.startTimer()
        this.callbacks.onGameStart?.()
        this.callbacks.onScoreUpdate?.(this.state.score)
        this.callbacks.onTimeUpdate?.(0)
    }

    stop(): void {
        this.stopTimer()
        if (this.state.status === 'playing') {
            this.state.status = 'idle'
        }
    }

    /** Reload current level without resetting run score/time. */
    resetLevel(): void {
        if (this.state.status !== 'playing') {
            return
        }
        // Drop crystals gathered on this attempt so reset/hazard cannot farm.
        this.state.crystalsCollected -= this.state.levelCrystalsCollected
        this.loadLevel(this.state.levelIndex, { preserveRun: true })
    }

    move(direction: Direction): void {
        if (this.state.status !== 'playing') {
            return
        }

        const delta = DIRECTION_DELTA[direction]
        const outcome = slide(this.state.grid, this.state.player, delta)

        if (outcome.kind === 'noop') {
            this.state.lastSlidePath = []
            return
        }

        this.state.moves += 1
        this.state.levelMoves += 1
        this.state.lastSlidePath = outcome.path.map(p => ({ ...p }))

        if (outcome.kind === 'hazard') {
            this.state.crystalsCollected -= this.state.levelCrystalsCollected
            this.loadLevel(this.state.levelIndex, { preserveRun: true })
            this.callbacks.onMove?.({
                moves: this.state.moves,
                levelMoves: this.state.levelMoves,
            })
            this.callbacks.onHazard?.()
            return
        }

        this.state.player = { ...outcome.end }
        if (outcome.crystals > 0) {
            this.state.levelCrystalsCollected += outcome.crystals
            this.state.crystalsCollected += outcome.crystals
            this.callbacks.onCrystal?.(this.state.crystalsCollected)
        }

        this.callbacks.onMove?.({
            moves: this.state.moves,
            levelMoves: this.state.levelMoves,
        })

        if (outcome.reachedGoal) {
            this.clearLevel()
        }
    }

    destroy(): void {
        this.stopTimer()
        this.callbacks = {}
    }

    private clearLevel(): void {
        const level = getLevel(this.state.levelIndex)
        const levelNumber = this.state.levelIndex + 1
        const gained = levelScore({
            levelNumber,
            parMoves: level.parMoves,
            movesUsed: this.state.levelMoves,
            crystalsCollected: this.state.levelCrystalsCollected,
        })
        this.state.score += gained
        this.state.levelsCleared += 1
        if (this.state.levelMoves <= level.parMoves) {
            this.state.perfectLevels += 1
        }
        this.callbacks.onScoreUpdate?.(this.state.score)

        if (this.state.levelIndex >= ICE_SLIDE_LEVELS.length - 1) {
            this.state.score += timeBonus(this.state.elapsedSeconds)
            this.state.status = 'won'
            this.stopTimer()
            this.callbacks.onScoreUpdate?.(this.state.score)
            this.callbacks.onLevelClear?.(levelNumber)
            this.callbacks.onWin?.(this.state.score)
            return
        }

        this.loadLevel(this.state.levelIndex + 1, { preserveRun: true })
        this.callbacks.onLevelClear?.(levelNumber)
    }

    private loadLevel(
        index: number,
        options: { preserveRun?: boolean } = {}
    ): void {
        const level = getLevel(index)
        const grid = cloneGrid(parseGrid(level))
        const start = findStart(grid)
        // Start tile behaves as ice after spawn.
        grid[start.row][start.col] = 'ice'

        const preserved = options.preserveRun
            ? {
                  moves: this.state.moves,
                  crystalsCollected: this.state.crystalsCollected,
                  score: this.state.score,
                  elapsedSeconds: this.state.elapsedSeconds,
                  perfectLevels: this.state.perfectLevels,
                  levelsCleared: this.state.levelsCleared,
                  status: this.state.status,
              }
            : null

        this.state = {
            levelIndex: index,
            levelName: level.name,
            rows: grid.length,
            cols: grid[0].length,
            grid,
            player: { ...start },
            start: { ...start },
            moves: preserved?.moves ?? 0,
            levelMoves: 0,
            crystalsCollected: preserved?.crystalsCollected ?? 0,
            levelCrystalsCollected: 0,
            score: preserved?.score ?? 0,
            elapsedSeconds: preserved?.elapsedSeconds ?? 0,
            status: preserved?.status ?? 'playing',
            perfectLevels: preserved?.perfectLevels ?? 0,
            levelsCleared: preserved?.levelsCleared ?? 0,
            lastSlidePath: [],
        }
    }

    private startTimer(): void {
        this.stopTimer()
        this.elapsedTimer = setInterval(() => {
            if (this.state.status !== 'playing') {
                return
            }
            this.state.elapsedSeconds += 1
            this.callbacks.onTimeUpdate?.(this.state.elapsedSeconds)
        }, 1000)
    }

    private stopTimer(): void {
        if (this.elapsedTimer !== null) {
            clearInterval(this.elapsedTimer)
            this.elapsedTimer = null
        }
    }
}
