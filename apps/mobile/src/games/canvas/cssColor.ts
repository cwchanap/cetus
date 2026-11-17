export const cssColor = (hex: number, alpha = 1): string => {
    const r = (hex >> 16) & 0xff
    const g = (hex >> 8) & 0xff
    const b = hex & 0xff
    return alpha === 1
        ? `rgb(${r}, ${g}, ${b})`
        : `rgba(${r}, ${g}, ${b}, ${alpha})`
}
