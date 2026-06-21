// src/lib/games/circuit-hacker/renderer.ts
import { Application, Graphics } from 'pixi.js'
import type { CircuitHackerState, Direction, GridPosition, Tile } from './types'
import { getConnectors } from './utils'

export interface RendererState {
    app: Application
    tileGraphic: Graphics
}

const BACKGROUND = '#000a14'
const COLOR_WIRE_OFF = 0x335577
const COLOR_WIRE_ON = 0x22d3ee
const COLOR_SOURCE = 0x22c55e
const COLOR_CORE_OFF = 0x9333ea
const COLOR_CORE_ON = 0xf472b6
const COLOR_BLOCKER = 0x1e293b

export async function setupPixiJS(
    container: HTMLElement,
    rows: number,
    cols: number,
    cellSize: number
): Promise<RendererState> {
    try {
        const app = new Application()
        await app.init({
            width: cols * cellSize,
            height: rows * cellSize,
            backgroundColor: BACKGROUND,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        })

        container.appendChild(app.canvas)
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.3)'
        app.canvas.style.borderRadius = '12px'
        app.canvas.style.boxShadow = '0 0 30px rgba(6, 182, 212, 0.3)'
        app.canvas.style.touchAction = 'none'
        // Responsive scaling: keep the PixiJS resolution at cols*cellSize but
        // let the browser shrink the displayed canvas to fit narrow viewports.
        // Pointer math in init.ts uses getBoundingClientRect(), so CSS scaling
        // stays in sync without coordinate changes.
        app.canvas.style.maxWidth = '100%'
        app.canvas.style.height = 'auto'

        const tileGraphic = new Graphics()
        app.stage.addChild(tileGraphic)

        return { app, tileGraphic }
    } catch (error) {
        while (container.firstChild) {
            container.removeChild(container.firstChild)
        }
        throw new Error(`Failed to initialize PixiJS: ${error}`)
    }
}

function dirOffset(dir: Direction): { dx: number; dy: number } {
    switch (dir) {
        case 'N':
            return { dx: 0, dy: -1 }
        case 'S':
            return { dx: 0, dy: 1 }
        case 'E':
            return { dx: 1, dy: 0 }
        case 'W':
            return { dx: -1, dy: 0 }
    }
}

function drawTile(
    g: Graphics,
    tile: Tile,
    x: number,
    y: number,
    cellSize: number
): void {
    const cx = x + cellSize / 2
    const cy = y + cellSize / 2
    const half = cellSize / 2

    // Cell background
    g.rect(x + 1, y + 1, cellSize - 2, cellSize - 2).fill({
        color: 0x001122,
        alpha: 0.5,
    })
    g.rect(x + 1, y + 1, cellSize - 2, cellSize - 2).stroke({
        color: 0x0ea5e9,
        width: 1,
        alpha: 0.15,
    })

    if (tile.type === 'blocker') {
        g.rect(x + 6, y + 6, cellSize - 12, cellSize - 12).fill(COLOR_BLOCKER)
        return
    }

    const wireColor = tile.powered ? COLOR_WIRE_ON : COLOR_WIRE_OFF
    const wireWidth = tile.powered ? 6 : 4

    // Draw a wire segment from the centre out to each connector edge.
    for (const dir of getConnectors(tile)) {
        const { dx, dy } = dirOffset(dir)
        g.moveTo(cx, cy)
            .lineTo(cx + dx * half, cy + dy * half)
            .stroke({ color: wireColor, width: wireWidth })
    }

    // Centre hub / node
    if (tile.type === 'source') {
        g.circle(cx, cy, half * 0.35).fill(COLOR_SOURCE)
    } else if (tile.type === 'core') {
        g.circle(cx, cy, half * 0.35).fill(
            tile.powered ? COLOR_CORE_ON : COLOR_CORE_OFF
        )
    } else {
        g.circle(cx, cy, wireWidth * 0.9).fill(wireColor)
    }
}

export function renderGrid(
    rendererState: RendererState,
    state: CircuitHackerState,
    cellSize: number
): void {
    const g = rendererState.tileGraphic
    g.clear()
    for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
            drawTile(g, state.grid[r][c], c * cellSize, r * cellSize, cellSize)
        }
    }
}

export function pointerToCell(
    x: number,
    y: number,
    cellSize: number,
    rows: number,
    cols: number
): GridPosition | null {
    const col = Math.floor(x / cellSize)
    const row = Math.floor(y / cellSize)
    if (row < 0 || row >= rows || col < 0 || col >= cols) {
        return null
    }
    return { row, col }
}

export function cleanup(rendererState: RendererState): void {
    rendererState.app.destroy(true, { children: true, texture: true })
}
