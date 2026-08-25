import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type {
    AsteroidDriftAsteroid,
    AsteroidDriftConfig,
    AsteroidDriftOrb,
    AsteroidDriftPlayer,
    AsteroidDriftState,
} from './types'

/** Below this speed (px/s) the ship is treated as stationary and points right. */
const SHIP_HEADING_MIN_SPEED = 1

/**
 * Authored star field: fixed normalized dots and radii, drawn once onto the
 * static background layer. Deterministic by construction — no RNG involved.
 */
export const ASTEROID_DRIFT_STAR_DOTS = [
    { x: 0.05, y: 0.12, r: 1.6 },
    { x: 0.11, y: 0.55, r: 1.1 },
    { x: 0.18, y: 0.82, r: 1.4 },
    { x: 0.24, y: 0.28, r: 1.0 },
    { x: 0.32, y: 0.68, r: 1.5 },
    { x: 0.38, y: 0.08, r: 1.2 },
    { x: 0.45, y: 0.42, r: 1.0 },
    { x: 0.52, y: 0.88, r: 1.3 },
    { x: 0.58, y: 0.18, r: 1.6 },
    { x: 0.64, y: 0.6, r: 1.1 },
    { x: 0.71, y: 0.35, r: 1.4 },
    { x: 0.77, y: 0.78, r: 1.0 },
    { x: 0.83, y: 0.14, r: 1.2 },
    { x: 0.89, y: 0.5, r: 1.5 },
    { x: 0.94, y: 0.86, r: 1.1 },
    { x: 0.97, y: 0.3, r: 1.3 },
] as const

/**
 * Crater decoration authored as fractions of the owning asteroid radius.
 * Each offset length plus its crater radius stays below 1 by construction.
 */
const ASTEROID_CRATERS = [
    { x: -0.35, y: -0.25, r: 0.18 },
    { x: 0.3, y: 0.35, r: 0.12 },
] as const

