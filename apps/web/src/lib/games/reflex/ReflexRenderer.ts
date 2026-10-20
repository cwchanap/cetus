// Reflex renderer using PixiJS and BaseRenderer framework
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type { ReflexState, ReflexConfig } from './frameworkTypes'
import type { GameObject, GridPosition } from './types'

export interface ReflexRendererConfig extends PixiJSRendererConfig {
    gridSize: number
    cellSize: number
    gridLineColor: number
    objectLifetime: number
}

const PADDING = 20

export class ReflexRenderer extends PixiJSRenderer {
    private reflexConfig: ReflexRendererConfig
    private gridContainer: PIXI.Container | null = null
    private objectContainer: PIXI.Container | null = null
    private cellGraphics: PIXI.Graphics[][] = []
    private objectGraphics: Map<string, PIXI.Graphics> = new Map()

    constructor(config: ReflexRendererConfig) {
        super(config)
        this.reflexConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error('ReflexRenderer: app not available after setup')
        }

        this.gridContainer = this.createContainer()
        this.objectContainer = this.createContainer()

        this.gridContainer.x = PADDING
        this.gridContainer.y = PADDING
        this.objectContainer.x = PADDING
        this.objectContainer.y = PADDING

        app.stage.addChild(this.gridContainer)
        app.stage.addChild(this.objectContainer)

