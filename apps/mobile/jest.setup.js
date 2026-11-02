/* eslint-disable no-undef -- test-only Node script */
// Test env for the mobile Jest project: the mobile lib modules throw at
// import time without a backend origin, so give them a deterministic one.
process.env.EXPO_PUBLIC_API_BASE_URL ??= 'https://cetus-test.example'
