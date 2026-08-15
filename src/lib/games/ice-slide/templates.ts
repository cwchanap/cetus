import { BOARD_TRANSFORMS, getUniqueBoardTransforms } from './transforms'
import type { BoardTransform, GridPosition, IceSlideDifficulty } from './types'

export type IceSlideTemplateDifficulty = Exclude<IceSlideDifficulty, 'tutorial'>

export interface IceSlideNamedPosition {
    id: string
    position: GridPosition
}

export interface IceSlideNamedPositionPattern {
    id: string
    positions: GridPosition[]
}

export interface IceSlideTemplate {
    id: string
    name: string
    difficulty: IceSlideTemplateDifficulty
    baseRows: string[]
    allowedTransforms: BoardTransform[]
    slots: {
        goals: IceSlideNamedPosition[]
        rocks: IceSlideNamedPositionPattern[]
        hazards: IceSlideNamedPositionPattern[]
        crystals: IceSlideNamedPositionPattern[]
    }
    constraints: {
        parBand: { minMoves: number; maxMoves: number }
        minReachableStops: number
        maxHazards: number
    }
    fallbackVariantId: string
}

export interface IceSlideTemplateFallback {
    id: string
    templateId: string
    difficulty: IceSlideTemplateDifficulty
    rows: string[]
}

export interface IceSlideTemplateCatalog {
    templates: readonly IceSlideTemplate[]
    fallbacks: readonly IceSlideTemplateFallback[]
}

