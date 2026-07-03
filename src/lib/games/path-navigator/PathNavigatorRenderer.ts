// Path Navigator renderer using PixiJS and BaseRenderer framework
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import { quadraticBezierPoint as getBezierPoint } from '@/lib/games/shared/geometry'
import { GAME_LEVELS } from './PathNavigatorGame'
import type {
    PathNavigatorState,
    PathNavigatorConfig,
    GameLevel,
    Cursor,
    Point,
    PathSegment,
} from './types'

export interface PathNavigatorRendererConfig extends PixiJSRendererConfig {
    gameWidth: number
    gameHeight: number
    cursorRadius: number
    pathColor: number
    cursorColor: number
    goalColor: number
    backgroundColor: number
    outOfBoundsColor: number
}

export class PathNavigatorRenderer extends PixiJSRenderer {
    private navConfig: PathNavigatorRendererConfig
    private gameContainer: PIXI.Container | null = null
    private backgroundGraphics: PIXI.Graphics | null = null
    private pathGraphics: PIXI.Graphics | null = null
    private cursorGraphics: PIXI.Graphics | null = null
    private goalGraphics: PIXI.Graphics | null = null

    constructor(config: PathNavigatorRendererConfig) {
        super(config)
        this.navConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error(
                'PathNavigatorRenderer: app not available after setup'
            )
        }

        this.gameContainer = this.createContainer()
        this.backgroundGraphics = this.createGraphics()
        this.pathGraphics = this.createGraphics()
        this.goalGraphics = this.createGraphics()
        this.cursorGraphics = this.createGraphics()

