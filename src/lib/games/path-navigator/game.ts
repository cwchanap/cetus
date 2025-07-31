import type {
    GameState,
    GameConfig,
    GameLevel,
    Point,
    CollisionResult,
    GameStats,
    GamePath,
    PathSegment,
} from './types'

export const DEFAULT_CONFIG: GameConfig = {
    gameDuration: 60, // 60 seconds
    gameWidth: 800,
    gameHeight: 600,
    cursorRadius: 8,
    pathColor: 0x00ffff, // Cyan
    cursorColor: 0xff00ff, // Magenta
    goalColor: 0x00ff00, // Green
    backgroundColor: 0x000000, // Black
    outOfBoundsColor: 0xff0000, // Red
}

export const GAME_LEVELS: GameLevel[] = [
    // Level 1: Easy - Wide straight path
    {
        id: 1,
        name: 'Easy Path',
        difficulty: 'easy',
        basePoints: 100,
        timeBonus: 2,
        path: {
            startPoint: { x: 50, y: 300 },
            endPoint: { x: 750, y: 300 },
            totalWidth: 80,
            segments: [
                {
                    start: { x: 50, y: 300 },
                    end: { x: 750, y: 300 },
                    width: 80,
                    type: 'straight',
                },
            ],
        },
    },
    // Level 2: Medium - Path with gentle curves
    {
        id: 2,
        name: 'Curved Path',
        difficulty: 'medium',
        basePoints: 200,
        timeBonus: 3,
        path: {
            startPoint: { x: 50, y: 150 },
            endPoint: { x: 750, y: 450 },
            totalWidth: 60,
            segments: [
                {
                    start: { x: 50, y: 150 },
                    end: { x: 300, y: 300 },
                    width: 60,
                    type: 'curve',
                    controlPoint: { x: 150, y: 100 },
                },
                {
                    start: { x: 300, y: 300 },
                    end: { x: 500, y: 200 },
                    width: 60,
                    type: 'curve',
                    controlPoint: { x: 400, y: 150 },
                },
                {
                    start: { x: 500, y: 200 },
                    end: { x: 750, y: 450 },
                    width: 60,
                    type: 'curve',
                    controlPoint: { x: 650, y: 350 },
                },
            ],
        },
    },
    // Level 3: Hard - Narrow zigzag path
    {
        id: 3,
        name: 'Zigzag Path',
        difficulty: 'hard',
        basePoints: 300,
        timeBonus: 4,
        path: {
            startPoint: { x: 50, y: 100 },
            endPoint: { x: 750, y: 500 },
            totalWidth: 40,
            segments: [
                {
                    start: { x: 50, y: 100 },
                    end: { x: 200, y: 200 },
                    width: 40,
                    type: 'straight',
                },
                {
                    start: { x: 200, y: 200 },
                    end: { x: 350, y: 100 },
                    width: 40,
                    type: 'straight',
                },
                {
                    start: { x: 350, y: 100 },
                    end: { x: 500, y: 300 },
                    width: 40,
                    type: 'straight',
                },
                {
                    start: { x: 500, y: 300 },
                    end: { x: 650, y: 150 },
                    width: 40,
                    type: 'straight',
                },
                {
                    start: { x: 650, y: 150 },
                    end: { x: 750, y: 500 },
                    width: 40,
                    type: 'straight',
                },
            ],
        },
    },
    // Level 4: Expert - Very narrow spiral path
    {
        id: 4,
        name: 'Spiral Path',
        difficulty: 'expert',
        basePoints: 500,
        timeBonus: 5,
        path: {
            startPoint: { x: 400, y: 50 },
            endPoint: { x: 400, y: 300 },
            totalWidth: 25,
            segments: [
                {
                    start: { x: 400, y: 50 },
                    end: { x: 600, y: 150 },
                    width: 25,
                    type: 'curve',
                    controlPoint: { x: 550, y: 75 },
                },
                {
                    start: { x: 600, y: 150 },
                    end: { x: 500, y: 350 },
                    width: 25,
                    type: 'curve',
                    controlPoint: { x: 650, y: 250 },
                },
                {
                    start: { x: 500, y: 350 },
                    end: { x: 200, y: 300 },
                    width: 25,
                    type: 'curve',
                    controlPoint: { x: 350, y: 400 },
                },
                {
                    start: { x: 200, y: 300 },
                    end: { x: 300, y: 150 },
                    width: 25,
                    type: 'curve',
                    controlPoint: { x: 150, y: 225 },
                },
                {
                    start: { x: 300, y: 150 },
                    end: { x: 400, y: 300 },
                    width: 25,
                    type: 'curve',
                    controlPoint: { x: 350, y: 200 },
                },
            ],
        },
    },
]

