import { hashString32Hex } from '../shared/seeded-rng'
import {
    createIceSlideStageSignature,
    ICE_SLIDE_RULESET_VERSION,
    ICE_SLIDE_RUN_SCHEMA_VERSION,
} from './run'
import type { IceSlideRunDefinition, IceSlideStageDefinition } from './types'

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
            'ice-slide:expedition:' + hashString32Hex('test-seed') + ':g1:r1',
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
