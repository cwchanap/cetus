/**
 * Color utility helpers shared across game logic.
 *
 * Despite the historical "pixi" naming these are pure number <-> hex-string
 * conversions with no PixiJS or DOM dependency; canvas renderers consume the
 * hex strings, game logic the numeric colors.
 */

/**
 * Color utility function for PixiJS rendering
 * Shared across multiple games. Throws a TypeError for invalid hex values.
 */
export function hexToPixiColor(hex: string): number {
    const cleanHex = hex.trim().replace(/^#/, '')

    if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
        throw new TypeError(`Invalid hex color: "${hex}"`)
    }

    return parseInt(cleanHex, 16)
}

// Usage example:
// hexToPixiColor('#00FFAA') // returns 65450
// hexToPixiColor('#GGGGGG') // throws TypeError

/**
 * Convert Pixi color number to hex string
 */
export function pixiColorToHex(color: number): string {
    if (typeof color !== 'number' || !Number.isFinite(color)) {
        throw new TypeError('Color must be a finite number')
    }

    // Coerce to integer and clamp to valid 24-bit color range
    const intColor = Math.max(0, Math.min(0xffffff, Math.floor(color)))

    return `#${intColor.toString(16).padStart(6, '0')}`
}