export const ICE_SLIDE_EXPEDITION_TEMPLATES: readonly IceSlideTemplate[] = [
    {
        id: 'easy-open-lane',
        name: 'Open Lane',
        difficulty: 'easy',
        baseRows: ['#####', '#S..#', '#...#', '#...#', '#####'],
        allowedTransforms: [...BOARD_TRANSFORMS],
        slots: {
            goals: [
                { id: 'goal:south', position: { row: 3, col: 1 } },
                { id: 'goal:southeast', position: { row: 3, col: 3 } },
                { id: 'goal:east', position: { row: 2, col: 3 } },
            ],
            rocks: [
                { id: 'rocks:none', positions: [] },
                { id: 'rocks:center', positions: [{ row: 2, col: 2 }] },
            ],
            hazards: [
                { id: 'hazards:none', positions: [] },
                { id: 'hazards:west', positions: [{ row: 2, col: 1 }] },
            ],
            crystals: [
                { id: 'crystals:none', positions: [] },
                {
                    id: 'crystals:northeast',
                    positions: [{ row: 1, col: 3 }],
                },
                {
                    id: 'crystals:south-mid',
                    positions: [{ row: 3, col: 2 }],
                },
            ],
        },
        constraints: {
            parBand: { minMoves: 1, maxMoves: 4 },
            minReachableStops: 3,
            maxHazards: 1,
        },
        fallbackVariantId: 'easy-open-lane-v1',
    },
    {
        id: 'easy-corner-pocket',
        name: 'Corner Pocket',
        difficulty: 'easy',
        baseRows: ['######', '#S#..#', '#....#', '##.#.#', '#....#', '######'],
        allowedTransforms: [...BOARD_TRANSFORMS],
        slots: {
            goals: [
                { id: 'goal:southeast', position: { row: 4, col: 4 } },
                { id: 'goal:northeast', position: { row: 1, col: 4 } },
                { id: 'goal:east-pocket', position: { row: 3, col: 4 } },
            ],
            rocks: [
                { id: 'rocks:none', positions: [] },
                {
                    id: 'rocks:center-left',
                    positions: [{ row: 2, col: 2 }],
                },
                { id: 'rocks:lower-mid', positions: [{ row: 4, col: 2 }] },
            ],
            hazards: [
                { id: 'hazards:none', positions: [] },
                { id: 'hazards:center', positions: [{ row: 2, col: 3 }] },
            ],
            crystals: [
                { id: 'crystals:none', positions: [] },
                {
                    id: 'crystals:left-mid',
                    positions: [{ row: 2, col: 1 }],
                },
                {
                    id: 'crystals:lower-left',
                    positions: [{ row: 4, col: 1 }],
                },
            ],
        },
        constraints: {
            parBand: { minMoves: 2, maxMoves: 5 },
            minReachableStops: 3,
            maxHazards: 1,
        },
        fallbackVariantId: 'easy-corner-pocket-v1',
    },
    {
        id: 'easy-bank-shot',
        name: 'Bank Shot',
        difficulty: 'easy',
        baseRows: [
            '#######',
            '#S.#..#',
            '#...#.#',
            '##....#',
            '#.#.#.#',
            '#.....#',
            '#######',
        ],
        allowedTransforms: [...BOARD_TRANSFORMS],
        slots: {
            goals: [
                { id: 'goal:southeast', position: { row: 5, col: 5 } },
                { id: 'goal:northeast', position: { row: 1, col: 5 } },
                { id: 'goal:east-notch', position: { row: 4, col: 5 } },
            ],
            rocks: [
                { id: 'rocks:none', positions: [] },
                { id: 'rocks:center', positions: [{ row: 3, col: 3 }] },
                {
                    id: 'rocks:lower-center',
                    positions: [{ row: 5, col: 3 }],
                },
            ],
            hazards: [
                { id: 'hazards:none', positions: [] },
                {
                    id: 'hazards:center-east',
                    positions: [{ row: 3, col: 4 }],
                },
            ],
            crystals: [
                { id: 'crystals:none', positions: [] },
                {
                    id: 'crystals:upper-mid',
                    positions: [{ row: 2, col: 3 }],
                },
                {
                    id: 'crystals:lower-left',
                    positions: [{ row: 5, col: 2 }],
                },
            ],
        },
        constraints: {
            parBand: { minMoves: 3, maxMoves: 6 },
            minReachableStops: 5,
            maxHazards: 1,
        },
        fallbackVariantId: 'easy-bank-shot-v1',
    },
    {
        id: 'medium-thin-ice',
        name: 'Thin Ice',
        difficulty: 'medium',
        baseRows: [
            '#######',
            '#S....#',
            '##.#..#',
            '#.....#',
            '#..#.##',
            '#.....#',
            '#######',
        ],
        allowedTransforms: [...BOARD_TRANSFORMS],
        slots: {
            goals: [
                { id: 'goal:southeast', position: { row: 5, col: 5 } },
                { id: 'goal:south-mid', position: { row: 5, col: 2 } },
                { id: 'goal:west-notch', position: { row: 4, col: 1 } },
            ],
            rocks: [
                { id: 'rocks:none', positions: [] },
                { id: 'rocks:center', positions: [{ row: 3, col: 3 }] },
                {
                    id: 'rocks:north-east',
                    positions: [{ row: 1, col: 4 }],
                },
            ],
            hazards: [
                { id: 'hazards:none', positions: [] },
                { id: 'hazards:north', positions: [{ row: 2, col: 4 }] },
                { id: 'hazards:south', positions: [{ row: 4, col: 2 }] },
                {
                    id: 'hazards:pair',
                    positions: [
                        { row: 2, col: 4 },
                        { row: 4, col: 2 },
                    ],
                },
            ],
            crystals: [
                { id: 'crystals:none', positions: [] },
                {
                    id: 'crystals:center-east',
                    positions: [{ row: 3, col: 4 }],
                },
                {
                    id: 'crystals:south-center',
                    positions: [{ row: 5, col: 3 }],
                },
            ],
        },
        constraints: {
            parBand: { minMoves: 4, maxMoves: 7 },
            minReachableStops: 5,
            maxHazards: 2,
        },
        fallbackVariantId: 'medium-thin-ice-v1',
    },
    {
        id: 'medium-crystal-cache',
        name: 'Crystal Cache',
        difficulty: 'medium',
        baseRows: [
            '########',
            '#S#....#',
            '#......#',
            '#......#',
            '##..#.##',
            '#......#',
            '#.#....#',
            '#......#',
            '########',
        ],
        allowedTransforms: [...BOARD_TRANSFORMS],
        slots: {
            goals: [
                { id: 'goal:southeast', position: { row: 7, col: 6 } },
                { id: 'goal:south-mid', position: { row: 7, col: 4 } },
                { id: 'goal:west-pocket', position: { row: 5, col: 1 } },
            ],
            rocks: [
                { id: 'rocks:none', positions: [] },
                {
                    id: 'rocks:upper-center',
                    positions: [{ row: 2, col: 4 }],
                },
                {
                    id: 'rocks:lower-east',
                    positions: [{ row: 6, col: 5 }],
                },
            ],
            hazards: [
                { id: 'hazards:none', positions: [] },
                {
                    id: 'hazards:upper-east',
                    positions: [{ row: 2, col: 5 }],
                },
                {
                    id: 'hazards:lower-mid',
                    positions: [{ row: 6, col: 3 }],
                },
            ],
            crystals: [
                { id: 'crystals:none', positions: [] },
                {
                    id: 'crystals:northwest',
                    positions: [{ row: 3, col: 2 }],
                },
                { id: 'crystals:east', positions: [{ row: 5, col: 6 }] },
                {
                    id: 'crystals:pair',
                    positions: [
                        { row: 3, col: 2 },
                        { row: 5, col: 6 },
                    ],
                },
            ],
        },
        constraints: {
            parBand: { minMoves: 5, maxMoves: 9 },
            minReachableStops: 6,
            maxHazards: 1,
        },
        fallbackVariantId: 'medium-crystal-cache-v1',
    },
    {
        id: 'medium-fracture-zone',
        name: 'Fracture Zone',
        difficulty: 'medium',
        baseRows: [
            '########',
            '#S#....#',
            '#..#...#',
            '#......#',
            '##.#.#.#',
            '#......#',
            '#......#',
            '########',
        ],
        allowedTransforms: [...BOARD_TRANSFORMS],
        slots: {
            goals: [
                { id: 'goal:southeast', position: { row: 6, col: 6 } },
                { id: 'goal:east', position: { row: 5, col: 6 } },
                { id: 'goal:southwest', position: { row: 6, col: 1 } },
            ],
            rocks: [
                { id: 'rocks:none', positions: [] },
                {
                    id: 'rocks:west-notch',
                    positions: [{ row: 4, col: 2 }],
                },
                { id: 'rocks:center', positions: [{ row: 3, col: 4 }] },
            ],
            hazards: [
                { id: 'hazards:none', positions: [] },
                { id: 'hazards:north', positions: [{ row: 2, col: 4 }] },
                {
                    id: 'hazards:southwest',
                    positions: [{ row: 6, col: 2 }],
                },
                {
                    id: 'hazards:pair',
                    positions: [
                        { row: 2, col: 4 },
                        { row: 6, col: 2 },
                    ],
                },
            ],
            crystals: [
                { id: 'crystals:none', positions: [] },
                {
                    id: 'crystals:center-left',
                    positions: [{ row: 3, col: 2 }],
                },
                {
                    id: 'crystals:lower-east',
                    positions: [{ row: 5, col: 5 }],
                },
            ],
        },
        constraints: {
            parBand: { minMoves: 3, maxMoves: 7 },
            minReachableStops: 5,
            maxHazards: 2,
        },
        fallbackVariantId: 'medium-fracture-zone-v1',
    },
    {
        id: 'hard-deep-freeze',
        name: 'Deep Freeze',
        difficulty: 'hard',
        baseRows: [
            '#########',
            '#S#.....#',
            '#...#.#.#',
            '#.......#',
            '##..#..##',
            '#.......#',
            '#.#.#...#',
            '#.......#',
            '#########',
        ],
        allowedTransforms: [...BOARD_TRANSFORMS],
        slots: {
            goals: [
                { id: 'goal:southeast', position: { row: 7, col: 7 } },
                { id: 'goal:south-mid', position: { row: 7, col: 5 } },
                { id: 'goal:east-pocket', position: { row: 5, col: 7 } },
            ],
            rocks: [
                { id: 'rocks:none', positions: [] },
                {
                    id: 'rocks:center-north',
                    positions: [{ row: 3, col: 4 }],
                },
                {
                    id: 'rocks:center-south',
                    positions: [{ row: 5, col: 4 }],
                },
            ],
            hazards: [
                { id: 'hazards:none', positions: [] },
                { id: 'hazards:mid-east', positions: [{ row: 4, col: 5 }] },
                {
                    id: 'hazards:lower-west',
                    positions: [{ row: 6, col: 3 }],
                },
            ],
            crystals: [
                { id: 'crystals:none', positions: [] },
                {
                    id: 'crystals:northwest',
                    positions: [{ row: 3, col: 2 }],
                },
                { id: 'crystals:east', positions: [{ row: 5, col: 6 }] },
                {
                    id: 'crystals:pair',
                    positions: [
                        { row: 3, col: 2 },
                        { row: 5, col: 6 },
                    ],
                },
            ],
        },
        constraints: {
            parBand: { minMoves: 5, maxMoves: 10 },
            minReachableStops: 7,
            maxHazards: 1,
        },
        fallbackVariantId: 'hard-deep-freeze-v1',
    },
    {
        id: 'hard-absolute-zero',
        name: 'Absolute Zero',
        difficulty: 'hard',
        baseRows: [
            '#########',
            '#S#.....#',
            '#...#.#.#',
            '#.......#',
            '##.....##',
            '#.......#',
            '#.#...#.#',
            '#.......#',
            '#########',
        ],
        allowedTransforms: [...BOARD_TRANSFORMS],
        slots: {
            goals: [
                { id: 'goal:southeast', position: { row: 7, col: 7 } },
                { id: 'goal:east-pocket', position: { row: 5, col: 7 } },
                { id: 'goal:south-mid', position: { row: 7, col: 5 } },
            ],
            rocks: [
                { id: 'rocks:none', positions: [] },
                {
                    id: 'rocks:lower-center',
                    positions: [{ row: 6, col: 4 }],
                },
                {
                    id: 'rocks:upper-center',
                    positions: [{ row: 3, col: 4 }],
                },
            ],
            hazards: [
                { id: 'hazards:none', positions: [] },
                { id: 'hazards:center', positions: [{ row: 4, col: 4 }] },
                {
                    id: 'hazards:lower-west',
                    positions: [{ row: 6, col: 3 }],
                },
            ],
            crystals: [
                { id: 'crystals:none', positions: [] },
                {
                    id: 'crystals:northwest',
                    positions: [{ row: 3, col: 2 }],
                },
                { id: 'crystals:east', positions: [{ row: 5, col: 6 }] },
                {
                    id: 'crystals:pair',
                    positions: [
                        { row: 3, col: 2 },
                        { row: 5, col: 6 },
                    ],
                },
            ],
        },
        constraints: {
            parBand: { minMoves: 5, maxMoves: 10 },
            minReachableStops: 7,
            maxHazards: 1,
        },
        fallbackVariantId: 'hard-absolute-zero-v1',
    },
    {
        id: 'hard-zero-cross',
        name: 'Zero Cross',
        difficulty: 'hard',
        baseRows: [
            '#########',
            '#S..#...#',
            '#.......#',
            '#.....#.#',
            '#..#....#',
            '#.#.....#',
            '#.....#.#',
            '#########',
        ],
        allowedTransforms: [...BOARD_TRANSFORMS],
        slots: {
            goals: [
                { id: 'goal:southeast', position: { row: 6, col: 7 } },
                { id: 'goal:south-mid', position: { row: 6, col: 4 } },
                { id: 'goal:east-pocket', position: { row: 3, col: 7 } },
            ],
            rocks: [
                { id: 'rocks:none', positions: [] },
                {
                    id: 'rocks:center-west',
                    positions: [{ row: 4, col: 2 }],
                },
                {
                    id: 'rocks:center-east',
                    positions: [{ row: 5, col: 6 }],
                },
            ],
            hazards: [
                { id: 'hazards:none', positions: [] },
                { id: 'hazards:center', positions: [{ row: 4, col: 5 }] },
                {
                    id: 'hazards:upper-east',
                    positions: [{ row: 2, col: 6 }],
                },
            ],
            crystals: [
                { id: 'crystals:none', positions: [] },
                {
                    id: 'crystals:northeast',
                    positions: [{ row: 2, col: 5 }],
                },
                {
                    id: 'crystals:southwest',
                    positions: [{ row: 6, col: 2 }],
                },
                {
                    id: 'crystals:pair',
                    positions: [
                        { row: 2, col: 5 },
                        { row: 6, col: 2 },
                    ],
                },
            ],
        },
        constraints: {
            parBand: { minMoves: 5, maxMoves: 10 },
            minReachableStops: 7,
            maxHazards: 1,
        },
        fallbackVariantId: 'hard-zero-cross-v1',
    },
]

