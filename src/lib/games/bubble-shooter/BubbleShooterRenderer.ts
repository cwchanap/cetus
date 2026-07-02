// Bubble Shooter renderer using PixiJS and BaseRenderer framework
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type {
    BubbleShooterState,
    BubbleShooterConfig,
    Bubble,
    Position,
} from './types'

export interface BubbleShooterRendererConfig extends PixiJSRendererConfig {
    bubbleRadius: number
    gameWidth: number
    gameHeight: number
}

export class BubbleShooterRenderer extends PixiJSRenderer {
    private shooterConfig: BubbleShooterRendererConfig
    private gridContainer: PIXI.Container | null = null
    private uiContainer: PIXI.Container | null = null
    private bubbleGraphics: PIXI.Graphics[] = []

    constructor(config: BubbleShooterRendererConfig) {
        super(config)
        this.shooterConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error(
                'BubbleShooterRenderer: app not available after setup'
            )
        }

        this.gridContainer = this.createContainer()
        this.uiContainer = this.createContainer()

        app.stage.addChild(this.gridContainer)
        app.stage.addChild(this.uiContainer)
    }

    protected renderGame(state: unknown): void {
        if (!this.isBubbleShooterState(state)) {
            return
        }
        if (!state.needsRedraw) {
            return
        }

        this.clearGraphics()

        const { bubbleRadius } = this.shooterConfig

        // Draw grid bubbles
        for (let row = 0; row < state.grid.length; row++) {
            if (!state.grid[row]) {
                continue
            }
            for (let col = 0; col < state.grid[row].length; col++) {
                const bubble = state.grid[row][col]
                if (bubble) {
                    this.drawBubble(bubble, bubbleRadius)
                }
            }
        }

        // Draw current bubble when no projectile is in flight
        if (state.currentBubble && !state.projectile) {
            this.drawCurrentBubble(state.currentBubble, bubbleRadius)
        }

        // Draw aim line when idle
        if (
            !state.projectile &&
            state.isActive &&
            !state.isGameOver &&
            !state.isPaused &&
            state.currentBubble
        ) {
            this.drawAimLine(state.currentBubble, state.aimAngle)
        }

        // Draw projectile
        if (state.projectile) {
            this.drawProjectile(state.projectile, bubbleRadius)
        }
    }

    private isBubbleShooterState(state: unknown): state is BubbleShooterState {
        if (!state || typeof state !== 'object') {
            return false
        }
        const candidate = state as {
            grid?: unknown
            needsRedraw?: boolean
            projectile?: unknown
        }
        return (
            Array.isArray(candidate.grid) &&
            typeof candidate.needsRedraw === 'boolean' &&
            'projectile' in candidate
        )
    }

    private drawBubble(bubble: Bubble, radius: number): void {
        if (!this.gridContainer) {
            return
        }

        const graphic = this.createGraphics()
        graphic.circle(bubble.x, bubble.y, radius)
        graphic.fill(bubble.color)

        graphic.circle(bubble.x, bubble.y, radius)
        graphic.stroke({ width: 2, color: 0xffffff })

        graphic.circle(
            bubble.x - radius * 0.3,
            bubble.y - radius * 0.3,
            radius * 0.3
        )
        graphic.fill({ color: 0xffffff, alpha: 0.3 })

        this.gridContainer.addChild(graphic)
        this.bubbleGraphics.push(graphic)
    }

    private drawCurrentBubble(bubble: Bubble, radius: number): void {
        if (!this.uiContainer) {
            return
        }

        const graphic = this.createGraphics()
        graphic.circle(bubble.x, bubble.y, radius)
        graphic.fill(bubble.color)

        graphic.circle(bubble.x, bubble.y, radius)
        graphic.stroke({ width: 3, color: 0xffffff })

        graphic.circle(
            bubble.x - radius * 0.3,
            bubble.y - radius * 0.3,
            radius * 0.25
        )
        graphic.fill({ color: 0xffffff, alpha: 0.5 })

        this.uiContainer.addChild(graphic)
        this.bubbleGraphics.push(graphic)
    }

    private drawAimLine(shooter: Position, aimAngle: number): void {
        if (!this.uiContainer) {
            return
        }

        const aimLineGraphic = this.createGraphics()
        const length = 80
        const endX = shooter.x + Math.cos(aimAngle) * length
        const endY = shooter.y + Math.sin(aimAngle) * length

        aimLineGraphic.moveTo(shooter.x, shooter.y)
        aimLineGraphic.lineTo(endX, endY)
        aimLineGraphic.stroke({ width: 2, color: 0xffffff, alpha: 0.7 })

        const arrowSize = 10
        const arrowAngle = 0.5
        const leftX =
            endX + Math.cos(aimAngle + Math.PI - arrowAngle) * arrowSize
        const leftY =
            endY + Math.sin(aimAngle + Math.PI - arrowAngle) * arrowSize
        const rightX =
            endX + Math.cos(aimAngle + Math.PI + arrowAngle) * arrowSize
        const rightY =
            endY + Math.sin(aimAngle + Math.PI + arrowAngle) * arrowSize

        aimLineGraphic.poly([
            { x: endX, y: endY },
            { x: leftX, y: leftY },
            { x: rightX, y: rightY },
        ])
        aimLineGraphic.fill({ color: 0xffffff, alpha: 0.7 })

        this.uiContainer.addChild(aimLineGraphic)
        this.bubbleGraphics.push(aimLineGraphic)
    }

    private drawProjectile(projectile: Bubble, radius: number): void {
        if (!this.uiContainer) {
            return
        }

        const graphic = this.createGraphics()
        graphic.circle(projectile.x, projectile.y, radius)
        graphic.fill(projectile.color)

        graphic.circle(projectile.x, projectile.y, radius)
        graphic.stroke({ width: 2, color: 0xffffff })

        graphic.circle(
            projectile.x - radius * 0.3,
            projectile.y - radius * 0.3,
            radius * 0.3
        )
        graphic.fill({ color: 0xffffff, alpha: 0.3 })

        this.uiContainer.addChild(graphic)
        this.bubbleGraphics.push(graphic)
    }

    private clearGraphics(): void {
        if (this.gridContainer) {
            this.gridContainer.removeChildren()
        }
        if (this.uiContainer) {
            this.uiContainer.removeChildren()
        }

        this.bubbleGraphics.forEach(graphic => {
            graphic.destroy()
        })
        this.bubbleGraphics = []
    }

    cleanup(): void {
        this.clearGraphics()
        if (this.gridContainer) {
            this.gridContainer.destroy({ children: true })
            this.gridContainer = null
        }
        if (this.uiContainer) {
            this.uiContainer.destroy({ children: true })
            this.uiContainer = null
        }
        super.cleanup()
    }
}

export function createBubbleShooterRendererConfig(
    gameConfig: BubbleShooterConfig,
    container: string
): BubbleShooterRendererConfig {
    return {
        type: 'canvas',
        container,
        width: gameConfig.gameWidth,
        height: gameConfig.gameHeight,
        responsive: false,
        backgroundColor: gameConfig.backgroundColor,
        antialias: true,
        bubbleRadius: gameConfig.bubbleRadius,
        gameWidth: gameConfig.gameWidth,
        gameHeight: gameConfig.gameHeight,
    }
}
