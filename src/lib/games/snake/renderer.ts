// PixiJS rendering for Snake
import { Application, Container, Graphics } from 'pixi.js'
import type { GameState, GameConstants, SnakeSegment, Food } from './types'

export interface RendererState {
    app: Application
    stage: Container
    gameContainer: Container
    gridContainer: Container
    graphics: Graphics[]
}

export async function setupPixiJS(
    gameContainer: HTMLElement,
    constants: GameConstants
): Promise<RendererState> {
    try {
        // Create PixiJS application
        const app = new Application()

        await app.init({
            width: constants.GAME_WIDTH,
            height: constants.GAME_HEIGHT,
            backgroundColor: constants.BACKGROUND_COLOR,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        })

        // Add the canvas to the DOM
        gameContainer.appendChild(app.canvas)
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.5)'
        app.canvas.style.borderRadius = '8px'

        // Create containers for organized rendering
        const gridContainer = new Container()
        const gameObjectContainer = new Container()

        app.stage.addChild(gridContainer)
        app.stage.addChild(gameObjectContainer)

        return {
            app,
            stage: app.stage,
            gameContainer: gameObjectContainer,
            gridContainer,
            graphics: [],
        }
    } catch (error) {
        // Clear the container if we failed to initialize
        while (gameContainer.firstChild) {
            gameContainer.removeChild(gameContainer.firstChild)
        }

        // Create error message element using DOM APIs
        const errorDiv = document.createElement('div')
        errorDiv.className = 'text-red-400 text-center p-4'
        errorDiv.textContent =
            'Failed to initialize game renderer. Please check if your browser supports WebGL.'
        gameContainer.appendChild(errorDiv)

        throw error
    }
}

export function clearPixiJS(renderer: RendererState): void {
    // Clear all graphics from containers
    renderer.gameContainer.removeChildren()

    // Reset graphics array
    renderer.graphics.forEach(graphic => graphic.destroy())
    renderer.graphics.length = 0
}

export function drawGrid(
    renderer: RendererState,
    constants: GameConstants
): void {
    const gridGraphic = new Graphics()
    gridGraphic.alpha = 0.15

    // Vertical lines
    for (let x = 0; x <= constants.GRID_WIDTH; x++) {
        gridGraphic.moveTo(x * constants.CELL_SIZE, 0)
        gridGraphic.lineTo(x * constants.CELL_SIZE, constants.GAME_HEIGHT)
    }

    // Horizontal lines
    for (let y = 0; y <= constants.GRID_HEIGHT; y++) {
        gridGraphic.moveTo(0, y * constants.CELL_SIZE)
        gridGraphic.lineTo(constants.GAME_WIDTH, y * constants.CELL_SIZE)
    }

    gridGraphic.stroke({ width: 1, color: constants.GRID_COLOR })
    renderer.gridContainer.addChild(gridGraphic)
}

export function drawSnakeSegment(
    renderer: RendererState,
    segment: SnakeSegment,
    isHead: boolean,
    constants: GameConstants
): void {
    const graphic = new Graphics()
    const x = segment.x * constants.CELL_SIZE
    const y = segment.y * constants.CELL_SIZE
    const padding = 2

    // Draw rounded rectangle for segment
    graphic.roundRect(
        x + padding,
        y + padding,
        constants.CELL_SIZE - padding * 2,
        constants.CELL_SIZE - padding * 2,
        4
    )
    graphic.fill(constants.SNAKE_COLOR)

    // Add glow effect for head
    if (isHead) {
        graphic.roundRect(
            x + padding,
            y + padding,
            constants.CELL_SIZE - padding * 2,
            constants.CELL_SIZE - padding * 2,
            4
        )
        graphic.stroke({ width: 2, color: 0xffffff, alpha: 0.8 })
    }

    renderer.gameContainer.addChild(graphic)
    renderer.graphics.push(graphic)
}

export function drawFood(
    renderer: RendererState,
    food: Food,
    constants: GameConstants
): void {
    const graphic = new Graphics()
    const x = food.x * constants.CELL_SIZE + constants.CELL_SIZE / 2
    const y = food.y * constants.CELL_SIZE + constants.CELL_SIZE / 2
    const radius = constants.CELL_SIZE / 2 - 3

    // Draw circle for food
    graphic.circle(x, y, radius)
    graphic.fill(constants.FOOD_COLOR)

    // Add pulse effect
    graphic.circle(x, y, radius)
    graphic.stroke({ width: 2, color: 0xffffff, alpha: 0.5 })

    renderer.gameContainer.addChild(graphic)
    renderer.graphics.push(graphic)
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

    // Draw snake
    state.snake.forEach((segment, index) => {
        drawSnakeSegment(renderer, segment, index === 0, constants)
    })

    // Draw food
    if (state.food) {
        drawFood(renderer, state.food, constants)
    }

    // Reset the redraw flag
    state.needsRedraw = false
}
