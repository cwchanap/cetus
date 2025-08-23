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

        const objectContainer = new Container()
        app.stage.addChild(objectContainer)

        const playerGraphic = new Graphics()
        app.stage.addChild(playerGraphic)

        return {
            app,
            stage: app.stage,
            objectContainer,
            playerGraphic,
            objectGraphics: new Map<string, Graphics>(),
        }
    } catch (error) {
        gameContainer.innerHTML = ''
        throw new Error(`Failed to initialize PixiJS: ${error}`)
    }
}

export function renderPlayer(
    rendererState: RendererState,
    player: GameState['player'],
    config: GameConfig
): void {
    const { playerGraphic } = rendererState
    playerGraphic.clear()

    // Draw player as a rectangle on the left side
    const playerWidth = config.playerSize
    const playerHeight = config.playerSize
    playerGraphic
        .rect(0, player.y - playerHeight / 2, playerWidth, playerHeight)
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
