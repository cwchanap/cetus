import { Application, Graphics } from 'pixi.js'
import { polarToWorld, ringRadius, type WorldPoint } from './geometry'
import type { SatelliteSyncState, RuntimeSatellite } from './types'

export interface SceneLayout {
    cx: number
    cy: number
    scale: number
    rings: number
}

export interface RendererState {
    app: Application
    scene: Graphics
    layout: SceneLayout
}

const BACKGROUND = '#02030a'
const RING_COLOR = 0x1e3a5f
const BODY_COLOR = 0xfbbf24
const OBSTACLE_COLOR = 0x475569

const BEAM_COLORS: Record<string, number> = {
    cyan: 0x22d3ee,
    magenta: 0xf472b6,
    yellow: 0xfacc15,
    green: 0x4ade80,
}

export const GRAB_RADIUS_WORLD = 0.4

export function buildLayout(
    width: number,
    height: number,
    rings: number
): SceneLayout {
    const minDim = Math.min(width, height)
    const outerRadius = ringRadius(Math.max(0, rings - 1))
    const scale = (minDim * 0.42) / outerRadius
    return { cx: width / 2, cy: height / 2, scale, rings }
}

export function worldToPixel(world: WorldPoint, layout: SceneLayout) {
    return {
        x: layout.cx + world.x * layout.scale,
        y: layout.cy + world.y * layout.scale,
    }
}

export function pixelToWorld(
    px: number,
    py: number,
    layout: SceneLayout
): WorldPoint {
    return {
        x: (px - layout.cx) / layout.scale,
        y: (py - layout.cy) / layout.scale,
    }
}

export function pointerToSatellite(
    px: number,
    py: number,
    satellites: RuntimeSatellite[],
    layout: SceneLayout
): string | null {
    const pointer = pixelToWorld(px, py, layout)
    let nearest: string | null = null
    let bestDist = GRAB_RADIUS_WORLD
    for (const sat of satellites) {
        const w = polarToWorld(sat.ring, sat.angle)
        const d = Math.hypot(w.x - pointer.x, w.y - pointer.y)
        if (d <= bestDist) {
            bestDist = d
            nearest = sat.id
        }
    }
    return nearest
}

export async function setupScene(
    container: HTMLElement,
    rings: number
): Promise<RendererState> {
    try {
        const size = 520
        const app = new Application()
        await app.init({
            width: size,
            height: size,
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
        app.canvas.style.maxWidth = '100%'
        app.canvas.style.height = 'auto'

        const scene = new Graphics()
        app.stage.addChild(scene)
        const layout = buildLayout(size, size, rings)
        return { app, scene, layout }
    } catch (error) {
        while (container.firstChild) {
            container.removeChild(container.firstChild)
        }
        throw new Error(`Failed to initialize PixiJS: ${error}`)
    }
}

function beamLength(layout: SceneLayout): number {
    return ringRadius(Math.max(0, layout.rings - 1)) * 1.25
}

export function render(
    rendererState: RendererState,
    state: SatelliteSyncState
): void {
    const { scene, layout } = rendererState
    scene.clear()

    for (let r = 0; r < layout.rings; r++) {
        const center = worldToPixel({ x: 0, y: 0 }, layout)
        scene.circle(center.x, center.y, ringRadius(r) * layout.scale).stroke({
            color: RING_COLOR,
            width: 1,
            alpha: 0.4,
        })
    }

    const bodyCenter = worldToPixel({ x: 0, y: 0 }, layout)
    scene
        .circle(bodyCenter.x, bodyCenter.y, layout.scale * 0.18)
        .fill(BODY_COLOR)

    for (const obs of state.obstacles) {
        const p = worldToPixel(polarToWorld(obs.ring, obs.currentAngle), layout)
        scene.circle(p.x, p.y, obs.radius * layout.scale).fill(OBSTACLE_COLOR)
    }

    for (const sat of state.satellites) {
        const sp = worldToPixel(polarToWorld(sat.ring, sat.angle), layout)
        const rad = (sat.aimAngle * Math.PI) / 180
        const len = beamLength(layout)
        const beamEnd = {
            x: sp.x + Math.sin(rad) * len,
            y: sp.y - Math.cos(rad) * len,
        }
        const beamColor = BEAM_COLORS[sat.color] ?? 0x22d3ee
        scene
            .moveTo(sp.x, sp.y)
            .lineTo(beamEnd.x, beamEnd.y)
            .stroke({
                color: beamColor,
                width: sat.lockedTargetId ? 5 : 3,
                alpha: sat.lockedTargetId ? 1 : 0.7,
            })
        scene.circle(sp.x, sp.y, layout.scale * 0.12).fill(beamColor)
    }

    for (const target of state.targets) {
        const tp = worldToPixel(
            polarToWorld(target.ring, target.currentAngle),
            layout
        )
        const color = BEAM_COLORS[target.color] ?? 0x22d3ee
        const r = layout.scale * (target.locked ? 0.16 : 0.12)
        scene
            .circle(tp.x, tp.y, r)
            .fill({ color, alpha: target.locked ? 1 : 0.45 })
        scene.circle(tp.x, tp.y, r).stroke({ color, width: 2 })
    }
}

export function cleanup(rendererState: RendererState): void {
    rendererState.app.destroy(true, { children: true, texture: true })
}
