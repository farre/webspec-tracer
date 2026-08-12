/**
 * Small DOM helpers shared by the parsers. The parsers operate on a live
 * `Document`/`Element` (native `DOMParser` in Firefox, jsdom in tests) using
 * standard DOM APIs, mirroring the scraper-based traversal in webspec-index.
 */

/** Heading depth (2-6) for an h2..h6 tag name, else null. Mirrors `heading_depth`. */
export function headingDepth(tag: string): number | null {
  switch (tag.toLowerCase()) {
    case "h2":
      return 2;
    case "h3":
      return 3;
    case "h4":
      return 4;
    case "h5":
      return 5;
    case "h6":
      return 6;
    default:
      return null;
  }
}

/** Lowercase tag name of an element. */
export function tag(el: Element): string {
  return el.tagName.toLowerCase();
}

/** True if `el` has any of the given class names. */
export function hasClass(el: Element, ...names: string[]): boolean {
  return names.some((n) => el.classList.contains(n));
}

/** Absolutize an href against a spec base URL, mirroring the markdown handler. */
export function absolutizeHref(href: string, baseUrl: string): string {
  return href.startsWith("#") ? `${baseUrl}${href}` : href;
}
