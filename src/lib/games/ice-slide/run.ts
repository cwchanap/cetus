import { hashString32Hex } from '../shared/seeded-rng'
import { ICE_SLIDE_LEVELS } from './levels'
import { BOARD_TRANSFORMS, serializeBoardRows } from './transforms'
import {
    GLYPH_TO_CELL,
    type BoardTransform,
    type IceSlideDifficulty,
    type IceSlideMode,
    type IceSlideObjectiveId,
    type IceSlideRunDefinition,
} from './types'

export const ICE_SLIDE_RUN_SCHEMA_VERSION = 1 as const
export const ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION = 1
export const ICE_SLIDE_RULESET_VERSION = 1

export const CAMPAIGN_RUN_KEY =
    `ice-slide:campaign:` +
    `g${ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION}:` +
    `r${ICE_SLIDE_RULESET_VERSION}`

export function createIceSlideStageSignature(input: {
    rows: readonly string[]
    parMoves: number
    transform: BoardTransform
    mutationIds: readonly string[]
    difficulty: IceSlideDifficulty
    objectiveIds: readonly IceSlideObjectiveId[]
    scoreMultiplierBps: number
}): string {
    const sortedMutationIds = [...input.mutationIds].sort()
    const sortedObjectiveIds = [...input.objectiveIds].sort()
    const payload = [
        'ice-slide-stage:v2',
        `rows=${serializeBoardRows(input.rows)}`,
        `parMoves=${input.parMoves}`,
        `transform=${input.transform}`,
        `mutationIds=${JSON.stringify(sortedMutationIds)}`,
        `difficulty=${input.difficulty}`,
        `objectiveIds=${sortedObjectiveIds.join(',')}`,
        `scoreMultiplierBps=${input.scoreMultiplierBps}`,
    ].join('\u001d')

    return `is2-${hashString32Hex(payload)}`
}

export const CAMPAIGN_STAGE_DIFFICULTIES: readonly IceSlideDifficulty[] = [
    'tutorial',
    'easy',
    'easy',
    'medium',
    'medium',
    'medium',
    'hard',
    'hard',
]

export function createCampaignRunDefinition(): IceSlideRunDefinition {
    if (CAMPAIGN_STAGE_DIFFICULTIES.length !== ICE_SLIDE_LEVELS.length) {
        throw new Error(
            'CAMPAIGN_STAGE_DIFFICULTIES and ICE_SLIDE_LEVELS must have the same length'
        )
    }
    return {
        schemaVersion: ICE_SLIDE_RUN_SCHEMA_VERSION,
        generatorVersion: ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION,
        rulesetVersion: ICE_SLIDE_RULESET_VERSION,
        mode: 'campaign',
        runKey: CAMPAIGN_RUN_KEY,
        seed: null,
        stages: ICE_SLIDE_LEVELS.map((level, index) => {
            const rows = [...level.rows]
            const stage = {
                id: `campaign:${level.id}`,
                name: level.name,
                templateId: `campaign:${level.id}`,
                difficulty: CAMPAIGN_STAGE_DIFFICULTIES[index],
                rows,
                parMoves: level.parMoves,
                transform: 'identity' as const,
                mutationIds: [],
                objectiveIds: [],
                scoreMultiplierBps: 10000,
                signature: '',
            }
            stage.signature = createIceSlideStageSignature(stage)
            return stage
        }),
    }
}

const RUN_KEY_PATTERN = /^[A-Za-z0-9:._-]+$/
const RUN_KEY_MAX_LENGTH = 128
const DAILY_KEY_PATTERN =
    /^ice-slide:daily:(\d{4}-\d{2}-\d{2}):g([1-9]\d*):r([1-9]\d*)$/
const UTC_DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const EXPEDITION_KEY_PATTERN =
    /^ice-slide:expedition:([0-9a-f]{8}):g([1-9]\d*):r([1-9]\d*)$/

const MODE_RECORD = {
    campaign: true,
    daily: true,
    expedition: true,
} as const satisfies Record<IceSlideMode, true>
const DIFFICULTY_RECORD = {
    tutorial: true,
    easy: true,
    medium: true,
    hard: true,
} as const satisfies Record<IceSlideDifficulty, true>
const OBJECTIVE_RECORD = {
    collect_all_crystals: true,
    no_falls: true,
    no_reset: true,
} as const satisfies Record<IceSlideObjectiveId, true>

