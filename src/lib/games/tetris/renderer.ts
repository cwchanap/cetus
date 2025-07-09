// PixiJS rendering for Tetris
import { Application, Container, Graphics } from 'pixi.js'
import type { GameState, GameConstants, Piece } from './types'

export interface RendererState {
    app: Application
    stage: Container
    boardContainer: Container
    uiContainer: Container
    blockGraphics: Graphics[]
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
            backgroundColor: '#000000',
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        })

        // Add the canvas to the DOM
        gameContainer.appendChild(app.canvas)
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.5)'
        app.canvas.style.borderRadius = '8px'

        // Create containers for organized rendering
        const boardContainer = new Container()
        const uiContainer = new Container()

        app.stage.addChild(boardContainer)
        app.stage.addChild(uiContainer)

        return {
            app,
            stage: app.stage,
            boardContainer,
            uiContainer,
            blockGraphics: [],
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
    renderer.boardContainer.removeChildren()
    renderer.uiContainer.removeChildren()

    // Reset block graphics array
    renderer.blockGraphics.forEach(graphic => graphic.destroy())
    renderer.blockGraphics.length = 0
}

export function drawBlock(
    renderer: RendererState,
    x: number,
    y: number,
    color: number,
    constants: GameConstants
): void {
    const blockGraphic = new Graphics()

    // Draw main block
    blockGraphic.rect(x, y, constants.BLOCK_SIZE, constants.BLOCK_SIZE)
    blockGraphic.fill(color)

    // Draw white border
    blockGraphic.rect(x, y, constants.BLOCK_SIZE, constants.BLOCK_SIZE)
    blockGraphic.stroke({ width: 1, color: 0xffffff })

    renderer.boardContainer.addChild(blockGraphic)
    renderer.blockGraphics.push(blockGraphic)
}

export function drawBoard(
    renderer: RendererState,
    board: (number | null)[][],
    constants: GameConstants
): void {
    for (let row = 0; row < constants.BOARD_HEIGHT; row++) {
        for (let col = 0; col < constants.BOARD_WIDTH; col++) {
            if (board[row][col]) {
                const x = col * constants.BLOCK_SIZE
                const y = row * constants.BLOCK_SIZE
                drawBlock(renderer, x, y, board[row][col]!, constants)
            }
        }
    }
}

export function drawPiece(
    renderer: RendererState,
    piece: Piece,
    constants: GameConstants
): void {
    for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
            if (piece.shape[row][col]) {
                const x = (piece.x + col) * constants.BLOCK_SIZE
                const y = (piece.y + row) * constants.BLOCK_SIZE
                drawBlock(renderer, x, y, piece.color, constants)
            }
        }
    }
}

export function drawGrid(
    renderer: RendererState,
    constants: GameConstants
): void {
    const gridGraphic = new Graphics()
    gridGraphic.alpha = 0.3

    // Vertical lines
    for (let x = 0; x <= constants.BOARD_WIDTH; x++) {
        gridGraphic.moveTo(x * constants.BLOCK_SIZE, 0)
        gridGraphic.lineTo(x * constants.BLOCK_SIZE, constants.GAME_HEIGHT)
    }

    // Horizontal lines
    for (let y = 0; y <= constants.BOARD_HEIGHT; y++) {
        gridGraphic.moveTo(0, y * constants.BLOCK_SIZE)
        gridGraphic.lineTo(constants.GAME_WIDTH, y * constants.BLOCK_SIZE)
    }

    gridGraphic.stroke({ width: 1, color: 0x333333 })
    renderer.uiContainer.addChild(gridGraphic)
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

    // Draw grid
    drawGrid(renderer, constants)

    // Draw board
    drawBoard(renderer, state.board, constants)

    // Draw current piece
    if (state.currentPiece) {
        drawPiece(renderer, state.currentPiece, constants)
    }

    // Reset the redraw flag
    state.needsRedraw = false
}
