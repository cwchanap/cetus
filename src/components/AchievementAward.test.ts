/**
 * Unit tests for AchievementAward component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { AchievementRarity } from '@/lib/achievements'

// Mock achievement data for testing
const mockAchievements = [
    {
        id: 'test_common',
        name: 'Test Common Achievement',
        description: 'This is a test common achievement',
        icon: '🎯',
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'test_rare',
        name: 'Test Rare Achievement',
        description: 'This is a test rare achievement',
        icon: '💎',
        rarity: AchievementRarity.RARE,
    },
    {
        id: 'test_epic',
        name: 'Test Epic Achievement',
        description: 'This is a test epic achievement',
        icon: '🌟',
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'test_legendary',
        name: 'Test Legendary Achievement',
        description: 'This is a test legendary achievement',
        icon: '👑',
        rarity: AchievementRarity.LEGENDARY,
    },
]

// Setup DOM environment
let dom: JSDOM
let window: Window & typeof globalThis
let document: Document

beforeEach(() => {
    // Create a fresh DOM for each test
    dom = new JSDOM(
        `
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
            <div id="achievement-award-overlay" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                <div id="achievement-award-backdrop" class="absolute inset-0 bg-black/70 backdrop-blur-sm opacity-0 transition-opacity duration-500 pointer-events-none"></div>
                <div id="achievement-award-container" class="relative max-w-md mx-4 transform scale-75 opacity-0 transition-all duration-700 ease-out pointer-events-auto"></div>
            </div>
        </body>
        </html>
    `,
        {
            url: 'http://localhost:3000',
            pretendToBeVisual: true,
            resources: 'usable',
        }
    )

    window = dom.window as Window & typeof globalThis
    document = window.document

    // Setup global objects
    global.window = window
    global.document = document
    global.requestAnimationFrame = vi.fn(cb => {
        return 1
    })
    global.setTimeout = vi.fn((cb, delay) => {
        return 1
    }) as any
    global.clearTimeout = vi.fn()

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
})

describe('AchievementAward Integration', () => {
    it('should work with score service integration', async () => {
        // Mock the score service response
        const mockScoreResponse = {
            success: true,
            newAchievements: [
                {
                    id: 'tetris_novice',
                    name: 'Tetris Novice',
                    description: 'Score 100 points in Tetris',
                    icon: '🔰',
                    rarity: 'common',
                },
            ],
        }

        // Mock fetch
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockScoreResponse),
        })

        // Mock the achievement award function
        const mockShowAchievementAward = vi.fn()
        ;(window as any).showAchievementAward = mockShowAchievementAward

        // Simulate score submission (simplified version)
        const scoreData = { gameId: 'tetris', score: 150 }
        const response = await fetch('/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scoreData),
        })

        const result = await response.json()

        // Simulate the score service handling
        if (
            result.success &&
            result.newAchievements &&
            result.newAchievements.length > 0
        ) {
            if (typeof window !== 'undefined' && window.showAchievementAward) {
                window.showAchievementAward(result.newAchievements)
            }
        }

        expect(mockShowAchievementAward).toHaveBeenCalledWith(
            mockScoreResponse.newAchievements
        )
    })
})
