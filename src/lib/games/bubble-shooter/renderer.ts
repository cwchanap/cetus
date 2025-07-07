// Canvas 2D rendering for Bubble Shooter
import type { GameState, GameConstants, Position } from './types'

export interface RendererState {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
    width: number
    height: number
}

export function setupCanvas(
    gameContainer: HTMLElement,
    constants: GameConstants
): RendererState {
    try {
        // Create canvas element
        const canvas = document.createElement('canvas')
        canvas.width = constants.GAME_WIDTH
        canvas.height = constants.GAME_HEIGHT
        canvas.style.border = '2px solid rgba(6, 182, 212, 0.5)'
        canvas.style.borderRadius = '8px'
        canvas.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'

        const ctx = canvas.getContext('2d')
        if (!ctx) {
            throw new Error('Failed to get 2D rendering context')
        }

        // Set up canvas properties
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        // Append canvas to container
        gameContainer.appendChild(canvas)

        console.log('Canvas 2D renderer initialized successfully')

        return {
            canvas,
            ctx,
            width: constants.GAME_WIDTH,
            height: constants.GAME_HEIGHT,
        }
    } catch (error) {
        console.error('Failed to initialize Canvas renderer:', error)
        throw error
    }
}

export function clearCanvas(renderer: RendererState): void {
    // Clear the entire canvas
    renderer.ctx.clearRect(0, 0, renderer.width, renderer.height)
}

export function drawBubble(
    renderer: RendererState,
    x: number,
    y: number,
    color: number,
    constants: GameConstants
): void {
    const ctx = renderer.ctx

    // Convert PixiJS color to CSS color
    const hexColor = '#' + color.toString(16).padStart(6, '0')

    // Draw main bubble
    ctx.beginPath()
    ctx.arc(x, y, constants.BUBBLE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = hexColor
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw highlight
    ctx.beginPath()
    ctx.arc(
        x - constants.BUBBLE_RADIUS * 0.3,
        y - constants.BUBBLE_RADIUS * 0.3,
        constants.BUBBLE_RADIUS * 0.3,
        0,
        Math.PI * 2
    )
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.fill()
}

export function drawCurrentBubble(
    renderer: RendererState,
    state: GameState,
    constants: GameConstants
): void {
    if (!state.currentBubble) {
        return
    }

    const ctx = renderer.ctx
    const hexColor =
        '#' + state.currentBubble.color.toString(16).padStart(6, '0')

    // Draw main bubble
    ctx.beginPath()
    ctx.arc(
        state.currentBubble.x,
        state.currentBubble.y,
        constants.BUBBLE_RADIUS,
        0,
        Math.PI * 2
    )
    ctx.fillStyle = hexColor
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    ctx.stroke()

    // Draw highlight
    ctx.beginPath()
    ctx.arc(
        state.currentBubble.x - constants.BUBBLE_RADIUS * 0.3,
        state.currentBubble.y - constants.BUBBLE_RADIUS * 0.3,
        constants.BUBBLE_RADIUS * 0.25,
        0,
        Math.PI * 2
    )
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.fill()
}

export function drawShooter(
    renderer: RendererState,
    shooter: Position,
    constants: GameConstants
): void {
    const ctx = renderer.ctx

    // Draw shooter base
    ctx.beginPath()
    ctx.arc(shooter.x, shooter.y, constants.BUBBLE_RADIUS * 0.8, 0, Math.PI * 2)
    ctx.fillStyle = '#333333'
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
}

export function drawAimLine(
    renderer: RendererState,
    shooter: Position,
    aimAngle: number
): void {
    const ctx = renderer.ctx
    const length = 80
    const endX = shooter.x + Math.cos(aimAngle) * length
    const endY = shooter.y + Math.sin(aimAngle) * length

    // Draw aim line
    ctx.beginPath()
    ctx.moveTo(shooter.x, shooter.y)
    ctx.lineTo(endX, endY)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw arrow head
    const arrowSize = 10
    const arrowAngle = 0.5
    const leftX = endX + Math.cos(aimAngle + Math.PI - arrowAngle) * arrowSize
    const leftY = endY + Math.sin(aimAngle + Math.PI - arrowAngle) * arrowSize
    const rightX = endX + Math.cos(aimAngle + Math.PI + arrowAngle) * arrowSize
    const rightY = endY + Math.sin(aimAngle + Math.PI + arrowAngle) * arrowSize

    ctx.beginPath()
    ctx.moveTo(endX, endY)
    ctx.lineTo(leftX, leftY)
    ctx.lineTo(rightX, rightY)
    ctx.closePath()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.fill()
}

export function drawProjectile(
    renderer: RendererState,
    state: GameState,
    constants: GameConstants
): void {
    if (!state.projectile) {
        return
    }

    const ctx = renderer.ctx
    const hexColor = '#' + state.projectile.color.toString(16).padStart(6, '0')

    // Draw main projectile
    ctx.beginPath()
    ctx.arc(
        state.projectile.x,
        state.projectile.y,
        constants.BUBBLE_RADIUS,
        0,
        Math.PI * 2
    )
    ctx.fillStyle = hexColor
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw highlight
    ctx.beginPath()
    ctx.arc(
        state.projectile.x - constants.BUBBLE_RADIUS * 0.3,
        state.projectile.y - constants.BUBBLE_RADIUS * 0.3,
        constants.BUBBLE_RADIUS * 0.3,
        0,
        Math.PI * 2
    )
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.fill()
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

    clearCanvas(renderer)

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
        !state.paused
    ) {
        drawAimLine(renderer, state.shooter, state.aimAngle)
    }

    if (state.projectile) {
        drawProjectile(renderer, state, constants)
    }

    drawShooter(renderer, state.shooter, constants)

    // Reset the redraw flag
    state.needsRedraw = false
}

export { setupCanvas as setupPixiJS }
