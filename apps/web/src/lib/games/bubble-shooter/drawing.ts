// Bubble Shooter canvas adapters — web host boundary (HPA-447 Stage 2).
// Canvas drawing needs DOM typings, so it stays in apps/web while the
// pure rules live in @cetus/games/bubble-shooter.

export function drawBubbleOnCanvas(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string
): void {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.fill()
}
