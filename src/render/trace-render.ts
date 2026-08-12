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
