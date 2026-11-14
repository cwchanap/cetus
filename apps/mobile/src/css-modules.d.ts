/**
 * Side-effect CSS imports (app/_layout.tsx imports ../global.css for
 * NativeWind). This declaration used to come from expo-env.d.ts, but Expo
 * CLI deletes that file whenever experiments.typedRoutes is disabled, so
 * the declaration lives here instead to keep `tsc --noEmit` green.
 */
declare module '*.css'