export const ICE_SLIDE_EXPEDITION_FALLBACKS: readonly IceSlideTemplateFallback[] =
    [
        {
            id: 'easy-open-lane-v1',
            templateId: 'easy-open-lane',
            difficulty: 'easy',
            rows: ['#####', '#S..#', '#...#', '#G..#', '#####'],
        },
        {
            id: 'easy-corner-pocket-v1',
            templateId: 'easy-corner-pocket',
            difficulty: 'easy',
            rows: ['######', '#S#..#', '#....#', '##.#.#', '#...G#', '######'],
        },
        {
            id: 'easy-bank-shot-v1',
            templateId: 'easy-bank-shot',
            difficulty: 'easy',
            rows: [
                '#######',
                '#S.#..#',
                '#...#.#',
                '##....#',
                '#.#.#.#',
                '#....G#',
                '#######',
            ],
        },
        {
            id: 'medium-thin-ice-v1',
            templateId: 'medium-thin-ice',
            difficulty: 'medium',
            rows: [
                '#######',
                '#S....#',
                '##.#H.#',
                '#.....#',
                '#.H#.##',
                '#....G#',
                '#######',
            ],
        },
        {
            id: 'medium-crystal-cache-v1',
            templateId: 'medium-crystal-cache',
            difficulty: 'medium',
            rows: [
                '########',
                '#S#....#',
                '#......#',
                '#.C....#',
                '##..#.##',
                '#.....C#',
                '#.#....#',
                '#.....G#',
                '########',
            ],
        },
        {
            id: 'medium-fracture-zone-v1',
            templateId: 'medium-fracture-zone',
            difficulty: 'medium',
            rows: [
                '########',
                '#S#....#',
                '#..#H..#',
                '#......#',
                '##O#.#.#',
                '#......#',
                '#.H...G#',
                '########',
            ],
        },
        {
            id: 'hard-deep-freeze-v1',
            templateId: 'hard-deep-freeze',
            difficulty: 'hard',
            rows: [
                '#########',
                '#S#.....#',
                '#...#.#.#',
                '#.C.....#',
                '##..#..##',
                '#.....C.#',
                '#.#.#...#',
                '#......G#',
                '#########',
            ],
        },
        {
            id: 'hard-absolute-zero-v1',
            templateId: 'hard-absolute-zero',
            difficulty: 'hard',
            rows: [
                '#########',
                '#S#.....#',
                '#...#.#.#',
                '#.C.....#',
                '##..H..##',
                '#.....C.#',
                '#.#.O.#.#',
                '#......G#',
                '#########',
            ],
        },
        {
            id: 'hard-zero-cross-v1',
            templateId: 'hard-zero-cross',
            difficulty: 'hard',
            rows: [
                '#########',
                '#S..#...#',
                '#.......#',
                '#.....#.#',
                '#..#....#',
                '#.#.....#',
                '#.....#G#',
                '#########',
            ],
        },
    ]

