/**
 * Ported from webspec-index (MIT, Copyright (c) 2026 jnjaeschke)
 * https://github.com/jnjaeschke/webspec-index — src/parse/sections.rs
 *
 * Section extraction: classifies id'd headings and `<dfn>`s into
 * Heading/Algorithm/Definition/Idl sections and computes the parent/prev/next
 * tree. M1 covers the WHATWG path (headings + dfns); ecmarkup/W3C-anchor/IETF
 * variants and full algorithm rendering land in M3.
 */
import type { ParsedSection, SectionType } from "../model/types.js";
import type TurndownService from "turndown";
import { elementToMarkdown } from "./markdown.js";
import { hasClass, headingDepth, tag } from "./dom.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Nearest ancestor element matching `pred`, walking up via parentElement. */
function findAncestor(el: Element, pred: (e: Element) => boolean): Element | null {
  let cur: Element | null = el.parentElement;
  while (cur) {
    if (pred(cur)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function isAlgorithmDiv(el: Element): boolean {
  return tag(el) === "div" && (hasClass(el, "algorithm") || el.hasAttribute("data-algorithm"));
}

/** Mirror of `is_idl_type`. */
function isIdlType(el: Element): boolean {
  const t = el.getAttribute("data-dfn-type");
  return (
    t === "interface" ||
    t === "dictionary" ||
    t === "enum" ||
    t === "callback" ||
    t === "callback interface" ||
    t === "typedef"
  );
}

const BLOCK_STOP = new Set(["p", "div", "h2", "h3", "h4", "h5", "h6"]);

/** Mirror of `is_inside_algorithm_content`. */
function isInsideAlgorithmContent(element: Element): boolean {
  let cur: Element | null = element.parentElement;
  while (cur) {
    if (tag(cur) === "ol" || tag(cur) === "ul") {
      const list = cur;
      // Pattern 1: list inside div.algorithm / div[data-algorithm].
      if (findAncestor(list, isAlgorithmDiv)) return true;

      // Pattern 2: Wattsi sibling — a preceding p/dd/li block containing a dfn[id].
      let prev: Element | null = list.previousElementSibling;
      while (prev) {
        const name = tag(prev);
        if (name === "p" || name === "dd" || name === "li") {
          if (prev.querySelector("dfn[id]")) return true;
        }
        if (BLOCK_STOP.has(name)) break;
        prev = prev.previousElementSibling;
      }
      return false;
    }
    cur = cur.parentElement;
  }
  return false;
}

/** Mirror of `is_inside_algorithm_div` (Bikeshed div OR Wattsi sibling list). */
function isInsideAlgorithmDiv(element: Element): boolean {
  let cur: Element | null = element.parentElement;
  while (cur) {
    if (isAlgorithmDiv(cur)) return true;
    const name = tag(cur);
    if (name === "p" || name === "div" || name === "dd" || name === "li") {
      let sib: Element | null = cur.nextElementSibling;
      while (sib) {
        const sname = tag(sib);
        if (sname === "ol" || sname === "ul" || sname === "dl") return true;
        if (BLOCK_STOP.has(sname)) break;
        sib = sib.nextElementSibling;
      }
    }
    cur = cur.parentElement;
  }
  return false;
}

// ── content extraction ─────────────────────────────────────────────────────

/** Mirror of `extract_heading_content`: prose between a heading and the next section. */
function extractHeadingContent(
  heading: Element,
  currentDepth: number,
  td: TurndownService,
): string | null {
  let html = "";
  let sib: Element | null = heading.nextElementSibling;
  while (sib) {
    const name = tag(sib);
    const d = headingDepth(name);
    if (d !== null && d <= currentDepth) break;
    if (name === "dfn" && sib.hasAttribute("id")) break;
    html += sib.outerHTML;
    sib = sib.nextElementSibling;
  }
  if (!html.trim()) return null;
  const md = td.turndown(html).trim();
  return md || null;
}

/** Mirror of `extract_heading_title`: text minus secno/secnum/self-link children. */
function extractHeadingTitle(el: Element): string | null {
  const parts: string[] = [];
  for (const node of el.childNodes) {
    if (node.nodeType === 1) {
      const child = node as Element;
      if (hasClass(child, "secno", "secnum", "self-link")) continue;
      parts.push(child.textContent ?? "");
    } else if (node.nodeType === 3) {
      parts.push(node.textContent ?? "");
    }
  }
  const result = parts.join("").trim();
  return result || null;
}

/** Definition content: nearest enclosing block-level element rendered to markdown. */
function extractDefinitionContent(el: Element, td: TurndownService): string | null {
  const block = findAncestor(el, (e) =>
    ["p", "div", "dd", "dt", "li", "section"].includes(tag(e)),
  );
  if (block) return elementToMarkdown(block, td);
  return (el.textContent ?? "").trim() || null;
}

/** Algorithm content (simplified for M1): the enclosing algorithm div, or the
 * intro block plus its following list, rendered via turndown. */
function extractAlgorithmContent(el: Element, td: TurndownService): string | null {
  const div = findAncestor(el, isAlgorithmDiv);
  if (div) return elementToMarkdown(div, td);

  const intro = findAncestor(el, (e) => ["p", "dd", "li"].includes(tag(e)));
  if (intro) {
    let html = intro.outerHTML;
    let sib: Element | null = intro.nextElementSibling;
    while (sib) {
      const name = tag(sib);
      if (name === "ol" || name === "ul" || name === "dl") {
        html += sib.outerHTML;
        break;
      }
      if (BLOCK_STOP.has(name)) break;
      sib = sib.nextElementSibling;
    }
    return td.turndown(html).trim() || null;
  }
  return null;
}

/** IDL content: text of the enclosing `<pre>`. */
function extractIdlContent(el: Element): string | null {
  const pre = findAncestor(el, (e) => tag(e) === "pre");
  return pre ? (pre.textContent ?? "").trim() || null : null;
}

// ── element parsers ────────────────────────────────────────────────────────

/** Mirror of `parse_heading_element`. */
export function parseHeadingElement(el: Element, td: TurndownService): ParsedSection | null {
  const anchor = el.getAttribute("id");
  if (!anchor) return null;
  const depth = headingDepth(tag(el));
  if (depth === null) return null;
  return {
    anchor,
    title: extractHeadingTitle(el),
    contentText: extractHeadingContent(el, depth, td),
    sectionType: "heading",
    parentAnchor: null,
    prevAnchor: null,
    nextAnchor: null,
    depth,
  };
}

/** Mirror of `parse_dfn_element`. */
export function parseDfnElement(el: Element, td: TurndownService): ParsedSection | null {
  const anchor = el.getAttribute("id");
  if (!anchor) return null;

  if (isInsideAlgorithmContent(el)) return null;

  const hasDfnFor = el.hasAttribute("data-dfn-for");
  const hasDfnType = el.hasAttribute("data-dfn-type");
  const hasDirectVarChild = Array.from(el.children).some((c) => tag(c) === "var");
  if ((hasDfnFor && !hasDfnType) || hasDirectVarChild) return null;
  if (el.getAttribute("data-dfn-type") === "argument") return null;

  const title = (el.textContent ?? "").trim() || null;

  let sectionType: SectionType;
  if (isInsideAlgorithmDiv(el)) sectionType = "algorithm";
  else if (isIdlType(el)) sectionType = "idl";
  else sectionType = "definition";

  let contentText: string | null = null;
  if (sectionType === "definition") contentText = extractDefinitionContent(el, td);
  else if (sectionType === "algorithm") contentText = extractAlgorithmContent(el, td);
  else if (sectionType === "idl") contentText = extractIdlContent(el);

  return {
    anchor,
    title,
    contentText,
    sectionType,
    parentAnchor: null,
    prevAnchor: null,
    nextAnchor: null,
    depth: null,
  };
}

// ── tree building ────────────────────────────────────────────────────────────

/** Mirror of `build_section_tree`: parent + prev/next sibling relationships. */
export function buildSectionTree(sections: ParsedSection[]): ParsedSection[] {
  // Parent relationships.
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    if (s.depth !== null) {
      for (let j = i - 1; j >= 0; j--) {
        const pd = sections[j]!.depth;
        if (pd !== null && pd < s.depth) {
          s.parentAnchor = sections[j]!.anchor;
          break;
        }
      }
    } else {
      for (let j = i - 1; j >= 0; j--) {
        if (sections[j]!.depth !== null) {
          s.parentAnchor = sections[j]!.anchor;
          break;
        }
      }
    }
  }

  // Prev/next siblings (same depth, same parent).
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    for (let j = i - 1; j >= 0; j--) {
      if (sections[j]!.depth === s.depth && sections[j]!.parentAnchor === s.parentAnchor) {
        s.prevAnchor = sections[j]!.anchor;
        break;
      }
    }
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j]!.depth === s.depth && sections[j]!.parentAnchor === s.parentAnchor) {
        s.nextAnchor = sections[j]!.anchor;
        break;
      }
    }
  }

  return sections;
}
