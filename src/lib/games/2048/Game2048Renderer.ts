// 2048 renderer using PixiJS and BaseRenderer framework
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import { GAME_CONSTANTS, type Position, type Animation } from './types'
import type { Game2048State, Game2048Config } from './frameworkTypes'
import { getTileColor, getTileTextColor, getTileFontSize } from './utils'

export interface Game2048RendererConfig extends PixiJSRendererConfig {
    tileSize: number
    gap: number
    animationDuration: number
    boardBgColor: number
    cellColor: number
}

export class Game2048Renderer extends PixiJSRenderer {
    private rendererConfig: Game2048RendererConfig
    private boardContainer: PIXI.Container | null = null
    private tilesContainer: PIXI.Container | null = null
    private tileSprites: Map<string, PIXI.Container> = new Map()

    constructor(config: Game2048RendererConfig) {
        super(config)
        this.rendererConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error('Game2048Renderer: app not available after setup')
        }

        this.boardContainer = this.createContainer()
        this.tilesContainer = this.createContainer()

        app.stage.addChild(this.boardContainer)
        app.stage.addChild(this.tilesContainer)

        this.drawBoard()
    }

    protected renderGame(state: unknown): void {
        if (!this.isGame2048State(state)) {
            return
        }
        this.drawBoard()
        this.drawTiles(state)
    }

    /**
     * Play move/merge/spawn animations, then leave the board drawn at the
     * final positions described by the state.
     */
    async playAnimations(
        animations: Animation[],
        state: Game2048State
    ): Promise<void> {
        // Draw tiles at their final positions first
        this.drawTiles(state)

        const moveAnimations = animations.filter(a => a.type === 'move')
        const mergeAnimations = animations.filter(a => a.type === 'merge')
        const spawnAnimations = animations.filter(a => a.type === 'spawn')

        const movePromises = moveAnimations.map(anim =>
            this.animateTileMove(anim.tileId, anim.from!, anim.to)
        )
        await Promise.all(movePromises)

        const mergePromises = mergeAnimations.map(anim =>
            this.animateTileMerge(anim.tileId, anim.to, anim.value!)
        )
        await Promise.all(mergePromises)

        const spawnPromises = spawnAnimations.map(anim =>
            this.animateTileSpawn(anim.tileId, anim.to)
        )
        await Promise.all(spawnPromises)
    }

    private isGame2048State(state: unknown): state is Game2048State {
        if (!state || typeof state !== 'object') {
            return false
        }
        const candidate = state as {
            board?: unknown
            needsRedraw?: boolean
        }
        return (
            Array.isArray(candidate.board) &&
            typeof candidate.needsRedraw === 'boolean'
        )
    }

    private getBoardDimensions(): { width: number; height: number } {
        const { tileSize, gap } = this.rendererConfig
        const size = GAME_CONSTANTS.BOARD_SIZE * (tileSize + gap) + gap
        return { width: size, height: size }
    }

    private drawBoard(): void {
        if (!this.boardContainer) {
            return
        }

        // Destroy previously rendered children to prevent Pixi resource
        // buildup during long sessions (drawBoard recreates Graphics every render).
        for (const child of this.boardContainer.children) {
            child.destroy()
        }
        this.boardContainer.removeChildren()

        const { BOARD_SIZE } = GAME_CONSTANTS
        const { tileSize, gap, boardBgColor, cellColor } = this.rendererConfig
        const gridGraphic = this.createGraphics()

        const { width, height } = this.getBoardDimensions()
        gridGraphic.roundRect(0, 0, width, height, 8)
        gridGraphic.fill(boardBgColor)

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const x = col * (tileSize + gap) + gap
                const y = row * (tileSize + gap) + gap

                gridGraphic.roundRect(x, y, tileSize, tileSize, 6)
                gridGraphic.fill(cellColor)
            }
        }

        this.boardContainer.addChild(gridGraphic)
    }

    private createTileSprite(
        value: number,
        position: Position
    ): PIXI.Container {
        const { tileSize, gap } = this.rendererConfig
        const container = this.createContainer()

        const x = position.col * (tileSize + gap) + gap
        const y = position.row * (tileSize + gap) + gap

        container.position.set(x + tileSize / 2, y + tileSize / 2)
        container.pivot.set(tileSize / 2, tileSize / 2)

        const background = this.createGraphics()
        background.roundRect(0, 0, tileSize, tileSize, 6)
        background.fill(getTileColor(value))

        // Glow effect for higher values
        if (value >= 128) {
            background.roundRect(-2, -2, tileSize + 4, tileSize + 4, 8)
            background.fill({ color: getTileColor(value), alpha: 0.3 })
        }

        container.addChild(background)

        const text = this.createText(value.toString(), {
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: getTileFontSize(value),
            fontWeight: 'bold',
            fill: getTileTextColor(value),
        })
        text.anchor.set(0.5)
        text.position.set(tileSize / 2, tileSize / 2)
        container.addChild(text)

        return container
    }

    private drawTiles(state: Game2048State): void {
        if (!this.tilesContainer) {
            return
        }

        // Destroy previously rendered tile containers to prevent Pixi
        // resource buildup (drawTiles recreates sprites every render).
        for (const child of this.tilesContainer.children) {
            child.destroy()
        }
        this.tilesContainer.removeChildren()
        this.tileSprites.clear()

        const { BOARD_SIZE } = GAME_CONSTANTS

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const tile = state.board[row][col]
                if (tile) {
                    const sprite = this.createTileSprite(tile.value, {
                        row,
                        col,
                    })
                    this.tilesContainer.addChild(sprite)
                    this.tileSprites.set(tile.id, sprite)
                }
            }
        }
    }

    private animateTileMove(
        tileId: string,
        from: Position,
        to: Position,
        duration: number = this.rendererConfig.animationDuration
    ): Promise<void> {
        return new Promise(resolve => {
            const sprite = this.tileSprites.get(tileId)
            if (!sprite) {
                resolve()
                return
            }

            const { tileSize, gap } = this.rendererConfig
            const startX = from.col * (tileSize + gap) + gap + tileSize / 2
            const startY = from.row * (tileSize + gap) + gap + tileSize / 2
            const endX = to.col * (tileSize + gap) + gap + tileSize / 2
            const endY = to.row * (tileSize + gap) + gap + tileSize / 2

            sprite.position.set(startX, startY)

            const startTime = performance.now()

            const animate = () => {
                const elapsed = performance.now() - startTime
                const progress = Math.min(elapsed / duration, 1)
                const eased = 1 - (1 - progress) * (1 - progress)

                sprite.position.set(
                    startX + (endX - startX) * eased,
                    startY + (endY - startY) * eased
                )

                if (progress < 1) {
                    requestAnimationFrame(animate)
                } else {
                    resolve()
                }
            }

            requestAnimationFrame(animate)
        })
    }

    private animateTileMerge(
        tileId: string,
        _position: Position,
        _value: number,
        duration: number = this.rendererConfig.animationDuration
    ): Promise<void> {
        return new Promise(resolve => {
            const sprite = this.tileSprites.get(tileId)
            if (!sprite) {
                resolve()
                return
            }

            const startTime = performance.now()
            const originalScale = 1

            const animate = () => {
                const elapsed = performance.now() - startTime
                const progress = Math.min(elapsed / duration, 1)

                let scale: number
                if (progress < 0.5) {
                    scale = originalScale + progress * 0.4
                } else {
                    scale = originalScale + (1 - progress) * 0.4
                }

                sprite.scale.set(scale)

                if (progress < 1) {
                    requestAnimationFrame(animate)
                } else {
                    sprite.scale.set(originalScale)
                    resolve()
                }
            }

            requestAnimationFrame(animate)
        })
    }

    private animateTileSpawn(
        tileId: string,
        _position: Position,
        duration: number = this.rendererConfig.animationDuration
    ): Promise<void> {
        return new Promise(resolve => {
            const sprite = this.tileSprites.get(tileId)
            if (!sprite) {
                resolve()
                return
            }

            sprite.alpha = 0
            sprite.scale.set(0.5)

            const startTime = performance.now()

            const animate = () => {
                const elapsed = performance.now() - startTime
                const progress = Math.min(elapsed / duration, 1)
                const eased = 1 - Math.pow(1 - progress, 3)

                sprite.alpha = eased
                sprite.scale.set(0.5 + 0.5 * eased)

                if (progress < 1) {
                    requestAnimationFrame(animate)
                } else {
                    sprite.alpha = 1
                    sprite.scale.set(1)
                    resolve()
                }
            }

            requestAnimationFrame(animate)
        })
    }

    cleanup(): void {
        this.tileSprites.clear()
        if (this.tilesContainer) {
            this.tilesContainer.destroy({ children: true })
            this.tilesContainer = null
        }
        if (this.boardContainer) {
            this.boardContainer.destroy({ children: true })
            this.boardContainer = null
        }
        super.cleanup()
    }
}

export function createGame2048RendererConfig(
    gameConfig: Game2048Config,
    container: string
): Game2048RendererConfig {
    return {
        type: 'canvas',
        container,
        width: gameConfig.gameWidth,
        height: gameConfig.gameHeight,
        responsive: false,
        backgroundColor: gameConfig.backgroundColor,
        antialias: true,
        tileSize: gameConfig.tileSize,
        gap: gameConfig.gap,
        animationDuration: gameConfig.animationDuration,
        boardBgColor: gameConfig.boardBgColor,
        cellColor: gameConfig.cellColor,
    }
}
