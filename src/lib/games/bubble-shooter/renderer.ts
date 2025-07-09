// PixiJS rendering for Bubble Shooter
import { Application, Container, Graphics } from 'pixi.js'
import type { GameState, GameConstants, Position } from './types'

export interface RendererState {
    app: Application
    stage: Container
    gridContainer: Container
    uiContainer: Container
    bubbleGraphics: Graphics[]
}

export async function setupPixiJS(
    gameContainer: HTMLElement,
    constants: GameConstants
): Promise<RendererState> {
    try {
        // Create PixiJS application - using exact same pattern as working drawing page
        const app = new Application()

        await app.init({
            width: constants.GAME_WIDTH,
            height: constants.GAME_HEIGHT,
            backgroundColor: '#000000',
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        })

        // Add the canvas to the DOM - same as drawing page
        gameContainer.appendChild(app.canvas)
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.5)'
        app.canvas.style.borderRadius = '8px'

        // Create containers for organized rendering
        const gridContainer = new Container()
        const uiContainer = new Container()

        app.stage.addChild(gridContainer)
        app.stage.addChild(uiContainer)

        return {
            app,
            stage: app.stage,
            gridContainer,
            uiContainer,
            bubbleGraphics: [],
        }
    } catch (error) {
        // Clear the container if we failed to initialize
        gameContainer.innerHTML =
            '<div class="text-red-400 text-center p-4">Failed to initialize game renderer. Please check if your browser supports WebGL.</div>'
        throw error
    }
}

export function clearPixiJS(renderer: RendererState): void {
    // Clear all graphics from containers
    renderer.gridContainer.removeChildren()
    renderer.uiContainer.removeChildren()

    // Reset bubble graphics array
    renderer.bubbleGraphics.forEach(graphic => graphic.destroy())
    renderer.bubbleGraphics = []
}

export function drawBubble(
    renderer: RendererState,
    x: number,
    y: number,
    color: number,
    constants: GameConstants
): void {
    const bubbleGraphic = new Graphics()

    // Draw main bubble
    bubbleGraphic.circle(x, y, constants.BUBBLE_RADIUS)
    bubbleGraphic.fill(color)

    // Draw white border
    bubbleGraphic.circle(x, y, constants.BUBBLE_RADIUS)
    bubbleGraphic.stroke({ width: 2, color: 0xffffff })

    // Draw highlight
    bubbleGraphic.circle(
        x - constants.BUBBLE_RADIUS * 0.3,
        y - constants.BUBBLE_RADIUS * 0.3,
        constants.BUBBLE_RADIUS * 0.3
    )
    bubbleGraphic.fill({ color: 0xffffff, alpha: 0.3 })

    renderer.gridContainer.addChild(bubbleGraphic)
    renderer.bubbleGraphics.push(bubbleGraphic)
}

export function drawCurrentBubble(
    renderer: RendererState,
    state: GameState,
    constants: GameConstants
): void {
    if (!state.currentBubble) {
        return
    }

    const bubbleGraphic = new Graphics()

    // Draw main bubble
    bubbleGraphic.circle(
        state.currentBubble.x,
        state.currentBubble.y,
        constants.BUBBLE_RADIUS
    )
    bubbleGraphic.fill(state.currentBubble.color)

    // Draw white border (thicker for current bubble)
    bubbleGraphic.circle(
        state.currentBubble.x,
        state.currentBubble.y,
        constants.BUBBLE_RADIUS
    )
    bubbleGraphic.stroke({ width: 3, color: 0xffffff })

    // Draw highlight
    bubbleGraphic.circle(
        state.currentBubble.x - constants.BUBBLE_RADIUS * 0.3,
        state.currentBubble.y - constants.BUBBLE_RADIUS * 0.3,
        constants.BUBBLE_RADIUS * 0.25
    )
    bubbleGraphic.fill({ color: 0xffffff, alpha: 0.5 })

    renderer.uiContainer.addChild(bubbleGraphic)
}

