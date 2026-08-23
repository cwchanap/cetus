import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import {
    SIGNAL_SWITCH_SIGNALS,
    type SignalSwitchConfig,
    type SignalSwitchState,
} from './types'

export interface SignalSwitchRendererConfig extends PixiJSRendererConfig {
    gateX: number
    laneCount: number
    droneWidth: number
    droneHeight: number
}

const GATE_MARKER_RADIUS = 9

export class SignalSwitchRenderer extends PixiJSRenderer {
    private signalConfig: SignalSwitchRendererConfig
    private laneGraphic: PIXI.Graphics | null = null
    private sceneGraphic: PIXI.Graphics | null = null

    constructor(config: SignalSwitchRendererConfig) {
        super(config)
        this.signalConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error(
                'SignalSwitchRenderer: app not available after setup'
            )
        }

        this.laneGraphic = this.createGraphics()
        this.sceneGraphic = this.createGraphics()
        app.stage.addChild(this.laneGraphic)
        app.stage.addChild(this.sceneGraphic)
        this.drawLanes()
    }

    protected renderGame(state: unknown): void {
        if (!this.sceneGraphic || !this.isSignalSwitchState(state)) {
            return
        }

        this.sceneGraphic.clear()
        this.drawLockedLanes(state.activeLaneCount)

        for (let lane = 0; lane < state.activeLaneCount; lane++) {
            const signal = state.gateSignals[lane]
            if (!signal) {
                continue
            }
            this.drawSignalMarker(
                this.sceneGraphic,
                signal,
                this.signalConfig.gateX,
                this.laneCenterY(lane),
                GATE_MARKER_RADIUS
            )
        }

        for (const drone of state.drones) {
            const y = this.laneCenterY(drone.laneIndex)
            const left = drone.x - this.signalConfig.droneWidth / 2
            const top = y - this.signalConfig.droneHeight / 2
            this.sceneGraphic
                .roundRect(
                    left,
                    top,
                    this.signalConfig.droneWidth,
                    this.signalConfig.droneHeight,
                    6
                )
                .fill({ color: 0x0f172a, alpha: 0.95 })
            this.drawSignalMarker(
                this.sceneGraphic,
                drone.signal,
                drone.x,
                y,
                7
            )
        }
    }

    cleanup(): void {
        if (this.laneGraphic) {
            this.laneGraphic.destroy()
            this.laneGraphic = null
        }
        if (this.sceneGraphic) {
            this.sceneGraphic.destroy()
            this.sceneGraphic = null
        }

        super.cleanup()
    }

    private drawLanes(): void {
        if (!this.laneGraphic) {
            return
        }

        const width = this.signalConfig.width ?? 800
        const height = this.signalConfig.height ?? 360
        const { gateX, laneCount } = this.signalConfig
        const laneHeight = height / laneCount

        this.laneGraphic.clear()
        this.laneGraphic.rect(0, 0, width, height).fill({ color: 0x020817 })
        for (let lane = 1; lane < laneCount; lane++) {
            const y = lane * laneHeight
            this.laneGraphic
                .moveTo(0, y)
                .lineTo(width, y)
                .stroke({ color: 0x1e293b, width: 2 })
        }
        this.laneGraphic
            .moveTo(gateX, 0)
            .lineTo(gateX, height)
            .stroke({ color: 0x22d3ee, width: 2, alpha: 0.35 })
    }

    private isSignalSwitchState(state: unknown): state is SignalSwitchState {
        if (!state || typeof state !== 'object') {
            return false
        }

        const candidate = state as {
            activeLaneCount?: unknown
            drones?: unknown
        }
        return (
            typeof candidate.activeLaneCount === 'number' &&
            Array.isArray(candidate.drones)
        )
    }

    private laneHeight(): number {
        const height = this.signalConfig.height ?? 360
        return height / this.signalConfig.laneCount
    }

    private laneCenterY(laneIndex: number): number {
        return this.laneHeight() * (laneIndex + 0.5)
    }

    private drawLockedLanes(activeLaneCount: number): void {
        if (!this.sceneGraphic) {
            return
        }

        const width = this.signalConfig.width ?? 800
        const laneHeight = this.laneHeight()
        for (
            let lane = activeLaneCount;
            lane < this.signalConfig.laneCount;
            lane++
        ) {
            this.sceneGraphic
                .rect(0, lane * laneHeight, width, laneHeight)
                .fill({ color: 0x020817, alpha: 0.55 })
        }
    }

    private drawSignalMarker(
        graphic: PIXI.Graphics,
        signal: keyof typeof SIGNAL_SWITCH_SIGNALS,
        x: number,
        y: number,
        radius: number
    ): void {
        switch (signal) {
            case 'cyan':
                graphic.circle(x, y, radius).fill({
                    color: SIGNAL_SWITCH_SIGNALS.cyan.color,
                    alpha: 0.9,
                })
                break
            case 'magenta':
                graphic
                    .moveTo(x, y - radius)
                    .lineTo(x + radius, y + radius)
                    .lineTo(x - radius, y + radius)
                    .lineTo(x, y - radius)
                    .fill({
                        color: SIGNAL_SWITCH_SIGNALS.magenta.color,
                        alpha: 0.9,
                    })
                break
            case 'amber':
                graphic
                    .moveTo(x, y - radius)
                    .lineTo(x + radius, y)
                    .lineTo(x, y + radius)
                    .lineTo(x - radius, y)
                    .lineTo(x, y - radius)
                    .fill({
                        color: SIGNAL_SWITCH_SIGNALS.amber.color,
                        alpha: 0.9,
                    })
                break
        }
    }
}

export function createSignalSwitchRendererConfig(
    config: SignalSwitchConfig
): SignalSwitchRendererConfig {
    return {
        type: 'canvas',
        container: '#signal-switch-canvas',
        width: config.canvasWidth,
        height: config.canvasHeight,
        gateX: config.gateX,
        laneCount: config.laneUnlockSeconds.length,
        droneWidth: config.droneWidth,
        droneHeight: config.droneHeight,
        responsive: false,
        backgroundColor: 0x020817,
        antialias: true,
    }
}
