import { hashString32Hex } from '../shared/seeded-rng'
import { ICE_SLIDE_DAILY_GENERATOR_VERSION } from './daily'
import {
    assertValidIceSlideRunDefinition,
    createIceSlideStageSignature,
    assertValidIceSlideUtcDateKey,
    ICE_SLIDE_RULESET_VERSION,
    ICE_SLIDE_RUN_SCHEMA_VERSION,
} from './run'
import type {
    Direction,
    IceSlideRunDefinition,
    IceSlideStageDefinition,
} from './types'

export function createTestStage(
    overrides: Partial<IceSlideStageDefinition> = {}
): IceSlideStageDefinition {
    const base: IceSlideStageDefinition = {
        id: 'test:1',
        name: 'Test Stage',
        templateId: 'test:1',
        difficulty: 'easy',
        rows: ['#####', '#S.G#', '#####'],
        parMoves: 1,
        transform: 'identity',
        mutationIds: [],
        objectiveIds: [],
        scoreMultiplierBps: 10000,
        signature: '',
    }
    const stage = {
        ...base,
        ...overrides,
        rows: [...(overrides.rows ?? base.rows)],
        mutationIds: [...(overrides.mutationIds ?? base.mutationIds)],
        objectiveIds: [...(overrides.objectiveIds ?? base.objectiveIds)],
    }
    stage.signature = createIceSlideStageSignature(stage)
    return stage
}

export function createTestRun(
    stages: IceSlideStageDefinition[] = [createTestStage()],
    overrides: Partial<IceSlideRunDefinition> = {}
): IceSlideRunDefinition {
    return {
        schemaVersion: ICE_SLIDE_RUN_SCHEMA_VERSION,
        generatorVersion: 1,
        rulesetVersion: ICE_SLIDE_RULESET_VERSION,
        mode: 'expedition',
        runKey:
            'ice-slide:expedition:' +
            hashString32Hex('test-seed') +
            `:g1:r${ICE_SLIDE_RULESET_VERSION}`,
        seed: 'test-seed',
        stages: stages.map(stage => ({
            ...stage,
            rows: [...stage.rows],
            mutationIds: [...stage.mutationIds],
            objectiveIds: [...stage.objectiveIds],
        })),
        ...overrides,
    }
}

function fiveSimpleStages(): IceSlideStageDefinition[] {
    const boards = [
        { rows: ['#####', '#S.G#', '#####'], parMoves: 1 },
        { rows: ['#####', '#S..#', '#G..#', '#####'], parMoves: 1 },
        { rows: ['######', '#S..G#', '######'], parMoves: 1 },
        {
            rows: ['#####', '#S..#', '#..G#', '#####'],
            parMoves: 2,
        },
        {
            rows: ['######', '#S...#', '#..G.#', '######'],
            parMoves: 2,
        },
    ]
    return boards.map((board, index) =>
        createTestStage({
            id: `daily:test:${index + 1}`,
            name: `Daily Test ${index + 1}`,
            templateId: `test:${index + 1}`,
            objectiveIds: ['no_falls'],
            ...board,
        })
    )
}

export function createTestDailyRun(
    stages: IceSlideStageDefinition[] = fiveSimpleStages(),
    dateKey = '2026-08-12'
): IceSlideRunDefinition {
    assertValidIceSlideUtcDateKey(dateKey)
    const stageCopies = stages.map(stage => {
        const copy = {
            ...stage,
            rows: [...stage.rows],
            mutationIds: [...stage.mutationIds],
            objectiveIds: [...stage.objectiveIds],
        }
        copy.signature = createIceSlideStageSignature(copy)
        return copy
    })
    const seed =
        `ice-slide:daily:${ICE_SLIDE_DAILY_GENERATOR_VERSION}:` +
        `${ICE_SLIDE_RULESET_VERSION}:${dateKey}`
    const run: IceSlideRunDefinition = {
        schemaVersion: ICE_SLIDE_RUN_SCHEMA_VERSION,
        generatorVersion: ICE_SLIDE_DAILY_GENERATOR_VERSION,
        rulesetVersion: ICE_SLIDE_RULESET_VERSION,
        mode: 'daily',
        runKey:
            `ice-slide:daily:${dateKey}:` +
            `g${ICE_SLIDE_DAILY_GENERATOR_VERSION}:r${ICE_SLIDE_RULESET_VERSION}`,
        seed,
        stages: stageCopies,
    }
    assertValidIceSlideRunDefinition(run)
    return run
}

/**
 * Frozen minimum-move direction sequence that completes the deterministic
 * generator-v1 2026-08-12 Daily. Shared by the unit replay (daily.test.ts) and
 * the Playwright Ice Slide coverage; the latter derives arrow keys from it via
 * a local map so no second copy of the sequence exists.
 */
export const ICE_SLIDE_DAILY_2026_08_12_DIRECTIONS = [
    ['S', 'E', 'S'],
    ['N', 'W', 'N', 'W'],
    ['W', 'N', 'E', 'S', 'W', 'N'],
    ['S', 'W', 'N', 'E', 'S', 'W'],
    ['E', 'S', 'W', 'N', 'E', 'S'],
] as const satisfies readonly (readonly Direction[])[]
