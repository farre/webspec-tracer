/**
 * Parse a user-supplied trace endpoint into (spec, anchor). Accepts:
 *   - `SPEC#anchor`         e.g. HTML#dom-location-assign
 *   - a full spec URL       e.g. https://html.spec.whatwg.org/#navigate
 *   - `#anchor` or `anchor` interpreted against `defaultSpec` (the start's spec)
 */
import type { Registry } from "./registry.js";

export function resolveEndpoint(
  input: string,
  registry: Registry,
  defaultSpec?: string,
): { spec: string; anchor: string } | null {
  const s = input.trim();
  if (!s) return null;

  if (s.startsWith("http://") || s.startsWith("https://")) {
    return registry.resolveUrl(s);
  }

  const hash = s.indexOf("#");
  if (hash > 0) {
    return { spec: s.slice(0, hash).trim(), anchor: s.slice(hash + 1).trim() };
  }

  const anchor = s.startsWith("#") ? s.slice(1) : s;
  if (defaultSpec && anchor) return { spec: defaultSpec, anchor };
  return null;
}
