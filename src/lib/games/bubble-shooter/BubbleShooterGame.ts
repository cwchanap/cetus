// Bubble Shooter game implementation using BaseGame framework
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks, ScoringConfig } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import type {
    BubbleShooterState,
    BubbleShooterConfig,
    BubbleShooterStats,
    Bubble,
    GameConstants,
    GridPosition,
} from './types'
import { getBubbleX, getBubbleY, getNeighbors } from './utils'
import { distance } from '@/lib/games/shared/geometry'

// Default configuration for Bubble Shooter game
export const DEFAULT_BUBBLE_SHOOTER_CONFIG: BubbleShooterConfig = {
    // BaseGameConfig — Bubble Shooter runs until bubbles reach the bottom,
    // so the countdown timer is given an effectively infinite duration.
    duration: Number.MAX_SAFE_INTEGER,
    achievementIntegration: true,
    pausable: true,
    resettable: true,
    // BubbleShooterConfig
    bubbleRadius: 20,
    gridWidth: 14,
    gridHeight: 20,
    colors: [0xff4444, 0x44ff44, 0x4444ff], // Red, Green, Blue
    gameWidth: 600,
    gameHeight: 800,
    shooterY: 800 - 60,
    projectileSpeed: 12,
    initialRows: 5,
    rowAddInterval: 5,
    bubbleFillChance: 0.8,
    newRowFillChance: 0.6,
    backgroundColor: 0x000000,
}

// Points awarded per bubble in a match, plus the all-clear bonus.
const POINTS_PER_BUBBLE = 10
const ALL_CLEAR_BONUS = 1000
// Match threshold (number of same-color connected bubbles required to pop).
const MATCH_THRESHOLD = 3

export class BubbleShooterGame extends BaseGame<
    BubbleShooterState,
    BubbleShooterConfig,
    BubbleShooterStats
