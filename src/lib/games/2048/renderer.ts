// PixiJS rendering for 2048 Game

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import {
    type GameState,
    type Animation,
    type Position,
    GAME_CONSTANTS,
} from './types'
import { getTileColor, getTileTextColor, getTileFontSize } from './utils'

export interface RendererState {
    app: Application
    stage: Container
    boardContainer: Container
    tilesContainer: Container
    tileSprites: Map<string, Container>
}

/**
 * Calculate board dimensions
 */
function getBoardDimensions(): { width: number; height: number } {
    const { BOARD_SIZE, TILE_SIZE, GAP } = GAME_CONSTANTS
    const size = BOARD_SIZE * (TILE_SIZE + GAP) + GAP
    return { width: size, height: size }
}

/**
 * Initialize PixiJS application
 */
export async function setupPixiJS(
    gameContainer: HTMLElement
): Promise<RendererState> {
    try {
        const { width, height } = getBoardDimensions()

        const app = new Application()

        await app.init({
            width,
            height,
            backgroundColor: '#0f172a', // Slate-900 for sci-fi feel
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        })

        // Add the canvas to the DOM
        gameContainer.appendChild(app.canvas)
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.5)'
        app.canvas.style.borderRadius = '8px'
        app.canvas.style.display = 'block'

        // Create containers
        const boardContainer = new Container()
        const tilesContainer = new Container()

        app.stage.addChild(boardContainer)
        app.stage.addChild(tilesContainer)

        return {
            app,
            stage: app.stage,
            boardContainer,
            tilesContainer,
            tileSprites: new Map(),
        }
    } catch (error) {
        while (gameContainer.firstChild) {
            gameContainer.removeChild(gameContainer.firstChild)
        }

        const errorDiv = document.createElement('div')
        errorDiv.className = 'text-red-400 text-center p-4'
        errorDiv.textContent =
            'Failed to initialize game renderer. Please check if your browser supports WebGL.'
        gameContainer.appendChild(errorDiv)

        throw error
    }
}

/**
 * Draw the background grid
 */
export function drawBoard(renderer: RendererState): void {
    renderer.boardContainer.removeChildren()

    const { BOARD_SIZE, TILE_SIZE, GAP } = GAME_CONSTANTS
    const gridGraphic = new Graphics()

    // Draw background
    const { width, height } = getBoardDimensions()
    gridGraphic.roundRect(0, 0, width, height, 8)
    gridGraphic.fill(0x1e293b) // Slate-800

    // Draw cell backgrounds
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const x = col * (TILE_SIZE + GAP) + GAP
            const y = row * (TILE_SIZE + GAP) + GAP

            gridGraphic.roundRect(x, y, TILE_SIZE, TILE_SIZE, 6)
            gridGraphic.fill(0x334155) // Slate-700
        }
    }

    renderer.boardContainer.addChild(gridGraphic)
}

/**
 * Create a tile sprite
 */
function createTileSprite(value: number, position: Position): Container {
    const { TILE_SIZE, GAP } = GAME_CONSTANTS
    const container = new Container()

    // Calculate pixel position
    const x = position.col * (TILE_SIZE + GAP) + GAP
    const y = position.row * (TILE_SIZE + GAP) + GAP

    container.position.set(x + TILE_SIZE / 2, y + TILE_SIZE / 2)
    container.pivot.set(TILE_SIZE / 2, TILE_SIZE / 2)

    // Create tile background
    const background = new Graphics()
    background.roundRect(0, 0, TILE_SIZE, TILE_SIZE, 6)
    background.fill(getTileColor(value))

    // Add glow effect for higher values
    if (value >= 128) {
        background.roundRect(-2, -2, TILE_SIZE + 4, TILE_SIZE + 4, 8)
        background.fill({ color: getTileColor(value), alpha: 0.3 })
    }

    container.addChild(background)

    // Create text
    const textStyle = new TextStyle({
        fontFamily: 'Inter, Arial, sans-serif',
        fontSize: getTileFontSize(value),
        fontWeight: 'bold',
        fill: getTileTextColor(value),
    })

    const text = new Text({ text: value.toString(), style: textStyle })
    text.anchor.set(0.5)
    text.position.set(TILE_SIZE / 2, TILE_SIZE / 2)
    container.addChild(text)

    return container
}

/**
 * Draw all tiles on the board
 */
export function drawTiles(renderer: RendererState, state: GameState): void {
    // Clear existing tiles
    renderer.tilesContainer.removeChildren()
    renderer.tileSprites.clear()

    const { BOARD_SIZE } = GAME_CONSTANTS

    // Draw each tile
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const tile = state.board[row][col]
            if (tile) {
                const sprite = createTileSprite(tile.value, { row, col })
                renderer.tilesContainer.addChild(sprite)
                renderer.tileSprites.set(tile.id, sprite)
            }
        }
    }
}

