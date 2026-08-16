import { hashString32Hex } from '../shared/seeded-rng'
import {
    ICE_SLIDE_EXPEDITION_GENERATOR_VERSION,
    createIceSlideExpeditionStage,
} from './generator'
import {
    ICE_SLIDE_RUN_SCHEMA_VERSION,
    assertValidIceSlideRunDefinition,
    formatIceSlideExpeditionRunKey,
} from './run'
import type { IceSlideRunDefinition } from './types'

export const ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2

export const ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES = [
    'easy',
    'easy',
    'medium',
    'medium',
    'hard',
    'hard',
] as const

export function createIceSlideExpeditionRunDefinition(
    seed: string
): IceSlideRunDefinition {
    if (seed.length === 0) {
        throw new RangeError('seed must be non-empty')
    }

    const canonicalKeys = new Set<string>()
    const stages = ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES.map(
        (difficulty, index) => {
            const generated = createIceSlideExpeditionStage({
                seed,
                stageNumber: index + 1,
                difficulty,
                existingCanonicalKeys: canonicalKeys,
            })
            canonicalKeys.add(generated.canonicalKey)
            return generated.stage
        }
    )

    const run: IceSlideRunDefinition = {
        schemaVersion: ICE_SLIDE_RUN_SCHEMA_VERSION,
        generatorVersion: ICE_SLIDE_EXPEDITION_GENERATOR_VERSION,
        rulesetVersion: ICE_SLIDE_EXPEDITION_RULESET_VERSION,
        mode: 'expedition',
        runKey: formatIceSlideExpeditionRunKey({
            seedHash: hashString32Hex(seed),
            generatorVersion: ICE_SLIDE_EXPEDITION_GENERATOR_VERSION,
            rulesetVersion: ICE_SLIDE_EXPEDITION_RULESET_VERSION,
        }),
        seed,
        stages,
    }

    assertValidIceSlideRunDefinition(run)
    return run
}
