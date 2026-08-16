import {
    DIRECTION_DELTA,
    type Direction,
    type IceSlideCallbacks,
    type IceSlideGameData,
    type IceSlideRunDefinition,
    type IceSlideStageClearResult,
    type IceSlideStageDefinition,
    type IceSlideState,
} from './types'
import {
    cloneGrid,
    countCrystals,
    findStart,
    parseGrid,
    slide,
} from './physics'
import {
    applyIceSlideExpeditionRouteChoice,
    type IceSlideExpeditionRouteChoice,
} from './expedition'
import {
    assertValidIceSlideRunDefinition,
    cloneIceSlideRunDefinition,
    createCampaignRunDefinition,
} from './run'
import { isIceSlideObjectiveComplete } from './objectives'
import {
    iceSlideScoringConfig,
    isIceSlideObjectiveMode,
    levelScore,
    timeBonus,
} from './scoring'

export class IceSlideGame {
    private state: IceSlideState
    private activeRun: IceSlideRunDefinition
    private elapsedTimer: ReturnType<typeof setInterval> | null = null
    private callbacks: Partial<IceSlideCallbacks>

    constructor(callbacks: Partial<IceSlideCallbacks> = {}) {
        this.callbacks = callbacks
        this.activeRun = createCampaignRunDefinition()
        this.state = this.createIdleState()
    }

    private runMetadata(): Pick<
        IceSlideState,
        | 'mode'
        | 'runKey'
        | 'runSchemaVersion'
        | 'generatorVersion'
        | 'rulesetVersion'
        | 'stagesTotal'
        | 'stageSignatures'
    > {
        return {
            mode: this.activeRun.mode,
            runKey: this.activeRun.runKey,
            runSchemaVersion: this.activeRun.schemaVersion,
            generatorVersion: this.activeRun.generatorVersion,
            rulesetVersion: this.activeRun.rulesetVersion,
            stagesTotal: this.activeRun.stages.length,
            stageSignatures: this.activeRun.stages.map(
                stage => stage.signature
            ),
        }
    }

    private starsPossibleForActiveRun(): number {
        if (!isIceSlideObjectiveMode(this.activeRun.mode)) {
            return 0
        }
        return this.activeRun.stages.reduce(
            (sum, stage) => sum + 2 + stage.objectiveIds.length,
            0
        )
    }

    private getStage(index: number): IceSlideStageDefinition {
        const stage = this.activeRun.stages[index]
        if (!stage) {
            throw new Error(`Ice Slide stage index out of range: ${index}`)
        }
        return stage
    }

    private createIdleState(): IceSlideState {
        return {
            levelIndex: 0,
            levelName: '',
            rows: 0,
            cols: 0,
            grid: [],
            player: { row: 0, col: 0 },
            start: { row: 0, col: 0 },
            moves: 0,
            levelMoves: 0,
            parMoves: 0,
            objectiveIds: [],
            pendingRouteChoiceAfterStage: null,
            routeChoices: [],
            undoChargesAvailable: 0,
            undoChargesUsed: 0,
            starsPossible: this.starsPossibleForActiveRun(),
            levelFalls: 0,
            levelResets: 0,
            crystalsCollected: 0,
            levelCrystalsCollected: 0,
            score: 0,
            elapsedSeconds: 0,
            status: 'idle',
            perfectLevels: 0,
            levelsCleared: 0,
            lastSlidePath: [],
            ...this.runMetadata(),
            starsEarned: 0,
            falls: 0,
            resets: 0,
        }
    }

    getState(): IceSlideState {
        return {
            ...this.state,
            grid: cloneGrid(this.state.grid),
            player: { ...this.state.player },
            start: { ...this.state.start },
            lastSlidePath: this.state.lastSlidePath.map(p => ({ ...p })),
            objectiveIds: [...this.state.objectiveIds],
            stageSignatures: [...this.state.stageSignatures],
            routeChoices: [...this.state.routeChoices],
        }
    }

    getGameData(): IceSlideGameData {
        return {
            levelsCleared: this.state.levelsCleared,
            totalMoves: this.state.moves,
            crystalsCollected: this.state.crystalsCollected,
            elapsedSeconds: this.state.elapsedSeconds,
            solved: this.state.status === 'won',
            perfectLevels: this.state.perfectLevels,
            mode: this.state.mode,
            runKey: this.state.runKey,
            runSchemaVersion: this.state.runSchemaVersion,
            generatorVersion: this.state.generatorVersion,
            rulesetVersion: this.state.rulesetVersion,
            stagesTotal: this.state.stagesTotal,
            starsEarned: this.state.starsEarned,
            falls: this.state.falls,
            resets: this.state.resets,
            stageSignatures: [...this.state.stageSignatures],
            routeChoices: [...this.state.routeChoices],
            undoChargesAvailable: this.state.undoChargesAvailable,
            undoChargesUsed: this.state.undoChargesUsed,
            starsPossible: this.state.starsPossible,
            stageObjectiveIds: this.activeRun.stages.map(stage => [
                ...stage.objectiveIds,
            ]),
            stageScoreMultipliersBps: this.activeRun.stages.map(
                stage => stage.scoreMultiplierBps
            ),
        }
    }

