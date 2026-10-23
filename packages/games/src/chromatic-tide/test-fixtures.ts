import { countCapturedCells, floodChromaticTideBoard } from './board'
import {
    CHROMATIC_TIDE_PALETTE,
    type ChromaticTideBoard,
    type ChromaticTideColor,
} from './types'

export function selectGreedyChromaticTideColor(
    board: ChromaticTideBoard,
    territoryColor: ChromaticTideColor
): ChromaticTideColor {
    let selectedColor: ChromaticTideColor = CHROMATIC_TIDE_PALETTE[0]
    let largestCapturedCount = -1

    for (const color of CHROMATIC_TIDE_PALETTE) {
        if (color === territoryColor) {
            continue
        }

        const capturedCount = countCapturedCells(
            floodChromaticTideBoard(board, color)
        )
        if (capturedCount > largestCapturedCount) {
            selectedColor = color
            largestCapturedCount = capturedCount
        }
    }

    return selectedColor
}