const MODES = new Set<IceSlideMode>(Object.keys(MODE_RECORD) as IceSlideMode[])
const DIFFICULTIES = new Set<IceSlideDifficulty>(
    Object.keys(DIFFICULTY_RECORD) as IceSlideDifficulty[]
)
const OBJECTIVES = new Set<IceSlideObjectiveId>(
    Object.keys(OBJECTIVE_RECORD) as IceSlideObjectiveId[]
)
const TRANSFORMS = new Set<BoardTransform>(BOARD_TRANSFORMS)

export function assertValidIceSlideUtcDateKey(dateKey: string): void {
    const match = UTC_DATE_KEY_PATTERN.exec(dateKey)
    if (!match) {
        throw new RangeError(
            'daily runKey date must be a calendar-valid YYYY-MM-DD date'
        )
    }

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const date = new Date()
    date.setUTCFullYear(year, month - 1, day)
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new RangeError(
            'daily runKey date must be a calendar-valid YYYY-MM-DD date'
        )
    }
}

function assertPositiveInt(value: number, field: string): void {
    if (!Number.isInteger(value) || value < 1 || value > 0x7fffffff) {
        throw new RangeError(`${field} must be a positive signed integer`)
    }
}

function assertUniqueNonEmpty(values: readonly string[], field: string): void {
    const seen = new Set<string>()
    for (const value of values) {
        if (value.length === 0 || seen.has(value)) {
            throw new RangeError(
                `${field} must contain unique non-empty values`
            )
        }
        seen.add(value)
    }
}

export function assertValidIceSlideRunDefinition(
    run: IceSlideRunDefinition
): void {
    if (run.schemaVersion !== ICE_SLIDE_RUN_SCHEMA_VERSION) {
        throw new RangeError(
            `schemaVersion must be ${ICE_SLIDE_RUN_SCHEMA_VERSION}`
        )
    }
    assertPositiveInt(run.generatorVersion, 'generatorVersion')
    assertPositiveInt(run.rulesetVersion, 'rulesetVersion')
    if (!MODES.has(run.mode)) {
        throw new RangeError(`unknown run mode "${run.mode}"`)
    }

    if (
        run.runKey.length > RUN_KEY_MAX_LENGTH ||
        !RUN_KEY_PATTERN.test(run.runKey)
    ) {
        throw new RangeError(
            `runKey must be transport-safe and at most ${RUN_KEY_MAX_LENGTH} characters`
        )
    }

    if (run.mode === 'campaign') {
        if (run.runKey !== CAMPAIGN_RUN_KEY) {
            throw new RangeError(`campaign runKey must be ${CAMPAIGN_RUN_KEY}`)
        }
        if (
            run.generatorVersion !== ICE_SLIDE_CAMPAIGN_GENERATOR_VERSION ||
            run.rulesetVersion !== ICE_SLIDE_RULESET_VERSION
        ) {
            throw new RangeError(
                'campaign versions must match the campaign runKey'
            )
        }
        if (run.seed !== null) {
            throw new RangeError('campaign seed must be null')
        }
    } else if (run.mode === 'daily') {
        const identity = parseIceSlideDailyRunKey(run.runKey)
        if (!identity) {
            throw new RangeError('daily runKey must match the daily key format')
        }
        if (run.generatorVersion !== identity.generatorVersion) {
            throw new RangeError('daily generatorVersion must match the runKey')
        }
        if (run.rulesetVersion !== identity.rulesetVersion) {
            throw new RangeError('daily rulesetVersion must match the runKey')
        }
        const expectedSeed =
            `ice-slide:daily:${identity.generatorVersion}:` +
            `${identity.rulesetVersion}:${identity.dateKey}`
        if (run.seed !== expectedSeed) {
            throw new RangeError(
                'daily seed must match the runKey date and versions'
            )
        }
    } else {
        const match = EXPEDITION_KEY_PATTERN.exec(run.runKey)
        if (!match) {
            throw new RangeError(
                'expedition runKey must match the expedition key format'
            )
        }
        const keyHash = match[1]
        const generatorVersion = Number(match[2])
        const rulesetVersion = Number(match[3])
        if (run.generatorVersion !== generatorVersion) {
            throw new RangeError(
                'expedition generatorVersion must match the runKey'
            )
        }
        if (run.rulesetVersion !== rulesetVersion) {
            throw new RangeError(
                'expedition rulesetVersion must match the runKey'
            )
        }
        if (
            run.seed === null ||
            run.seed.length === 0 ||
            run.seed.includes('\u001f')
        ) {
            throw new RangeError(
                'expedition seed must be non-empty without U+001F'
            )
        }
        if (hashString32Hex(run.seed) !== keyHash) {
            throw new RangeError(
                'expedition runKey hash must equal hashString32Hex(seed)'
            )
        }
    }

    if (
        !Number.isInteger(run.stages.length) ||
        run.stages.length < 1 ||
        run.stages.length > 64
    ) {
        throw new RangeError('run must contain between 1 and 64 stages')
    }
    assertUniqueNonEmpty(
        run.stages.map(stage => stage.id),
        'stage ids'
    )

    for (const stage of run.stages) {
        if (!DIFFICULTIES.has(stage.difficulty)) {
            throw new RangeError(
                `unknown stage difficulty "${stage.difficulty}"`
            )
        }
        if (!TRANSFORMS.has(stage.transform)) {
            throw new RangeError(`unknown stage transform "${stage.transform}"`)
        }
        if (stage.rows.length === 0) {
            throw new RangeError('stage rows must not be empty')
        }
        const cols = stage.rows[0].length
        if (cols === 0) {
            throw new RangeError('stage rows must not have zero columns')
        }
        for (const row of stage.rows) {
            if (row.length !== cols) {
                throw new RangeError('stage rows must be rectangular')
            }
        }
        for (const row of stage.rows) {
            for (const glyph of row) {
                if (!GLYPH_TO_CELL[glyph]) {
                    throw new RangeError(`unknown stage glyph "${glyph}"`)
                }
            }
        }
        assertPositiveInt(stage.parMoves, 'parMoves')
        if (
            !Number.isInteger(stage.scoreMultiplierBps) ||
            stage.scoreMultiplierBps < 1000 ||
            stage.scoreMultiplierBps > 50000
        ) {
            throw new RangeError(
                'scoreMultiplierBps must be an integer from 1000 through 50000'
            )
        }
        assertUniqueNonEmpty(stage.mutationIds, 'mutation ids')
        assertUniqueNonEmpty(stage.objectiveIds, 'objective ids')
        for (const objectiveId of stage.objectiveIds) {
            if (!OBJECTIVES.has(objectiveId)) {
                throw new RangeError(`unknown objective "${objectiveId}"`)
            }
        }
        const expectedSignature = createIceSlideStageSignature({
            rows: stage.rows,
            parMoves: stage.parMoves,
            transform: stage.transform,
            mutationIds: stage.mutationIds,
            difficulty: stage.difficulty,
            objectiveIds: stage.objectiveIds,
            scoreMultiplierBps: stage.scoreMultiplierBps,
        })
        if (stage.signature !== expectedSignature) {
            throw new RangeError(
                'stage signature does not match its definition'
            )
        }
    }
}

