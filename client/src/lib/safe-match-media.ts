/**
 * Safe wrapper around window.matchMedia for environments where it is
 * unavailable or returns null (e.g. iOS in-app WebKit browsers).
 */
export function safeMatchMedia(query: string): MediaQueryList | null {
  try {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return null;
    }
    return window.matchMedia(query);
  } catch {
    return null;
  }
}

/**
 * Returns whether a media query matches, falling back to `fallback`
 * when matchMedia is unavailable.
 */
export function safeMatchMediaMatches(query: string, fallback = false): boolean {
  return safeMatchMedia(query)?.matches ?? fallback;
}
