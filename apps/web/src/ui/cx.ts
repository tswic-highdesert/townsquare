/**
 * Join class names, skipping anything falsy.
 *
 * Small enough to inline in every component, which is exactly why it ends up
 * written eight slightly different ways instead. One version, one behaviour.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
