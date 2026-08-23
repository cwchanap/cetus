import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

export const SIGNAL_SWITCH_SIGNAL_ORDER = ['cyan', 'magenta', 'amber'] as const

export type SignalSwitchSignal = (typeof SIGNAL_SWITCH_SIGNAL_ORDER)[number]

export const SIGNAL_SWITCH_SIGNALS: Readonly<
    Record<
        SignalSwitchSignal,
        {
            label: string
            glyph: string
            shapeName: 'Circle' | 'Triangle' | 'Diamond'
            color: number
        }
    >
> = {
    cyan: {
        label: 'Cyan',
        glyph: '●',
        shapeName: 'Circle',
        color: 0x22d3ee,
    },
    magenta: {
        label: 'Magenta',
        glyph: '▲',
        shapeName: 'Triangle',
        color: 0xec4899,
    },
    amber: {
        label: 'Amber',
        glyph: '◆',
        shapeName: 'Diamond',
        color: 0xf59e0b,
    },
}

export const SIGNAL_SWITCH_RULES = {
    duration: 90,
    canvasWidth: 800,
    canvasHeight: 360,
    laneUnlockSeconds: [0, 0, 30, 60] as const,
    startingIntegrity: 3,
    droneSpawnX: 64,
    gateX: 680,
    droneWidth: 32,
    droneHeight: 22,
    initialDroneSpeed: 140,
    finalDroneSpeed: 240,
    initialSpawnInterval: 3.2,
    finalSpawnInterval: 1.1,
    maxUpdateDelta: 0.1,
} as const

export type SignalSwitchOutcome = 'playing' | 'systems-failed' | 'survived'

export interface SignalSwitchConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    laneUnlockSeconds: readonly number[]
    startingIntegrity: number
    droneSpawnX: number
    gateX: number
    droneWidth: number
    droneHeight: number
    initialDroneSpeed: number
    finalDroneSpeed: number
    initialSpawnInterval: number
    finalSpawnInterval: number
    maxUpdateDelta: number
    rng: () => number
}

export interface SignalSwitchDrone {
    id: string
    laneIndex: number
    signal: SignalSwitchSignal
    /** Horizontal center in logical canvas pixels. */
    x: number
}

export interface SignalSwitchState extends BaseGameState {
    outcome: SignalSwitchOutcome
    activeLaneCount: number
    gateSignals: SignalSwitchSignal[]
    drones: SignalSwitchDrone[]
    integrity: number
    safePasses: number
    crashes: number
    combo: number
    maxCombo: number
    droneSpeed: number
    spawnInterval: number
}

export interface SignalSwitchStats extends BaseGameStats {
    outcome: SignalSwitchOutcome
    safePasses: number
    crashes: number
    maxCombo: number
    integrityRemaining: number
}

export interface SignalSwitchGameData {
    safePasses: number
    crashes: number
    maxCombo: number
    integrityRemaining: number
    survivedFullRun: boolean
}

export function createSignalSwitchConfig(
    overrides: Partial<SignalSwitchConfig> = {}
): SignalSwitchConfig {
    return {
        ...SIGNAL_SWITCH_RULES,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        rng: Math.random,
        ...overrides,
    }
}
