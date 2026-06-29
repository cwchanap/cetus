import type { SatelliteSyncLevel } from './types'
import {
    polarToWorld,
    segmentIntersectsCircle,
    type WorldPoint,
} from './geometry'

function pathClear(
    from: WorldPoint,
    to: WorldPoint,
    level: SatelliteSyncLevel
): boolean {
    return !level.obstacles.some(o => {
        const ow = polarToWorld(o.ring, o.angle)
        return segmentIntersectsCircle(from, to, ow, o.radius)
    })
}

function canReach(
    level: SatelliteSyncLevel,
    satIndex: number,
    targetIndex: number
): boolean {
    const sat = level.satellites[satIndex]
    const target = level.targets[targetIndex]
    if (sat.color !== target.color) {
        return false
    }
    const from = polarToWorld(sat.ring, sat.angle)
    const to = polarToWorld(target.ring, target.angle)
    return pathClear(from, to, level)
}

function matchingExists(level: SatelliteSyncLevel): boolean {
    const numTargets = level.targets.length
    const numSats = level.satellites.length
    if (numSats < numTargets) {
        return false
    }
    const matchS = new Array<number>(numSats).fill(-1)
    const seen = new Array<boolean>(numSats).fill(false)

    const tryAssign = (t: number): boolean => {
        for (let s = 0; s < numSats; s++) {
            if (seen[s] || !canReach(level, s, t)) {
                continue
            }
            seen[s] = true
            if (matchS[s] === -1 || tryAssign(matchS[s])) {
                matchS[s] = t
                return true
            }
        }
        return false
    }

    let matched = 0
    for (let t = 0; t < numTargets; t++) {
        seen.fill(false)
        if (tryAssign(t)) {
            matched++
        }
    }
    return matched === numTargets
}

export function hasStaticMatching(level: SatelliteSyncLevel): boolean {
    return matchingExists(level)
}

