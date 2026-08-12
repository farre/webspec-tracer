/**
 * Renders a trace as a numbered, nested Markdown list ready to paste into a
 * Bugzilla comment (matching the bug 2040963 c4 shape). Each node links to its
 * spec section: `[title](baseUrl#anchor)`.
 */
import type { TraceNode } from "../tracer/trace.js";

/** Resolves a spec name to its base URL (e.g. registry.baseUrlForSpec). */
export type BaseUrlResolver = (spec: string) => string | null;

function linkFor(node: TraceNode, baseUrlFor: BaseUrlResolver): string {
  const base = baseUrlFor(node.spec);
  const url = base ? `${base}#${node.anchor}` : `#${node.anchor}`;
  const label = node.title ?? node.anchor;
  return `[${label}](${url})`;
}

function renderNode(
  node: TraceNode,
  prefix: string,
  depth: number,
  baseUrlFor: BaseUrlResolver,
  lines: string[],
): void {
  const indent = "   ".repeat(depth);
  lines.push(`${indent}${prefix}. ${linkFor(node, baseUrlFor)}`);
  node.children.forEach((child, i) =>
    renderNode(child, `${prefix}.${i + 1}`, depth + 1, baseUrlFor, lines),
  );
}

/** Render a call-tree with an optional header line. */
export function renderTree(
  root: TraceNode,
  baseUrlFor: BaseUrlResolver,
  header?: string,
): string {
  const lines: string[] = [];
  if (header) lines.push(header, "");
  renderNode(root, "1", 0, baseUrlFor, lines);
  return lines.join("\n");
}

/** Convert a linear path (start → … → goal) into a nested single-child tree. */
export function chainToTree(chain: TraceNode[]): TraceNode | null {
  if (chain.length === 0) return null;
  for (let i = 0; i < chain.length - 1; i++) {
    chain[i]!.children = [chain[i + 1]!];
  }
  chain[chain.length - 1]!.children = [];
  return chain[0]!;
}

/**
 * Render a path as a flat, numbered "A calls B" list (one line per hop), the
 * shape used in hand-authored Bugzilla spec traces. The caller links to its
 * canonical definition; the callee links to the exact **call site** inside the
 * caller's section (the source `<a>`'s id) when known, so clicking lands on the
 * step that makes the call. A hop into another spec is labelled `SPEC#anchor`.
 */
export function renderPath(
  chain: TraceNode[],
  baseUrlFor: BaseUrlResolver,
  header?: string,
): string {
  const contextSpec = chain[0]?.spec;
  const label = (n: TraceNode) =>
    n.spec === contextSpec ? `#${n.anchor}` : `${n.spec}#${n.anchor}`;

  /** Canonical definition link for a node. */
  const defLink = (n: TraceNode) => {
    const base = baseUrlFor(n.spec);
    return `[${label(n)}](${base ? `${base}#${n.anchor}` : `#${n.anchor}`})`;
  };

  /**
   * Callee links: the first call site links the anchor label (`[#to]`), any
   * further call sites are numbered footnote-style (`[[2]]`, `[[3]]`), all
   * pointing at their `<a>` inside `from`'s page. Falls back to the canonical
   * definition when no call-site ids were captured.
   */
  const callLinks = (from: TraceNode, to: TraceNode): string => {
    const fromBase = baseUrlFor(from.spec);
    const ids = to.viaCallSiteIds ?? [];
    if (ids.length === 0 || !fromBase) return defLink(to);
    const parts = [`[${label(to)}](${fromBase}#${ids[0]})`];
    for (let k = 1; k < ids.length; k++) {
      parts.push(`[[${k + 1}]](${fromBase}#${ids[k]})`);
    }
    return parts.join(", ");
  };

  const lines: string[] = [];
  if (header) lines.push(header, "");
  for (let i = 0; i < chain.length - 1; i++) {
    const from = chain[i]!;
    const to = chain[i + 1]!;
    lines.push(`${i + 1}. ${defLink(from)} calls ${callLinks(from, to)}`);
  }
  return lines.join("\n");
}
