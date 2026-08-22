import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import {
    GRAVITY_FLIP_HAZARD_CATALOG,
    type GravityFlipConfig,
    type GravityFlipHazard,
    type GravityFlipState,
    type GravityFlipStar,
} from './types'

export interface GravityFlipRendererConfig extends PixiJSRendererConfig {
    corridorInset: number
}

export class GravityFlipRenderer extends PixiJSRenderer {
    private gravityFlipConfig: GravityFlipRendererConfig
    private corridorGraphic: PIXI.Graphics | null = null
    private sceneGraphic: PIXI.Graphics | null = null

    constructor(config: GravityFlipRendererConfig) {
        super(config)
        this.gravityFlipConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error(
                'GravityFlipRenderer: app not available after setup'
            )
        }

        this.corridorGraphic = this.createGraphics()
        this.sceneGraphic = this.createGraphics()
        app.stage.addChild(this.corridorGraphic)
        app.stage.addChild(this.sceneGraphic)
        this.drawCorridor()
    }

    protected renderGame(state: unknown): void {
        if (!this.sceneGraphic || !this.isGravityFlipState(state)) {
            return
        }

        this.sceneGraphic.clear()

        for (const hazard of state.hazards) {
            const descriptor = GRAVITY_FLIP_HAZARD_CATALOG[hazard.kind]
            switch (descriptor.shape) {
                case 'spike':
                    this.drawSpike(hazard, descriptor.surface)
                    break
                case 'gap':
                    this.drawGap(hazard, descriptor.surface)
                    break
                case 'mover':
                    this.drawMover(hazard)
                    break
            }
        }

        this.drawPlayer(state.player)
        for (const star of state.stars) {
            this.drawStar(star)
        }
    }

    cleanup(): void {
        if (this.corridorGraphic) {
            this.corridorGraphic.destroy()
            this.corridorGraphic = null
        }
        if (this.sceneGraphic) {
            this.sceneGraphic.destroy()
            this.sceneGraphic = null
        }

        super.cleanup()
    }

    private isGravityFlipState(state: unknown): state is GravityFlipState {
        if (!state || typeof state !== 'object') {
            return false
        }

        const candidate = state as {
            player?: unknown
            hazards?: unknown
            stars?: unknown
        }
        return (
            candidate.player !== null &&
            typeof candidate.player === 'object' &&
            Array.isArray(candidate.hazards) &&
            Array.isArray(candidate.stars)
        )
    }

    private drawCorridor(): void {
        if (!this.corridorGraphic) {
            return
        }

        const width = this.gravityFlipConfig.width ?? 800
        const height = this.gravityFlipConfig.height ?? 320
        const { corridorInset } = this.gravityFlipConfig

        this.corridorGraphic.clear()
        this.corridorGraphic.rect(0, 0, width, height).fill({ color: 0x020817 })
        this.corridorGraphic
            .rect(0, 0, width, corridorInset)
            .fill({ color: 0x0f172a, alpha: 0.95 })
        this.corridorGraphic
            .rect(0, height - corridorInset, width, corridorInset)
            .fill({ color: 0x0f172a, alpha: 0.95 })
        this.corridorGraphic
            .moveTo(0, corridorInset)
            .lineTo(width, corridorInset)
            .stroke({ color: 0x22d3ee, width: 2, alpha: 0.8 })
        this.corridorGraphic
            .moveTo(0, height - corridorInset)
            .lineTo(width, height - corridorInset)
            .stroke({ color: 0x22d3ee, width: 2, alpha: 0.8 })
    }

    private drawSpike(
        hazard: GravityFlipHazard,
        surface: 'floor' | 'ceiling'
    ): void {
        if (!this.sceneGraphic) {
            return
        }

        const baseY = surface === 'floor' ? hazard.y + hazard.height : hazard.y
        const tipY = surface === 'floor' ? hazard.y : hazard.y + hazard.height

        this.sceneGraphic
            .moveTo(hazard.x, baseY)
            .lineTo(hazard.x + hazard.width / 2, tipY)
            .lineTo(hazard.x + hazard.width, baseY)
            .lineTo(hazard.x, baseY)
            .fill({ color: 0xf43f5e, alpha: 0.9 })
            .stroke({ color: 0xfb7185, width: 2, alpha: 1 })
    }

    private drawGap(
        hazard: GravityFlipHazard,
        surface: 'floor' | 'ceiling'
    ): void {
        if (!this.sceneGraphic) {
            return
        }

        const height = this.gravityFlipConfig.height ?? 320
        const eraseY = surface === 'floor' ? hazard.y : 0
        const eraseHeight =
            surface === 'floor' ? height - hazard.y : hazard.y + hazard.height

        this.sceneGraphic
            .rect(hazard.x, eraseY, hazard.width, eraseHeight)
            .fill({
                color: this.gravityFlipConfig.backgroundColor ?? 0x020817,
                alpha: 1,
            })
    }

    private drawMover(hazard: GravityFlipHazard): void {
        if (!this.sceneGraphic) {
            return
        }

        this.sceneGraphic
            .roundRect(hazard.x, hazard.y, hazard.width, hazard.height, 8)
            .fill({ color: 0xa855f7, alpha: 0.9 })
            .stroke({ color: 0xe879f9, width: 2, alpha: 1 })
    }

    private drawPlayer(player: GravityFlipState['player']): void {
        if (!this.sceneGraphic) {
            return
        }

        const radius = player.size / 2
        this.sceneGraphic
            .moveTo(player.x, player.y - radius)
            .lineTo(player.x + radius, player.y)
            .lineTo(player.x, player.y + radius)
            .lineTo(player.x - radius, player.y)
            .lineTo(player.x, player.y - radius)
            .fill({ color: 0x22d3ee, alpha: 0.9 })
            .stroke({ color: 0x67e8f9, width: 3, alpha: 1 })
    }

    private drawStar(star: GravityFlipStar): void {
        if (!this.sceneGraphic) {
            return
        }

        const radius = star.radius
        const inner = radius * 0.45
        this.sceneGraphic
            .moveTo(star.x, star.y - radius)
            .lineTo(star.x + inner * 0.588, star.y - inner * 0.809)
            .lineTo(star.x + radius * 0.951, star.y - radius * 0.309)
            .lineTo(star.x + inner * 0.951, star.y + inner * 0.309)
            .lineTo(star.x + radius * 0.588, star.y + radius * 0.809)
            .lineTo(star.x, star.y + inner)
            .lineTo(star.x - radius * 0.588, star.y + radius * 0.809)
            .lineTo(star.x - inner * 0.951, star.y + inner * 0.309)
            .lineTo(star.x - radius * 0.951, star.y - radius * 0.309)
            .lineTo(star.x - inner * 0.588, star.y - inner * 0.809)
            .lineTo(star.x, star.y - radius)
            .fill({ color: 0xfacc15, alpha: 0.95 })
            .stroke({ color: 0xfef08a, width: 1.5, alpha: 1 })
    }
}

export function createGravityFlipRendererConfig(
    config: GravityFlipConfig
): GravityFlipRendererConfig {
    return {
        type: 'canvas',
        container: '#gravity-flip-canvas',
        width: config.canvasWidth,
        height: config.canvasHeight,
        corridorInset: config.corridorInset,
        responsive: false,
        backgroundColor: 0x020817,
        antialias: true,
    }
}
