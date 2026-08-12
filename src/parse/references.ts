/**
 * Ported from webspec-index (MIT, Copyright (c) 2026 jnjaeschke)
 * https://github.com/jnjaeschke/webspec-index — src/parse/references.rs
 *
 * Cross-reference extraction: a single document-order pass tracking the current
 * Heading/Algorithm scope; each `<a href>` (excluding self-links and biblio
 * refs) is attributed to that scope and resolved to a (toSpec, toAnchor) target.
 * We additionally aggregate every call-site id (the source `<a>`'s own id) per
 * from→to pair, which extends webspec-index's model.
 */
import type { ParsedReference, ParsedSection } from "../model/types.js";
import { algorithmExtent } from "./sections.js";

/** Resolves a full spec URL to a (spec, anchor) target. */
export interface UrlResolver {
  resolveUrl(url: string): { spec: string; anchor: string } | null;
}

function isSelfLink(a: Element): boolean {
  return a.classList.contains("self-link");
}

function isBiblioRef(a: Element): boolean {
  return a.getAttribute("data-link-type") === "biblio";
}

/** Resolve an href to its (toSpec, toAnchor) target, or null. `#foo` → "self". */
function resolveTarget(
  href: string,
  registry: UrlResolver,
): { toSpec: string; toAnchor: string } | null {
  if (href.startsWith("#")) {
    return { toSpec: "self", toAnchor: href.slice(1) };
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    const resolved = registry.resolveUrl(href);
    if (resolved) return { toSpec: resolved.spec, toAnchor: resolved.anchor };
  }
  return null;
}

/**
 * Extract all cross-references from a parsed document. Only Heading and
 * Algorithm sections establish attribution scope (Definitions do not).
 */
export function extractReferences(
  doc: Document,
  specName: string,
  sections: ParsedSection[],
  registry: UrlResolver,
): ParsedReference[] {
  const scopeAnchors = new Set(
    sections
      .filter((s) => s.sectionType === "heading" || s.sectionType === "algorithm")
      .map((s) => s.anchor),
  );
  const algoAnchors = new Set(
    sections.filter((s) => s.sectionType === "algorithm").map((s) => s.anchor),
  );

  // One reference per (from, toSpec, toAnchor), preserving first-occurrence
  // order, but aggregating every call-site id for that pair.
  const byKey = new Map<string, ParsedReference>();
  const references: ParsedReference[] = [];
  let currentSection: string | null = null;
  // The DOM extent of the current section when it's an algorithm; null for
  // headings. Call-site ids are only recorded for links inside this extent.
  let currentAlgoExtent: Element[] | null = null;

  const root = doc.documentElement ?? doc.body;
  for (const el of root.querySelectorAll("*")) {
    const id = el.getAttribute("id");
    if (id && scopeAnchors.has(id)) {
      currentSection = id;
      currentAlgoExtent = algoAnchors.has(id) ? algorithmExtent(el) : null;
    }

    if (el.tagName.toLowerCase() === "a") {
      const href = el.getAttribute("href");
      if (!href) continue;
      if (isSelfLink(el) || isBiblioRef(el)) continue;
      if (currentSection === null) continue;

      const target = resolveTarget(href, registry);
      if (!target) continue;
      const toSpec = target.toSpec === "self" ? specName : target.toSpec;

      const key = `${currentSection} ${toSpec} ${target.toAnchor}`;
      let ref = byKey.get(key);
      if (!ref) {
        ref = { fromAnchor: currentSection, toSpec, toAnchor: target.toAnchor, callSiteIds: [] };
        byKey.set(key, ref);
        references.push(ref);
      }
      // Record a section-scoped call site only when the link lives inside the
      // calling algorithm's body.
      const callSiteId = el.getAttribute("id");
      if (callSiteId && currentAlgoExtent?.some((e) => e.contains(el))) {
        ref.callSiteIds.push(callSiteId);
      }
    }
  }

  return references;
}
