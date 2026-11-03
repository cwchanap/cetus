// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
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

  integrations: [react()],

  // The built-in origin check is all-or-nothing and would 403 Apple's
  // cross-site form_post callback before Better Auth sees it. It is
  // re-implemented in src/middleware.ts with /api/auth/callback/apple
  // exempted (Better Auth enforces its own trustedOrigins there).
  security: { checkOrigin: false },

  adapter: vercel(),
})
