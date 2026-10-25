import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { loadRenderers } from 'astro:container'
import { getContainerRenderer } from '@astrojs/react'

/**
 * AstroContainer pre-loaded with the React renderer (HPA-379 Stage 1).
 * Container tests that render — or will render once Stage 2 lands — React
 * descendants (AppLayout, homepage, abyssal shell, wrappers, shell tokens)
 * must use this instead of a bare AstroContainer.create(), so Astro can
 * resolve React islands inside the rendered tree.
 */
export async function createContainer() {
    const renderers = await loadRenderers([getContainerRenderer()])
    return AstroContainer.create({ renderers })
}
