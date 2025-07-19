import { Application, Container, Graphics, Text, FillGradient } from 'pixi.js'
import type { GameObject, Cell, GameConfig } from './types'

export interface RendererState {
    app: Application
    stage: Container
    gridContainer: Container
    objectContainer: Container
    cellGraphics: Graphics[][]
    objectGraphics: Map<string, Graphics>
}

export async function setupPixiJS(
    gameContainer: HTMLElement,
    config: GameConfig
): Promise<RendererState> {
    try {
        const canvasSize = config.gridSize * config.cellSize + 40 // 20px padding on each side

        // Create PixiJS application
        const app = new Application()

        await app.init({
            width: canvasSize,
            height: canvasSize,
            backgroundColor: '#000a14',
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        })

        // Add the canvas to the DOM
        gameContainer.appendChild(app.canvas)
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.3)'
        app.canvas.style.borderRadius = '12px'
        app.canvas.style.boxShadow = '0 0 30px rgba(6, 182, 212, 0.3)'

        // Create containers for organized rendering
        const gridContainer = new Container()
        const objectContainer = new Container()

        // Add 20px offset for padding
        gridContainer.x = 20
        gridContainer.y = 20
        objectContainer.x = 20
        objectContainer.y = 20

        app.stage.addChild(gridContainer)
        app.stage.addChild(objectContainer)

        // Initialize cell graphics grid
        const cellGraphics: Graphics[][] = []
        for (let row = 0; row < config.gridSize; row++) {
            cellGraphics[row] = []
            for (let col = 0; col < config.gridSize; col++) {
                const cellGraphic = new Graphics()
                cellGraphic.x = col * config.cellSize
                cellGraphic.y = row * config.cellSize
                cellGraphics[row][col] = cellGraphic
                gridContainer.addChild(cellGraphic)
            }
        }

        return {
            app,
            stage: app.stage,
            gridContainer,
            objectContainer,
            cellGraphics,
            objectGraphics: new Map(),
        }
    } catch (error) {
        // Clear the container if we failed to initialize
        gameContainer.innerHTML = ''
        throw new Error(`Failed to initialize PixiJS: ${error}`)
    }
}

export function renderGrid(
    rendererState: RendererState,
    grid: Cell[][],
    config: GameConfig
): void {
    const { cellGraphics } = rendererState

    for (let row = 0; row < config.gridSize; row++) {
        for (let col = 0; col < config.gridSize; col++) {
            const cellGraphic = cellGraphics[row][col]
            cellGraphic.clear()

            // Draw cell background with subtle sci-fi styling
            cellGraphic
                .rect(0, 0, config.cellSize, config.cellSize)
                .fill({
                    color: 0x001122,
                    alpha: 0.3,
                })
                .stroke({
                    color: 0x0ea5e9,
                    width: 1,
                    alpha: 0.2,
                })
        }
    }
}

