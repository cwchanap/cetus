import { Application, Container, Graphics } from 'pixi.js'
import type {
    RendererState,
    GameConfig,
    GameLevel,
    Cursor,
    Point,
    PathSegment,
} from './types'

export async function setupPixiJS(
    gameContainer: HTMLElement,
    config: GameConfig
): Promise<RendererState> {
    // Create PixiJS application
    const app = new Application()

    await app.init({
        width: config.gameWidth,
        height: config.gameHeight,
        backgroundColor: config.backgroundColor,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
    })

    // Add the canvas to the DOM
    gameContainer.appendChild(app.canvas)
    app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.5)'
    app.canvas.style.borderRadius = '8px'
    app.canvas.style.cursor = 'none' // Hide default cursor

    // Create containers for organized rendering
    const gameContainerPixi = new Container()
    app.stage.addChild(gameContainerPixi)

    // Create graphics objects
    const backgroundGraphics = new Graphics()
    const pathGraphics = new Graphics()
    const cursorGraphics = new Graphics()
    const goalGraphics = new Graphics()

    gameContainerPixi.addChild(backgroundGraphics)
    gameContainerPixi.addChild(pathGraphics)
    gameContainerPixi.addChild(goalGraphics)
    gameContainerPixi.addChild(cursorGraphics)

    return {
        app,
        stage: app.stage,
        gameContainer: gameContainerPixi,
        pathGraphics,
        cursorGraphics,
        goalGraphics,
        backgroundGraphics,
    }
}

export function clearRenderer(renderer: RendererState): void {
    if (renderer.app) {
        renderer.app.destroy(true)
    }
}

export function renderBackground(
    renderer: RendererState,
    config: GameConfig
): void {
    const { backgroundGraphics } = renderer
    backgroundGraphics.clear()

    // Draw background
    backgroundGraphics.rect(0, 0, config.gameWidth, config.gameHeight)
    backgroundGraphics.fill(config.backgroundColor)

    // Add grid pattern
    backgroundGraphics.stroke({ width: 1, color: 0x333333, alpha: 0.3 })

    // Vertical lines
    for (let x = 0; x <= config.gameWidth; x += 50) {
        backgroundGraphics.moveTo(x, 0)
        backgroundGraphics.lineTo(x, config.gameHeight)
    }

    // Horizontal lines
    for (let y = 0; y <= config.gameHeight; y += 50) {
        backgroundGraphics.moveTo(0, y)
        backgroundGraphics.lineTo(config.gameWidth, y)
    }

    backgroundGraphics.stroke()
}

export function renderPath(
    renderer: RendererState,
    level: GameLevel,
    config: GameConfig
): void {
    const { pathGraphics } = renderer
    pathGraphics.clear()

    // Draw start position with buffer zone
    const startRadius = 15
    const startBufferRadius = 30 // Visual indication of safe start zone

    // Draw start buffer zone (semi-transparent)
    pathGraphics.circle(
        level.path.startPoint.x,
        level.path.startPoint.y,
        startBufferRadius
    )
    pathGraphics.fill({ color: 0x00ffff, alpha: 0.2 })

    // Draw start position marker
    pathGraphics.circle(
        level.path.startPoint.x,
        level.path.startPoint.y,
        startRadius
    )
    pathGraphics.fill(0x00ffff)

    // Draw each path segment
    for (const segment of level.path.segments) {
        drawSegment(pathGraphics, segment, config)
    }
}

function drawSegment(
    graphics: Graphics,
    segment: PathSegment,
    config: GameConfig
): void {
    if (segment.type === 'straight') {
        drawStraightPath(graphics, segment, config)
    } else if (segment.type === 'curve' && segment.controlPoint) {
        drawCurvedPath(graphics, segment, config)
    }
}

function drawStraightPath(
    graphics: Graphics,
    segment: PathSegment,
    config: GameConfig
): void {
    const { start, end, width } = segment

    // Calculate perpendicular vector for width
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.sqrt(dx * dx + dy * dy)

    if (length === 0) {
        return
    }

    const perpX = (-dy / length) * (width / 2)
    const perpY = (dx / length) * (width / 2)

    // Draw path as rectangle
    graphics.poly([
        start.x + perpX,
        start.y + perpY,
        start.x - perpX,
        start.y - perpY,
        end.x - perpX,
        end.y - perpY,
        end.x + perpX,
        end.y + perpY,
    ])
    graphics.fill(config.pathColor)

    // Draw outline
    graphics.poly([
        start.x + perpX,
        start.y + perpY,
        start.x - perpX,
        start.y - perpY,
        end.x - perpX,
        end.y - perpY,
        end.x + perpX,
        end.y + perpY,
    ])
    graphics.stroke({ width: 2, color: 0x00dddd })
}

