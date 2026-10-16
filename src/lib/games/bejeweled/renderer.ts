import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import { lerp } from '@/lib/games/shared/utils'
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
    private paused = false
    private animationVersion = 0
    private dragOrigin: Position | null = null
    private cursor: Position | null = null
    private hint: Position[] = []
    private glyphs = false
    private pace: 'swift' | 'measured' = 'swift'
    private reducedMotion = false
    private gradients = new Map<JewelType, PIXI.FillGradient>()

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
            if (state.isAnimating || this.paused || e.button > 0) {
                return
            }
            const { row, col } = this.mapPointToCell(x, y, state)
            if (row >= 0 && col >= 0 && row < state.rows && col < state.cols) {
                this.dragOrigin = { row, col }
                this.hint = []
                app.canvas.focus()
            }
        })

        app.canvas.style.touchAction = 'none'
        app.canvas.tabIndex = 0
        app.canvas.setAttribute('role', 'application')
        app.canvas.setAttribute(
            'aria-label',
            'Bejeweled board, 8 by 8 gems. Arrow keys to move, Enter to select and swap.'
        )
        const release = (event: PIXI.FederatedPointerEvent) => {
            const origin = this.dragOrigin
            this.dragOrigin = null
            const state = this.lastState
            if (!origin || !state || state.isAnimating || this.paused) {
                return
            }
            const target = this.mapPointToCell(
                event.global.x,
                event.global.y,
                state
            )
            if (
                target.row < 0 ||
                target.col < 0 ||
                target.row >= state.rows ||
                target.col >= state.cols
            ) {
                return
            }
            const distance =
                Math.abs(target.row - origin.row) +
                Math.abs(target.col - origin.col)
            if (distance > 1) {
                return
            }
            this.cursor = target
            if (distance === 0) {
                this.onCellClick?.(target.row, target.col)
                return
            }
            if (
                state.selected?.row !== origin.row ||
                state.selected?.col !== origin.col
            ) {
                if (state.selected) {
                    this.onCellClick?.(state.selected.row, state.selected.col)
                }
                this.onCellClick?.(origin.row, origin.col)
            }
            this.onCellClick?.(target.row, target.col)
        }
        app.stage.on('pointerup', release)
        app.stage.on('pointerupoutside', release)
        app.stage.on('pointercancel', () => {
            this.dragOrigin = null
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
                    const g = this.drawGem(
                        jewel,
                        (cellSize - this.cellPadding * 2) / 2
                    )
                    g.position.set(x + cellSize / 2, y + cellSize / 2)
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

        for (const [cells, color] of [
            [this.hint, 0x6fe3ff],
            [this.cursor ? [this.cursor] : [], 0xeaf6ff],
        ] as const) {
            for (const cell of cells) {
                const outline = this.createGraphics()
                outline.rect(
                    offsetX + cell.col * cellSize + 4,
                    offsetY + cell.row * cellSize + 4,
                    cellSize - 8,
                    cellSize - 8
                )
                outline.stroke({ width: 2, color, alpha: 0.9 })
                this.addToStage(outline)
            }
        }

        // Ensure overlay layer is on top after a full redraw
        if (this.overlayLayer) {
            app.stage.addChild(this.overlayLayer)
        }
    }

    // Destroy stage children on full redraws — every move, hint, cursor
    // move and preference change re-renders the whole grid, and detaching
    // without destroying leaked those Graphics. The overlay layer persists;
    // renderGame re-adds it on top.
    clearStage(): void {
        const app = this.getApp()
        if (!app) {
            return
        }
        for (const child of app.stage.children ?? []) {
            if (child !== this.overlayLayer) {
                child.destroy()
            }
        }
        super.clearStage()
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
        const typeA = state.grid[a.row][a.col] as JewelType
        const typeB = state.grid[b.row][b.col] as JewelType
        const [ax, ay] = this.cellCenter(a.row, a.col, layout)
        const [bx, by] = this.cellCenter(b.row, b.col, layout)

        // Covers to hide underlying jewels for cleaner animation
        const coverA = this.drawCellBackground(a.row, a.col, layout)
        const coverB = this.drawCellBackground(b.row, b.col, layout)
        this.overlayLayer.addChild(coverA, coverB)

        // Moving jewels
        const gA = this.drawGem(typeA, r)
        gA.position.set(ax, ay)

        const gB = this.drawGem(typeB, r)
        gB.position.set(bx, by)

        this.overlayLayer.addChild(gA, gB)

        await this.animate(
            this.reducedMotion
                ? 0
                : durationMs * (this.pace === 'swift' ? 0.24 : 0.48),
            t => {
                gA.position.set(lerp(ax, bx, t), lerp(ay, by, t))
                gB.position.set(lerp(bx, ax, t), lerp(by, ay, t))
            }
        )

        // Cleanup — destroy so repeated swaps do not leak Graphics
        for (const g of [gA, gB, coverA, coverB]) {
            this.overlayLayer?.removeChild(g)
            g.destroy()
        }
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
        durationMs: number = 1000,
        points: number = 0
    ): Promise<void> {
        const app = this.getApp()
        if (!app || !this.overlayLayer || cells.length === 0) {
            return
        }

        const layout = this.computeLayout(state)
        const r = (layout.cellSize - this.cellPadding * 2) / 2

        const covers: PIXI.Graphics[] = []
        const jewels: PIXI.Graphics[] = []
        const rings: { graphic: PIXI.Graphics; color: number }[] = []

        for (const { row, col } of cells) {
            const jewelType = state.grid[row][col] as JewelType | null
            if (!jewelType) {
                continue
            }
            const [cx, cy] = this.cellCenter(row, col, layout)

            const cover = this.drawCellBackground(row, col, layout)
            covers.push(cover)
            this.overlayLayer.addChild(cover)

            const g = this.drawGem(jewelType, r)
            g.position.set(cx, cy)
            this.overlayLayer.addChild(g)
            jewels.push(g)

            if (!this.reducedMotion) {
                const ring = this.createGraphics()
                ring.position.set(cx, cy)
                this.overlayLayer.addChild(ring)
                rings.push({ graphic: ring, color: JEWEL_COLORS[jewelType] })
            }
        }

        if (points > 0 && !this.reducedMotion) {
            const pop = this.createText(
                `+${points}${state.combo > 1 ? `  ×${state.combo}` : ''}`,
                {
                    fontFamily: 'Field Mono, monospace',
                    fontWeight: '600',
                    fontSize: state.combo > 1 ? 26 : 19,
                    fill: state.combo > 1 ? 0xffc24a : 0xeaf6ff,
                }
            )
            pop.anchor.set(0.5)
            const [x, y] = this.cellCenter(
                cells.reduce((sum, cell) => sum + cell.row, 0) / cells.length,
                cells.reduce((sum, cell) => sum + cell.col, 0) / cells.length,
                layout
            )
            pop.position.set(x, y)
            this.overlayLayer.addChild(pop)
            // Let the label outlive the clear without delaying the next swap.
            void this.animate(this.pace === 'swift' ? 435 : 870, t => {
                pop.visible = !this.reducedMotion
                pop.alpha = 1 - t
                pop.position.set(x, y - t * 46)
            }).then(() => {
                if (!pop.destroyed) {
                    pop.destroy()
                }
            })
        }

        // Fade and scale out
        await this.animate(
            this.reducedMotion
                ? 0
                : durationMs * (this.pace === 'swift' ? 0.24 : 0.48),
            t => {
                const alpha = 1 - t
                const scale = 1 - 0.8 * t // 1 -> 0.2
                for (const g of jewels) {
                    g.alpha = alpha
                    g.scale.set(scale)
                }
                for (const { graphic, color } of rings) {
                    graphic.visible = !this.reducedMotion
                    graphic.alpha = alpha
                    graphic.clear()
                    graphic.circle(0, 0, r * (1 + t * 1.6))
                    graphic.stroke({ width: 2 * alpha, color })
                }
            }
        )

        // Cleanup
        for (const g of jewels) {
            if (!g.destroyed) {
                g.destroy()
            }
        }
        for (const c of covers) {
            if (!c.destroyed) {
                c.destroy()
            }
        }
        for (const { graphic } of rings) {
            if (!graphic.destroyed) {
                graphic.destroy()
            }
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

    setPaused(paused: boolean): void {
        this.paused = paused
        this.dragOrigin = null
    }

    cancelAnimations(): void {
        this.animationVersion++
        this.paused = false
        this.hint = []
        this.cursor = null
        for (const child of this.overlayLayer?.removeChildren() ?? []) {
            child.destroy()
        }
    }

    setPreferences(
        pace: 'swift' | 'measured',
        glyphs: boolean,
        reducedMotion: boolean
    ): void {
        this.pace = pace
        this.glyphs = glyphs
        this.reducedMotion = reducedMotion
        if (this.lastState && !this.lastState.isAnimating) {
            this.render(this.lastState)
        }
    }

    showHint(cells: Position[]): void {
        this.hint = cells
        if (this.lastState) {
            this.render(this.lastState)
        }
    }

    moveCursor(rowDelta: number, colDelta: number): void {
        const state = this.lastState
        if (!state || state.isAnimating || this.paused) {
            return
        }
        const cursor = this.cursor ?? state.selected ?? { row: 0, col: 0 }
        this.cursor = {
            row: Math.max(0, Math.min(state.rows - 1, cursor.row + rowDelta)),
            col: Math.max(0, Math.min(state.cols - 1, cursor.col + colDelta)),
        }
        const { row, col } = this.cursor
        this.getApp()?.canvas.setAttribute(
            'aria-label',
            `Bejeweled board. Row ${row + 1}, column ${col + 1}, ${state.grid[row][col]} gem. Enter to select or swap.`
        )
        this.render(state)
    }

    selectCursor(): void {
        const cell = this.cursor ?? { row: 0, col: 0 }
        this.hint = []
        this.onCellClick?.(cell.row, cell.col)
    }

    private drawGem(type: JewelType, radius: number): PIXI.Graphics {
        const color = JEWEL_COLORS[type]
        let gradient = this.gradients.get(type)
        if (!gradient) {
            const darker =
                (Math.round(((color >> 16) & 255) * 0.75) << 16) |
                (Math.round(((color >> 8) & 255) * 0.75) << 8) |
                Math.round((color & 255) * 0.75)
            gradient = new PIXI.FillGradient({
                type: 'linear',
                start: { x: 0, y: 0 },
                end: { x: 1, y: 1 },
                colorStops: [
                    { offset: 0, color },
                    { offset: 1, color: darker },
                ],
            })
            this.gradients.set(type, gradient)
        }
        const g = this.createGraphics()
        g.roundRect(-radius, -radius, radius * 2, radius * 2, radius * 0.3)
        g.fill(gradient)
        g.stroke({ width: 1, color: 0xeaf6ff, alpha: 0.32 })
        g.poly([
            -radius * 0.5,
            -radius * 0.55,
            radius * 0.15,
            -radius * 0.55,
            -radius * 0.5,
            radius * 0.12,
        ])
        g.fill({ color: 0xffffff, alpha: 0.4 })
        if (this.glyphs) {
            const r = radius * 0.36
            if (type === 'blue') {
                g.circle(0, 0, r)
            } else if (type === 'yellow') {
                g.rect(-r, -r, r * 2, r * 2)
            } else if (type === 'green') {
                g.poly([0, -r, r, r, -r, r])
            } else if (type === 'red') {
                g.poly([0, -r, r, 0, 0, r, -r, 0])
            } else if (type === 'purple') {
                g.poly([
                    0,
                    -r,
                    r * 0.3,
                    -r * 0.3,
                    r,
                    0,
                    r * 0.3,
                    r * 0.3,
                    0,
                    r,
                    -r * 0.3,
                    r * 0.3,
                    -r,
                    0,
                    -r * 0.3,
                    -r * 0.3,
                ])
            } else {
                g.poly([
                    -r,
                    0,
                    -r / 2,
                    -r,
                    r / 2,
                    -r,
                    r,
                    0,
                    r / 2,
                    r,
                    -r / 2,
                    r,
                ])
            }
            g.fill({ color: 0x04060a, alpha: 0.85 })
        }
        return g
    }

    cleanup(): void {
        this.cancelAnimations()
        this.overlayLayer = null
        super.cleanup()
        this.gradients.forEach(gradient => gradient.destroy())
        this.gradients.clear()
    }

    private animate(
        durationMs: number,
        step: (t: number) => void
    ): Promise<void> {
        const version = this.animationVersion
        return new Promise(resolve => {
            let previous = performance.now()
            let elapsed = 0
            const frame = (now: number) => {
                if (version !== this.animationVersion) {
                    resolve()
                    return
                }
                if (!this.paused) {
                    elapsed += now - previous
                }
                previous = now
                const t =
                    durationMs === 0 ? 1 : Math.min(1, elapsed / durationMs)
                if (!this.paused) {
                    step(t)
                }
                if (t < 1 || this.paused) {
                    requestAnimationFrame(frame)
                } else {
                    resolve()
                }
            }
            requestAnimationFrame(frame)
        })
    }
}