export function renderObject(
    rendererState: RendererState,
    object: GameObject,
    config: GameConfig
): void {
    const { objectContainer, objectGraphics } = rendererState

    // Remove existing graphic if it exists
    if (objectGraphics.has(object.id)) {
        const existingGraphic = objectGraphics.get(object.id)!
        objectContainer.removeChild(existingGraphic)
        objectGraphics.delete(object.id)
    }

    if (!object.isActive) {
        return
    }

    const objectGraphic = new Graphics()
    const centerX = object.cell.col * config.cellSize + config.cellSize / 2
    const centerY = object.cell.row * config.cellSize + config.cellSize / 2
    const radius = Math.min(config.cellSize * 0.35, 20)

    objectGraphic.x = centerX
    objectGraphic.y = centerY

    if (object.type === 'coin') {
        // Draw golden coin with gradient and glow effect
        const coinGradient = new FillGradient(0, -radius, 0, radius)
        coinGradient.addColorStop(0, 0xffd700) // Gold
        coinGradient.addColorStop(0.5, 0xffed4e) // Lighter gold
        coinGradient.addColorStop(1, 0xffa500) // Orange gold

        // Outer glow
        objectGraphic.circle(0, 0, radius + 3).fill({
            color: 0xffd700,
            alpha: 0.3,
        })

        // Main coin body
        objectGraphic.circle(0, 0, radius).fill(coinGradient).stroke({
            color: 0xffd700,
            width: 2,
        })

        // Inner highlight
        objectGraphic.circle(-radius * 0.3, -radius * 0.3, radius * 0.4).fill({
            color: 0xffff99,
            alpha: 0.6,
        })

        // Dollar sign
        const dollarText = new Text({
            text: '$',
            style: {
                fontSize: radius * 0.8,
                fill: 0x000000,
                fontWeight: 'bold',
                fontFamily: 'Arial',
            },
        })
        dollarText.anchor.set(0.5)
        objectGraphic.addChild(dollarText)
    } else {
        // Draw red bomb with warning styling
        const bombGradient = new FillGradient(0, -radius, 0, radius)
        bombGradient.addColorStop(0, 0xff4444) // Light red
        bombGradient.addColorStop(0.5, 0xff0000) // Red
        bombGradient.addColorStop(1, 0xcc0000) // Dark red

        // Outer glow/danger aura
        objectGraphic.circle(0, 0, radius + 4).fill({
            color: 0xff0000,
            alpha: 0.4,
        })

        // Main bomb body
        objectGraphic.circle(0, 0, radius).fill(bombGradient).stroke({
            color: 0xff0000,
            width: 2,
        })

        // Bomb fuse
        objectGraphic.rect(-1, -radius - 8, 2, 8).fill(0x8b4513)

        // Fuse spark
        objectGraphic.circle(0, -radius - 8, 2).fill(0xffff00)

        // Warning symbol (!)
        const warningText = new Text({
            text: '!',
            style: {
                fontSize: radius * 0.9,
                fill: 0xffffff,
                fontWeight: 'bold',
                fontFamily: 'Arial',
            },
        })
        warningText.anchor.set(0.5)
        objectGraphic.addChild(warningText)
    }

    // Add pulsing animation based on remaining lifetime
    const now = Date.now()
    const timeLeft = object.expirationTime - now
    const totalLifetime = config.objectLifetime * 1000
    const lifetimeRatio = timeLeft / totalLifetime

    // Start pulsing when 50% lifetime remains
    if (lifetimeRatio < 0.5) {
        const pulseSpeed = (0.5 - lifetimeRatio) * 10 // Faster as time runs out
        const pulse = Math.sin(now * pulseSpeed * 0.01) * 0.2 + 1
        objectGraphic.scale.set(pulse)
    }

    objectContainer.addChild(objectGraphic)
    objectGraphics.set(object.id, objectGraphic)
}

export function removeObject(
    rendererState: RendererState,
    objectId: string
): void {
    const { objectContainer, objectGraphics } = rendererState

    if (objectGraphics.has(objectId)) {
        const graphic = objectGraphics.get(objectId)!
        objectContainer.removeChild(graphic)
        objectGraphics.delete(objectId)
    }
}

export function showClickEffect(
    rendererState: RendererState,
    row: number,
    col: number,
    config: GameConfig,
    isPositive: boolean
): void {
    const { objectContainer } = rendererState

    const effectGraphic = new Graphics()
    const centerX = col * config.cellSize + config.cellSize / 2
    const centerY = row * config.cellSize + config.cellSize / 2

    effectGraphic.x = centerX
    effectGraphic.y = centerY

    // Draw click effect
    const color = isPositive ? 0x00ff00 : 0xff0000
    const radius = config.cellSize * 0.6

    effectGraphic.circle(0, 0, radius).fill({
        color,
        alpha: 0.5,
    })

    objectContainer.addChild(effectGraphic)

    // Animate and remove effect
    let scale = 0.5
    let alpha = 0.8

    const animate = () => {
        scale += 0.1
        alpha -= 0.1

        effectGraphic.scale.set(scale)
        effectGraphic.alpha = alpha

        if (alpha <= 0) {
            objectContainer.removeChild(effectGraphic)
        } else {
            requestAnimationFrame(animate)
        }
    }

    requestAnimationFrame(animate)
}

export function getCellFromPosition(
    x: number,
    y: number,
    config: GameConfig
): { row: number; col: number } | null {
    const padding = 20
    const adjustedX = x - padding
    const adjustedY = y - padding

    if (adjustedX < 0 || adjustedY < 0) {
        return null
    }

    const col = Math.floor(adjustedX / config.cellSize)
    const row = Math.floor(adjustedY / config.cellSize)

    if (
        row >= 0 &&
        row < config.gridSize &&
        col >= 0 &&
        col < config.gridSize
    ) {
        return { row, col }
    }

    return null
}

export function cleanup(rendererState: RendererState): void {
    const { app, objectGraphics } = rendererState

    // Clear all object graphics
    objectGraphics.clear()

    // Destroy the PixiJS application
    app.destroy(true, { children: true, texture: true })
}
