export interface RunGuard {
    next: () => number
    current: () => number
    isStale: (runId: number) => boolean
}

export function createRunGuard(): RunGuard {
    let currentRun = 0
    return {
        next: () => ++currentRun,
        current: () => currentRun,
        isStale: runId => runId !== currentRun,
    }
}