    start(run?: IceSlideRunDefinition): void {
        const nextRun = run
            ? (() => {
                  assertValidIceSlideRunDefinition(run)
                  return cloneIceSlideRunDefinition(run)
              })()
            : createCampaignRunDefinition()

        this.stopTimer()
        this.activeRun = nextRun
        this.state = this.createIdleState()
        this.state.status = 'playing'
        this.loadLevel(0)
        this.startTimer()
        this.callbacks.onGameStart?.()
        this.callbacks.onScoreUpdate?.(this.state.score)
        this.callbacks.onTimeUpdate?.(0)
    }

    stop(): void {
        this.stopTimer()
        if (this.state.status === 'playing') {
            this.state.status = 'idle'
        }
    }

    chooseExpeditionRoute(choice: IceSlideExpeditionRouteChoice): boolean {
        const afterStageNumber = this.state.pendingRouteChoiceAfterStage
        if (
            this.state.mode !== 'expedition' ||
            this.state.status !== 'playing' ||
            afterStageNumber === null ||
            this.state.routeChoices.length !== (afterStageNumber === 2 ? 0 : 1)
        ) {
            return false
        }

        const effect = applyIceSlideExpeditionRouteChoice(
            this.activeRun,
            afterStageNumber,
            choice
        )
        this.activeRun = effect.run
        const stage = this.getStage(this.state.levelIndex)
        this.state.objectiveIds = [...stage.objectiveIds]
        Object.assign(this.state, this.runMetadata())
        this.state.starsPossible = this.starsPossibleForActiveRun()
        this.state.undoChargesAvailable += effect.undoChargesGranted
        this.state.routeChoices.push(choice)
        this.state.pendingRouteChoiceAfterStage = null
        return true
    }

    /** Reload current level without resetting run score/time. */
    resetLevel(): void {
        if (
            this.state.status !== 'playing' ||
            this.state.pendingRouteChoiceAfterStage !== null
        ) {
            return
        }
        // Drop crystals gathered on this attempt so reset/hazard cannot farm.
        this.state.crystalsCollected -= this.state.levelCrystalsCollected
        this.state.resets += 1
        this.state.levelResets += 1
        this.loadLevel(this.state.levelIndex, {
            preserveRun: true,
            preserveLevelAttemptStats: true,
        })
    }

    move(direction: Direction): void {
        if (
            this.state.status !== 'playing' ||
            this.state.pendingRouteChoiceAfterStage !== null
        ) {
            return
        }

        const delta = DIRECTION_DELTA[direction]
        const outcome = slide(this.state.grid, this.state.player, delta)

        if (outcome.kind === 'noop') {
            this.state.lastSlidePath = []
            return
        }

        this.state.moves += 1
        this.state.levelMoves += 1
        this.state.lastSlidePath = outcome.path.map(p => ({ ...p }))

        if (outcome.kind === 'hazard') {
            this.state.crystalsCollected -= this.state.levelCrystalsCollected
            this.state.falls += 1
            this.state.resets += 1
            this.state.levelFalls += 1
            this.state.levelResets += 1
            this.loadLevel(this.state.levelIndex, {
                preserveRun: true,
                preserveLevelMoves: true,
                preserveLevelAttemptStats: true,
            })
            this.callbacks.onMove?.({
                moves: this.state.moves,
                levelMoves: this.state.levelMoves,
            })
            this.callbacks.onHazard?.()
            return
        }

        this.state.player = { ...outcome.end }
        if (outcome.crystals > 0) {
            this.state.levelCrystalsCollected += outcome.crystals
            this.state.crystalsCollected += outcome.crystals
            this.callbacks.onCrystal?.(this.state.crystalsCollected)
        }

        this.callbacks.onMove?.({
            moves: this.state.moves,
            levelMoves: this.state.levelMoves,
        })

        if (outcome.reachedGoal) {
            this.clearLevel()
        }
    }

    destroy(): void {
        this.stopTimer()
        this.callbacks = {}
    }

