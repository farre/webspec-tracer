/**
 * Trace shapes built on top of the graph traversal:
 *  - outgoing call-tree from one anchor (BFS tree over outgoing edges);
 *  - path between two anchors (BFS + parent-pointer backtrace).
 * The path finder has no upstream equivalent; see docs/design.md.
 */
import type { GraphNode, GraphResult } from "../model/types.js";
import type { SpecStore } from "../store/spec-store.js";
import { buildGraph, type GraphOptions } from "./graph.js";

export interface TraceNode {
  id: string;
  spec: string;
  anchor: string;
  title: string | null;
  children: TraceNode[];
}

const nodeId = (spec: string, anchor: string) => `${spec}#${anchor}`;

/** Build a call-tree (no cycles) rooted at the graph's root, following directed edges. */
export function treeFromGraph(graph: GraphResult): TraceNode {
  const byId = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, string[]>();
  for (const e of graph.edges) {
    (adjacency.get(e.from) ?? adjacency.set(e.from, []).get(e.from)!).push(e.to);
  }

  const rootId = nodeId(graph.root.spec, graph.root.anchor);
  const visited = new Set<string>();

  const build = (id: string): TraceNode => {
    visited.add(id);
    const n = byId.get(id);
    const spec = n?.spec ?? graph.root.spec;
    const anchor = n?.anchor ?? graph.root.anchor;
    const children: TraceNode[] = [];
    for (const to of adjacency.get(id) ?? []) {
      if (!visited.has(to)) children.push(build(to));
    }
    return { id, spec, anchor, title: n?.title ?? null, children };
  };

  return build(rootId);
}

/** Outgoing call-tree trace: returns both the raw graph and the tree. */
export async function outgoingTrace(
  store: SpecStore,
  opts: GraphOptions,
): Promise<{ graph: GraphResult; tree: TraceNode }> {
  const graph = await buildGraph(store, { ...opts, direction: "outgoing" });
  return { graph, tree: treeFromGraph(graph) };
}

/** Shortest outgoing path from a start anchor to a target anchor, or null. */
export async function pathTrace(
  store: SpecStore,
  fromSpec: string,
  fromAnchor: string,
  toSpec: string,
  toAnchor: string,
  maxNodes = 5000,
): Promise<TraceNode[] | null> {
  const start = nodeId(fromSpec, fromAnchor);
  const goal = nodeId(toSpec, toAnchor);
  const parent = new Map<string, string>();
  const seen = new Set<string>([start]);
  const queue: Array<[string, string]> = [[fromSpec, fromAnchor]];

  while (queue.length > 0) {
    const [spec, anchor] = queue.shift()!;
    const id = nodeId(spec, anchor);
    if (id === goal) break;
    if (seen.size > maxNodes) break;
    for (const r of await store.getOutgoingRefs(spec, anchor)) {
      const nid = nodeId(r.toSpec, r.toAnchor);
      if (!seen.has(nid)) {
        seen.add(nid);
        parent.set(nid, id);
        queue.push([r.toSpec, r.toAnchor]);
      }
    }
  }

  if (goal !== start && !parent.has(goal)) return null;

  // Reconstruct start → goal.
  const ids: string[] = [];
  let cur: string | undefined = goal;
  while (cur !== undefined) {
    ids.unshift(cur);
    if (cur === start) break;
    cur = parent.get(cur);
  }

  const chain: TraceNode[] = [];
  for (const id of ids) {
    const [spec, anchor] = id.split("#") as [string, string];
    const meta = await store.getNodeMeta(spec, anchor);
    chain.push({ id, spec, anchor, title: meta?.title ?? null, children: [] });
  }
  return chain;
}