export function drawShooter(
    renderer: RendererState,
    shooter: Position,
    constants: GameConstants
): void {
    const shooterGraphic = new Graphics()

    // Draw shooter base
    shooterGraphic.circle(shooter.x, shooter.y, constants.BUBBLE_RADIUS * 0.8)
    shooterGraphic.fill(0x333333)

    // Draw white border
    shooterGraphic.circle(shooter.x, shooter.y, constants.BUBBLE_RADIUS * 0.8)
    shooterGraphic.stroke({ width: 2, color: 0xffffff })

    renderer.uiContainer.addChild(shooterGraphic)
}

export function drawAimLine(
    renderer: RendererState,
    shooter: Position,
    aimAngle: number
): void {
    const aimLineGraphic = new Graphics()
    const length = 80
    const endX = shooter.x + Math.cos(aimAngle) * length
    const endY = shooter.y + Math.sin(aimAngle) * length

    // Draw aim line
    aimLineGraphic.moveTo(shooter.x, shooter.y)
    aimLineGraphic.lineTo(endX, endY)
    aimLineGraphic.stroke({ width: 2, color: 0xffffff, alpha: 0.7 })

    // Draw arrow head
    const arrowSize = 10
    const arrowAngle = 0.5
    const leftX = endX + Math.cos(aimAngle + Math.PI - arrowAngle) * arrowSize
    const leftY = endY + Math.sin(aimAngle + Math.PI - arrowAngle) * arrowSize
    const rightX = endX + Math.cos(aimAngle + Math.PI + arrowAngle) * arrowSize
    const rightY = endY + Math.sin(aimAngle + Math.PI + arrowAngle) * arrowSize

    aimLineGraphic.poly([
        { x: endX, y: endY },
        { x: leftX, y: leftY },
        { x: rightX, y: rightY },
    ])
    aimLineGraphic.fill({ color: 0xffffff, alpha: 0.7 })

    renderer.uiContainer.addChild(aimLineGraphic)
}

export function drawProjectile(
    renderer: RendererState,
    state: GameState,
    constants: GameConstants
): void {
    if (!state.projectile) {
        return
    }

    const projectileGraphic = new Graphics()

    // Draw main projectile
    projectileGraphic.circle(
        state.projectile.x,
        state.projectile.y,
        constants.BUBBLE_RADIUS
    )
    projectileGraphic.fill(state.projectile.color)

    // Draw white border
    projectileGraphic.circle(
        state.projectile.x,
        state.projectile.y,
        constants.BUBBLE_RADIUS
    )
    projectileGraphic.stroke({ width: 2, color: 0xffffff })

    // Draw highlight
    projectileGraphic.circle(
        state.projectile.x - constants.BUBBLE_RADIUS * 0.3,
        state.projectile.y - constants.BUBBLE_RADIUS * 0.3,
        constants.BUBBLE_RADIUS * 0.3
    )
    projectileGraphic.fill({ color: 0xffffff, alpha: 0.3 })

    renderer.uiContainer.addChild(projectileGraphic)
}

export function draw(
    renderer: RendererState,
    state: GameState,
    constants: GameConstants
): void {
    // Only redraw if something has changed
    if (!state.needsRedraw) {
        return
    }

    clearPixiJS(renderer)

    // Draw grid bubbles
    for (let row = 0; row < state.grid.length; row++) {
        if (!state.grid[row]) {
            continue
        }
        for (let col = 0; col < state.grid[row].length; col++) {
            const bubble = state.grid[row][col]
            if (bubble) {
                drawBubble(
                    renderer,
                    bubble.x,
                    bubble.y,
                    bubble.color,
                    constants
                )
            }
        }
    }

    if (state.currentBubble && !state.projectile) {
        drawCurrentBubble(renderer, state, constants)
    }

    if (
        !state.projectile &&
        state.gameStarted &&
        !state.gameOver &&
        !state.paused &&
        state.currentBubble
    ) {
        drawAimLine(renderer, state.currentBubble, state.aimAngle)
    }

    if (state.projectile) {
        drawProjectile(renderer, state, constants)
    }

    // Shooter ball removed - current bubble is now visible above

    // Reset the redraw flag
    state.needsRedraw = false
}