export class AsteroidDriftRenderer extends PixiJSRenderer {
    private backgroundGraphic: PIXI.Graphics | null = null
    private entityGraphic: PIXI.Graphics | null = null

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error(
                'AsteroidDriftRenderer: app not available after setup'
            )
        }

        this.backgroundGraphic = this.createGraphics()
        this.entityGraphic = this.createGraphics()
        app.stage.addChild(this.backgroundGraphic)
        app.stage.addChild(this.entityGraphic)
        this.drawBackground()
    }

    protected renderGame(state: unknown): void {
        if (!this.entityGraphic || !this.isAsteroidDriftState(state)) {
            return
        }

        this.entityGraphic.clear()
        if (state.energyOrb) {
            this.drawOrb(state.energyOrb)
        }
        for (const asteroid of state.asteroids) {
            this.drawAsteroid(asteroid)
        }
        this.drawShip(state.player)
    }

    cleanup(): void {
        if (this.backgroundGraphic) {
            this.backgroundGraphic.destroy()
            this.backgroundGraphic = null
        }
        if (this.entityGraphic) {
            this.entityGraphic.destroy()
            this.entityGraphic = null
        }

        super.cleanup()
    }

    private isAsteroidDriftState(state: unknown): state is AsteroidDriftState {
        if (!state || typeof state !== 'object') {
            return false
        }

        const candidate = state as {
            player?: unknown
            asteroids?: unknown
            energyOrb?: unknown
        }
        return (
            candidate.player !== null &&
            typeof candidate.player === 'object' &&
            Array.isArray(candidate.asteroids) &&
            (candidate.energyOrb === null ||
                candidate.energyOrb === undefined ||
                typeof candidate.energyOrb === 'object')
        )
    }

    private drawBackground(): void {
        if (!this.backgroundGraphic) {
            return
        }

        const width = this.config.width ?? 800
        const height = this.config.height ?? 480
        const fieldColor = this.pixiConfig.backgroundColor ?? 0x020617

        this.backgroundGraphic.clear()
        this.backgroundGraphic
            .rect(0, 0, width, height)
            .fill({ color: fieldColor })
        this.backgroundGraphic
            .rect(0.5, 0.5, width - 1, height - 1)
            .stroke({ color: 0x155e75, width: 1, alpha: 0.8 })
        for (const dot of ASTEROID_DRIFT_STAR_DOTS) {
            this.backgroundGraphic
                .circle(dot.x * width, dot.y * height, dot.r)
                .fill({ color: 0xe2e8f0, alpha: 0.65 })
        }
    }

    private drawOrb(orb: AsteroidDriftOrb): void {
        if (!this.entityGraphic) {
            return
        }

        const graphic = this.entityGraphic
        graphic
            .circle(orb.x, orb.y, orb.radius)
            .fill({ color: 0xfacc15, alpha: 0.12 })
            .stroke({ color: 0xfacc15, width: 2 })

        const diamondRadius = orb.radius * 0.5
        graphic
            .poly([
                orb.x - diamondRadius,
                orb.y,
                orb.x,
                orb.y - diamondRadius,
                orb.x + diamondRadius,
                orb.y,
                orb.x,
                orb.y + diamondRadius,
            ])
            .stroke({ color: 0xfde047, width: 1, alpha: 0.9 })

        const crossRadius = orb.radius * 0.3
        graphic
            .moveTo(orb.x - crossRadius, orb.y)
            .lineTo(orb.x + crossRadius, orb.y)
            .moveTo(orb.x, orb.y - crossRadius)
            .lineTo(orb.x, orb.y + crossRadius)
            .stroke({ color: 0xfde047, width: 1, alpha: 0.9 })
    }

    private drawAsteroid(asteroid: AsteroidDriftAsteroid): void {
        if (!this.entityGraphic) {
            return
        }

        const graphic = this.entityGraphic
        graphic
            .circle(asteroid.x, asteroid.y, asteroid.radius)
            .fill({ color: 0x334155, alpha: 0.95 })
            .stroke({ color: 0x94a3b8, width: 1.5 })

        for (const crater of ASTEROID_CRATERS) {
            graphic
                .circle(
                    asteroid.x + crater.x * asteroid.radius,
                    asteroid.y + crater.y * asteroid.radius,
                    crater.r * asteroid.radius
                )
                .fill({ color: 0x0f172a, alpha: 0.55 })
        }
    }

    private drawShip(player: AsteroidDriftPlayer): void {
        if (!this.entityGraphic) {
            return
        }

        const radius = player.radius
        const speed = Math.hypot(player.velocityX, player.velocityY)
        const heading =
            speed > SHIP_HEADING_MIN_SPEED
                ? Math.atan2(player.velocityY, player.velocityX)
                : 0
        const cos = Math.cos(heading)
        const sin = Math.sin(heading)

        // Equilateral hull inscribed in the collision circle: every vertex
        // is derived from and sits at (essentially exactly) player.radius
        // from the center. The epsilon shrink absorbs rotation rounding so
        // a vertex can never land outside the collision circle.
        const vertexScale = 1 - 1e-9
        const hull: Array<[number, number]> = [
            [radius * vertexScale, 0],
            [
                (-radius / 2) * vertexScale,
                ((-radius * Math.sqrt(3)) / 2) * vertexScale,
            ],
            [
                (-radius / 2) * vertexScale,
                ((radius * Math.sqrt(3)) / 2) * vertexScale,
            ],
        ]
        const vertices = hull.map(
            ([lx, ly]) =>
                [
                    player.x + lx * cos - ly * sin,
                    player.y + lx * sin + ly * cos,
                ] as [number, number]
        )

        this.entityGraphic
            .moveTo(vertices[0][0], vertices[0][1])
            .lineTo(vertices[1][0], vertices[1][1])
            .lineTo(vertices[2][0], vertices[2][1])
            .lineTo(vertices[0][0], vertices[0][1])
            .fill({ color: 0x22d3ee, alpha: 0.9 })
            .stroke({ color: 0x67e8f9, width: 2 })
    }
}

export function createAsteroidDriftRendererConfig(
    config: AsteroidDriftConfig
): PixiJSRendererConfig {
    return {
        type: 'canvas',
        container: '#asteroid-drift-canvas',
        width: config.canvasWidth,
        height: config.canvasHeight,
        responsive: false,
        backgroundColor: 0x020617,
        antialias: true,
    }
}
