import { createAuthClient } from 'better-auth/client'

export const authClient = createAuthClient({
  baseURL: import.meta.env.BETTER_AUTH_URL || '',
  fetchOptions: {
    credentials: 'include',
    headers: {
      'X-Forwarded-Proto':
        window?.location?.protocol?.replace(':', '') || 'http',
      'X-Forwarded-Host': window?.location?.host || 'localhost:4321',
    },
  },
})
