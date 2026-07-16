// Evader renderer using PixiJS and BaseRenderer framework
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type { EvaderState, EvaderConfig } from './frameworkTypes'
import type { GameObject, Player } from './types'

export interface EvaderRendererConfig extends PixiJSRendererConfig {
    playerSize: number
    objectSize: number
    gridLineColor: number
}

export class EvaderRenderer extends PixiJSRenderer {
    private evaderConfig: EvaderRendererConfig
    private boardGraphic: PIXI.Graphics | null = null
    private objectContainer: PIXI.Container | null = null
    private playerGraphic: PIXI.Graphics | null = null
    private objectGraphics: Map<string, PIXI.Graphics> = new Map()
    private playerGradient: PIXI.FillGradient | null = null
    private coinGradient: PIXI.FillGradient | null = null
    private coinGradientRadius = NaN
    private bombGradient: PIXI.FillGradient | null = null
    private bombGradientRadius = NaN

    constructor(config: EvaderRendererConfig) {
        super(config)
        this.evaderConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error('EvaderRenderer: app not available after setup')
        }

        this.boardGraphic = this.createGraphics()
        this.objectContainer = this.createContainer()
        this.playerGraphic = this.createGraphics()

        app.stage.addChild(this.boardGraphic)
        app.stage.addChild(this.objectContainer)
        app.stage.addChild(this.playerGraphic)

        this.drawBoard()
    }

    protected renderGame(state: unknown): void {
        if (!this.isEvaderState(state)) {
            return
        }

        this.renderPlayer(state.player)
        this.renderObjects(state.objects)
    }

    private isEvaderState(state: unknown): state is EvaderState {
        if (!state || typeof state !== 'object') {
            return false
        }
        const candidate = state as {
            objects?: unknown
            player?: unknown
        }
        return (
            Array.isArray(candidate.objects) &&
            typeof candidate.player === 'object'
        )
    }

    private drawBoard(): void {
        if (!this.boardGraphic) {
            return
        }

        const width = this.config.width || 800
        const height = this.config.height || 300

        this.boardGraphic.clear()

        this.boardGraphic.rect(0, 0, width, height).fill({
            color: 0x001122,
            alpha: 0.45,
        })

        const gridSize = 40
        for (let x = 0; x <= width; x += gridSize) {
            this.boardGraphic.moveTo(x, 0).lineTo(x, height).stroke({
                color: this.evaderConfig.gridLineColor,
                width: 1,
                alpha: 0.12,
            })
        }
        for (let y = 0; y <= height; y += gridSize) {
            this.boardGraphic.moveTo(0, y).lineTo(width, y).stroke({
                color: this.evaderConfig.gridLineColor,
                width: 1,
                alpha: 0.12,
            })
        }

        this.boardGraphic.rect(1, 1, width - 2, height - 2).stroke({
            color: 0x06b6d4,
            width: 2,
            alpha: 0.35,
        })
    }

    private getPlayerGradient(): PIXI.FillGradient {
        if (!this.playerGradient) {
            // Local-space vertical gradient (0→1) fills the player rect
            // regardless of world position, so geometry never needs updating.
            this.playerGradient = new PIXI.FillGradient(0, 0, 0, 1)
            this.playerGradient.addColorStop(0, 0x6bffae)
            this.playerGradient.addColorStop(0.5, 0x00ff66)
            this.playerGradient.addColorStop(1, 0x00cc44)
        }
        return this.playerGradient
    }

    private getCoinGradient(radius: number): PIXI.FillGradient {
        // Rebuild when radius changes so the gradient always matches the
        // circle geometry (objectSize is constant today, but this guards
        // against a future dynamic radius).
        if (!this.coinGradient || this.coinGradientRadius !== radius) {
            this.coinGradient = new PIXI.FillGradient(0, -radius, 0, radius)
            this.coinGradient.addColorStop(0, 0xffd700)
            this.coinGradient.addColorStop(0.5, 0xffed4e)
            this.coinGradient.addColorStop(1, 0xffa500)
            this.coinGradientRadius = radius
        }
        return this.coinGradient
    }

    private getBombGradient(radius: number): PIXI.FillGradient {
        if (!this.bombGradient || this.bombGradientRadius !== radius) {
            this.bombGradient = new PIXI.FillGradient(0, -radius, 0, radius)
            this.bombGradient.addColorStop(0, 0xff4444)
            this.bombGradient.addColorStop(0.5, 0xff0000)
            this.bombGradient.addColorStop(1, 0xcc0000)
            this.bombGradientRadius = radius
        }
        return this.bombGradient
    }

    private renderPlayer(player: Player): void {
        if (!this.playerGraphic) {
            return
        }

        this.playerGraphic.clear()

        const playerWidth = this.evaderConfig.playerSize
        const playerHeight = this.evaderConfig.playerSize

        this.playerGraphic
            .rect(
                player.x - playerWidth / 2,
                player.y - playerHeight / 2,
                playerWidth,
                playerHeight
            )
            .fill(this.getPlayerGradient())
            .stroke({ color: 0x00ff66, width: 2 })
    }

    private renderObjects(objects: GameObject[]): void {
        if (!this.objectContainer) {
            return
        }

        // Remove old graphics
        for (const [id, graphic] of this.objectGraphics) {
            if (!objects.find(obj => obj.id === id)) {
                this.objectContainer.removeChild(graphic)
                graphic.destroy()
                this.objectGraphics.delete(id)
            }
        }

        const radius = this.evaderConfig.objectSize / 2

        for (const obj of objects) {
            let objectGraphic = this.objectGraphics.get(obj.id)
            if (!objectGraphic) {
                objectGraphic = this.createGraphics()
                this.objectContainer.addChild(objectGraphic)
                this.objectGraphics.set(obj.id, objectGraphic)
            }

            objectGraphic.clear()
            objectGraphic.x = obj.x
            objectGraphic.y = obj.y

            if (obj.type === 'coin') {
                objectGraphic
                    .circle(0, 0, radius)
                    .fill(this.getCoinGradient(radius))
                    .stroke({
                        color: 0xffd700,
                        width: 2,
                    })
            } else {
                objectGraphic
                    .circle(0, 0, radius)
                    .fill(this.getBombGradient(radius))
                    .stroke({
                        color: 0xff0000,
                        width: 2,
                    })
            }
        }
    }

    cleanup(): void {
        this.objectGraphics.forEach(graphic => graphic.destroy())
        this.objectGraphics.clear()

        this.playerGradient?.destroy()
        this.playerGradient = null
        this.coinGradient?.destroy()
        this.coinGradient = null
        this.bombGradient?.destroy()
        this.bombGradient = null

        if (this.boardGraphic) {
            this.boardGraphic.destroy()
            this.boardGraphic = null
        }
        if (this.objectContainer) {
            this.objectContainer.destroy({ children: true })
            this.objectContainer = null
        }
        if (this.playerGraphic) {
            this.playerGraphic.destroy()
            this.playerGraphic = null
        }

        super.cleanup()
    }
}

export function createEvaderRendererConfig(
    gameConfig: EvaderConfig,
    container: string
): EvaderRendererConfig {
    return {
        type: 'canvas',
        container,
        width: gameConfig.canvasWidth,
        height: gameConfig.canvasHeight,
        responsive: false,
        backgroundColor: gameConfig.backgroundColor,
        antialias: true,
        playerSize: gameConfig.playerSize,
        objectSize: gameConfig.objectSize,
        gridLineColor: 0x0ea5e9,
    }
}