/**
 * Animate tile movement
 */
export function animateTileMove(
    renderer: RendererState,
    tileId: string,
    from: Position,
    to: Position,
    duration: number = GAME_CONSTANTS.ANIMATION_DURATION
): Promise<void> {
    return new Promise(resolve => {
        const sprite = renderer.tileSprites.get(tileId)
        if (!sprite) {
            resolve()
            return
        }

        const { TILE_SIZE, GAP } = GAME_CONSTANTS
        const startX = from.col * (TILE_SIZE + GAP) + GAP + TILE_SIZE / 2
        const startY = from.row * (TILE_SIZE + GAP) + GAP + TILE_SIZE / 2
        const endX = to.col * (TILE_SIZE + GAP) + GAP + TILE_SIZE / 2
        const endY = to.row * (TILE_SIZE + GAP) + GAP + TILE_SIZE / 2

        sprite.position.set(startX, startY)

        const startTime = performance.now()

        function animate() {
            const elapsed = performance.now() - startTime
            const progress = Math.min(elapsed / duration, 1)

            // Ease out quad
            const eased = 1 - (1 - progress) * (1 - progress)

            sprite!.position.set(
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

/**
 * Animate tile merge (pop effect)
 */
export function animateTileMerge(
    renderer: RendererState,
    tileId: string,
    _position: Position,
    _value: number,
    duration: number = GAME_CONSTANTS.ANIMATION_DURATION
): Promise<void> {
    return new Promise(resolve => {
        const sprite = renderer.tileSprites.get(tileId)
        if (!sprite) {
            resolve()
            return
        }

        const startTime = performance.now()
        const originalScale = 1

        function animate() {
            const elapsed = performance.now() - startTime
            const progress = Math.min(elapsed / duration, 1)

            // Pop effect: scale up then back to normal
            let scale: number
            if (progress < 0.5) {
                // Scale up
                scale = originalScale + progress * 0.4
            } else {
                // Scale back down
                scale = originalScale + (1 - progress) * 0.4
            }

            sprite!.scale.set(scale)

            if (progress < 1) {
                requestAnimationFrame(animate)
            } else {
                sprite!.scale.set(originalScale)
                resolve()
            }
        }

        requestAnimationFrame(animate)
    })
}

/**
 * Animate tile spawn (fade in and scale up)
 */
export function animateTileSpawn(
    renderer: RendererState,
    tileId: string,
    _position: Position,
    duration: number = GAME_CONSTANTS.ANIMATION_DURATION
): Promise<void> {
    return new Promise(resolve => {
        const sprite = renderer.tileSprites.get(tileId)
        if (!sprite) {
            resolve()
            return
        }

        sprite.alpha = 0
        sprite.scale.set(0.5)

        const startTime = performance.now()

        function animate() {
            const elapsed = performance.now() - startTime
            const progress = Math.min(elapsed / duration, 1)

            // Ease out back
            const eased = 1 - Math.pow(1 - progress, 3)

            sprite!.alpha = eased
            sprite!.scale.set(0.5 + 0.5 * eased)

            if (progress < 1) {
                requestAnimationFrame(animate)
            } else {
                sprite!.alpha = 1
                sprite!.scale.set(1)
                resolve()
            }
        }

        requestAnimationFrame(animate)
    })
}

/**
 * Process and play animations
 */
export async function playAnimations(
    renderer: RendererState,
    animations: Animation[],
    state: GameState
): Promise<void> {
    // First, draw tiles at their final positions
    drawTiles(renderer, state)

    // Separate animations by type
    const moveAnimations = animations.filter(a => a.type === 'move')
    const mergeAnimations = animations.filter(a => a.type === 'merge')
    const spawnAnimations = animations.filter(a => a.type === 'spawn')

    // Play move animations
    const movePromises = moveAnimations.map(anim =>
        animateTileMove(renderer, anim.tileId, anim.from!, anim.to)
    )
    await Promise.all(movePromises)

    // Play merge animations
    const mergePromises = mergeAnimations.map(anim =>
        animateTileMerge(renderer, anim.tileId, anim.to, anim.value!)
    )
    await Promise.all(mergePromises)

    // Play spawn animations
    const spawnPromises = spawnAnimations.map(anim =>
        animateTileSpawn(renderer, anim.tileId, anim.to)
    )
    await Promise.all(spawnPromises)
}

/**
 * Main draw function - redraws the entire board
 */
export function draw(renderer: RendererState, state: GameState): void {
    drawBoard(renderer)
    drawTiles(renderer, state)
}

/**
 * Cleanup renderer
 */
export function destroyRenderer(renderer: RendererState): void {
    renderer.tilesContainer.removeChildren()
    renderer.boardContainer.removeChildren()
    renderer.tileSprites.clear()
    renderer.app.destroy(true, { children: true })
}
