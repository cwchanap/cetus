import '@testing-library/jest-dom'
import { vi } from 'vitest'

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