export interface IceSlideDailyRunIdentity {
    dateKey: string
    generatorVersion: number
    rulesetVersion: number
}

export function parseIceSlideDailyRunKey(
    runKey: string
): IceSlideDailyRunIdentity | null {
    const match = DAILY_KEY_PATTERN.exec(runKey)
    if (!match) {
        return null
    }

    try {
        assertValidIceSlideUtcDateKey(match[1])
    } catch {
        return null
    }

    const generatorVersion = Number(match[2])
    const rulesetVersion = Number(match[3])
    if (
        !Number.isSafeInteger(generatorVersion) ||
        generatorVersion < 1 ||
        !Number.isSafeInteger(rulesetVersion) ||
        rulesetVersion < 1
    ) {
        return null
    }

    return {
        dateKey: match[1],
        generatorVersion,
        rulesetVersion,
    }
}

export function formatIceSlideDailyRunKey(
    identity: IceSlideDailyRunIdentity
): string {
    assertValidIceSlideUtcDateKey(identity.dateKey)
    assertPositiveInt(identity.generatorVersion, 'generatorVersion')
    assertPositiveInt(identity.rulesetVersion, 'rulesetVersion')
    return (
        `ice-slide:daily:${identity.dateKey}:` +
        `g${identity.generatorVersion}:r${identity.rulesetVersion}`
    )
}

export function cloneIceSlideRunDefinition(
    run: IceSlideRunDefinition
): IceSlideRunDefinition {
    return {
        ...run,
        stages: run.stages.map(stage => ({
            ...stage,
            rows: [...stage.rows],
            mutationIds: [...stage.mutationIds],
            objectiveIds: [...stage.objectiveIds],
        })),
    }
}
