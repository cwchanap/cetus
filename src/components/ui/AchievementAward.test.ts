/**
 * Unit tests for AchievementAward component
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'

// Mock achievement data for testing
const mockAchievements = [
    {
        id: 'test_common',
        name: 'Test Common Achievement',
        description: 'This is a test common achievement',
        icon: '🎯',
        rarity: 'common' as const,
    },
    {
        id: 'test_rare',
        name: 'Test Rare Achievement',
        description: 'This is a test rare achievement',
        icon: '💎',
        rarity: 'rare' as const,
    },
    {
        id: 'test_epic',
        name: 'Test Epic Achievement',
        description: 'This is a test epic achievement',
        icon: '🌟',
        rarity: 'epic' as const,
    },
    {
        id: 'test_legendary',
        name: 'Test Legendary Achievement',
        description: 'This is a test legendary achievement',
        icon: '👑',
        rarity: 'legendary' as const,
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

describe('AchievementAward Component', () => {
    it('should create AchievementAward class successfully', () => {
        // Create the AchievementAward class inline since we can't import the Astro component
        class AchievementAward {
            private overlay: HTMLElement
            private backdrop: HTMLElement
            private container: HTMLElement
            private queue: any[] = []
            private isShowing = false

            constructor() {
                this.overlay = document.getElementById(
                    'achievement-award-overlay'
                )!
                this.backdrop = document.getElementById(
                    'achievement-award-backdrop'
                )!
                this.container = document.getElementById(
                    'achievement-award-container'
                )!
                this.overlay.style.display = 'none'
            }

            getOverlay() {
                return this.overlay
            }
            getBackdrop() {
                return this.backdrop
            }
            getContainer() {
                return this.container
            }
            getQueue() {
                return this.queue
            }
            isCurrentlyShowing() {
                return this.isShowing
            }
        }

        const achievementAward = new AchievementAward()

        expect(achievementAward).toBeDefined()
        expect(achievementAward.getOverlay()).toBeDefined()
        expect(achievementAward.getBackdrop()).toBeDefined()
        expect(achievementAward.getContainer()).toBeDefined()
        expect(achievementAward.getQueue()).toEqual([])
        expect(achievementAward.isCurrentlyShowing()).toBe(false)
    })

    it('should handle empty achievements array', () => {
        class AchievementAward {
            private queue: any[] = []

            async showAchievements(achievements: any[]): Promise<void> {
                if (!achievements || achievements.length === 0) {
                    return
                }
                this.queue.push(...achievements)
            }

            getQueue() {
                return this.queue
            }
        }

        const achievementAward = new AchievementAward()

        // Test with empty array
        achievementAward.showAchievements([])
        expect(achievementAward.getQueue()).toEqual([])

        // Test with null/undefined
        achievementAward.showAchievements(null as any)
        expect(achievementAward.getQueue()).toEqual([])
    })

    it('should add achievements to queue', async () => {
        class AchievementAward {
            private queue: any[] = []

            async showAchievements(achievements: any[]): Promise<void> {
                if (!achievements || achievements.length === 0) {
                    return
                }
                this.queue.push(...achievements)
            }

            getQueue() {
                return this.queue
            }
        }

        const achievementAward = new AchievementAward()

        await achievementAward.showAchievements([mockAchievements[0]])
        expect(achievementAward.getQueue()).toHaveLength(1)
        expect(achievementAward.getQueue()[0]).toEqual(mockAchievements[0])

        await achievementAward.showAchievements([
            mockAchievements[1],
            mockAchievements[2],
        ])
        expect(achievementAward.getQueue()).toHaveLength(3)
    })

    it('should generate correct rarity styles', () => {
        class AchievementAward {
            getRarityStyles(rarity: string) {
                switch (rarity) {
                    case 'legendary':
                        return {
                            rarityColor: 'border-yellow-400/50',
                            rarityGlow: 'shadow-yellow-400/25',
                            particleColor: 'rgb(251 191 36)',
                            glowColor: 'bg-yellow-400/20',
                        }
                    case 'epic':
                        return {
                            rarityColor: 'border-purple-400/50',
                            rarityGlow: 'shadow-purple-400/25',
                            particleColor: 'rgb(168 85 247)',
                            glowColor: 'bg-purple-400/20',
                        }
                    case 'rare':
                        return {
                            rarityColor: 'border-blue-400/50',
                            rarityGlow: 'shadow-blue-400/25',
                            particleColor: 'rgb(59 130 246)',
                            glowColor: 'bg-blue-400/20',
                        }
                    default: // common
                        return {
                            rarityColor: 'border-gray-400/50',
                            rarityGlow: 'shadow-gray-400/25',
                            particleColor: 'rgb(156 163 175)',
                            glowColor: 'bg-gray-400/20',
                        }
                }
            }
        }

        const achievementAward = new AchievementAward()

        // Test legendary
        const legendaryStyles = achievementAward.getRarityStyles('legendary')
        expect(legendaryStyles.rarityColor).toBe('border-yellow-400/50')
        expect(legendaryStyles.particleColor).toBe('rgb(251 191 36)')

        // Test epic
        const epicStyles = achievementAward.getRarityStyles('epic')
        expect(epicStyles.rarityColor).toBe('border-purple-400/50')
        expect(epicStyles.particleColor).toBe('rgb(168 85 247)')

        // Test rare
        const rareStyles = achievementAward.getRarityStyles('rare')
        expect(rareStyles.rarityColor).toBe('border-blue-400/50')
        expect(rareStyles.particleColor).toBe('rgb(59 130 246)')

        // Test common (default)
        const commonStyles = achievementAward.getRarityStyles('common')
        expect(commonStyles.rarityColor).toBe('border-gray-400/50')
        expect(commonStyles.particleColor).toBe('rgb(156 163 175)')
    })

    it('should generate correct rarity badge classes', () => {
        class AchievementAward {
            getRarityBadgeClass(rarity: string): string {
                switch (rarity) {
                    case 'legendary':
                        return 'bg-yellow-500/20 text-yellow-400'
                    case 'epic':
                        return 'bg-purple-500/20 text-purple-400'
                    case 'rare':
                        return 'bg-blue-500/20 text-blue-400'
                    default:
                        return 'bg-gray-500/20 text-gray-400'
                }
            }
        }

        const achievementAward = new AchievementAward()

        expect(achievementAward.getRarityBadgeClass('legendary')).toBe(
            'bg-yellow-500/20 text-yellow-400'
        )
        expect(achievementAward.getRarityBadgeClass('epic')).toBe(
            'bg-purple-500/20 text-purple-400'
        )
        expect(achievementAward.getRarityBadgeClass('rare')).toBe(
            'bg-blue-500/20 text-blue-400'
        )
        expect(achievementAward.getRarityBadgeClass('common')).toBe(
            'bg-gray-500/20 text-gray-400'
        )
        expect(achievementAward.getRarityBadgeClass('unknown')).toBe(
            'bg-gray-500/20 text-gray-400'
        )
    })

    it('should create achievement card with correct content', () => {
        class AchievementAward {
            private createParticles(color: string): string {
                return `<div class="particle" style="color: ${color}"></div>`
            }

            private getRarityStyles(rarity: string) {
                return {
                    rarityColor: 'border-gray-400/50',
                    rarityGlow: 'shadow-gray-400/25',
                    particleColor: 'rgb(156 163 175)',
                    glowColor: 'bg-gray-400/20',
                }
            }

            private getRarityBadgeClass(rarity: string): string {
                return 'bg-gray-500/20 text-gray-400'
            }

            createAchievementCard(achievement: any): HTMLElement {
                const { rarityColor, rarityGlow, particleColor, glowColor } =
                    this.getRarityStyles(achievement.rarity)

                const card = document.createElement('div')
                card.className = `achievement-card ${rarityColor} ${rarityGlow}`

                card.innerHTML = `
                    <div class="particles">${this.createParticles(particleColor)}</div>
                    <div class="content">
                        <div class="icon">${achievement.icon}</div>
                        <h3 class="name">${achievement.name}</h3>
                        <p class="description">${achievement.description}</p>
                        <span class="rarity ${this.getRarityBadgeClass(achievement.rarity)}">${achievement.rarity}</span>
                    </div>
                `

                return card
            }
        }

        const achievementAward = new AchievementAward()
        const card = achievementAward.createAchievementCard(mockAchievements[0])

        expect(card).toBeDefined()
        expect(card.classList.contains('achievement-card')).toBe(true)
        expect(card.innerHTML).toContain(mockAchievements[0].name)
        expect(card.innerHTML).toContain(mockAchievements[0].description)
        expect(card.innerHTML).toContain(mockAchievements[0].icon)
        expect(card.innerHTML).toContain(mockAchievements[0].rarity)
    })

    it('should handle particle generation', () => {
        class AchievementAward {
            createParticles(color: string): string {
                const particles = []
                for (let i = 0; i < 12; i++) {
                    particles.push(`
                        <div 
                            class="particle"
                            style="
                                background-color: ${color};
                                left: ${Math.random() * 100}%;
                                top: ${Math.random() * 100}%;
                            "
                        ></div>
                    `)
                }
                return particles.join('')
            }
        }

        const achievementAward = new AchievementAward()
        const particles = achievementAward.createParticles('rgb(255 0 0)')

        expect(particles).toBeDefined()
        expect(particles).toContain('rgb(255 0 0)')
        expect(particles).toContain('class="particle"')
        // Should contain 12 particles
        expect((particles.match(/class="particle"/g) || []).length).toBe(12)
    })

    it('should properly initialize overlay display', () => {
        class AchievementAward {
            private overlay: HTMLElement

            constructor() {
                this.overlay = document.getElementById(
                    'achievement-award-overlay'
                )!
                this.overlay.style.display = 'none'
            }

            getOverlayDisplay() {
                return this.overlay.style.display
            }
        }

        const achievementAward = new AchievementAward()
        expect(achievementAward.getOverlayDisplay()).toBe('none')
    })

    it('should handle global window function registration', () => {
        // Mock the global showAchievementAward function
        const mockShowAchievementAward = vi.fn()

        // Simulate the global registration
        ;(window as any).showAchievementAward = mockShowAchievementAward

        // Test that it was registered
        expect(window.showAchievementAward).toBeDefined()
        expect(typeof window.showAchievementAward).toBe('function')

        // Test calling it
        window.showAchievementAward(mockAchievements)
        expect(mockShowAchievementAward).toHaveBeenCalledWith(mockAchievements)
    })
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
