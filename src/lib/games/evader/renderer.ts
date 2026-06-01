import { Application, Container, Graphics, FillGradient } from 'pixi.js'
import type { GameObject, GameConfig, RendererState, GameState } from './types'

export async function setupPixiJS(
    gameContainer: HTMLElement,
    config: GameConfig
): Promise<RendererState> {
    try {
        const app = new Application()
        await app.init({
            width: config.canvasWidth,
            height: config.canvasHeight,
            backgroundColor: '#000a14',
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        })

        gameContainer.appendChild(app.canvas)
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.3)'
        app.canvas.style.borderRadius = '12px'
        app.canvas.style.boxShadow = '0 0 30px rgba(6, 182, 212, 0.3)'

        const boardGraphic = new Graphics()
        app.stage.addChild(boardGraphic)

        const objectContainer = new Container()
        app.stage.addChild(objectContainer)

        const playerGraphic = new Graphics()
        app.stage.addChild(playerGraphic)

        const rendererState = {
            app,
            stage: app.stage,
            boardGraphic,
            objectContainer,
            playerGraphic,
            objectGraphics: new Map<string, Graphics>(),
        }
        renderBoard(rendererState, config)

        return rendererState
    } catch (error) {
        gameContainer.innerHTML = ''
        throw new Error(`Failed to initialize PixiJS: ${error}`)
    }
}

export function renderBoard(
    rendererState: RendererState,
    config: GameConfig
): void {
    const { boardGraphic } = rendererState
    boardGraphic.clear()

    boardGraphic.rect(0, 0, config.canvasWidth, config.canvasHeight).fill({
        color: 0x001122,
        alpha: 0.45,
    })

    const gridSize = 40
    for (let x = 0; x <= config.canvasWidth; x += gridSize) {
        boardGraphic.moveTo(x, 0).lineTo(x, config.canvasHeight).stroke({
            color: 0x0ea5e9,
            width: 1,
            alpha: 0.12,
        })
    }
    for (let y = 0; y <= config.canvasHeight; y += gridSize) {
        boardGraphic.moveTo(0, y).lineTo(config.canvasWidth, y).stroke({
            color: 0x0ea5e9,
            width: 1,
            alpha: 0.12,
        })
    }

    boardGraphic
        .rect(1, 1, config.canvasWidth - 2, config.canvasHeight - 2)
        .stroke({
            color: 0x06b6d4,
            width: 2,
            alpha: 0.35,
        })
}

export function renderPlayer(
    rendererState: RendererState,
    player: GameState['player'],
    config: GameConfig
): void {
    const { playerGraphic } = rendererState
    playerGraphic.clear()

    // Draw player as a rectangle at current position
    const playerWidth = config.playerSize
    const playerHeight = config.playerSize
    playerGraphic
        .rect(
            player.x - playerWidth / 2,
            player.y - playerHeight / 2,
            playerWidth,
            playerHeight
        )
        .fill(0x00ff00) // Green for player
        .stroke({ color: 0x00ff00, width: 2 })
}

export function renderObjects(
    rendererState: RendererState,
    objects: GameObject[],
    config: GameConfig
): void {
    const { objectContainer, objectGraphics } = rendererState

    // Remove old graphics
    objectGraphics.forEach((graphic: Graphics, id: string) => {
        if (!objects.find(obj => obj.id === id)) {
            objectContainer.removeChild(graphic)
            objectGraphics.delete(id)
        }
    })

    objects.forEach(obj => {
        let objectGraphic = objectGraphics.get(obj.id)
        if (!objectGraphic) {
            objectGraphic = new Graphics()
            objectContainer.addChild(objectGraphic)
            objectGraphics.set(obj.id, objectGraphic)
        }

        objectGraphic.clear()
        objectGraphic.x = obj.x
        objectGraphic.y = obj.y

        const radius = config.objectSize / 2

        if (obj.type === 'coin') {
            const coinGradient = new FillGradient(0, -radius, 0, radius)
            coinGradient.addColorStop(0, 0xffd700)
            coinGradient.addColorStop(0.5, 0xffed4e)
            coinGradient.addColorStop(1, 0xffa500)

            objectGraphic.circle(0, 0, radius).fill(coinGradient).stroke({
                color: 0xffd700,
                width: 2,
            })
        } else {
            const bombGradient = new FillGradient(0, -radius, 0, radius)
            bombGradient.addColorStop(0, 0xff4444)
            bombGradient.addColorStop(0.5, 0xff0000)
            bombGradient.addColorStop(1, 0xcc0000)

            objectGraphic.circle(0, 0, radius).fill(bombGradient).stroke({
                color: 0xff0000,
                width: 2,
            })
        }
    })
}

export function cleanup(rendererState: RendererState): void {
    const { app, objectGraphics } = rendererState

    objectGraphics.clear()

    app.destroy(true, { children: true, texture: true })
}
