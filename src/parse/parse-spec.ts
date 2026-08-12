/**
 * Ported from webspec-index (MIT, Copyright (c) 2026 jnjaeschke)
 * https://github.com/jnjaeschke/webspec-index — src/parse/mod.rs
 *
 * Orchestrates parsing a spec Document into sections + references (+ IDL in M3).
 * M1 handles the generic WHATWG/W3C path (id'd headings and dfns).
 */
import type { ParsedSpec } from "../model/types.js";
import type { UrlResolver } from "./references.js";
import { buildConverter } from "./markdown.js";
import { parseDfnElement, parseHeadingElement, buildSectionTree } from "./sections.js";
import { extractReferences } from "./references.js";
import { headingDepth, tag } from "./dom.js";

const GENERIC_SELECTOR = "h2[id],h3[id],h4[id],h5[id],h6[id],dfn[id]";

/** Parse a spec Document into a ParsedSpec. `baseUrl` absolutizes content links. */
export function parseSpec(
  doc: Document,
  specName: string,
  baseUrl: string,
  registry: UrlResolver,
): ParsedSpec {
  const td = buildConverter(baseUrl);
  const root = doc.documentElement ?? doc.body;

  const sections = [];
  for (const el of root.querySelectorAll(GENERIC_SELECTOR)) {
    const section =
      headingDepth(tag(el)) !== null
        ? parseHeadingElement(el, td)
        : parseDfnElement(el, td);
    if (section) sections.push(section);
  }

  buildSectionTree(sections);
  const references = extractReferences(doc, specName, sections, registry);

  return { sections, references, idlDefinitions: [] };
}