> {
    private gameLoopId: number | null = null

    constructor(
        config: Partial<BubbleShooterConfig> = {},
        callbacks: BaseGameCallbacks = {},
        scoringConfig?: ScoringConfig
    ) {
        const fullConfig: BubbleShooterConfig = {
            ...DEFAULT_BUBBLE_SHOOTER_CONFIG,
            ...config,
        }
        super(
            GameID.BUBBLE_SHOOTER,
            fullConfig,
            callbacks,
            scoringConfig ?? {
                basePoints: 0,
                timeBonus: false, // Bubble Shooter computes its own scores
            }
        )
    }

    createInitialState(): BubbleShooterState {
        const constants = this.getConstantsView()
        return {
            // BaseGameState fields
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            // BubbleShooterState fields
            grid: [],
            shooter: {
                x: constants.GAME_WIDTH / 2,
                y: constants.SHOOTER_Y,
            },
            currentBubble: null,
            nextBubble: null,
            aimAngle: -Math.PI / 2,
            projectile: null,
            bubblesRemaining: 0,
            rowOffset: 0,
            shotCount: 0,
            shotsFired: 0,
            bubblesPopped: 0,
            largestCombo: 0,
            needsRedraw: true,
        }
    }

    protected onGameStart(): void {
        // Build the initial grid and load the first bubbles.
        this.initializeGrid()
        this.generateBubble()
        this.generateNextBubble()
        this.startGameLoop()
    }

    protected onGamePause(): void {
        this.stopGameLoop()
    }

    protected onGameResume(): void {
        this.startGameLoop()
    }

    protected onGameEnd(
        _finalScore: number,
        _finalStats: BubbleShooterStats
    ): void {
        this.stopGameLoop()
    }

    protected onGameReset(): void {
        this.stopGameLoop()
        this.emitStateChange()
    }

    update(_deltaTime: number): void {
        // Game logic is driven by the internal game loop
    }

    render(): void {
        // Rendering is handled by the renderer
    }

    cleanup(): void {
        this.stopGameLoop()
    }

    getGameStats(): BubbleShooterStats {
        const timerStatus = this.getTimerStatus()
        const shotsFired = this.state.shotsFired
        const bubblesPopped = this.state.bubblesPopped
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime || 0),
            gameCompleted: this.state.isGameOver,
            bubblesPopped,
            shotsFired,
            accuracy: shotsFired > 0 ? (bubblesPopped / shotsFired) * 100 : 0,
            largestCombo: this.state.largestCombo,
        }
    }

    protected getGameData(): Record<string, unknown> {
        return {
            bubblesPopped: this.state.bubblesPopped,
            shotsFired: this.state.shotsFired,
            largestCombo: this.state.largestCombo,
        }
    }

    // --- Bubble Shooter-specific public API (input handlers) ---

    /**
     * Update the aim angle from a mouse position. The angle is clamped to the
     * upward arc so the player can only aim above the shooter.
     */
    setAimAngle(angle: number): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.projectile
        ) {
            return
        }

        let clampedAngle = angle
        if (clampedAngle > -Math.PI * 0.1) {
            clampedAngle = -Math.PI * 0.1
        }
        if (clampedAngle < -Math.PI * 0.9) {
            clampedAngle = -Math.PI * 0.9
        }

        if (Math.abs(this.state.aimAngle - clampedAngle) > 0.01) {
            this.state.aimAngle = clampedAngle
            this.state.needsRedraw = true
        }
    }

    /**
     * Fire the current bubble along the aim angle.
     */
    shoot(): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.projectile ||
            !this.state.currentBubble ||
            !this.state.nextBubble
        ) {
            return
        }

        const speed = this.config.projectileSpeed
        this.state.projectile = {
            x: this.state.currentBubble.x,
            y: this.state.currentBubble.y,
            vx: Math.cos(this.state.aimAngle) * speed,
            vy: Math.sin(this.state.aimAngle) * speed,
            color: this.state.currentBubble.color,
        }

        // Promote the next bubble to current and generate a new next bubble.
        const constants = this.getConstantsView()
        this.state.currentBubble = {
            ...this.state.nextBubble,
            x: this.state.shooter.x,
            y: this.state.shooter.y - constants.BUBBLE_RADIUS * 1.5,
        }
        this.generateNextBubble()

        this.state.shotsFired++
        this.state.needsRedraw = true
    }

    /**
     * Get config for renderer / external consumers
     */
    getConfig(): BubbleShooterConfig {
        return { ...this.config }
    }

    /**
     * Build a legacy GameConstants view from the active config so the shared
     * grid helpers keep working.
     */
    getConstantsView(): GameConstants {
        return {
            BUBBLE_RADIUS: this.config.bubbleRadius,
            GRID_WIDTH: this.config.gridWidth,
            GRID_HEIGHT: this.config.gridHeight,
            COLORS: [...this.config.colors],
            GAME_WIDTH: this.config.gameWidth,
            GAME_HEIGHT: this.config.gameHeight,
            SHOOTER_Y: this.config.shooterY,
        }
    }

    /**
     * Mark the game as rendered - clears the needsRedraw flag
     */
    markRendered(): void {
        this.state.needsRedraw = false
    }

    // --- Grid / bubble setup ---

    private initializeGrid(): void {
        const constants = this.getConstantsView()
        this.state.grid = []
        this.state.bubblesRemaining = 0

        for (let row = 0; row < this.config.initialRows; row++) {
            this.state.grid[row] = []
            const cols = constants.GRID_WIDTH - (row % 2)
            for (let col = 0; col < cols; col++) {
                if (Math.random() < this.config.bubbleFillChance) {
                    this.state.grid[row][col] = {
                        color: constants.COLORS[
                            Math.floor(Math.random() * constants.COLORS.length)
                        ],
                        x: getBubbleX(col, row, constants),
                        y: getBubbleY(row, this.state.rowOffset, constants),
                    }
                    this.state.bubblesRemaining++
                } else {
                    this.state.grid[row][col] = null
                }
            }
        }

        for (
            let row = this.config.initialRows;
            row < constants.GRID_HEIGHT;
            row++
        ) {
            this.state.grid[row] = []
        }

        this.state.needsRedraw = true
    }

    private generateBubble(): Bubble {
        const constants = this.getConstantsView()
        const colorIndex = Math.floor(Math.random() * constants.COLORS.length)
        const bubble: Bubble = {
            color: constants.COLORS[colorIndex],
            x: this.state.shooter.x,
            y: this.state.shooter.y - constants.BUBBLE_RADIUS * 1.5,
        }
        this.state.currentBubble = bubble
        this.state.needsRedraw = true
        return bubble
    }

    private generateNextBubble(): { color: number } {
        const constants = this.getConstantsView()
        const nextBubble = {
            color: constants.COLORS[
                Math.floor(Math.random() * constants.COLORS.length)
            ],
        }
        this.state.nextBubble = nextBubble
        this.state.needsRedraw = true
        return nextBubble
    }

    // --- Projectile physics ---

    /**
     * Advance the projectile one step, handling wall bounces and attachment.
     * Returns true if the game ended as a result of this step.
     */
    updateProjectile(): boolean {
        if (!this.state.projectile) {
            return false
        }

        const constants = this.getConstantsView()
        const oldX = this.state.projectile.x
        const oldY = this.state.projectile.y

        this.state.projectile.x += this.state.projectile.vx
        this.state.projectile.y += this.state.projectile.vy

        // Wall collisions
        if (
            this.state.projectile.x <= constants.BUBBLE_RADIUS ||
            this.state.projectile.x >=
                constants.GAME_WIDTH - constants.BUBBLE_RADIUS
        ) {
            this.state.projectile.vx *= -1
        }

        if (
            Math.abs(oldX - this.state.projectile.x) > 0.1 ||
            Math.abs(oldY - this.state.projectile.y) > 0.1
        ) {
            this.state.needsRedraw = true
        }

        const bubbleCollision = this.checkBubbleCollision()
        if (
            this.state.projectile.y <= constants.BUBBLE_RADIUS ||
            bubbleCollision
        ) {
            return this.attachBubble(bubbleCollision ?? undefined)
        }

        return false
    }

    /**
     * Find the nearest grid bubble currently overlapping the projectile.
     */
    checkBubbleCollision(): GridPosition | null {
        if (!this.state.projectile) {
            return null
        }

        const constants = this.getConstantsView()
        let closest: { row: number; col: number; distance: number } | null =
            null

        for (let row = 0; row < this.state.grid.length; row++) {
            if (!this.state.grid[row]) {
                continue
            }
            for (let col = 0; col < this.state.grid[row].length; col++) {
                const bubble = this.state.grid[row][col]
                if (!bubble) {
                    continue
                }

                const dist = distance(this.state.projectile, bubble)

                if (dist < constants.BUBBLE_RADIUS * 2) {
                    if (!closest || dist < closest.distance) {
                        closest = { row, col, distance: dist }
                    }
                }
            }
        }

        return closest ? { row: closest.row, col: closest.col } : null
    }

    /**
     * Attach the projectile to the grid, then resolve matches and game-over.
     * Returns true if the game ended as a result.
     */
    attachBubble(anchorPosition?: GridPosition): boolean {
        if (!this.state.projectile) {
            return false
        }

        const constants = this.getConstantsView()
        const attachPos = this.findAttachPosition(constants, anchorPosition)

        if (attachPos) {
            this.state.grid[attachPos.row][attachPos.col] = {
                color: this.state.projectile.color,
                x: getBubbleX(attachPos.col, attachPos.row, constants),
                y: getBubbleY(attachPos.row, this.state.rowOffset, constants),
            }
            this.state.bubblesRemaining++

            this.checkMatches(attachPos.row, attachPos.col)

            this.state.shotCount++
            if (this.state.shotCount % this.config.rowAddInterval === 0) {
                this.addNewRow(constants)
            }
        }

        this.state.projectile = null
        this.state.needsRedraw = true

        if (this.checkGameOverCondition(constants)) {
            void this.end()
            return true
        }
        return false
    }

    private findAttachPosition(
        constants: GameConstants,
        anchorPosition?: GridPosition
    ): GridPosition | null {
        if (!this.state.projectile) {
            return null
        }

        if (anchorPosition) {
            const anchoredPosition = this.findClosestPosition(
                constants,
                getNeighbors(anchorPosition.row, anchorPosition.col, constants)
            )
            if (anchoredPosition) {
                return anchoredPosition
            }
        }

        const candidates: GridPosition[] = []
        for (let row = 0; row < constants.GRID_HEIGHT; row++) {
            const cols = constants.GRID_WIDTH - (row % 2)
            for (let col = 0; col < cols; col++) {
                candidates.push({ row, col })
            }
        }

        return (
            this.findClosestPosition(constants, candidates) || {
                row: 0,
                col: Math.floor((constants.GRID_WIDTH - (0 % 2)) / 2),
            }
        )
    }

    private findClosestPosition(
        constants: GameConstants,
        candidates: GridPosition[]
    ): GridPosition | null {
        if (!this.state.projectile) {
            return null
        }

        let bestPosition: GridPosition | null = null
        let minDistance = Infinity

        for (const { row, col } of candidates) {
            if (!this.state.grid[row]) {
                this.state.grid[row] = []
            }

            if (!this.state.grid[row][col]) {
                const x = getBubbleX(col, row, constants)
                const y = getBubbleY(row, this.state.rowOffset, constants)
                const dist = distance(this.state.projectile, { x, y })

                if (
                    this.isValidAttachPosition(row, col) &&
                    dist < minDistance
                ) {
                    minDistance = dist
                    bestPosition = { row, col }
                }
            }
        }

        return bestPosition
    }

    private isValidAttachPosition(row: number, col: number): boolean {
        if (row === 0) {
            return true
        }

        const constants = this.getConstantsView()
        const neighbors = getNeighbors(row, col, constants)
        return neighbors.some(({ row: nRow, col: nCol }) => {
            return this.state.grid[nRow] && this.state.grid[nRow][nCol]
        })
    }

    private checkMatches(startRow: number, startCol: number): void {
        const bubble = this.state.grid[startRow][startCol]
        if (!bubble) {
            return
        }

        const constants = this.getConstantsView()
        const color = bubble.color
        const visited = new Set<string>()
        const matches: GridPosition[] = []

        const dfs = (row: number, col: number): void => {
            const key = `${row},${col}`
            if (visited.has(key)) {
                return
            }
            if (!this.state.grid[row] || !this.state.grid[row][col]) {
                return
            }
            if (this.state.grid[row][col]?.color !== color) {
                return
            }

            visited.add(key)
            matches.push({ row, col })

            const neighbors = getNeighbors(row, col, constants)
            neighbors.forEach(({ row: nRow, col: nCol }) => {
                dfs(nRow, nCol)
            })
        }

        dfs(startRow, startCol)

        if (matches.length >= MATCH_THRESHOLD) {
            this.removeBubbles(matches)
            this.addScore(matches.length * POINTS_PER_BUBBLE, 'bubble_pop')
            this.state.bubblesPopped += matches.length
            this.state.largestCombo = Math.max(
                this.state.largestCombo,
                matches.length
            )
            this.state.bubblesRemaining -= matches.length
            this.state.needsRedraw = true
        }

        if (this.state.bubblesRemaining === 0) {
            this.addScore(ALL_CLEAR_BONUS, 'all_clear')
            this.state.needsRedraw = true
        }
    }

    private removeBubbles(bubbles: GridPosition[]): void {
        bubbles.forEach(({ row, col }) => {
            this.state.grid[row][col] = null
        })
    }

    private addNewRow(constants: GameConstants): void {
        this.addRowAtTop(constants)

        if (this.checkGameOverCondition(constants)) {
            this.state.needsRedraw = true
        }
    }

    private addRowAtTop(constants: GameConstants): void {
        for (let row = constants.GRID_HEIGHT - 1; row > 0; row--) {
            this.state.grid[row] = this.state.grid[row - 1]
                ? [...this.state.grid[row - 1]]
                : []

            if (this.state.grid[row]) {
                for (let col = 0; col < this.state.grid[row].length; col++) {
                    const bubble = this.state.grid[row][col]
                    if (bubble) {
                        bubble.y = getBubbleY(
                            row,
                            this.state.rowOffset,
                            constants
                        )
                    }
                }
            }
        }

        this.state.grid[0] = []
        const cols = constants.GRID_WIDTH - (0 % 2)
        for (let col = 0; col < cols; col++) {
            if (Math.random() < this.config.newRowFillChance) {
                this.state.grid[0][col] = {
                    color: constants.COLORS[
                        Math.floor(Math.random() * constants.COLORS.length)
                    ],
                    x: getBubbleX(col, 0, constants),
                    y: getBubbleY(0, this.state.rowOffset, constants),
                }
                this.state.bubblesRemaining++
            } else {
                this.state.grid[0][col] = null
            }
        }

        this.state.needsRedraw = true
    }

    private checkGameOverCondition(constants: GameConstants): boolean {
        const dangerZone = constants.SHOOTER_Y - constants.BUBBLE_RADIUS * 5

        for (let row = 0; row < constants.GRID_HEIGHT; row++) {
            if (this.state.grid[row]) {
                for (let col = 0; col < this.state.grid[row].length; col++) {
                    const bubble = this.state.grid[row][col]
                    if (bubble && bubble.y >= dangerZone) {
                        return true
                    }
                }
            }
        }
        return false
    }

    // --- Game loop ---

    private startGameLoop(): void {
        if (this.gameLoopId !== null) {
            return
        }

        const loop = () => {
            if (
                !this.state.isActive ||
                this.state.isPaused ||
                this.state.isGameOver
            ) {
                this.gameLoopId = null
                return
            }

            this.gameUpdate()
            this.gameLoopId = requestAnimationFrame(loop)
        }

        this.gameLoopId = requestAnimationFrame(loop)
    }

    private stopGameLoop(): void {
        if (this.gameLoopId !== null) {
            cancelAnimationFrame(this.gameLoopId)
            this.gameLoopId = null
        }
    }

    private gameUpdate(): void {
        this.updateProjectile()
        this.emitStateChange()
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}

export default BubbleShooterGame