        this.drawGrid()
    }

    protected renderGame(state: unknown): void {
        if (!this.isReflexState(state)) {
            return
        }

        this.renderObjects(state.objects)
    }

    private isReflexState(state: unknown): state is ReflexState {
        if (!state || typeof state !== 'object') {
            return false
        }
        const candidate = state as {
            objects?: unknown
            needsRedraw?: boolean
        }
        return (
            Array.isArray(candidate.objects) &&
            typeof candidate.needsRedraw === 'boolean'
        )
    }

    private drawGrid(): void {
        if (!this.gridContainer) {
            return
        }

        const { gridSize, cellSize, gridLineColor } = this.reflexConfig

        for (let row = 0; row < gridSize; row++) {
            this.cellGraphics[row] = []
            for (let col = 0; col < gridSize; col++) {
                const cellGraphic = this.createGraphics()
                cellGraphic.x = col * cellSize
                cellGraphic.y = row * cellSize

                cellGraphic
                    .rect(0, 0, cellSize, cellSize)
                    .fill({
                        color: 0x001122,
                        alpha: 0.3,
                    })
                    .stroke({
                        color: gridLineColor,
                        width: 1,
                        alpha: 0.2,
                    })

                this.gridContainer.addChild(cellGraphic)
                this.cellGraphics[row][col] = cellGraphic
            }
        }
    }

    private renderObjects(objects: GameObject[]): void {
        if (!this.objectContainer) {
            return
        }

        const currentIds = new Set(
            objects.filter(o => o.isActive).map(o => o.id)
        )

        for (const [id, graphic] of this.objectGraphics) {
            if (!currentIds.has(id)) {
                this.objectContainer.removeChild(graphic)
                graphic.destroy()
                this.objectGraphics.delete(id)
            }
        }

        for (const object of objects) {
            if (!object.isActive) {
                continue
            }

            const existing = this.objectGraphics.get(object.id)
            if (existing) {
                this.updateObjectAnimation(existing, object)
            } else {
                this.drawObject(object)
            }
        }
    }

    private drawObject(object: GameObject): void {
        if (!this.objectContainer) {
            return
        }

        const { cellSize } = this.reflexConfig
        const objectGraphic = this.createGraphics()
        const centerX = object.cell.col * cellSize + cellSize / 2
        const centerY = object.cell.row * cellSize + cellSize / 2
        const radius = Math.min(cellSize * 0.35, 20)

        objectGraphic.x = centerX
        objectGraphic.y = centerY

        if (object.type === 'coin') {
            this.drawCoin(objectGraphic, radius)
        } else {
            this.drawBomb(objectGraphic, radius)
        }

        this.updateObjectAnimation(objectGraphic, object)

        this.objectContainer.addChild(objectGraphic)
        this.objectGraphics.set(object.id, objectGraphic)
    }

    private drawCoin(graphic: PIXI.Graphics, radius: number): void {
        const coinGradient = new PIXI.FillGradient(0, -radius, 0, radius)
        coinGradient.addColorStop(0, 0xffd700)
        coinGradient.addColorStop(0.5, 0xffed4e)
        coinGradient.addColorStop(1, 0xffa500)

        graphic.circle(0, 0, radius + 3).fill({
            color: 0xffd700,
            alpha: 0.3,
        })

        graphic.circle(0, 0, radius).fill(coinGradient).stroke({
            color: 0xffd700,
            width: 2,
        })

        graphic.circle(-radius * 0.3, -radius * 0.3, radius * 0.4).fill({
            color: 0xffff99,
            alpha: 0.6,
        })

        const dollarText = new PIXI.Text({
            text: '$',
            style: {
                fontSize: radius * 0.8,
                fill: 0x000000,
                fontWeight: 'bold',
                fontFamily: 'Arial',
            },
        })
        dollarText.anchor.set(0.5)
        graphic.addChild(dollarText)
    }

    private drawBomb(graphic: PIXI.Graphics, radius: number): void {
        const bombGradient = new PIXI.FillGradient(0, -radius, 0, radius)
        bombGradient.addColorStop(0, 0xff4444)
        bombGradient.addColorStop(0.5, 0xff0000)
        bombGradient.addColorStop(1, 0xcc0000)

        graphic.circle(0, 0, radius + 4).fill({
            color: 0xff0000,
            alpha: 0.4,
        })

        graphic.circle(0, 0, radius).fill(bombGradient).stroke({
            color: 0xff0000,
            width: 2,
        })

        graphic.rect(-1, -radius - 8, 2, 8).fill(0x8b4513)
        graphic.circle(0, -radius - 8, 2).fill(0xffff00)

        const warningText = new PIXI.Text({
            text: '!',
            style: {
                fontSize: radius * 0.9,
                fill: 0xffffff,
                fontWeight: 'bold',
                fontFamily: 'Arial',
            },
        })
        warningText.anchor.set(0.5)
        graphic.addChild(warningText)
    }

    private updateObjectAnimation(
        graphic: PIXI.Graphics,
        object: GameObject
    ): void {
        const now = Date.now()
        const timeLeft = object.expirationTime - now
        const totalLifetime = this.reflexConfig.objectLifetime * 1000
        const lifetimeRatio = timeLeft / totalLifetime

        if (lifetimeRatio < 0.5) {
            const pulseSpeed = (0.5 - lifetimeRatio) * 10
            const pulse = Math.sin(now * pulseSpeed * 0.01) * 0.2 + 1
            graphic.scale.set(pulse)
        } else {
            graphic.scale.set(1)
        }
    }

    /**
     * Show a click effect at the given grid position.
     */
    showClickEffect(row: number, col: number, isPositive: boolean): void {
        if (!this.objectContainer) {
            return
        }

        const { cellSize } = this.reflexConfig
        const effectGraphic = this.createGraphics()
        const centerX = col * cellSize + cellSize / 2
        const centerY = row * cellSize + cellSize / 2

        effectGraphic.x = centerX
        effectGraphic.y = centerY

        const color = isPositive ? 0x00ff00 : 0xff0000
        const radius = cellSize * 0.6

        effectGraphic.circle(0, 0, radius).fill({
            color,
            alpha: 0.5,
        })

        this.objectContainer.addChild(effectGraphic)

        let scale = 0.5
        let alpha = 0.8

        const animate = () => {
            scale += 0.1
            alpha -= 0.1

            effectGraphic.scale.set(scale)
            effectGraphic.alpha = alpha

            if (alpha <= 0) {
                this.objectContainer?.removeChild(effectGraphic)
                effectGraphic.destroy()
            } else {
                requestAnimationFrame(animate)
            }
        }

        requestAnimationFrame(animate)
    }

    /**
     * Convert pixel coordinates to grid position.
     */
    getCellFromPosition(x: number, y: number): GridPosition | null {
        const adjustedX = x - PADDING
        const adjustedY = y - PADDING

        if (adjustedX < 0 || adjustedY < 0) {
            return null
        }

        const col = Math.floor(adjustedX / this.reflexConfig.cellSize)
        const row = Math.floor(adjustedY / this.reflexConfig.cellSize)

        if (
            row >= 0 &&
            row < this.reflexConfig.gridSize &&
            col >= 0 &&
            col < this.reflexConfig.gridSize
        ) {
            return { row, col }
        }

        return null
    }

    /**
     * Get the logical canvas size (grid + padding).
     */
    getLogicalSize(): number {
        return this.reflexConfig.gridSize * this.reflexConfig.cellSize + 40
    }

    cleanup(): void {
        this.objectGraphics.forEach(graphic => graphic.destroy())
        this.objectGraphics.clear()

        this.cellGraphics = []

        if (this.gridContainer) {
            this.gridContainer.destroy({ children: true })
            this.gridContainer = null
        }
        if (this.objectContainer) {
            this.objectContainer.destroy({ children: true })
            this.objectContainer = null
        }
        super.cleanup()
    }
}

export function createReflexRendererConfig(
    gameConfig: ReflexConfig,
    container: string
): ReflexRendererConfig {
    const canvasSize = gameConfig.gridSize * gameConfig.cellSize + 40
    return {
        type: 'canvas',
        container,
        width: canvasSize,
        height: canvasSize,
        responsive: false,
        backgroundColor: gameConfig.backgroundColor,
        antialias: true,
        gridSize: gameConfig.gridSize,
        cellSize: gameConfig.cellSize,
        gridLineColor: gameConfig.gridLineColor,
        objectLifetime: gameConfig.objectLifetime,
    }
}