export class PathNavigatorGame {
    private state: GameState
    private config: GameConfig
    private gameTimer: NodeJS.Timeout | null = null

    constructor(config: Partial<GameConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.state = this.createInitialState()
    }

    private createInitialState(): GameState {
        return {
            currentLevel: 1,
            score: 0,
            timeRemaining: this.config.gameDuration,
            isGameActive: false,
            isGameOver: false,
            isGameWon: false,
            gameStartTime: null,
            cursor: {
                x: GAME_LEVELS[0].path.startPoint.x,
                y: GAME_LEVELS[0].path.startPoint.y,
                radius: this.config.cursorRadius,
                isVisible: true,
            },
            isOnPath: true,
            hasReachedGoal: false,
            totalLevels: GAME_LEVELS.length,
            levelStartTime: null,
            isBoundaryDetectionEnabled: false, // Start disabled until user reaches start position
        }
    }

    public startGame(): void {
        if (this.state.isGameActive) {
            return
        }

        this.state.isGameActive = true
        this.state.isGameOver = false
        this.state.isGameWon = false
        this.state.gameStartTime = Date.now()
        this.state.levelStartTime = Date.now()
        this.state.timeRemaining = this.config.gameDuration
        this.state.isBoundaryDetectionEnabled = false // Disable until user reaches start

        // Position cursor at start of first level
        const startPoint = GAME_LEVELS[0].path.startPoint
        this.state.cursor.x = startPoint.x
        this.state.cursor.y = startPoint.y

        this.startTimer()
    }

    public endGame(): void {
        if (!this.state.isGameActive) {
            return
        }

        this.state.isGameActive = false
        this.state.isGameOver = true
        this.stopTimer()
    }

    public pauseGame(): void {
        if (!this.state.isGameActive || this.state.isGameOver) {
            return
        }

        this.state.isGameActive = false
        this.stopTimer()
    }

    public resumeGame(): void {
        if (this.state.isGameActive || this.state.isGameOver) {
            return
        }

        this.state.isGameActive = true
        this.startTimer()
    }

    public resetGame(): void {
        this.stopTimer()
        this.state = this.createInitialState()
    }

    public updateCursorPosition(x: number, y: number): CollisionResult {
        if (!this.state.isGameActive) {
            return { isOnPath: true, hasReachedGoal: false }
        }

        this.state.cursor.x = x
        this.state.cursor.y = y

        const currentLevel = GAME_LEVELS[this.state.currentLevel - 1]

        // Check if user has reached the start position (enable boundary detection)
        if (!this.state.isBoundaryDetectionEnabled) {
            const startDistance = this.distance(
                { x, y },
                currentLevel.path.startPoint
            )
            // Enable boundary detection when user is close to start position
            if (startDistance <= 30) {
                // Same buffer as START_BUFFER in checkCollision
                this.state.isBoundaryDetectionEnabled = true
            }
        }

        const collisionResult = this.checkCollision(
            { x, y },
            currentLevel.path,
            this.state.cursor.radius
        )

        this.state.isOnPath = collisionResult.isOnPath
        this.state.hasReachedGoal = collisionResult.hasReachedGoal

        // Only check boundaries if detection is enabled
        if (this.state.isBoundaryDetectionEnabled) {
            // Check if cursor went out of bounds
            if (!collisionResult.isOnPath) {
                this.endGame()
            }
        }

        // Check if goal reached (always enabled)
        if (collisionResult.hasReachedGoal) {
            this.completeLevel()
        }

        return collisionResult
    }

    public setCursorPosition(x: number, y: number): void {
        this.state.cursor.x = x
        this.state.cursor.y = y
    }

    private completeLevel(): void {
        const currentLevel = GAME_LEVELS[this.state.currentLevel - 1]
        const levelTime = this.state.levelStartTime
            ? (Date.now() - this.state.levelStartTime) / 1000
            : 0
        const timeBonus = Math.max(
            0,
            Math.floor((15 - levelTime) * currentLevel.timeBonus)
        )

        // Add score
        this.state.score += currentLevel.basePoints + timeBonus

        // Check if all levels completed
        if (this.state.currentLevel >= GAME_LEVELS.length) {
            this.state.isGameWon = true
            this.endGame()
            return
        }

        // Move to next level
        this.state.currentLevel++
        this.state.levelStartTime = Date.now()
        this.state.isBoundaryDetectionEnabled = false // Disable for new level

        // Position cursor at start of next level
        const nextLevel = GAME_LEVELS[this.state.currentLevel - 1]
        const startPoint = nextLevel.path.startPoint
        this.state.cursor.x = startPoint.x
        this.state.cursor.y = startPoint.y
        this.state.hasReachedGoal = false
    }

