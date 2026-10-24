/**
 * Drop keys explicitly set to `undefined` from a partial override object.
 * `{ ...defaults, ...partial }` would otherwise let `{ duration: undefined }`
 * erase the default instead of leaving it in place.
 *
 * The return type keeps the input shape: keys that are required in `T` are
 * still present (a required key cannot be `undefined`), while optional keys
 * may have been dropped — which is exactly what the optionality describes.
 */
export function definedValues<T extends object>(values: T): T {
    return Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== undefined)
    ) as T
}
