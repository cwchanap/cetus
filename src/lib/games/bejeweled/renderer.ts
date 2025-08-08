import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import {
    JEWEL_COLORS,
    type BejeweledState,
    type JewelType,
    type Position,
    type BejeweledAnimator,
} from './types'

export interface BejeweledRendererConfig extends PixiJSRendererConfig {
    gridPadding?: number
    cellPadding?: number
}

export class BejeweledRenderer
    extends PixiJSRenderer
    implements BejeweledAnimator
{
    private onCellClick?: (row: number, col: number) => void
    private gridPadding: number
    private cellPadding: number
    private lastState?: BejeweledState
    private overlayLayer: PIXI.Container | null = null

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
            // Disable input during animations
            if (state.isAnimating) {
                return
            }
            const { row, col } = this.mapPointToCell(x, y, state)
            if (row >= 0 && col >= 0 && row < state.rows && col < state.cols) {
                this.onCellClick?.(row, col)
            }
        })

        // Create overlay layer for animations (always on top)
        this.overlayLayer = this.createContainer()
        app.stage.addChild(this.overlayLayer)
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

        // Ensure overlay layer is on top after a full redraw
        if (this.overlayLayer) {
            app.stage.addChild(this.overlayLayer)
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

    // ---- Animator API ----
    public async animateSwap(
        a: Position,
        b: Position,
        state: BejeweledState,
        durationMs: number = 500
    ): Promise<void> {
        const app = this.getApp()
        if (!app || !this.overlayLayer) {
            return
        }

        const layout = this.computeLayout(state)
        const r = (layout.cellSize - this.cellPadding * 2) / 2
        const colorA = JEWEL_COLORS[state.grid[a.row][a.col] as JewelType]
        const colorB = JEWEL_COLORS[state.grid[b.row][b.col] as JewelType]
        const [ax, ay] = this.cellCenter(a.row, a.col, layout)
        const [bx, by] = this.cellCenter(b.row, b.col, layout)

        // Covers to hide underlying jewels for cleaner animation
        const coverA = this.drawCellBackground(a.row, a.col, layout)
        const coverB = this.drawCellBackground(b.row, b.col, layout)
        this.overlayLayer.addChild(coverA, coverB)

        // Moving jewels
        const gA = this.createGraphics()
        gA.circle(0, 0, r)
        gA.fill({ color: colorA, alpha: 1 })
        gA.stroke({ width: 2, color: 0xffffff, alpha: 0.12 })
        gA.position.set(ax, ay)

        const gB = this.createGraphics()
        gB.circle(0, 0, r)
        gB.fill({ color: colorB, alpha: 1 })
        gB.stroke({ width: 2, color: 0xffffff, alpha: 0.12 })
        gB.position.set(bx, by)

        this.overlayLayer.addChild(gA, gB)

        await this.animate(durationMs, t => {
            gA.position.set(this.lerp(ax, bx, t), this.lerp(ay, by, t))
            gB.position.set(this.lerp(bx, ax, t), this.lerp(by, ay, t))
        })

        // Cleanup
        this.overlayLayer.removeChild(gA)
        this.overlayLayer.removeChild(gB)
        this.overlayLayer.removeChild(coverA)
        this.overlayLayer.removeChild(coverB)
    }

    public async animateSwapBack(
        a: Position,
        b: Position,
        state: BejeweledState,
        durationMs: number = 500
    ): Promise<void> {
        // Just swap in reverse direction
        await this.animateSwap(b, a, state, durationMs)
    }

    public async animateClear(
        cells: Position[],
        state: BejeweledState,
        durationMs: number = 1000
    ): Promise<void> {
        const app = this.getApp()
        if (!app || !this.overlayLayer || cells.length === 0) {
            return
        }

        const layout = this.computeLayout(state)
        const r = (layout.cellSize - this.cellPadding * 2) / 2

        const covers: PIXI.Graphics[] = []
        const jewels: PIXI.Graphics[] = []

        for (const { row, col } of cells) {
            const jewelType = state.grid[row][col] as JewelType | null
            if (!jewelType) {
                continue
            }
            const color = JEWEL_COLORS[jewelType]
            const [cx, cy] = this.cellCenter(row, col, layout)

            const cover = this.drawCellBackground(row, col, layout)
            covers.push(cover)
            this.overlayLayer.addChild(cover)

            const g = this.createGraphics()
            g.circle(0, 0, r)
            g.fill({ color, alpha: 1 })
            g.stroke({ width: 2, color: 0xffffff, alpha: 0.12 })
            g.position.set(cx, cy)
            this.overlayLayer.addChild(g)
            jewels.push(g)
        }

        // Fade and scale out
        await this.animate(durationMs, t => {
            const alpha = 1 - t
            const scale = 1 - 0.8 * t // 1 -> 0.2
            for (const g of jewels) {
                g.alpha = alpha
                g.scale.set(scale)
            }
        })

        // Cleanup
        for (const g of jewels) {
            this.overlayLayer.removeChild(g)
        }
        for (const c of covers) {
            this.overlayLayer.removeChild(c)
        }
    }

    // ---- Helpers ----
    private computeLayout(s: BejeweledState): {
        width: number
        height: number
        cellSize: number
        offsetX: number
        offsetY: number
    } {
        const app = this.getApp()
        if (!app) {
            return { width: 0, height: 0, cellSize: 0, offsetX: 0, offsetY: 0 }
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
        return { width, height, cellSize, offsetX, offsetY }
    }

    private cellCenter(
        row: number,
        col: number,
        layout: { cellSize: number; offsetX: number; offsetY: number }
    ): [number, number] {
        const x = layout.offsetX + col * layout.cellSize + layout.cellSize / 2
        const y = layout.offsetY + row * layout.cellSize + layout.cellSize / 2
        return [x, y]
    }

    private drawCellBackground(
        row: number,
        col: number,
        layout: { cellSize: number; offsetX: number; offsetY: number }
    ): PIXI.Graphics {
        const x = layout.offsetX + col * layout.cellSize
        const y = layout.offsetY + row * layout.cellSize
        const bg = this.createGraphics()
        bg.roundRect(
            x + 1,
            y + 1,
            layout.cellSize - 2,
            layout.cellSize - 2,
            Math.min(8, layout.cellSize * 0.2)
        )
        bg.fill({ color: 0x0b1020, alpha: 0.8 })
        bg.stroke({ width: 1, color: 0x1a2a3a, alpha: 0.6 })
        return bg
    }

    private animate(
        durationMs: number,
        step: (t: number) => void
    ): Promise<void> {
        return new Promise(resolve => {
            const start = performance.now()
            const frame = (now: number) => {
                const t = Math.min(1, (now - start) / durationMs)
                step(t)
                if (t < 1) {
                    requestAnimationFrame(frame)
                } else {
                    resolve()
                }
            }
            requestAnimationFrame(frame)
        })
    }

    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t
    }
}