    private checkCollision(
        cursorPos: Point,
        path: GamePath,
        tolerance: number
    ): CollisionResult {
        // Add buffer zones for start and end points
        const START_BUFFER = 30 // Larger buffer for start position
        const END_BUFFER = 25 // Buffer for end position

        // Check if cursor is near start position (always safe)
        const startDistance = this.distance(cursorPos, path.startPoint)
        if (startDistance <= START_BUFFER) {
            return { isOnPath: true, hasReachedGoal: false }
        }

        // Check if cursor is near end position (goal reached)
        const endDistance = this.distance(cursorPos, path.endPoint)
        if (endDistance <= END_BUFFER) {
            return { isOnPath: true, hasReachedGoal: true }
        }

        // Check if cursor is on any path segment
        for (const segment of path.segments) {
            if (this.isPointOnSegment(cursorPos, segment, tolerance)) {
                return { isOnPath: true, hasReachedGoal: false }
            }
        }

        return { isOnPath: false, hasReachedGoal: false }
    }

    private isPointOnSegment(
        point: Point,
        segment: PathSegment,
        tolerance: number
    ): boolean {
        if (segment.type === 'straight') {
            return this.isPointOnLine(
                point,
                segment.start,
                segment.end,
                segment.width / 2 + tolerance
            )
        } else if (segment.type === 'curve' && segment.controlPoint) {
            return this.isPointOnBezier(
                point,
                segment.start,
                segment.controlPoint,
                segment.end,
                segment.width / 2 + tolerance
            )
        }
        return false
    }

    private isPointOnLine(
        point: Point,
        lineStart: Point,
        lineEnd: Point,
        tolerance: number
    ): boolean {
        const A = point.x - lineStart.x
        const B = point.y - lineStart.y
        const C = lineEnd.x - lineStart.x
        const D = lineEnd.y - lineStart.y

        const dot = A * C + B * D
        const lenSq = C * C + D * D

        if (lenSq === 0) {
            return false
        }

        const param = dot / lenSq

        if (param < 0 || param > 1) {
            return false
        }

        const xx = lineStart.x + param * C
        const yy = lineStart.y + param * D

        const dx = point.x - xx
        const dy = point.y - yy
        return dx * dx + dy * dy <= tolerance * tolerance
    }

    private isPointOnBezier(
        point: Point,
        start: Point,
        control: Point,
        end: Point,
        tolerance: number
    ): boolean {
        // Simplified bezier curve collision - sample points along curve
        const samples = 50
        for (let i = 0; i <= samples; i++) {
            const t = i / samples
            const bezierPoint = this.getBezierPoint(t, start, control, end)
            if (this.distance(point, bezierPoint) <= tolerance) {
                return true
            }
        }
        return false
    }

    private getBezierPoint(
        t: number,
        start: Point,
        control: Point,
        end: Point
    ): Point {
        const mt = 1 - t
        return {
            x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
            y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
        }
    }

    private distance(p1: Point, p2: Point): number {
        const dx = p1.x - p2.x
        const dy = p1.y - p2.y
        return Math.sqrt(dx * dx + dy * dy)
    }

    private startTimer(): void {
        this.gameTimer = setInterval(() => {
            if (this.state.timeRemaining <= 0) {
                this.endGame()
                return
            }
            this.state.timeRemaining--
        }, 1000)
    }

    private stopTimer(): void {
        if (this.gameTimer) {
            clearInterval(this.gameTimer)
            this.gameTimer = null
        }
    }

    public getState(): GameState {
        return { ...this.state }
    }

    public getCurrentLevel(): GameLevel {
        return GAME_LEVELS[this.state.currentLevel - 1]
    }

    public getStats(): GameStats {
        const totalTime = this.state.gameStartTime
            ? (Date.now() - this.state.gameStartTime) / 1000
            : 0

        return {
            finalScore: this.state.score,
            levelsCompleted: this.state.isGameWon
                ? GAME_LEVELS.length
                : Math.max(0, this.state.currentLevel - 1),
            totalTime,
            averageTimePerLevel:
                this.state.currentLevel > 1
                    ? totalTime / (this.state.currentLevel - 1)
                    : 0,
            pathViolations:
                this.state.isGameOver && !this.state.isGameWon ? 1 : 0,
            perfectLevels: this.state.isGameWon ? GAME_LEVELS.length : 0,
        }
    }

    public cleanup(): void {
        this.stopTimer()
    }
}
