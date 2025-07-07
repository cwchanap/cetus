import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock environment variables for testing
Object.defineProperty(import.meta, 'env', {
    value: {
        TURSO_DATABASE_URL: 'libsql://test-db.turso.io',
        TURSO_AUTH_TOKEN: 'test-token',
        BETTER_AUTH_SECRET: 'test-secret',
        BETTER_AUTH_URL: 'http://localhost:4321',
        GOOGLE_CLIENT_ID: 'test-google-client-id',
        GOOGLE_CLIENT_SECRET: 'test-google-secret',
    },
    writable: true,
})

// Mock Better Auth client
vi.mock('@/lib/auth-client', () => ({
    authClient: {
        signIn: {
            email: vi.fn(),
            social: vi.fn(),
        },
        signUp: {
            email: vi.fn(),
        },
        signOut: vi.fn(),
        getSession: vi.fn(),
    },
}))

// Mock database client
vi.mock('@/lib/db', () => ({
    db: {
        selectFrom: vi.fn(),
        insertInto: vi.fn(),
        updateTable: vi.fn(),
        deleteFrom: vi.fn(),
    },
    getUserStats: vi.fn(),
    saveGameScore: vi.fn(),
    getGameLeaderboard: vi.fn(),
    getUserBestScore: vi.fn(),
}))
