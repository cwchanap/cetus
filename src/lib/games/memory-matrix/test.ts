// Simple test to verify Memory Matrix game logic
import { MemoryMatrixGame } from './game'
import { CONSTANTS } from './utils'

export function testMemoryMatrixGame(): void {}

// Run test if this file is executed directly
if (typeof window !== 'undefined') {
    ;(window as any).testMemoryMatrix = testMemoryMatrixGame
}
