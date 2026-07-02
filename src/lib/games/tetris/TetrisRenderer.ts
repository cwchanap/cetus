// Tetris renderer using PixiJS and BaseRenderer framework
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type { TetrisState, TetrisConfig, Piece } from './types'

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
    private blockGraphics: PIXI.Graphics[] = []
    private gridGraphic: PIXI.Graphics | null = null

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
            this.drawPiece(state.currentPiece)
        }
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
        this.gridGraphic.alpha = 0.3

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

    private drawBlock(x: number, y: number, color: number): void {
        if (!this.boardContainer) {
            return
        }

        const blockGraphic = this.createGraphics()
        const { blockSize } = this.tetrisConfig

        // Draw main block
        blockGraphic.rect(x, y, blockSize, blockSize)
        blockGraphic.fill(color)

        // Draw white border
        blockGraphic.rect(x, y, blockSize, blockSize)
        blockGraphic.stroke({ width: 1, color: 0xffffff })

        this.boardContainer.addChild(blockGraphic)
        this.blockGraphics.push(blockGraphic)
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

    private drawPiece(piece: Piece): void {
        const { blockSize } = this.tetrisConfig
        for (let row = 0; row < piece.shape.length; row++) {
            for (let col = 0; col < piece.shape[row].length; col++) {
                if (piece.shape[row][col]) {
                    const x = (piece.x + col) * blockSize
                    const y = (piece.y + row) * blockSize
                    this.drawBlock(x, y, piece.color)
                }
            }
        }
    }

    private clearBoard(): void {
        if (this.boardContainer) {
            this.boardContainer.removeChildren()
        }

        // Destroy block graphics objects
        this.blockGraphics.forEach(graphic => {
            graphic.destroy()
        })
        this.blockGraphics = []
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
        backgroundColor: gameConfig.backgroundColor,
        antialias: true,
        boardWidth: gameConfig.boardWidth,
        boardHeight: gameConfig.boardHeight,
        blockSize: gameConfig.blockSize,
        gridColor: gameConfig.gridColor,
    }
}