    private clearLevel(): void {
        const stage = this.getStage(this.state.levelIndex)
        const levelNumber = this.state.levelIndex + 1
        const mode = this.activeRun.mode
        const isObjectiveMode = isIceSlideObjectiveMode(mode)
        const scoringConfig = iceSlideScoringConfig(mode)
        const efficient = this.state.levelMoves <= stage.parMoves
        const totalCrystals = countCrystals(parseGrid(stage))
        const bonuses = isObjectiveMode
            ? this.state.objectiveIds.map(id => ({
                  id,
                  earned: isIceSlideObjectiveComplete(id, {
                      crystalsCollected: this.state.levelCrystalsCollected,
                      totalCrystals,
                      stageFalls: this.state.levelFalls,
                      stageResets: this.state.levelResets,
                  }),
              }))
            : []
        const bonusStarsEarned = bonuses.filter(item => item.earned).length
        const optionalStarsEarned = isObjectiveMode
            ? Number(efficient) + bonusStarsEarned
            : 0
        const scoringParams = {
            levelNumber,
            parMoves: stage.parMoves,
            movesUsed: this.state.levelMoves,
            crystalsCollected: this.state.levelCrystalsCollected,
        }
        const scoreGained = levelScore(
            {
                ...scoringParams,
                optionalStarsEarned,
                scoreMultiplierBps: stage.scoreMultiplierBps,
            },
            scoringConfig
        )
        const result: IceSlideStageClearResult = {
            stageNumber: levelNumber,
            stageName: stage.name,
            parMoves: stage.parMoves,
            movesUsed: this.state.levelMoves,
            crystalsCollected: this.state.levelCrystalsCollected,
            scoreGained,
            stars: {
                clear: true,
                efficient,
                bonuses,
                earnedCount: isObjectiveMode ? 1 + optionalStarsEarned : 0,
            },
        }

        this.state.score += scoreGained
        this.state.levelsCleared += 1
        if (efficient) {
            this.state.perfectLevels += 1
        }
        if (isObjectiveMode) {
            this.state.starsEarned += result.stars.earnedCount
        }
        this.callbacks.onScoreUpdate?.(this.state.score)

        if (this.state.levelIndex >= this.activeRun.stages.length - 1) {
            this.state.score += isObjectiveMode
                ? timeBonus(this.state.elapsedSeconds, scoringConfig)
                : timeBonus(this.state.elapsedSeconds)
            this.state.status = 'won'
            this.stopTimer()
            this.callbacks.onScoreUpdate?.(this.state.score)
            this.callbacks.onLevelClear?.(result)
            this.callbacks.onWin?.(this.state.score)
            return
        }

        this.loadLevel(this.state.levelIndex + 1, { preserveRun: true })
        if (mode === 'expedition' && (levelNumber === 2 || levelNumber === 4)) {
            this.state.pendingRouteChoiceAfterStage = levelNumber
        }
        this.callbacks.onLevelClear?.(result)
    }

    private loadLevel(
        index: number,
        options: {
            preserveRun?: boolean
            preserveLevelMoves?: boolean
            preserveLevelAttemptStats?: boolean
        } = {}
    ): void {
        const stage = this.getStage(index)
        const grid = cloneGrid(parseGrid(stage))
        const start = findStart(grid)
        // Start tile behaves as ice after spawn.
        grid[start.row][start.col] = 'ice'

        const preserved = options.preserveRun
            ? {
                  moves: this.state.moves,
                  crystalsCollected: this.state.crystalsCollected,
                  score: this.state.score,
                  elapsedSeconds: this.state.elapsedSeconds,
                  perfectLevels: this.state.perfectLevels,
                  levelsCleared: this.state.levelsCleared,
                  starsEarned: this.state.starsEarned,
                  falls: this.state.falls,
                  resets: this.state.resets,
                  routeChoices: [...this.state.routeChoices],
                  undoChargesAvailable: this.state.undoChargesAvailable,
                  undoChargesUsed: this.state.undoChargesUsed,
                  levelFalls: this.state.levelFalls,
                  levelResets: this.state.levelResets,
                  status: this.state.status,
              }
            : null

        this.state = {
            levelIndex: index,
            levelName: stage.name,
            rows: grid.length,
            cols: grid[0].length,
            grid,
            player: { ...start },
            start: { ...start },
            moves: preserved?.moves ?? 0,
            levelMoves: options.preserveLevelMoves ? this.state.levelMoves : 0,
            parMoves: stage.parMoves,
            objectiveIds: [...stage.objectiveIds],
            pendingRouteChoiceAfterStage: null,
            routeChoices: preserved?.routeChoices ?? [],
            undoChargesAvailable: preserved?.undoChargesAvailable ?? 0,
            undoChargesUsed: preserved?.undoChargesUsed ?? 0,
            starsPossible: this.starsPossibleForActiveRun(),
            levelFalls: options.preserveLevelAttemptStats
                ? (preserved?.levelFalls ?? 0)
                : 0,
            levelResets: options.preserveLevelAttemptStats
                ? (preserved?.levelResets ?? 0)
                : 0,
            crystalsCollected: preserved?.crystalsCollected ?? 0,
            levelCrystalsCollected: 0,
            score: preserved?.score ?? 0,
            elapsedSeconds: preserved?.elapsedSeconds ?? 0,
            status: preserved?.status ?? 'playing',
            perfectLevels: preserved?.perfectLevels ?? 0,
            levelsCleared: preserved?.levelsCleared ?? 0,
            lastSlidePath: [],
            ...this.runMetadata(),
            starsEarned: preserved?.starsEarned ?? 0,
            falls: preserved?.falls ?? 0,
            resets: preserved?.resets ?? 0,
        }
    }

    private startTimer(): void {
        this.stopTimer()
        this.elapsedTimer = setInterval(() => {
            if (this.state.status !== 'playing') {
                return
            }
            this.state.elapsedSeconds += 1
            this.callbacks.onTimeUpdate?.(this.state.elapsedSeconds)
        }, 1000)
    }

    private stopTimer(): void {
        if (this.elapsedTimer !== null) {
            clearInterval(this.elapsedTimer)
            this.elapsedTimer = null
        }
    }
}