export const SATELLITE_SYNC_LEVELS: SatelliteSyncLevel[] = [
    {
        id: 1,
        name: 'First Contact',
        timeBudget: 60,
        rings: 2,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 120, color: 'cyan' },
            { ring: 0, angle: 240, color: 'cyan' },
        ],
        targets: [
            { ring: 1, angle: 60, color: 'cyan' },
            { ring: 1, angle: 180, color: 'cyan' },
            { ring: 1, angle: 300, color: 'cyan' },
        ],
        obstacles: [],
    },
    {
        id: 2,
        name: 'Spectrum',
        timeBudget: 55,
        rings: 2,
        satellites: [
            { ring: 0, angle: 30, color: 'cyan' },
            { ring: 0, angle: 150, color: 'magenta' },
            { ring: 0, angle: 270, color: 'yellow' },
            { ring: 0, angle: 90, color: 'cyan' },
        ],
        targets: [
            { ring: 1, angle: 60, color: 'cyan' },
            { ring: 1, angle: 180, color: 'magenta' },
            { ring: 1, angle: 300, color: 'yellow' },
        ],
        obstacles: [],
    },
    {
        id: 3,
        name: 'Crossfire',
        timeBudget: 50,
        rings: 3,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 120, color: 'magenta' },
            { ring: 0, angle: 240, color: 'yellow' },
            { ring: 1, angle: 60, color: 'cyan' },
            { ring: 1, angle: 200, color: 'magenta' },
        ],
        targets: [
            { ring: 2, angle: 30, color: 'cyan' },
            { ring: 2, angle: 110, color: 'magenta' },
            { ring: 2, angle: 200, color: 'yellow' },
            { ring: 2, angle: 300, color: 'cyan' },
            { ring: 2, angle: 250, color: 'magenta' },
        ],
        obstacles: [],
    },
    {
        id: 4,
        name: 'Debris Field',
        timeBudget: 50,
        rings: 3,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 120, color: 'cyan' },
            { ring: 0, angle: 240, color: 'magenta' },
            { ring: 0, angle: 60, color: 'magenta' },
        ],
        targets: [
            { ring: 2, angle: 40, color: 'cyan' },
            { ring: 2, angle: 160, color: 'cyan' },
            { ring: 2, angle: 280, color: 'magenta' },
            { ring: 2, angle: 340, color: 'magenta' },
        ],
        obstacles: [{ ring: 1, angle: 90, radius: 0.3 }],
    },
    {
        id: 5,
        name: 'Orbit Drift',
        timeBudget: 45,
        rings: 2,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 120, color: 'cyan' },
            { ring: 0, angle: 240, color: 'cyan' },
        ],
        targets: [
            {
                ring: 1,
                angle: 0,
                color: 'cyan',
                moving: { speed: 18, direction: 1 },
            },
            {
                ring: 1,
                angle: 120,
                color: 'cyan',
                moving: { speed: 18, direction: -1 },
            },
            {
                ring: 1,
                angle: 240,
                color: 'cyan',
                moving: { speed: 18, direction: 1 },
            },
        ],
        obstacles: [],
    },
    {
        id: 6,
        name: 'Shifting Debris',
        timeBudget: 45,
        rings: 3,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 90, color: 'magenta' },
            { ring: 0, angle: 180, color: 'yellow' },
            { ring: 0, angle: 270, color: 'cyan' },
        ],
        targets: [
            {
                ring: 2,
                angle: 45,
                color: 'cyan',
                moving: { speed: 14, direction: 1 },
            },
            {
                ring: 2,
                angle: 135,
                color: 'magenta',
                moving: { speed: 14, direction: -1 },
            },
            {
                ring: 2,
                angle: 225,
                color: 'yellow',
                moving: { speed: 14, direction: 1 },
            },
            {
                ring: 2,
                angle: 315,
                color: 'cyan',
                moving: { speed: 14, direction: -1 },
            },
        ],
        obstacles: [
            {
                ring: 1,
                angle: 0,
                radius: 0.28,
                moving: { speed: 10, direction: 1 },
            },
        ],
    },
    {
        id: 7,
        name: 'Prismatic Storm',
        timeBudget: 40,
        rings: 3,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 72, color: 'magenta' },
            { ring: 0, angle: 144, color: 'yellow' },
            { ring: 0, angle: 216, color: 'green' },
            { ring: 0, angle: 288, color: 'cyan' },
            { ring: 0, angle: 36, color: 'magenta' },
        ],
        targets: [
            {
                ring: 2,
                angle: 20,
                color: 'cyan',
                moving: { speed: 12, direction: 1 },
            },
            {
                ring: 2,
                angle: 90,
                color: 'magenta',
                moving: { speed: 12, direction: -1 },
            },
            { ring: 2, angle: 160, color: 'yellow' },
            {
                ring: 2,
                angle: 230,
                color: 'green',
                moving: { speed: 12, direction: 1 },
            },
            {
                ring: 2,
                angle: 310,
                color: 'cyan',
                moving: { speed: 12, direction: -1 },
            },
            { ring: 2, angle: 340, color: 'magenta' },
        ],
        obstacles: [{ ring: 1, angle: 180, radius: 0.25 }],
    },
    {
        id: 8,
        name: 'Singularity',
        timeBudget: 40,
        rings: 3,
        satellites: [
            { ring: 0, angle: 0, color: 'cyan' },
            { ring: 0, angle: 90, color: 'magenta' },
            { ring: 0, angle: 180, color: 'yellow' },
            { ring: 0, angle: 270, color: 'green' },
            { ring: 0, angle: 45, color: 'cyan' },
            { ring: 0, angle: 225, color: 'magenta' },
        ],
        targets: [
            {
                ring: 2,
                angle: 30,
                color: 'cyan',
                moving: { speed: 16, direction: 1 },
            },
            {
                ring: 2,
                angle: 100,
                color: 'magenta',
                moving: { speed: 16, direction: -1 },
            },
            {
                ring: 2,
                angle: 170,
                color: 'yellow',
                moving: { speed: 16, direction: 1 },
            },
            {
                ring: 2,
                angle: 240,
                color: 'green',
                moving: { speed: 16, direction: -1 },
            },
            {
                ring: 2,
                angle: 310,
                color: 'cyan',
                moving: { speed: 16, direction: 1 },
            },
            {
                ring: 2,
                angle: 350,
                color: 'magenta',
                moving: { speed: 16, direction: -1 },
            },
        ],
        obstacles: [
            {
                ring: 1,
                angle: 60,
                radius: 0.25,
                moving: { speed: 12, direction: 1 },
            },
            {
                ring: 1,
                angle: 236,
                radius: 0.25,
                moving: { speed: 12, direction: -1 },
            },
        ],
    },
]
