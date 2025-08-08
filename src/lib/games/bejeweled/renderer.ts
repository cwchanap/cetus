import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import { JEWEL_COLORS, type BejeweledState, type JewelType } from './types'

export interface BejeweledRendererConfig extends PixiJSRendererConfig {
    gridPadding?: number
    cellPadding?: number
}

export class BejeweledRenderer extends PixiJSRenderer {
    private onCellClick?: (row: number, col: number) => void
    private gridPadding: number
    private cellPadding: number
    private lastState?: BejeweledState

    constructor(config: BejeweledRendererConfig) {
        super(config)
        this.gridPadding = config.gridPadding ?? 8
        this.cellPadding = config.cellPadding ?? 4
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            return
        }

        // Enable pointer interaction on entire stage
        app.stage.eventMode = 'static'
        const { width, height } = app.renderer
        app.stage.hitArea = new PIXI.Rectangle(0, 0, width, height)
        app.stage.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            const { x, y } = e.global
            const state = this.lastState
            if (!state) {
                return
            }
            const { row, col } = this.mapPointToCell(x, y, state)
            if (row >= 0 && col >= 0 && row < state.rows && col < state.cols) {
                this.onCellClick?.(row, col)
            }
        })
    }

    setCellClickCallback(cb: (row: number, col: number) => void): void {
        this.onCellClick = cb
    }

    protected renderGame(state: unknown): void {
        const s = state as BejeweledState
        this.lastState = s
        const app = this.getApp()
        if (!app) {
            return
        }
        this.clearStage()

        const { width, height } = app.renderer
        const padding = this.gridPadding
        const gridWidth = width - padding * 2
        const gridHeight = height - padding * 2
        const cellW = gridWidth / s.cols
        const cellH = gridHeight / s.rows
        const cellSize = Math.min(cellW, cellH)
        const offsetX = (width - cellSize * s.cols) / 2
        const offsetY = (height - cellSize * s.rows) / 2

        // Draw cells
        for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
                const jewel = s.grid[r][c]
                const x = offsetX + c * cellSize
                const y = offsetY + r * cellSize

                // Cell background
                const bg = this.createGraphics()
                bg.roundRect(
                    x + 1,
                    y + 1,
                    cellSize - 2,
                    cellSize - 2,
                    Math.min(8, cellSize * 0.2)
                )
                bg.fill({ color: 0x0b1020, alpha: 0.8 })
                bg.stroke({ width: 1, color: 0x1a2a3a, alpha: 0.6 })
                this.addToStage(bg)

                if (jewel) {
                    const color = JEWEL_COLORS[jewel as JewelType]
                    const g = this.createGraphics()
                    const inset = this.cellPadding
                    const radius = (cellSize - inset * 2) / 2
                    const cx = x + cellSize / 2
                    const cy = y + cellSize / 2
                    g.circle(cx, cy, radius)
                    g.fill({ color, alpha: 1 })
                    g.stroke({ width: 2, color: 0xffffff, alpha: 0.1 })
                    this.addToStage(g)
                }

                // Selection highlight
                if (
                    s.selected &&
                    s.selected.row === r &&
                    s.selected.col === c
                ) {
                    const hl = this.createGraphics()
                    hl.roundRect(
                        x + 2,
                        y + 2,
                        cellSize - 4,
                        cellSize - 4,
                        Math.min(10, cellSize * 0.25)
                    )
                    hl.stroke({ width: 3, color: 0x00e5ff, alpha: 0.9 })
                    this.addToStage(hl)
                }
            }
        }
    }

    private mapPointToCell(
        x: number,
        y: number,
        s: BejeweledState
    ): { row: number; col: number } {
        const app = this.getApp()
        if (!app) {
            return { row: -1, col: -1 }
        }

        const { width, height } = app.renderer
        const padding = this.gridPadding
        const gridWidth = width - padding * 2
        const gridHeight = height - padding * 2
        const cellW = gridWidth / s.cols
        const cellH = gridHeight / s.rows
        const cellSize = Math.min(cellW, cellH)
        const offsetX = (width - cellSize * s.cols) / 2
        const offsetY = (height - cellSize * s.rows) / 2

        const col = Math.floor((x - offsetX) / cellSize)
        const row = Math.floor((y - offsetY) / cellSize)
        return { row, col }
    }
}
