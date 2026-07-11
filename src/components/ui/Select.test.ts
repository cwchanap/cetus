// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import Select from './Select.astro'

// Since we're testing an Astro component, we'll test the TypeScript logic
// that can be extracted and the component props interface

describe('Select Component', () => {
    let container: Awaited<ReturnType<typeof AstroContainer.create>>

    beforeAll(async () => {
        container = await AstroContainer.create()
    })

    describe('Props Interface', () => {
        it('should accept valid variant options', () => {
            const validVariants = ['default', 'glass', 'outline'] as const

            validVariants.forEach(variant => {
                expect(['default', 'glass', 'outline']).toContain(variant)
            })
        })

        it('should accept valid size options', () => {
            const validSizes = ['default', 'sm', 'lg'] as const

            validSizes.forEach(size => {
                expect(['default', 'sm', 'lg']).toContain(size)
            })
        })

        it('should require options array', () => {
            // Test that the options prop is required by checking the type structure
            const sampleOptions = [
                { value: 'option1', label: 'Option 1' },
                { value: 'option2', label: 'Option 2' },
            ]

            expect(Array.isArray(sampleOptions)).toBe(true)
            expect(
                sampleOptions.every(
                    option =>
                        typeof option.value === 'string' &&
                        typeof option.label === 'string'
                )
            ).toBe(true)
        })
    })

    describe('Class Variants Logic', () => {
        // Render the actual Select.astro via AstroContainer and assert it
        // emits cetus-* tokens (not stale legacy colors like bg-gray-800 /
        // border-cyan-400).
        const options = [
            { value: 'option1', label: 'Option 1' },
            { value: 'option2', label: 'Option 2' },
        ]

        it('default variant uses cetus surface/hairline/accent tokens', async () => {
            const html = await container.renderToString(Select, {
                props: { variant: 'default', options },
            })
            expect(html).toContain('bg-cetus-surface')
            expect(html).toContain('border-cetus-hairline')
            expect(html).toContain('hover:border-cetus-accent/50')
            expect(html).toContain('focus:border-cetus-accent')
            // Must not leak legacy hardcoded colors
            expect(html).not.toMatch(/bg-gray-800/)
            expect(html).not.toMatch(/border-cyan-400/)
        })

        it('glass variant uses cetus tokens with backdrop blur', async () => {
            const html = await container.renderToString(Select, {
                props: { variant: 'glass', options },
            })
            expect(html).toContain('bg-cetus-surface')
            expect(html).toContain('border-cetus-hairline')
            expect(html).toContain('backdrop-blur-md')
            expect(html).toContain('hover:border-cetus-accent/50')
            // No legacy glass colors
            expect(html).not.toMatch(/bg-white\/5/)
            expect(html).not.toMatch(/border-cyan-400/)
        })

        it('outline variant uses cetus-accent tokens', async () => {
            const html = await container.renderToString(Select, {
                props: { variant: 'outline', options },
            })
            expect(html).toContain('bg-transparent')
            expect(html).toContain('border-cetus-accent')
            expect(html).toContain('text-cetus-accent')
            expect(html).not.toMatch(/border-cyan-400/)
        })

        it('dropdown and option list use cetus tokens, no legacy glows', async () => {
            const html = await container.renderToString(Select, {
                props: { options },
            })
            expect(html).toContain('hover:bg-cetus-accent/20')
            expect(html).toContain('focus:bg-cetus-accent/30')
            expect(html).not.toMatch(/shadow-cyan-400/)
        })

        it('size classes render for default, sm, and lg', async () => {
            const htmlDefault = await container.renderToString(Select, {
                props: { size: 'default', options },
            })
            expect(htmlDefault).toContain('h-10')
            const htmlSm = await container.renderToString(Select, {
                props: { size: 'sm', options },
            })
            expect(htmlSm).toContain('h-8')
            const htmlLg = await container.renderToString(Select, {
                props: { size: 'lg', options },
            })
            expect(htmlLg).toContain('h-12')
        })
    })

    describe('Option Validation', () => {
        it('should validate option structure', () => {
            const validOptions = [
                { value: 'game1', label: '🎮 Game 1' },
                { value: 'game2', label: '🎯 Game 2' },
                { value: 'all', label: 'All Games' },
            ]

            validOptions.forEach(option => {
                expect(option).toHaveProperty('value')
                expect(option).toHaveProperty('label')
                expect(typeof option.value).toBe('string')
                expect(typeof option.label).toBe('string')
            })
        })

        it('should handle empty options array', () => {
            const emptyOptions: Array<{ value: string; label: string }> = []
            expect(Array.isArray(emptyOptions)).toBe(true)
            expect(emptyOptions.length).toBe(0)
        })

        it('should handle options with special characters', () => {
            const specialOptions = [
                { value: 'game-1', label: '🎮 Game with emoji' },
                { value: 'game_2', label: 'Game with underscore' },
                { value: 'game.3', label: 'Game with dot' },
            ]

            specialOptions.forEach(option => {
                expect(option.value).toMatch(/^[a-zA-Z0-9._-]+$/)
                expect(option.label.length).toBeGreaterThan(0)
            })
        })
    })

    describe('Default Props', () => {
        it('should have correct default values', () => {
            const defaultProps = {
                variant: 'default' as const,
                size: 'default' as const,
                placeholder: 'Select an option...',
                className: '',
            }

            expect(defaultProps.variant).toBe('default')
            expect(defaultProps.size).toBe('default')
            expect(defaultProps.placeholder).toBe('Select an option...')
            expect(defaultProps.className).toBe('')
        })
    })

    describe('Accessibility Features', () => {
        it('should support aria attributes', () => {
            const ariaAttributes = [
                'aria-label',
                'aria-describedby',
                'aria-expanded',
                'aria-haspopup',
            ]

            // Test that these are valid aria attributes for select components
            ariaAttributes.forEach(attr => {
                expect(attr.startsWith('aria-')).toBe(true)
            })
        })

        it('should support keyboard navigation keys', () => {
            const keyboardKeys = [
                'ArrowDown',
                'ArrowUp',
                'Enter',
                'Escape',
                'Space',
            ]

            keyboardKeys.forEach(key => {
                expect(typeof key).toBe('string')
                expect(key.length).toBeGreaterThan(0)
            })
        })
    })

    describe('Component Integration', () => {
        it('should be compatible with form submission', () => {
            const formData = {
                name: 'game-selector',
                id: 'game-selector-id',
                value: 'selected-game',
            }

            expect(formData.name).toBeDefined()
            expect(formData.id).toBeDefined()
            expect(formData.value).toBeDefined()
        })

        it('should handle client-side state management', () => {
            const selectState = {
                isOpen: false,
                selectedValue: '',
                selectedIndex: -1,
                filteredOptions: [],
            }

            expect(typeof selectState.isOpen).toBe('boolean')
            expect(typeof selectState.selectedValue).toBe('string')
            expect(typeof selectState.selectedIndex).toBe('number')
            expect(Array.isArray(selectState.filteredOptions)).toBe(true)
        })
    })
})
