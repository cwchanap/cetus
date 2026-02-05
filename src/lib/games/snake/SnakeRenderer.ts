// Snake renderer using PixiJS and BaseRenderer framework
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type { SnakeState, SnakeConfig, SnakeSegment, Food } from './types'

export interface SnakeRendererConfig extends PixiJSRendererConfig {
    gridWidth: number
    gridHeight: number
    cellSize: number
    snakeColor: number
    foodColor: number
    gridColor: number
}

export class SnakeRenderer extends PixiJSRenderer {
    private snakeConfig: SnakeRendererConfig
    private gridContainer: PIXI.Container | null = null
    private gameObjectContainer: PIXI.Container | null = null
    private graphics: PIXI.Graphics[] = []
    private gridGraphic: PIXI.Graphics | null = null

    constructor(config: SnakeRendererConfig) {
        super(config)
        this.snakeConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error('SnakeRenderer: app not available after setup')
        }

        // Create containers for organized rendering
        this.gridContainer = this.createContainer()
        this.gameObjectContainer = this.createContainer()

        app.stage.addChild(this.gridContainer)
        app.stage.addChild(this.gameObjectContainer)

        // Draw the static grid
        this.drawGrid()
    }

    protected renderGame(state: unknown): void {
        if (!this.isSnakeState(state)) {
            return
        }
        if (!state.needsRedraw) {
            return
        }

        this.clearGameObjects()

        // Draw snake
        state.snake.forEach((segment, index) => {
            this.drawSnakeSegment(segment, index === 0)
        })

        // Draw food
        if (state.food) {
            this.drawFood(state.food)
        }
    }

    private isSnakeState(state: unknown): state is SnakeState {
        if (!state || typeof state !== 'object') {
            return false
        }
        const candidate = state as {
            snake?: SnakeSegment[]
            needsRedraw?: boolean
            food?: Food | null
        }
        return (
            Array.isArray(candidate.snake) &&
            typeof candidate.needsRedraw === 'boolean' &&
            'food' in candidate
        )
    }

    private drawGrid(): void {
        if (!this.gridContainer) {
            return
        }

        this.gridGraphic = this.createGraphics()
        this.gridGraphic.alpha = 0.15

        const { gridWidth, gridHeight, cellSize, gridColor } = this.snakeConfig
        const gameWidth = gridWidth * cellSize
        const gameHeight = gridHeight * cellSize

        // Vertical lines
        for (let x = 0; x <= gridWidth; x++) {
            this.gridGraphic.moveTo(x * cellSize, 0)
            this.gridGraphic.lineTo(x * cellSize, gameHeight)
        }

        // Horizontal lines
        for (let y = 0; y <= gridHeight; y++) {
            this.gridGraphic.moveTo(0, y * cellSize)
            this.gridGraphic.lineTo(gameWidth, y * cellSize)
        }

        this.gridGraphic.stroke({ width: 1, color: gridColor })
        this.gridContainer.addChild(this.gridGraphic)
    }

    private drawSnakeSegment(segment: SnakeSegment, isHead: boolean): void {
        if (!this.gameObjectContainer) {
            return
        }

        const graphic = this.createGraphics()
        const { cellSize, snakeColor } = this.snakeConfig
        const x = segment.x * cellSize
        const y = segment.y * cellSize
        const padding = 2

        // Draw rounded rectangle for segment
        graphic.roundRect(
            x + padding,
            y + padding,
            cellSize - padding * 2,
            cellSize - padding * 2,
            4
        )
        graphic.fill(snakeColor)

        // Add glow effect for head
        if (isHead) {
            graphic.roundRect(
                x + padding,
                y + padding,
                cellSize - padding * 2,
                cellSize - padding * 2,
                4
            )
            graphic.stroke({ width: 2, color: 0xffffff, alpha: 0.8 })
        }

        this.gameObjectContainer.addChild(graphic)
        this.graphics.push(graphic)
    }

    private drawFood(food: Food): void {
        if (!this.gameObjectContainer) {
            return
        }

        const graphic = this.createGraphics()
        const { cellSize, foodColor } = this.snakeConfig
        const x = food.x * cellSize + cellSize / 2
        const y = food.y * cellSize + cellSize / 2
        const radius = cellSize / 2 - 3

        // Draw circle for food
        graphic.circle(x, y, radius)
        graphic.fill(foodColor)

        // Add pulse effect
        graphic.circle(x, y, radius)
        graphic.stroke({ width: 2, color: 0xffffff, alpha: 0.5 })

        this.gameObjectContainer.addChild(graphic)
        this.graphics.push(graphic)
    }

    private clearGameObjects(): void {
        if (this.gameObjectContainer) {
            this.gameObjectContainer.removeChildren()
        }

        // Destroy graphics objects
        this.graphics.forEach(graphic => graphic.destroy())
        this.graphics = []
    }

    cleanup(): void {
        this.clearGameObjects()
        if (this.gridGraphic) {
            this.gridGraphic.destroy()
            this.gridGraphic = null
        }
        if (this.gridContainer) {
            this.gridContainer.destroy({ children: true })
            this.gridContainer = null
        }
        if (this.gameObjectContainer) {
            this.gameObjectContainer.destroy({ children: true })
            this.gameObjectContainer = null
        }
        super.cleanup()
    }
}

export function createSnakeRendererConfig(
    gameConfig: SnakeConfig,
    container: string
): SnakeRendererConfig {
    return {
        type: 'canvas',
        container,
        width: gameConfig.gameWidth,
        height: gameConfig.gameHeight,
        responsive: false,
        backgroundColor: gameConfig.backgroundColor,
        antialias: true,
        gridWidth: gameConfig.gridWidth,
        gridHeight: gameConfig.gridHeight,
        cellSize: gameConfig.cellSize,
        snakeColor: gameConfig.snakeColor,
        foodColor: gameConfig.foodColor,
        gridColor: gameConfig.gridColor,
    }
}