        app.stage.addChild(this.gameContainer)
        this.gameContainer.addChild(this.backgroundGraphics)
        this.gameContainer.addChild(this.pathGraphics)
        this.gameContainer.addChild(this.goalGraphics)
        this.gameContainer.addChild(this.cursorGraphics)
    }

    protected renderGame(state: unknown): void {
        if (!this.isPathNavigatorState(state)) {
            return
        }

        const level = GAME_LEVELS[(state.currentLevel ?? 1) - 1]
        if (!level) {
            return
        }

        this.renderBackground()
        this.renderPath(level)
        this.renderGoal(level.path.endPoint)
        this.renderCursor(state.cursor, state.isOnPath)
    }

    private isPathNavigatorState(state: unknown): state is PathNavigatorState {
        if (!state || typeof state !== 'object') {
            return false
        }
        const candidate = state as {
            cursor?: unknown
            isOnPath?: unknown
            currentLevel?: unknown
        }
        return (
            'cursor' in candidate &&
            typeof candidate.isOnPath === 'boolean' &&
            typeof candidate.currentLevel === 'number'
        )
    }

    private renderBackground(): void {
        const g = this.backgroundGraphics
        if (!g) {
            return
        }
        g.clear()

        // Draw background
        g.rect(0, 0, this.navConfig.gameWidth, this.navConfig.gameHeight)
        g.fill(this.navConfig.backgroundColor)

        // Add grid pattern
        g.stroke({ width: 1, color: 0x333333, alpha: 0.3 })

        // Vertical lines
        for (let x = 0; x <= this.navConfig.gameWidth; x += 50) {
            g.moveTo(x, 0)
            g.lineTo(x, this.navConfig.gameHeight)
        }

        // Horizontal lines
        for (let y = 0; y <= this.navConfig.gameHeight; y += 50) {
            g.moveTo(0, y)
            g.lineTo(this.navConfig.gameWidth, y)
        }

        g.stroke()
    }

    private renderPath(level: GameLevel): void {
        const g = this.pathGraphics
        if (!g) {
            return
        }
        g.clear()

        // Draw start position with buffer zone
        const startRadius = 15
        const startBufferRadius = 30 // Visual indication of safe start zone

        // Draw start buffer zone (semi-transparent)
        g.circle(
            level.path.startPoint.x,
            level.path.startPoint.y,
            startBufferRadius
        )
        g.fill({ color: 0x00ffff, alpha: 0.2 })

        // Draw start position marker
        g.circle(level.path.startPoint.x, level.path.startPoint.y, startRadius)
        g.fill(0x00ffff)

        // Draw each path segment
        for (const segment of level.path.segments) {
            this.drawSegment(segment)
        }
    }

    private drawSegment(segment: PathSegment): void {
        const g = this.pathGraphics
        if (!g) {
            return
        }
        if (segment.type === 'straight') {
            this.drawStraightPath(segment)
        } else if (segment.type === 'curve' && segment.controlPoint) {
            this.drawCurvedPath(segment)
        }
    }

    private drawStraightPath(segment: PathSegment): void {
        const g = this.pathGraphics
        if (!g) {
            return
        }
        const { start, end, width } = segment

        // Calculate perpendicular vector for width
        const dx = end.x - start.x
        const dy = end.y - start.y
        const length = Math.sqrt(dx * dx + dy * dy)

        if (length === 0) {
            return
        }

        const perpX = (-dy / length) * (width / 2)
        const perpY = (dx / length) * (width / 2)

        const polyPoints = [
            start.x + perpX,
            start.y + perpY,
            start.x - perpX,
            start.y - perpY,
            end.x - perpX,
            end.y - perpY,
            end.x + perpX,
            end.y + perpY,
        ]

        // Draw filled path
        g.poly(polyPoints)
        g.fill(this.navConfig.pathColor)

        // Draw outline
        g.poly(polyPoints)
        g.stroke({ width: 2, color: 0x00dddd })
    }

    private drawCurvedPath(segment: PathSegment): void {
        const g = this.pathGraphics
        if (!g) {
            return
        }
        const { start, end, width, controlPoint } = segment

        if (!controlPoint) {
            return
        }

        const steps = 50
        const points: number[] = []

        // Generate points along the curve
        for (let i = 0; i <= steps; i++) {
            const t = i / steps
            const point = getBezierPoint(t, start, controlPoint, end)

            let perpX = 0
            let perpY = 0

            if (i < steps) {
                const nextT = (i + 1) / steps
                const nextPoint = getBezierPoint(
                    nextT,
                    start,
                    controlPoint,
                    end
                )
                const ddx = nextPoint.x - point.x
                const ddy = nextPoint.y - point.y
                const len = Math.sqrt(ddx * ddx + ddy * ddy)

                if (len > 0) {
                    perpX = (-ddy / len) * (width / 2)
                    perpY = (ddx / len) * (width / 2)
                }
            }

            points.push(point.x + perpX, point.y + perpY)
        }

        // Add return path for other side
        for (let i = steps; i >= 0; i--) {
            const t = i / steps
            const point = getBezierPoint(t, start, controlPoint, end)

            let perpX = 0
            let perpY = 0

            if (i < steps) {
                const nextT = (i + 1) / steps
                const nextPoint = getBezierPoint(
                    nextT,
                    start,
                    controlPoint,
                    end
                )
                const ddx = nextPoint.x - point.x
                const ddy = nextPoint.y - point.y
                const len = Math.sqrt(ddx * ddx + ddy * ddy)

                if (len > 0) {
                    perpX = (-ddy / len) * (width / 2)
                    perpY = (ddx / len) * (width / 2)
                }
            }

            points.push(point.x - perpX, point.y - perpY)
        }

        // Draw filled path
        g.poly(points)
        g.fill(this.navConfig.pathColor)

        // Draw outline
        g.poly(points)
        g.stroke({ width: 2, color: 0x00dddd })
    }

    private renderGoal(goalPosition: Point): void {
        const g = this.goalGraphics
        if (!g) {
            return
        }
        g.clear()

        const radius = 15
        const bufferRadius = 25 // Visual indication of buffer zone

        // Draw buffer zone (semi-transparent)
        g.circle(goalPosition.x, goalPosition.y, bufferRadius)
        g.fill({ color: this.navConfig.goalColor, alpha: 0.2 })

        // Draw goal
        g.circle(goalPosition.x, goalPosition.y, radius)
        g.fill(this.navConfig.goalColor)

        // Add glow effect
        g.circle(goalPosition.x, goalPosition.y, radius + 5)
        g.stroke({ width: 3, color: this.navConfig.goalColor, alpha: 0.5 })
    }

    private renderCursor(cursor: Cursor, isOnPath: boolean): void {
        const g = this.cursorGraphics
        if (!g) {
            return
        }
        g.clear()

        if (!cursor.isVisible) {
            return
        }

        const color = isOnPath
            ? this.navConfig.cursorColor
            : this.navConfig.outOfBoundsColor
        const time = Date.now() / 1000
        const pulse = isOnPath ? 1 : 0.7 + 0.3 * Math.sin(time * 10)

        // Draw cursor
        g.circle(cursor.x, cursor.y, cursor.radius * pulse)
        g.fill(color)

        // Add trail effect
        if (isOnPath) {
            g.circle(cursor.x, cursor.y, cursor.radius + 3)
            g.stroke({ width: 2, color: color, alpha: 0.3 })
        }
    }

    cleanup(): void {
        if (this.gameContainer) {
            this.gameContainer.destroy({ children: true })
            this.gameContainer = null
        }
        this.backgroundGraphics = null
        this.pathGraphics = null
        this.cursorGraphics = null
        this.goalGraphics = null
        super.cleanup()
    }
}

export function createPathNavigatorRendererConfig(
    gameConfig: PathNavigatorConfig,
    container: string
): PathNavigatorRendererConfig {
    return {
        type: 'canvas',
        container,
        width: gameConfig.gameWidth,
        height: gameConfig.gameHeight,
        responsive: false,
        backgroundColor: gameConfig.backgroundColor,
        antialias: true,
        gameWidth: gameConfig.gameWidth,
        gameHeight: gameConfig.gameHeight,
        cursorRadius: gameConfig.cursorRadius,
        pathColor: gameConfig.pathColor,
        cursorColor: gameConfig.cursorColor,
        goalColor: gameConfig.goalColor,
        outOfBoundsColor: gameConfig.outOfBoundsColor,
    }
}
