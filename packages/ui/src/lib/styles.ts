import type { CSSProperties } from 'react'

// Token-driven display font (Orbitron/Fraunces via theme). Single source
// for headings and emphasized titles that used to repeat the var() triple.
export const displayFontStyle: CSSProperties = {
    fontFamily: 'var(--cetus-display-font)',
    fontWeight: 'var(--cetus-display-weight)',
    fontStyle: 'var(--cetus-display-style)',
}
