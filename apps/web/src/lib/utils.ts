// Deep-import cn so Astro components using @/lib/utils don't pull the
// @cetus/ui barrel (every component's CSS) into pages that only merge
// class names.
export { cn } from '@cetus/ui/lib/utils'
