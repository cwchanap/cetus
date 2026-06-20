// Shared test utilities for circuit-hacker tests.

// Deterministic LCG so tests are reproducible.
export function seededRng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0xffffffff
    }
}
