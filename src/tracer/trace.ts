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

/**
 * Build a call-tree (no cycles) rooted at the graph's root. Children follow the
 * order the references appear in the spec source (from the store's outgoing
 * refs), not the graph's alphabetical edge sort — so the trace reads as an
 * actual call sequence. The graph's node set bounds the tree (depth/node caps).
 */
export async function treeFromGraph(
  store: SpecStore,
  graph: GraphResult,
): Promise<TraceNode> {
  const byId = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));
  const inGraph = new Set(byId.keys());
  const visited = new Set<string>();

  const build = async (spec: string, anchor: string): Promise<TraceNode> => {
    const id = nodeId(spec, anchor);
    visited.add(id);
    const n = byId.get(id);
    const children: TraceNode[] = [];
    for (const r of await store.getOutgoingRefs(spec, anchor)) {
      const cid = nodeId(r.toSpec, r.toAnchor);
      if (inGraph.has(cid) && !visited.has(cid)) {
        children.push(await build(r.toSpec, r.toAnchor));
      }
    }
    return { id, spec, anchor, title: n?.title ?? null, children };
  };

  return build(graph.root.spec, graph.root.anchor);
}

/** Outgoing call-tree trace: returns both the raw graph and the tree. */
export async function outgoingTrace(
  store: SpecStore,
  opts: GraphOptions,
): Promise<{ graph: GraphResult; tree: TraceNode }> {
  const graph = await buildGraph(store, { ...opts, direction: "outgoing" });
  return { graph, tree: await treeFromGraph(store, graph) };
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
