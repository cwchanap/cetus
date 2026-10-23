import { describe, it, expect } from 'vitest'
import { isEditableTarget } from './keyboard'

describe('isEditableTarget', () => {
    it('recognizes form controls as editable keyboard targets', () => {
        expect(isEditableTarget(document.createElement('input'))).toBe(true)
        expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
        expect(isEditableTarget(document.createElement('select'))).toBe(true)
        expect(isEditableTarget(document.createElement('div'))).toBe(false)
        expect(isEditableTarget(null)).toBe(false)
    })
})
