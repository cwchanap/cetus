// Shared `../src/lib/api` mock for every suite that renders
// NativeGameHost: `api.submitScore` is the per-file jest.fn all assertions
// target, and `createScoreSubmitter` binds straight onto it so hosts reach
// the same fn whichever identity they bind. Jest hands each test file a
// fresh module registry, so no state leaks between files.
import type { ScoreData } from '@cetus/shared/scores'

export const api = { submitScore: jest.fn() }

export const createScoreSubmitter = jest.fn(
    async (): Promise<(data: ScoreData) => Promise<unknown>> =>
        async (data: ScoreData) =>
            api.submitScore(data)
)
