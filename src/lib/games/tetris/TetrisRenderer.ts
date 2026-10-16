// Tetris renderer using PixiJS and BaseRenderer framework
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type { TetrisState, TetrisConfig, Piece } from './types'
import { getDropDistance } from './utils'

export interface TetrisRendererConfig extends PixiJSRendererConfig {
    boardWidth: number
    boardHeight: number
    blockSize: number
    gridColor: number
}

export class TetrisRenderer extends PixiJSRenderer {
    private tetrisConfig: TetrisRendererConfig
    private boardContainer: PIXI.Container | null = null
    private uiContainer: PIXI.Container | null = null
    private blockElements: (PIXI.Graphics | PIXI.Text)[] = []
    private gridGraphic: PIXI.Graphics | null = null
    private ghost = true
    private glyphs = false

    constructor(config: TetrisRendererConfig) {
        super(config)
        this.tetrisConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()

        const app = this.getApp()
        if (!app) {
            throw new Error('TetrisRenderer: app not available after setup')
        }

        // Create containers for organized rendering
        this.boardContainer = this.createContainer()
        this.uiContainer = this.createContainer()

        app.stage.addChild(this.boardContainer)
        app.stage.addChild(this.uiContainer)

        // Draw the static grid
        this.drawGrid()
    }

    protected renderGame(state: unknown): void {
        if (!this.isTetrisState(state)) {
            return
        }
        if (!state.needsRedraw) {
            return
        }

        this.clearBoard()

        // Draw board (placed blocks)
        this.drawBoard(state.board)

        // Draw current piece
        if (state.currentPiece) {
            if (this.ghost && state.isActive) {
                const piece = state.currentPiece
                const drop = getDropDistance(
                    piece.x,
                    piece.y,
                    piece.shape,
                    state.board,
                    {
                        BOARD_WIDTH: this.tetrisConfig.boardWidth,
                        BOARD_HEIGHT: this.tetrisConfig.boardHeight,
                    }
                )
                if (drop > 0) {
                    this.drawPiece({ ...piece, y: piece.y + drop }, true)
                }
            }
            this.drawPiece(state.currentPiece)
        }
    }

    setPreferences(ghost: boolean, glyphs: boolean): void {
        this.ghost = ghost
        this.glyphs = glyphs
    }

    private isTetrisState(state: unknown): state is TetrisState {
        if (!state || typeof state !== 'object') {
            return false
        }
        const candidate = state as {
            board?: unknown
            needsRedraw?: boolean
            currentPiece?: unknown
        }
        return (
            Array.isArray(candidate.board) &&
            typeof candidate.needsRedraw === 'boolean' &&
            'currentPiece' in candidate
        )
    }

    private drawGrid(): void {
        if (!this.uiContainer) {
            return
        }

        this.gridGraphic = this.createGraphics()
        this.gridGraphic.alpha = 0.05

        const { boardWidth, boardHeight, blockSize, gridColor } =
            this.tetrisConfig
        const gameWidth = boardWidth * blockSize
        const gameHeight = boardHeight * blockSize

        // Vertical lines
        for (let x = 0; x <= boardWidth; x++) {
            this.gridGraphic.moveTo(x * blockSize, 0)
            this.gridGraphic.lineTo(x * blockSize, gameHeight)
        }

        // Horizontal lines
        for (let y = 0; y <= boardHeight; y++) {
            this.gridGraphic.moveTo(0, y * blockSize)
            this.gridGraphic.lineTo(gameWidth, y * blockSize)
        }

        this.gridGraphic.stroke({ width: 1, color: gridColor })
        this.uiContainer.addChild(this.gridGraphic)
    }

    private drawBlock(
        x: number,
        y: number,
        color: number,
        ghost = false,
        type?: string
    ): void {
        if (!this.boardContainer) {
            return
        }

        const blockGraphic = this.createGraphics()
        const { blockSize } = this.tetrisConfig
        this.boardContainer.addChild(blockGraphic)
        this.blockElements.push(blockGraphic)

        if (ghost) {
            blockGraphic.rect(
                x + 1.75,
                y + 1.75,
                blockSize - 3.5,
                blockSize - 3.5
            )
            blockGraphic.stroke({ width: 1.5, color: 0xeaf6ff, alpha: 0.5 })
        } else {
            blockGraphic
                .rect(x + 1, y + 1, blockSize - 2, blockSize - 2)
                .fill(color)
            blockGraphic
                .rect(x + 1, y + 1, blockSize - 2, blockSize * 0.14)
                .fill({ color: 0xffffff, alpha: 0.28 })
            blockGraphic
                .rect(
                    x + 1,
                    y + blockSize - 1 - blockSize * 0.14,
                    blockSize - 2,
                    blockSize * 0.14
                )
                .fill({ color: 0x04060a, alpha: 0.3 })
            blockGraphic
                .rect(x + 1.5, y + 1.5, blockSize - 3, blockSize - 3)
                .stroke({ width: 1, color: 0x04060a, alpha: 0.55 })
            if (this.glyphs && type) {
                const label = this.createText(type, {
                    fontFamily: 'Field Mono, monospace',
                    fontSize: blockSize * 0.5,
                    fill: 0x04060a,
                })
                label.anchor.set(0.5)
                label.position.set(x + blockSize / 2, y + blockSize / 2)
                this.boardContainer.addChild(label)
                this.blockElements.push(label)
            }
        }
    }

    private drawBoard(board: (number | null)[][]): void {
        const { boardHeight, boardWidth, blockSize } = this.tetrisConfig
        for (let row = 0; row < boardHeight; row++) {
            for (let col = 0; col < boardWidth; col++) {
                if (board[row]?.[col]) {
                    const x = col * blockSize
                    const y = row * blockSize
                    this.drawBlock(x, y, board[row][col]!)
                }
            }
        }
    }

    private drawPiece(piece: Piece, ghost = false): void {
        const { blockSize } = this.tetrisConfig
        for (let row = 0; row < piece.shape.length; row++) {
            for (let col = 0; col < piece.shape[row].length; col++) {
                if (piece.shape[row][col]) {
                    const x = (piece.x + col) * blockSize
                    const y = (piece.y + row) * blockSize
                    this.drawBlock(x, y, piece.color, ghost, piece.type)
                }
            }
        }
    }

    private clearBoard(): void {
        if (this.boardContainer) {
            this.boardContainer.removeChildren()
        }

        // Destroy block graphics objects
        this.blockElements.forEach(element => {
            element.destroy({ children: true })
        })
        this.blockElements = []
    }

    cleanup(): void {
        this.clearBoard()
        // gridGraphic is a child of uiContainer, destroyed with children: true
        this.gridGraphic = null
        if (this.uiContainer) {
            this.uiContainer.destroy({ children: true })
            this.uiContainer = null
        }
        if (this.boardContainer) {
            this.boardContainer.destroy({ children: true })
            this.boardContainer = null
        }
        super.cleanup()
    }
}

export function createTetrisRendererConfig(
    gameConfig: TetrisConfig,
    container: string
): TetrisRendererConfig {
    return {
        type: 'canvas',
        container,
        width: gameConfig.gameWidth,
        height: gameConfig.gameHeight,
        responsive: false,
        transparent: true,
        backgroundColor: gameConfig.backgroundColor,
        antialias: true,
        boardWidth: gameConfig.boardWidth,
        boardHeight: gameConfig.boardHeight,
        blockSize: gameConfig.blockSize,
        gridColor: gameConfig.gridColor,
    }
}
