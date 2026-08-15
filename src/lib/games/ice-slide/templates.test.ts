import { describe, expect, it } from 'vitest'
import { validateIceSlideStageQuality } from './quality'
import { getUniqueBoardTransforms } from './transforms'
import {
    assertValidIceSlideTemplateCatalog,
    ICE_SLIDE_EXPEDITION_FALLBACKS,
    ICE_SLIDE_EXPEDITION_TEMPLATES,
    type IceSlideTemplateCatalog,
} from './templates'

function cloneCatalog(): IceSlideTemplateCatalog {
    return structuredClone({
        templates: ICE_SLIDE_EXPEDITION_TEMPLATES,
        fallbacks: ICE_SLIDE_EXPEDITION_FALLBACKS,
    })
}

describe('ice-slide expedition templates: catalog identity', () => {
    it('has three templates per tier with exact fallback links', () => {
        expect(
            ICE_SLIDE_EXPEDITION_TEMPLATES.map(template => [
                template.difficulty,
                template.id,
                template.fallbackVariantId,
            ])
        ).toEqual([
            ['easy', 'easy-open-lane', 'easy-open-lane-v1'],
            ['easy', 'easy-corner-pocket', 'easy-corner-pocket-v1'],
            ['easy', 'easy-bank-shot', 'easy-bank-shot-v1'],
            ['medium', 'medium-thin-ice', 'medium-thin-ice-v1'],
            ['medium', 'medium-crystal-cache', 'medium-crystal-cache-v1'],
            ['medium', 'medium-fracture-zone', 'medium-fracture-zone-v1'],
            ['hard', 'hard-deep-freeze', 'hard-deep-freeze-v1'],
            ['hard', 'hard-absolute-zero', 'hard-absolute-zero-v1'],
            ['hard', 'hard-zero-cross', 'hard-zero-cross-v1'],
        ])
    })
})

