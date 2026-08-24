import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type {
    RhythmReactorConfig,
    RhythmReactorNote,
    RhythmReactorState,
} from './types'

export interface RhythmReactorRendererConfig extends PixiJSRendererConfig {
    laneCount: number
    approachSeconds: number
    noteSpawnY: number
    hitLineY: number
}

const NOTE_HEIGHT = 18
const STABILITY_X = 20
const STABILITY_Y = 16
const STABILITY_WIDTH = 100
const STABILITY_HEIGHT = 8

export class RhythmReactorRenderer extends PixiJSRenderer {
    private readonly rhythmConfig: RhythmReactorRendererConfig
    private staticGraphic: PIXI.Graphics | null = null
    private dynamicGraphic: PIXI.Graphics | null = null

    constructor(config: RhythmReactorRendererConfig) {
        super(config)
        this.rhythmConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error(
                'RhythmReactorRenderer: app not available after setup'
            )
        }

        this.staticGraphic = this.createGraphics()
        this.dynamicGraphic = this.createGraphics()
        app.stage.addChild(this.staticGraphic)
        app.stage.addChild(this.dynamicGraphic)
        this.drawStaticBoard()
    }

    protected override renderGame(rawState: unknown): void {
        if (!this.dynamicGraphic || !this.isRhythmReactorState(rawState)) {
            return
        }

        this.dynamicGraphic.clear()
        for (const note of rawState.pendingNotes) {
            if (
                note.hitTimeSeconds - rawState.elapsedSeconds <=
                this.rhythmConfig.approachSeconds
            ) {
                this.drawNote(
                    this.dynamicGraphic,
                    note,
                    rawState.elapsedSeconds
                )
            }
        }
        this.drawStability(this.dynamicGraphic, rawState.stability)
    }

    cleanup(): void {
        if (this.staticGraphic) {
            this.staticGraphic.destroy()
            this.staticGraphic = null
        }
        if (this.dynamicGraphic) {
            this.dynamicGraphic.destroy()
            this.dynamicGraphic = null
        }

        super.cleanup()
    }

    private drawStaticBoard(): void {
        if (!this.staticGraphic) {
            return
        }

        const width = this.rhythmConfig.width ?? 800
        const height = this.rhythmConfig.height ?? 420
        const laneWidth = width / this.rhythmConfig.laneCount

        this.staticGraphic.clear()
        this.staticGraphic.rect(0, 0, width, height).fill({
            color: 0x020817,
        })
        for (let lane = 0; lane < this.rhythmConfig.laneCount; lane += 1) {
            this.staticGraphic
                .rect(lane * laneWidth, 0, laneWidth, height)
                .fill({
                    color: lane % 2 === 0 ? 0x0f172a : 0x111827,
                    alpha: 0.8,
                })
        }
        for (let lane = 1; lane < this.rhythmConfig.laneCount; lane += 1) {
            const x = lane * laneWidth
            this.staticGraphic
                .moveTo(x, 0)
                .lineTo(x, height)
                .stroke({ color: 0x334155, width: 2 })
        }
        this.staticGraphic
            .moveTo(0, this.rhythmConfig.noteSpawnY)
            .lineTo(width, this.rhythmConfig.noteSpawnY)
            .stroke({ color: 0x64748b, width: 1, alpha: 0.5 })
        this.staticGraphic
            .moveTo(0, this.rhythmConfig.hitLineY)
            .lineTo(width, this.rhythmConfig.hitLineY)
            .stroke({ color: 0x22d3ee, width: 3, alpha: 0.9 })
    }

    private drawNote(
        graphic: PIXI.Graphics,
        note: RhythmReactorNote,
        elapsedSeconds: number
    ): void {
        const width = this.rhythmConfig.width ?? 800
        const laneWidth = width / this.rhythmConfig.laneCount
        const noteWidth = laneWidth * 0.55
        const x = note.laneIndex * laneWidth + (laneWidth - noteWidth) / 2
        const y = this.noteY(note, elapsedSeconds)

        graphic
            .roundRect(x, y, noteWidth, NOTE_HEIGHT, 6)
            .fill({ color: 0xf472b6, alpha: 0.95 })
    }

    private drawStability(graphic: PIXI.Graphics, stability: number): void {
        const clampedStability = Math.max(0, Math.min(100, stability))
        graphic.rect(
            STABILITY_X,
            STABILITY_Y,
            STABILITY_WIDTH,
            STABILITY_HEIGHT
        )
        graphic.fill({ color: 0x1e293b, alpha: 0.9 })
        graphic.rect(
            STABILITY_X,
            STABILITY_Y,
            (STABILITY_WIDTH * clampedStability) / 100,
            STABILITY_HEIGHT
        )
        graphic.fill({ color: 0x34d399, alpha: 0.95 })
    }

    private noteY(note: RhythmReactorNote, elapsedSeconds: number): number {
        const timeUntilHit = note.hitTimeSeconds - elapsedSeconds
        const progress = 1 - timeUntilHit / this.rhythmConfig.approachSeconds
        return (
            this.rhythmConfig.noteSpawnY +
            (this.rhythmConfig.hitLineY - this.rhythmConfig.noteSpawnY) *
                progress
        )
    }

    private isRhythmReactorState(value: unknown): value is RhythmReactorState {
        if (!value || typeof value !== 'object') {
            return false
        }

        const candidate = value as {
            pendingNotes?: unknown
            elapsedSeconds?: unknown
            stability?: unknown
        }
        return (
            Array.isArray(candidate.pendingNotes) &&
            typeof candidate.elapsedSeconds === 'number' &&
            typeof candidate.stability === 'number'
        )
    }
}

export function createRhythmReactorRendererConfig(
    config: RhythmReactorConfig
): RhythmReactorRendererConfig {
    return {
        type: 'canvas',
        container: '#rhythm-reactor-canvas',
        width: config.canvasWidth,
        height: config.canvasHeight,
        laneCount: config.laneCount,
        approachSeconds: config.approachSeconds,
        noteSpawnY: config.noteSpawnY,
        hitLineY: config.hitLineY,
        responsive: false,
        backgroundColor: 0x020817,
        antialias: true,
    }
}
