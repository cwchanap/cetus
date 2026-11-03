// Single source for the backend origin. The committed eas.json placeholder
// must fail loudly at boot — letting it pass produced builds that "worked"
// until every auth call silently surfaced as canceled.
const value = process.env.EXPO_PUBLIC_API_BASE_URL
if (!value || value.includes('REPLACE-WITH')) {
    throw new Error(
        'EXPO_PUBLIC_API_BASE_URL is required. Point it at the fixed HTTPS backend origin (e.g. the Stage 0 Cloudflare tunnel) in app config or your environment.'
    )
}

export const apiBaseUrl = value
