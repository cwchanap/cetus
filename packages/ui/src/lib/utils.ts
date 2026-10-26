import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// `hidden` gets its own class group so it never conflicts with other
// display utilities: game scripts toggle the `hidden` class on SSR'd
// components imperatively (classList.remove('hidden')), and the default
// merge would drop the base display class from e.g. cn('flex', 'hidden')
// — leaving nothing to restore once `hidden` is removed. `.hidden` sorts
// after every other display utility in Tailwind's output, so it wins
// while present regardless of class order.
const twMerge = extendTailwindMerge<'visibility-hidden'>({
    override: {
        classGroups: {
            display: [
                'block',
                'inline-block',
                'inline',
                'flex',
                'inline-flex',
                'table',
                'inline-table',
                'table-caption',
                'table-cell',
                'table-column',
                'table-column-group',
                'table-footer-group',
                'table-header-group',
                'table-row-group',
                'table-row',
                'flow-root',
                'grid',
                'inline-grid',
                'contents',
                'list-item',
            ],
        },
    },
    extend: {
        classGroups: {
            'visibility-hidden': ['hidden'],
        },
    },
})

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
