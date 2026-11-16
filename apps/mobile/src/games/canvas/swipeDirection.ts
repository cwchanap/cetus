export type SwipeDirection = 'up' | 'down' | 'left' | 'right'

const SWIPE_THRESHOLD_DP = 30

export function swipeDirection(
    translationX: number,
    translationY: number
): SwipeDirection | null {
    if (
        Math.max(Math.abs(translationX), Math.abs(translationY)) <
        SWIPE_THRESHOLD_DP
    ) {
        return null
    }
    if (Math.abs(translationX) > Math.abs(translationY)) {
        return translationX > 0 ? 'right' : 'left'
    }
    return translationY > 0 ? 'down' : 'up'
}