export function getIceSlideTemplatesByDifficulty(
    difficulty: IceSlideTemplateDifficulty
): readonly IceSlideTemplate[] {
    return ICE_SLIDE_EXPEDITION_TEMPLATES.filter(
        template => template.difficulty === difficulty
    )
}

export function getIceSlideFallback(id: string): IceSlideTemplateFallback {
    const fallback = ICE_SLIDE_EXPEDITION_FALLBACKS.find(
        candidate => candidate.id === id
    )
    if (!fallback) {
        throw new RangeError(`unknown Ice Slide expedition fallback: ${id}`)
    }
    return fallback
}

function assertPositiveInt(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new RangeError(`${field} must be a positive safe integer`)
    }
}

function assertUniqueNonEmpty(values: readonly string[], field: string): void {
    const seen = new Set<string>()
    for (const value of values) {
        if (value.length === 0) {
            throw new RangeError(`${field} must not contain empty values`)
        }
        if (seen.has(value)) {
            throw new RangeError(`${field} must be unique`)
        }
        seen.add(value)
    }
}

function assertRectangularRows(rows: readonly string[], field: string): void {
    if (rows.length === 0) {
        throw new RangeError(`${field} must not be empty`)
    }
    const columnCount = rows[0].length
    if (columnCount === 0) {
        throw new RangeError(`${field} must not have zero columns`)
    }
    for (const row of rows) {
        if (row.length !== columnCount) {
            throw new RangeError(`${field} must be rectangular`)
        }
    }
}

