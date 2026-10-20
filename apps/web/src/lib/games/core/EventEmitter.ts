import type { GameEvent, GameEventType } from './types'

export type EventListener = (event: GameEvent) => void

export class GameEventEmitter {
    private listeners: Map<GameEventType, EventListener[]> = new Map()

    /**
     * Subscribe to a game event
     */
    on(eventType: GameEventType, listener: EventListener): void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, [])
        }
        const listeners = this.listeners.get(eventType)
        if (listeners) {
            listeners.push(listener)
        }
    }

    /**
     * Unsubscribe from a game event
     */
    off(eventType: GameEventType, listener: EventListener): void {
        const listeners = this.listeners.get(eventType)
        if (listeners) {
            const index = listeners.indexOf(listener)
            if (index > -1) {
                listeners.splice(index, 1)
            }
        }
    }

    /**
     * Emit a game event
     */
    emit(eventType: GameEventType, data?: Record<string, unknown>): void {
        const event: GameEvent = {
            type: eventType,
            data,
            timestamp: Date.now(),
        }

        const listeners = this.listeners.get(eventType)
        if (listeners) {
            listeners.forEach(listener => listener(event))
        }
    }

    /**
     * Remove all listeners for an event type, or all listeners if no type specified
     */
    removeAllListeners(eventType?: GameEventType): void {
        if (eventType) {
            this.listeners.delete(eventType)
        } else {
            this.listeners.clear()
        }
    }

    /**
     * Get the number of listeners for an event type
     */
    listenerCount(eventType: GameEventType): number {
        const listeners = this.listeners.get(eventType)
        return listeners ? listeners.length : 0
    }
}