function drawCurvedPath(
    graphics: Graphics,
    segment: PathSegment,
    config: GameConfig
): void {
    const { start, end, width, controlPoint } = segment

    if (!controlPoint) {
        return
    }

    const steps = 50
    const points: number[] = []

    // Generate points along the curve
    for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const point = getBezierPoint(t, start, controlPoint, end)

        // Calculate perpendicular for width
        let perpX = 0
        let perpY = 0

        if (i < steps) {
            const nextT = (i + 1) / steps
            const nextPoint = getBezierPoint(nextT, start, controlPoint, end)
            const dx = nextPoint.x - point.x
            const dy = nextPoint.y - point.y
            const length = Math.sqrt(dx * dx + dy * dy)

            if (length > 0) {
                perpX = (-dy / length) * (width / 2)
                perpY = (dx / length) * (width / 2)
            }
        }

        if (i === 0) {
            points.push(point.x + perpX, point.y + perpY)
        } else {
            points.push(point.x + perpX, point.y + perpY)
        }
    }

    // Add return path for other side
    for (let i = steps; i >= 0; i--) {
        const t = i / steps
        const point = getBezierPoint(t, start, controlPoint, end)

        let perpX = 0
        let perpY = 0

        if (i < steps) {
            const nextT = (i + 1) / steps
            const nextPoint = getBezierPoint(nextT, start, controlPoint, end)
            const dx = nextPoint.x - point.x
            const dy = nextPoint.y - point.y
            const length = Math.sqrt(dx * dx + dy * dy)

            if (length > 0) {
                perpX = (-dy / length) * (width / 2)
                perpY = (dx / length) * (width / 2)
            }
        }

        points.push(point.x - perpX, point.y - perpY)
    }

    // Draw filled path
    graphics.poly(points)
    graphics.fill(config.pathColor)

    // Draw outline
    graphics.poly(points)
    graphics.stroke({ width: 2, color: 0x00dddd })
}

function getBezierPoint(
    t: number,
    start: Point,
    control: Point,
    end: Point
): Point {
    const mt = 1 - t
    return {
        x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
        y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
    }
}

export function renderGoal(
    renderer: RendererState,
    goalPosition: Point,
    config: GameConfig
): void {
    const { goalGraphics } = renderer
    goalGraphics.clear()

    const radius = 15
    const bufferRadius = 25 // Visual indication of buffer zone

    // Draw buffer zone (semi-transparent)
    goalGraphics.circle(goalPosition.x, goalPosition.y, bufferRadius)
    goalGraphics.fill({ color: config.goalColor, alpha: 0.2 })

    // Draw goal
    goalGraphics.circle(goalPosition.x, goalPosition.y, radius)
    goalGraphics.fill(config.goalColor)

    // Add glow effect
    goalGraphics.circle(goalPosition.x, goalPosition.y, radius + 5)
    goalGraphics.stroke({ width: 3, color: config.goalColor, alpha: 0.5 })
}

export function renderCursor(
    renderer: RendererState,
    cursor: Cursor,
    config: GameConfig,
    isOnPath: boolean
): void {
    const { cursorGraphics } = renderer
    cursorGraphics.clear()

    if (!cursor.isVisible) {
        return
    }

    const color = isOnPath ? config.cursorColor : config.outOfBoundsColor
    const time = Date.now() / 1000
    const pulse = isOnPath ? 1 : 0.7 + 0.3 * Math.sin(time * 10) // Faster pulse when out of bounds

    // Draw cursor
    cursorGraphics.circle(cursor.x, cursor.y, cursor.radius * pulse)
    cursorGraphics.fill(color)

    // Add trail effect
    if (isOnPath) {
        cursorGraphics.circle(cursor.x, cursor.y, cursor.radius + 3)
        cursorGraphics.stroke({ width: 2, color: color, alpha: 0.3 })
    }
}

export function renderUI(
    _renderer: RendererState,
    _score: number,
    _level: number,
    _timeRemaining: number,
    _config: GameConfig
): void {
    // UI will be rendered via DOM elements, not PixiJS
    // This function is here for consistency but can be used for in-game overlays
}

export function handleMouseMove(
    renderer: RendererState,
    event: MouseEvent
): Point {
    const rect = renderer.app.canvas.getBoundingClientRect()
    const scaleX = renderer.app.canvas.width / rect.width
    const scaleY = renderer.app.canvas.height / rect.height

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
    }
}
