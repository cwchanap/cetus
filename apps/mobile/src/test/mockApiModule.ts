// Shared `../src/lib/api` mock for every suite that renders
// NativeGameHost: `api.submitScore` is the per-file jest.fn all assertions
// target, and `createScoreSubmitter` binds straight onto it so hosts reach
// the same fn whichever identity they bind. `api.getLeaderboard` backs the
// in-board Daily leaderboard. Jest hands each test file a fresh module
// registry, so no state leaks between files.
import type { LeaderboardQuery } from '@cetus/api-client/api-client'
import type { LeaderboardResponse } from '@cetus/shared/api-dto'
import type { ScoreData } from '@cetus/shared/scores'

export const api = {
    submitScore: jest.fn(),
    getLeaderboard: jest.fn(
        async (_query?: LeaderboardQuery): Promise<LeaderboardResponse> => ({
            gameId: 'ice-slide',
            gameName: 'Ice Slide',
            viewerAuthenticated: false,
            leaderboard: [],
        })
    ),
}

export const createScoreSubmitter = jest.fn(
    async (): Promise<(data: ScoreData) => Promise<unknown>> =>
        async (data: ScoreData) =>
            api.submitScore(data)
)