function assertIcePosition(
    rows: readonly string[],
    position: GridPosition,
    label: string
): void {
    if (
        !Number.isInteger(position.row) ||
        !Number.isInteger(position.col) ||
        position.row < 0 ||
        position.row >= rows.length ||
        position.col < 0 ||
        position.col >= rows[0].length
    ) {
        throw new RangeError(`${label} position is out of bounds`)
    }
    if (rows[position.row][position.col] !== '.') {
        throw new RangeError(`${label} position does not land on ice`)
    }
}

function assertTemplateSlotsValid(template: IceSlideTemplate): void {
    const { goals, rocks, hazards, crystals } = template.slots
    assertUniqueNonEmpty(
        goals.map(goal => goal.id),
        `template ${template.id} goal ids`
    )
    for (const category of ['rocks', 'hazards', 'crystals'] as const) {
        assertUniqueNonEmpty(
            template.slots[category].map(pattern => pattern.id),
            `template ${template.id} ${category} ids`
        )
    }
    if (goals.length === 0) {
        throw new RangeError(
            `template ${template.id} must define at least one goal`
        )
    }
    for (const category of ['rocks', 'hazards', 'crystals'] as const) {
        if (template.slots[category].length === 0) {
            throw new RangeError(
                `template ${template.id} must define at least one ${category} pattern`
            )
        }
    }

    for (const goal of goals) {
        assertIcePosition(template.baseRows, goal.position, `goal ${goal.id}`)
    }
    for (const pattern of [...rocks, ...hazards, ...crystals]) {
        const seen = new Set<string>()
        for (const position of pattern.positions) {
            const key = `${position.row},${position.col}`
            if (seen.has(key)) {
                throw new RangeError(
                    `pattern ${pattern.id} contains duplicate coordinates`
                )
            }
            seen.add(key)
            assertIcePosition(
                template.baseRows,
                position,
                `pattern ${pattern.id}`
            )
        }
    }
}