describe('ice-slide expedition templates: structural validation', () => {
    it('accepts the checked-in catalog and an unmodified clone', () => {
        expect(() => assertValidIceSlideTemplateCatalog()).not.toThrow()
        expect(() =>
            assertValidIceSlideTemplateCatalog(cloneCatalog())
        ).not.toThrow()
    })

    const invalidCases: Array<{
        label: string
        mutate: (catalog: IceSlideTemplateCatalog) => void
    }> = [
        {
            label: 'empty template IDs',
            mutate: catalog => {
                catalog.templates[0].id = ''
            },
        },
        {
            label: 'duplicate template IDs',
            mutate: catalog => {
                catalog.templates[1].id = catalog.templates[0].id
            },
        },
        {
            label: 'empty fallback IDs',
            mutate: catalog => {
                catalog.fallbacks[0].id = ''
            },
        },
        {
            label: 'duplicate fallback IDs',
            mutate: catalog => {
                catalog.fallbacks[1].id = catalog.fallbacks[0].id
            },
        },
        {
            label: 'duplicate goal IDs',
            mutate: catalog => {
                catalog.templates[0].slots.goals[1].id =
                    catalog.templates[0].slots.goals[0].id
            },
        },
        {
            label: 'duplicate pattern IDs',
            mutate: catalog => {
                catalog.templates[0].slots.rocks[1].id =
                    catalog.templates[0].slots.rocks[0].id
            },
        },
        {
            label: 'empty baseRows',
            mutate: catalog => {
                catalog.templates[0].baseRows = []
            },
        },
        {
            label: 'non-rectangular baseRows',
            mutate: catalog => {
                catalog.templates[0].baseRows = ['#####', '####']
            },
        },
        {
            label: 'empty fallback rows',
            mutate: catalog => {
                catalog.fallbacks[0].rows = []
            },
        },
        {
            label: 'non-rectangular fallback rows',
            mutate: catalog => {
                catalog.fallbacks[0].rows = ['#####', '####']
            },
        },
        {
            label: 'baseRows without a start',
            mutate: catalog => {
                catalog.templates[0].baseRows = [
                    '#####',
                    '#...#',
                    '#...#',
                    '#...#',
                    '#####',
                ]
            },
        },
        {
            label: 'baseRows with multiple starts',
            mutate: catalog => {
                catalog.templates[0].baseRows = [
                    '#####',
                    '#S#.#',
                    '#S..#',
                    '#...#',
                    '#####',
                ]
            },
        },
        ...(['G', 'O', 'H', 'C'] as const).map(glyph => ({
            label: `forbidden ${glyph} in baseRows`,
            mutate: (catalog: IceSlideTemplateCatalog) => {
                catalog.templates[0].baseRows[1] = `#S.${glyph}#`
            },
        })),
        {
            label: 'empty allowedTransforms',
            mutate: catalog => {
                catalog.templates[0].allowedTransforms = []
            },
        },
        {
            label: 'duplicate allowedTransforms',
            mutate: catalog => {
                catalog.templates[0].allowedTransforms = [
                    'identity',
                    'identity',
                ]
            },
        },
        {
            label: 'missing goal alternatives',
            mutate: catalog => {
                catalog.templates[0].slots.goals = []
            },
        },
        {
            label: 'missing rock alternatives',
            mutate: catalog => {
                catalog.templates[0].slots.rocks = []
            },
        },
        {
            label: 'missing hazard alternatives',
            mutate: catalog => {
                catalog.templates[0].slots.hazards = []
            },
        },
        {
            label: 'missing crystal alternatives',
            mutate: catalog => {
                catalog.templates[0].slots.crystals = []
            },
        },
        {
            label: 'out-of-bounds goal positions',
            mutate: catalog => {
                catalog.templates[0].slots.goals[0].position = {
                    row: 99,
                    col: 99,
                }
            },
        },
        {
            label: 'goal positions off the ice',
            mutate: catalog => {
                catalog.templates[0].slots.goals[0].position = {
                    row: 0,
                    col: 0,
                }
            },
        },
        {
            label: 'duplicate coordinates inside a pattern',
            mutate: catalog => {
                catalog.templates[0].slots.rocks[1].positions = [
                    { row: 2, col: 2 },
                    { row: 2, col: 2 },
                ]
            },
        },
        {
            label: 'zero parBand.minMoves',
            mutate: catalog => {
                catalog.templates[0].constraints.parBand = {
                    minMoves: 0,
                    maxMoves: 4,
                }
            },
        },
        {
            label: 'inverted par band',
            mutate: catalog => {
                catalog.templates[0].constraints.parBand = {
                    minMoves: 5,
                    maxMoves: 4,
                }
            },
        },
        {
            label: 'zero minReachableStops',
            mutate: catalog => {
                catalog.templates[0].constraints.minReachableStops = 0
            },
        },
        {
            label: 'negative maxHazards',
            mutate: catalog => {
                catalog.templates[0].constraints.maxHazards = -1
            },
        },
        {
            label: 'unresolvable fallbackVariantId',
            mutate: catalog => {
                catalog.templates[0].fallbackVariantId = 'missing-v1'
            },
        },
        {
            label: 'fallback template mismatch',
            mutate: catalog => {
                catalog.fallbacks[0].templateId = 'easy-bank-shot'
            },
        },
        {
            label: 'fallback difficulty mismatch',
            mutate: catalog => {
                catalog.fallbacks[0].difficulty = 'hard'
            },
        },
    ]

    for (const { label, mutate } of invalidCases) {
        it(`rejects ${label}`, () => {
            const catalog = cloneCatalog()
            mutate(catalog)
            expect(() => assertValidIceSlideTemplateCatalog(catalog)).toThrow(
                RangeError
            )
        })
    }
})

describe('ice-slide expedition templates: transform-orbit uniqueness', () => {
    it('has nine distinct base family orbit keys', () => {
        function orbitKey(rows: readonly string[]): string {
            return getUniqueBoardTransforms(rows)
                .map(variant => variant.canonicalKey)
                .sort()[0]
        }

        const keys = ICE_SLIDE_EXPEDITION_TEMPLATES.map(template =>
            orbitKey(template.baseRows)
        )
        expect(new Set(keys).size).toBe(keys.length)
    })
})

describe('ice-slide expedition templates: fallback quality', () => {
    it('accepts every fallback under its owning template constraints', () => {
        for (const fallback of ICE_SLIDE_EXPEDITION_FALLBACKS) {
            const template = ICE_SLIDE_EXPEDITION_TEMPLATES.find(
                candidate => candidate.id === fallback.templateId
            )
            expect(template, `template for ${fallback.id}`).toBeDefined()
            if (!template) {
                continue
            }
            const result = validateIceSlideStageQuality(
                {
                    id: fallback.id,
                    rows: fallback.rows,
                    objectiveIds: [],
                },
                {
                    parBand: template.constraints.parBand,
                    maxStates: 10_000,
                    minReachableStops: template.constraints.minReachableStops,
                    maxHazards: template.constraints.maxHazards,
                }
            )
            expect(result, fallback.id).toMatchObject({ accepted: true })
            if (fallback.id === 'hard-zero-cross-v1' && result.accepted) {
                expect(result.parMoves, fallback.id).toBe(5)
            }
        }
    })
})
