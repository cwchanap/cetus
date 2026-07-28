import { Application, Graphics } from 'pixi.js'
import type { CellType, Direction, IceSlideState } from './types'

export interface RendererState {
    app: Application
    gridGraphic: Graphics
    cellSize: number
}

const BACKGROUND = '#041018'
const COLORS: Record<CellType, number> = {
    wall: 0x1e293b,
    ice: 0x0e7490,
    start: 0x0e7490,
    goal: 0x22c55e,
    rock: 0x64748b,
    hazard: 0x7f1d1d,
    crystal: 0x67e8f9,
}

const PLAYER_COLOR = 0xf0f9ff
const PATH_COLOR = 0x38bdf8

export async function setupPixiJS(
    container: HTMLElement,
    rows: number,
    cols: number,
    cellSize: number
): Promise<RendererState> {
    let app: Application | undefined
    try {
        app = new Application()
        await app.init({
            width: cols * cellSize,
            height: rows * cellSize,
            backgroundColor: BACKGROUND,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        })

        container.appendChild(app.canvas)
        app.canvas.style.border = '2px solid rgba(111, 227, 255, 0.35)'
        app.canvas.style.borderRadius = '12px'
        app.canvas.style.boxShadow = '0 0 30px rgba(111, 227, 255, 0.25)'
        app.canvas.style.touchAction = 'none'
        app.canvas.style.maxWidth = '100%'
        app.canvas.style.height = 'auto'

        const gridGraphic = new Graphics()
        app.stage.addChild(gridGraphic)

        return { app, gridGraphic, cellSize }
    } catch (error) {
        app?.destroy()
        while (container.firstChild) {
            container.removeChild(container.firstChild)
        }
        throw new Error(`Failed to initialize PixiJS: ${error}`)
    }
}

export function renderGrid(
    renderer: RendererState,
    state: IceSlideState
): void {
    const { gridGraphic: g, cellSize } = renderer
    g.clear()

    for (let row = 0; row < state.rows; row++) {
        for (let col = 0; col < state.cols; col++) {
            const cell = state.grid[row][col]
            const x = col * cellSize
            const y = row * cellSize
            drawCell(g, cell, x, y, cellSize)
        }
    }

    // Slide trail highlight
    for (const pos of state.lastSlidePath) {
        g.rect(
            pos.col * cellSize + 4,
            pos.row * cellSize + 4,
            cellSize - 8,
            cellSize - 8
        ).stroke({ color: PATH_COLOR, width: 2, alpha: 0.45 })
    }

    // Player
    const px = state.player.col * cellSize + cellSize / 2
    const py = state.player.row * cellSize + cellSize / 2
    const radius = cellSize * 0.28
    g.circle(px, py, radius).fill(PLAYER_COLOR)
    g.circle(px, py, radius).stroke({ color: 0x6fe3ff, width: 2 })
}

function drawCell(
    g: Graphics,
    cell: CellType,
    x: number,
    y: number,
    cellSize: number
): void {
    const pad = 1
    if (cell === 'wall') {
        g.rect(x, y, cellSize, cellSize).fill(COLORS.wall)
        return
    }

    g.rect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2).fill({
        color: 0x082f49,
        alpha: 0.85,
    })
    g.rect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2).stroke({
        color: 0x155e75,
        width: 1,
        alpha: 0.5,
    })

    const cx = x + cellSize / 2
    const cy = y + cellSize / 2

    if (cell === 'goal') {
        g.roundRect(x + 8, y + 8, cellSize - 16, cellSize - 16, 6).fill(
            COLORS.goal
        )
        return
    }

    if (cell === 'rock') {
        g.roundRect(x + 10, y + 10, cellSize - 20, cellSize - 20, 4).fill(
            COLORS.rock
        )
        return
    }

    if (cell === 'hazard') {
        g.circle(cx, cy, cellSize * 0.28).fill(COLORS.hazard)
        g.circle(cx, cy, cellSize * 0.14).fill(0x450a0a)
        return
    }

    if (cell === 'crystal') {
        g.star(cx, cy, 4, cellSize * 0.28, cellSize * 0.12).fill(COLORS.crystal)
        return
    }

    // ice shimmer
    g.rect(x + 6, y + 6, cellSize - 12, cellSize - 12).fill({
        color: COLORS.ice,
        alpha: 0.18,
    })
}

export function cleanup(renderer: RendererState): void {
    renderer.gridGraphic.destroy()
    renderer.app.destroy(true)
}

const SWIPE_THRESHOLD = 24

export function swipeToDirection(
    dx: number,
    dy: number,
    threshold = SWIPE_THRESHOLD
): Direction | null {
    if (Math.hypot(dx, dy) < threshold) {
        return null
    }
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 'E' : 'W'
    }
    return dy > 0 ? 'S' : 'N'
}

export function keyToDirection(key: string): Direction | null {
    switch (key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            return 'N'
        case 'ArrowRight':
        case 'd':
        case 'D':
            return 'E'
        case 'ArrowDown':
        case 's':
        case 'S':
            return 'S'
        case 'ArrowLeft':
        case 'a':
        case 'A':
            return 'W'
        default:
            return null
    }
}
