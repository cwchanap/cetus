/**
 * Web keyboard helpers shared by game initializers.
 *
 * `isEditableTarget` needs HTMLElement/DOM typings, so it lives on the web
 * side of the package boundary (HPA-447 Stage 2); portable game logic must
 * stay DOM-free.
 */

/**
 * Check if an event target is an editable form control (or contenteditable
 * element) whose keystrokes must not be hijacked by game keyboard shortcuts.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false
    }
    return (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
    )
}
