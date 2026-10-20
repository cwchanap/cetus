// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

import vercel from '@astrojs/vercel'

// https://astro.build/config
export default defineConfig({
  output: 'server',
  vite: {
    // @tailwindcss/vite's Plugin type comes from a different vite instance
    // than astro's, causing a structurally-identical type mismatch under
    // `// @ts-check`. Cast through a variable to satisfy the checker.
    plugins: [/** @type {any} */ (tailwindcss())],
  },

  adapter: vercel(),
})
