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
    ProjectileImpact,
} from './types'
import {
    getBubbleX,
    getBubbleY,
    getNeighbors,
    getRowColumnCount,
} from './utils'
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
    projectileSpeed: 720,
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
// Cap a single physics update to this many seconds so a long frame (or a tab
// suspended in the background) cannot teleport the projectile across the board.
const MAX_PROJECTILE_FRAME_SECONDS = 0.05
// Each collision substep travels at most this fraction of BUBBLE_RADIUS so a
// fast projectile can never tunnel past a bubble between collision checks.
const MAX_PROJECTILE_SUBSTEP_RATIO = 0.5

// Outcome of resolving a single shot: direct color matches, ceiling-
// disconnected drops, and the combined removed count used for scoring.
interface ShotResolution {
    directMatches: GridPosition[]
    dropped: GridPosition[]
    removedCount: number
}

export class BubbleShooterGame extends BaseGame<
    BubbleShooterState,
    BubbleShooterConfig,
    BubbleShooterStats
> {
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
            rowPhase: 0,
            shotCount: 0,
            shotsFired: 0,
            bubblesPopped: 0,
            largestCombo: 0,
            successfulShots: 0,
            needsRedraw: true,
        }
    }

    protected onGameStart(): void {
        // Build the initial grid, drop any ceiling-disconnected clusters
        // the random fill may have produced, then load the first bubbles.
        const constants = this.getConstantsView()
        this.initializeGrid()
        this.removeUnsupportedBubbles(constants)
        this.syncBubbleCount()
        this.generateBubble()
        this.generateNextBubble()
    }

    protected onGamePause(): void {
        // No internal loop to stop — the framework render loop gates update().
    }

    protected onGameResume(): void {
        // No internal loop to restart — the framework render loop gates update().
    }

    protected onGameEnd(
        _finalScore: number,
        _finalStats: BubbleShooterStats
    ): void {
        // No internal loop to stop — the framework render loop gates update().
    }

    protected onGameReset(): void {
        this.emitStateChange()
    }

    update(deltaTime: number): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver
        ) {
            return
        }

        this.updateProjectile(deltaTime)

        // Only emit state changes when something actually changed this frame.
        if (this.state.needsRedraw) {
            this.emitStateChange()
        }
    }

    render(): void {
        // Rendering is handled by the renderer
    }

    cleanup(): void {
        // No internal loop to stop — the framework render loop owns the RAF.
    }

    getGameStats(): BubbleShooterStats {
        const timerStatus = this.getTimerStatus()
        const shotsFired = this.state.shotsFired
        const bubblesPopped = this.state.bubblesPopped
        const successfulShots = this.state.successfulShots
        // Accuracy is the successful-shot rate (shots that popped at least one
        // bubble / total shots). No cap is needed: successfulShots cannot
        // exceed shotsFired, so the ratio is already in [0, 100].
        const accuracy =
            shotsFired > 0 ? (successfulShots / shotsFired) * 100 : 0
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(timerStatus.elapsedTime || 0),
            gameCompleted: this.state.isGameOver,
            bubblesPopped,
            shotsFired,
            accuracy,
            largestCombo: this.state.largestCombo,
            successfulShots,
        }
    }

    protected getGameData(): Record<string, unknown> {
        return {
            bubblesPopped: this.state.bubblesPopped,
            shotsFired: this.state.shotsFired,
            largestCombo: this.state.largestCombo,
            successfulShots: this.state.successfulShots,
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
        const generationColors = [...this.config.colors]
        this.state.grid = []

        for (let row = 0; row < this.config.initialRows; row++) {
            const rowCells = this.createEmptyRow(row, constants)
            for (let col = 0; col < rowCells.length; col++) {
                if (Math.random() < this.config.bubbleFillChance) {
                    rowCells[col] = {
                        color: generationColors[
                            Math.floor(Math.random() * generationColors.length)
                        ],
                        x: 0,
                        y: 0,
                    }
                }
            }
            this.state.grid[row] = rowCells
        }

        this.refreshBubbleCoordinates(constants)
        this.syncBubbleCount()
        this.state.needsRedraw = true
    }

    private createEmptyRow(
        row: number,
        constants: GameConstants
    ): (Bubble | null)[] {
        return Array.from(
            {
                length: getRowColumnCount(row, this.state.rowPhase, constants),
            },
            () => null
        )
    }

    private refreshBubbleCoordinates(constants: GameConstants): void {
        for (let row = 0; row < constants.GRID_HEIGHT; row++) {
            const width = getRowColumnCount(row, this.state.rowPhase, constants)
            const oldRow = this.state.grid[row] ?? []
            this.state.grid[row] = Array.from(
                { length: width },
                (_, col) => oldRow[col] ?? null
            )

            for (let col = 0; col < width; col++) {
                const bubble = this.state.grid[row][col]
                if (!bubble) {
                    continue
                }
                bubble.x = getBubbleX(col, row, this.state.rowPhase, constants)
                bubble.y = getBubbleY(row, constants)
            }
        }
    }

    private syncBubbleCount(): number {
        let count = 0
        for (const row of this.state.grid) {
            for (let col = 0; col < row.length; col++) {
                if (row[col]) {
                    count++
                }
            }
        }
        this.state.bubblesRemaining = count
        return count
    }

    private generateBubble(): Bubble {
        const constants = this.getConstantsView()
        const color = this.randomColor(this.getAvailableBubbleColors())
        const bubble: Bubble = {
            color,
            x: this.state.shooter.x,
            y: this.state.shooter.y - constants.BUBBLE_RADIUS * 1.5,
        }
        this.state.currentBubble = bubble
        this.state.needsRedraw = true
        return bubble
    }

    private generateNextBubble(): { color: number } {
        const nextBubble = {
            color: this.randomColor(this.getAvailableBubbleColors()),
        }
        this.state.nextBubble = nextBubble
        this.state.needsRedraw = true
        return nextBubble
    }

    /**
     * Unique colors currently present on the board. Used so the queue and new
     * rows only produce colors the player can actually match. Falls back to
     * the full config palette when the grid is empty (e.g. on reset).
     */
    private getAvailableBubbleColors(): number[] {
        const colors = new Set<number>()
        for (const row of this.state.grid) {
            if (!row) {
                continue
            }
            for (let col = 0; col < row.length; col++) {
                const bubble = row[col]
                if (bubble) {
                    colors.add(bubble.color)
                }
            }
        }
        return colors.size > 0 ? [...colors] : [...this.config.colors]
    }

    private randomColor(colors: number[]): number {
        return colors[Math.floor(Math.random() * colors.length)]
    }

    /**
     * Re-roll nextBubble if its color is no longer present on the board (for
     * example, after the last bubble of a color was just popped or dropped).
     * Preserves the current bubble — only future shots are reconciled.
     */
    private reconcileNextBubbleColor(): void {
        const colors = this.getAvailableBubbleColors()
        if (
            !this.state.nextBubble ||
            !colors.includes(this.state.nextBubble.color)
        ) {
            this.state.nextBubble = { color: this.randomColor(colors) }
        }
    }

    // --- Projectile physics ---

    /**
     * Advance the projectile by elapsed seconds, using collision-safe substeps.
     * On each substep the bubble collision is checked BEFORE the ceiling so a
     * projectile grazing a bubble attaches to the bubble, not the ceiling.
     * Returns true if the game ended as a result of this step.
     */
    updateProjectile(deltaTimeSeconds: number): boolean {
        const projectile = this.state.projectile
        if (!projectile) {
            return false
        }

        const constants = this.getConstantsView()
        const elapsed = Math.min(
            Math.max(deltaTimeSeconds, 0),
            MAX_PROJECTILE_FRAME_SECONDS
        )
        const speed = Math.hypot(projectile.vx, projectile.vy)
        const maxStepDistance =
            constants.BUBBLE_RADIUS * MAX_PROJECTILE_SUBSTEP_RATIO
        const stepCount = Math.max(
            1,
            Math.ceil((speed * elapsed) / maxStepDistance)
        )
        const stepSeconds = elapsed / stepCount

        for (let step = 0; step < stepCount; step++) {
            projectile.x += projectile.vx * stepSeconds
            projectile.y += projectile.vy * stepSeconds
            this.reflectProjectileOffWalls(constants)

            const anchor = this.checkBubbleCollision()
            if (anchor) {
                return this.attachBubble({ kind: 'bubble', anchor })
            }
            if (projectile.y <= constants.BUBBLE_RADIUS) {
                return this.attachBubble({ kind: 'ceiling' })
            }
        }

        if (elapsed > 0) {
            this.state.needsRedraw = true
        }
        return false
    }

    /**
     * Mirror the projectile's overshoot back inside the playfield and flip vx
     * toward the board. Unlike a plain sign flip, this keeps the projectile
     * within [radius, gameWidth - radius] so it never escapes the board.
     */
    private reflectProjectileOffWalls(constants: GameConstants): void {
        const projectile = this.state.projectile
        if (!projectile) {
            return
        }
        const minX = constants.BUBBLE_RADIUS
        const maxX = constants.GAME_WIDTH - constants.BUBBLE_RADIUS
        if (projectile.x < minX) {
            projectile.x = 2 * minX - projectile.x
            projectile.vx = Math.abs(projectile.vx)
        } else if (projectile.x > maxX) {
            projectile.x = 2 * maxX - projectile.x
            projectile.vx = -Math.abs(projectile.vx)
        }
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
     * The impact disambiguates the trigger: 'bubble' snaps to a neighbor of
     * the collided anchor; 'ceiling' snaps to a row-zero cell. Candidates are
     * strictly impact-local; a blocked impact (no unoccupied local candidate)
     * consumes the shot but does not by itself end the run — only the danger-
     * zone check in checkGameOverCondition can. Returns true if the game ended.
     */
    attachBubble(impact: ProjectileImpact): boolean {
        if (!this.state.projectile) {
            return false
        }

        const constants = this.getConstantsView()
        const anchorPosition =
            impact.kind === 'bubble' ? impact.anchor : undefined
        const attachPos = this.findAttachPosition(constants, anchorPosition)

        if (attachPos) {
            this.state.grid[attachPos.row][attachPos.col] = {
                color: this.state.projectile.color,
                x: getBubbleX(
                    attachPos.col,
                    attachPos.row,
                    this.state.rowPhase,
                    constants
                ),
                y: getBubbleY(attachPos.row, constants),
            }
            this.state.bubblesRemaining++

            this.resolveMatches(attachPos, constants)
        }

        this.state.shotCount++
        if (
            this.state.bubblesRemaining > 0 &&
            this.state.shotCount % this.config.rowAddInterval === 0
        ) {
            this.addNewRow(constants)
        }

        this.state.projectile = null
        this.state.needsRedraw = true
        // Reconcile nextBubble exactly once after match resolution and any
        // row insertion so the upcoming shot is always a playable color.
        this.reconcileNextBubbleColor()

        if (this.checkGameOverCondition(constants)) {
            this.end().catch((error: unknown) =>
                console.error('BubbleShooter end failed', error)
            )
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

        let candidates: GridPosition[]
        if (anchorPosition) {
            // Bubble impact: only neighbors of the collided anchor are valid.
            candidates = getNeighbors(
                anchorPosition.row,
                anchorPosition.col,
                this.state.rowPhase,
                constants
            )
        } else {
            // Ceiling impact: only row-zero cells are valid attachment points.
            const topRowCols = getRowColumnCount(
                0,
                this.state.rowPhase,
                constants
            )
            candidates = []
            for (let col = 0; col < topRowCols; col++) {
                candidates.push({ row: 0, col })
            }
        }

        // Locality comes from the candidate set; filter occupied cells so the
        // projectile never overwrites an existing bubble. No global or fixed
        // fallback — a blocked impact returns null and is handled by the caller.
        const unoccupied = candidates.filter(({ row, col }) => {
            return !this.state.grid[row] || !this.state.grid[row][col]
        })

        return this.findClosestPosition(constants, unoccupied)
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
                const x = getBubbleX(col, row, this.state.rowPhase, constants)
                const y = getBubbleY(row, constants)
                const dist = distance(this.state.projectile, { x, y })

                if (dist < minDistance) {
                    minDistance = dist
                    bestPosition = { row, col }
                }
            }
        }

        return bestPosition
    }

    /**
     * Iteratively collect the same-color cluster containing `start`, using
     * phase-aware getNeighbors. Returns an empty list when the start cell is
     * empty so resolveMatches can early-return without side effects.
     */
    private collectColorCluster(
        start: GridPosition,
        constants: GameConstants
    ): GridPosition[] {
        const startBubble = this.state.grid[start.row]?.[start.col]
        if (!startBubble) {
            return []
        }
        const color = startBubble.color
        const visited = new Set<string>()
        const cluster: GridPosition[] = []
        const stack: GridPosition[] = [start]

        while (stack.length > 0) {
            const current = stack.pop()!
            const key = `${current.row},${current.col}`
            if (visited.has(key)) {
                continue
            }
            const bubble = this.state.grid[current.row]?.[current.col]
            if (!bubble || bubble.color !== color) {
                continue
            }
            visited.add(key)
            cluster.push(current)
            const neighbors = getNeighbors(
                current.row,
                current.col,
                this.state.rowPhase,
                constants
            )
            for (const neighbor of neighbors) {
                if (!visited.has(`${neighbor.row},${neighbor.col}`)) {
                    stack.push(neighbor)
                }
            }
        }
        return cluster
    }

    /**
     * Collect every cell reachable from occupied row-zero cells via occupied
     * neighbors. Color is ignored — this is the ceiling-support set.
     */
    private collectCeilingConnected(constants: GameConstants): Set<string> {
        const connected = new Set<string>()
        const stack: GridPosition[] = []

        const topRow = this.state.grid[0]
        if (topRow) {
            for (let col = 0; col < topRow.length; col++) {
                if (topRow[col]) {
                    stack.push({ row: 0, col })
                }
            }
        }

        while (stack.length > 0) {
            const current = stack.pop()!
            const key = `${current.row},${current.col}`
            if (connected.has(key)) {
                continue
            }
            const bubble = this.state.grid[current.row]?.[current.col]
            if (!bubble) {
                continue
            }
            connected.add(key)
            const neighbors = getNeighbors(
                current.row,
                current.col,
                this.state.rowPhase,
                constants
            )
            for (const neighbor of neighbors) {
                if (!connected.has(`${neighbor.row},${neighbor.col}`)) {
                    stack.push(neighbor)
                }
            }
        }
        return connected
    }

    private removeUnsupportedBubbles(constants: GameConstants): GridPosition[] {
        const connected = this.collectCeilingConnected(constants)
        const dropped: GridPosition[] = []

        for (let row = 0; row < this.state.grid.length; row++) {
            for (let col = 0; col < this.state.grid[row].length; col++) {
                if (
                    this.state.grid[row][col] &&
                    !connected.has(`${row},${col}`)
                ) {
                    dropped.push({ row, col })
                    this.state.grid[row][col] = null
                }
            }
        }
        return dropped
    }

    private resolveMatches(
        attached: GridPosition,
        constants: GameConstants
    ): ShotResolution {
        const directMatches = this.collectColorCluster(attached, constants)
        if (directMatches.length < MATCH_THRESHOLD) {
            return { directMatches: [], dropped: [], removedCount: 0 }
        }

        this.removeBubbles(directMatches)
        const dropped = this.removeUnsupportedBubbles(constants)
        this.syncBubbleCount()
        const removedCount = directMatches.length + dropped.length

        this.addScore(removedCount * POINTS_PER_BUBBLE, 'bubble_pop')
        this.state.successfulShots++
        this.state.bubblesPopped += removedCount
        this.state.largestCombo = Math.max(
            this.state.largestCombo,
            removedCount
        )
        if (this.state.bubblesRemaining === 0) {
            this.addScore(ALL_CLEAR_BONUS, 'all_clear')
        }

        return { directMatches, dropped, removedCount }
    }

    private removeBubbles(bubbles: GridPosition[]): void {
        bubbles.forEach(({ row, col }) => {
            this.state.grid[row][col] = null
        })
    }

    private addNewRow(constants: GameConstants): void {
        // Snapshot the active palette BEFORE the shift: addRowAtTop changes
        // which bubbles occupy the top row, so a post-shift reading would
        // seed the new row with colors that may have just been displaced.
        const generationColors = this.getAvailableBubbleColors()
        this.addRowAtTop(constants, generationColors)
        this.removeUnsupportedBubbles(constants)
        this.syncBubbleCount()

        if (this.checkGameOverCondition(constants)) {
            this.state.needsRedraw = true
        }
    }

    private addRowAtTop(
        constants: GameConstants,
        generationColors: number[]
    ): void {
        for (let row = constants.GRID_HEIGHT - 1; row > 0; row--) {
            this.state.grid[row] = [...(this.state.grid[row - 1] ?? [])]
        }

        this.state.rowPhase = this.state.rowPhase === 0 ? 1 : 0
        const topRow = this.createEmptyRow(0, constants)
        for (let col = 0; col < topRow.length; col++) {
            if (Math.random() < this.config.newRowFillChance) {
                topRow[col] = {
                    color: generationColors[
                        Math.floor(Math.random() * generationColors.length)
                    ],
                    x: 0,
                    y: 0,
                }
            }
        }
        this.state.grid[0] = topRow
        this.refreshBubbleCoordinates(constants)
        this.syncBubbleCount()
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

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}

export default BubbleShooterGame
