import { describe, expect, it } from 'vitest'
import { serializeBoardRows } from './transforms'
import { assertValidIceSlideRunDefinition } from './run'
import {
    createIceSlideDailyRunDefinition,
    ICE_SLIDE_DAILY_GENERATOR_VERSION,
    ICE_SLIDE_DAILY_SOLVER_MAX_STATES,
    ICE_SLIDE_DAILY_STAGE_POOLS,
    toIceSlideUtcDateKey,
} from './daily'

describe('Ice Slide Daily date keys', () => {
    it('formats a Date in UTC', () => {
        expect(toIceSlideUtcDateKey(new Date('2026-08-12T23:59:59Z'))).toBe(
            '2026-08-12'
        )
    })

    it('rejects invalid Dates', () => {
        expect(() => toIceSlideUtcDateKey(new Date(Number.NaN))).toThrow(
            RangeError
        )
    })

    it('rejects Dates outside the YYYY-MM-DD transport range', () => {
        expect(() =>
            toIceSlideUtcDateKey(new Date(Date.UTC(10000, 0, 1)))
        ).toThrow(RangeError)
        expect(() =>
            toIceSlideUtcDateKey(new Date(Date.UTC(-1, 0, 1)))
        ).toThrow(RangeError)
    })
})

describe('Ice Slide Daily generator v1', () => {
    it('locks the generator constants and authored stage pools', () => {
        expect(ICE_SLIDE_DAILY_GENERATOR_VERSION).toBe(1)
        expect(ICE_SLIDE_DAILY_SOLVER_MAX_STATES).toBe(10_000)
        expect(ICE_SLIDE_DAILY_STAGE_POOLS).toEqual([
            [1, 2],
            [2, 3],
            [3, 4, 5],
            [5, 6, 7],
            [7, 8],
        ])
    })

    it('fails loudly when generator v1 output changes; version-bump decision required', () => {
        const run = createIceSlideDailyRunDefinition('2026-08-12')

        expect(run).toMatchObject({
            schemaVersion: 1,
            generatorVersion: 1,
            rulesetVersion: 1,
            mode: 'daily',
            seed: 'ice-slide:daily:1:1:2026-08-12',
            runKey: 'ice-slide:daily:2026-08-12:g1:r1',
        })

        expect(
            run.stages.map(stage => ({
                id: stage.id,
                name: stage.name,
                templateId: stage.templateId,
                transform: stage.transform,
                objectiveIds: stage.objectiveIds,
                parMoves: stage.parMoves,
                difficulty: stage.difficulty,
                signature: stage.signature,
            }))
        ).toEqual([
            {
                id: 'daily:2026-08-12:1',
                name: 'Corner Pocket',
                templateId: 'campaign:2',
                transform: 'identity',
                objectiveIds: ['no_reset'],
                parMoves: 3,
                difficulty: 'easy',
                signature: 'is2-8c5387f7',
            },
            {
                id: 'daily:2026-08-12:2',
                name: 'Bank Shot',
                templateId: 'campaign:3',
                transform: 'rotate_180',
                objectiveIds: ['no_reset'],
                parMoves: 4,
                difficulty: 'easy',
                signature: 'is2-c8c370cb',
            },
            {
                id: 'daily:2026-08-12:3',
                name: 'Crystal Cache',
                templateId: 'campaign:5',
                transform: 'reflect_anti_diagonal',
                objectiveIds: ['collect_all_crystals'],
                parMoves: 6,
                difficulty: 'medium',
                signature: 'is2-2394afd9',
            },
            {
                id: 'daily:2026-08-12:4',
                name: 'Deep Freeze',
                templateId: 'campaign:7',
                transform: 'reflect_vertical',
                objectiveIds: ['collect_all_crystals'],
                parMoves: 6,
                difficulty: 'hard',
                signature: 'is2-07d0c27d',
            },
            {
                id: 'daily:2026-08-12:5',
                name: 'Absolute Zero',
                templateId: 'campaign:8',
                transform: 'reflect_main_diagonal',
                objectiveIds: ['no_reset'],
                parMoves: 6,
                difficulty: 'hard',
                signature: 'is2-c31fa49b',
            },
        ])
    })

    it('materializes deterministic, unique, validated stages', () => {
        const first = createIceSlideDailyRunDefinition('2026-08-12')
        const second = createIceSlideDailyRunDefinition('2026-08-12')

        expect(JSON.stringify(first)).toBe(JSON.stringify(second))
        expect(first.stages).toHaveLength(5)

        const templateIds = first.stages.map(stage => stage.templateId)
        const boardKeys = first.stages.map(stage =>
            serializeBoardRows(stage.rows)
        )
        expect(new Set(templateIds).size).toBe(5)
        expect(new Set(boardKeys).size).toBe(5)

        const stagePools = [
            [1, 2],
            [2, 3],
            [3, 4, 5],
            [5, 6, 7],
            [7, 8],
        ]
        for (const [index, stage] of first.stages.entries()) {
            const templateId = Number(
                stage.templateId.slice('campaign:'.length)
            )
            expect(stagePools[index]).toContain(templateId)
            expect(stage.objectiveIds).toHaveLength(1)
            expect(stage.mutationIds).toEqual([])
            expect(stage.scoreMultiplierBps).toBe(10_000)
            expect(stage.parMoves).toBeGreaterThan(0)
        }

        expect(() => assertValidIceSlideRunDefinition(first)).not.toThrow()
    })

    it('varies by date while remaining deterministic', () => {
        const first = createIceSlideDailyRunDefinition('2026-01-01')
        const second = createIceSlideDailyRunDefinition('2026-01-02')

        expect(JSON.stringify(first)).not.toBe(JSON.stringify(second))
        expect(JSON.stringify(first)).toBe(
            JSON.stringify(createIceSlideDailyRunDefinition('2026-01-01'))
        )
        expect(JSON.stringify(second)).toBe(
            JSON.stringify(createIceSlideDailyRunDefinition('2026-01-02'))
        )
    })

    it('does not reuse a source template when stage pools overlap', () => {
        const run = createIceSlideDailyRunDefinition('2026-01-01')
        const templateIds = run.stages.map(stage => stage.templateId)

        expect(new Set(templateIds).size).toBe(run.stages.length)
    })

    it('materializes every calendar date in 2026', () => {
        for (
            let day = new Date('2026-01-01T00:00:00Z');
            day <= new Date('2026-12-31T00:00:00Z');
            day = new Date(day.getTime() + 86_400_000)
        ) {
            const run = createIceSlideDailyRunDefinition(
                toIceSlideUtcDateKey(day)
            )
            expect(
                new Set(run.stages.map(stage => stage.templateId)).size
            ).toBe(run.stages.length)
        }
    })
})