function getTransformOrbitKey(rows: readonly string[]): string {
    return getUniqueBoardTransforms(rows)
        .map(variant => variant.canonicalKey)
        .sort()[0]
}

export function assertValidIceSlideTemplateCatalog(
    catalog: IceSlideTemplateCatalog = {
        templates: ICE_SLIDE_EXPEDITION_TEMPLATES,
        fallbacks: ICE_SLIDE_EXPEDITION_FALLBACKS,
    }
): void {
    const { templates, fallbacks } = catalog

    assertUniqueNonEmpty(
        templates.map(template => template.id),
        'template ids'
    )
    assertUniqueNonEmpty(
        fallbacks.map(fallback => fallback.id),
        'fallback ids'
    )

    for (const template of templates) {
        assertRectangularRows(
            template.baseRows,
            `template ${template.id} baseRows`
        )
        const flatBase = template.baseRows.join('')
        if (flatBase.split('S').length - 1 !== 1) {
            throw new RangeError(
                `template ${template.id} baseRows must contain exactly one S`
            )
        }
        for (const glyph of ['G', 'O', 'H', 'C']) {
            if (flatBase.includes(glyph)) {
                throw new RangeError(
                    `template ${template.id} baseRows must not contain ${glyph}`
                )
            }
        }
        if (template.allowedTransforms.length === 0) {
            throw new RangeError(
                `template ${template.id} allowedTransforms must not be empty`
            )
        }
        assertUniqueNonEmpty(
            template.allowedTransforms,
            `template ${template.id} allowedTransforms`
        )
        assertTemplateSlotsValid(template)

        const { parBand, minReachableStops, maxHazards } = template.constraints
        assertPositiveInt(
            parBand.minMoves,
            `template ${template.id} parBand.minMoves`
        )
        assertPositiveInt(
            parBand.maxMoves,
            `template ${template.id} parBand.maxMoves`
        )
        if (parBand.minMoves > parBand.maxMoves) {
            throw new RangeError(
                `template ${template.id} parBand.minMoves must not exceed parBand.maxMoves`
            )
        }
        assertPositiveInt(
            minReachableStops,
            `template ${template.id} minReachableStops`
        )
        if (!Number.isSafeInteger(maxHazards) || maxHazards < 0) {
            throw new RangeError(
                `template ${template.id} maxHazards must be a non-negative safe integer`
            )
        }

        const fallback = fallbacks.find(
            candidate => candidate.id === template.fallbackVariantId
        )
        if (!fallback) {
            throw new RangeError(
                `template ${template.id} fallbackVariantId does not resolve`
            )
        }
        if (
            fallback.templateId !== template.id ||
            fallback.difficulty !== template.difficulty
        ) {
            throw new RangeError(
                `template ${template.id} fallback must match template and difficulty`
            )
        }
    }

    for (const fallback of fallbacks) {
        assertRectangularRows(fallback.rows, `fallback ${fallback.id} rows`)
    }

    const orbitKeys = templates.map(template =>
        getTransformOrbitKey(template.baseRows)
    )
    if (new Set(orbitKeys).size !== orbitKeys.length) {
        throw new RangeError(
            'template base families must have distinct transform-orbit keys'
        )
    }
}
