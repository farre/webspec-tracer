/**
 * Ported from webspec-index (MIT, Copyright (c) 2026 jnjaeschke)
 * https://github.com/jnjaeschke/webspec-index — src/lib.rs build_graph_from_conn
 *
 * Cross-reference graph traversal: BFS over outgoing/incoming refs with depth
 * and node caps, optional same-spec / include-exclude filtering, shortest-path
 * bridge marking, and disconnected pruning. Reads refs from a SpecStore.
 */
import type { GraphDirection, GraphNode, GraphResult } from "../model/types.js";
import type { SpecStore } from "../store/spec-store.js";

export interface GraphOptions {
  rootSpec: string;
  rootAnchor: string;
  direction?: GraphDirection;
  maxDepth?: number;
  maxNodes?: number;
  sameSpecOnly?: boolean;
  include?: string[];
  exclude?: string[];
}

const nodeId = (spec: string, anchor: string) => `${spec}#${anchor}`;

export async function buildGraph(store: SpecStore, opts: GraphOptions): Promise<GraphResult> {
  const direction = opts.direction ?? "outgoing";
  const maxDepth = opts.maxDepth ?? 2;
  const maxNodes = opts.maxNodes ?? 150;
  const sameSpecOnly = opts.sameSpecOnly ?? false;
  if (maxNodes <= 0) throw new Error("maxNodes must be greater than 0");

  const include = (opts.include ?? []).map((p) => new RegExp(p));
  const exclude = (opts.exclude ?? []).map((p) => new RegExp(p));
  const { rootSpec, rootAnchor } = opts;
  const rootId = nodeId(rootSpec, rootAnchor);

  const visited = new Set<string>([`${rootSpec}\n${rootAnchor}`]);
  const queue: Array<[string, string, number]> = [[rootSpec, rootAnchor, 0]];
  const edges = new Set<string>();
  let truncated = false;

  const wantOut = direction === "outgoing" || direction === "both";
  const wantIn = direction === "incoming" || direction === "both";

  const tryAdd = (spec: string, anchor: string, depth: number) => {
    const vk = `${spec}\n${anchor}`;
    if (!visited.has(vk)) {
      visited.add(vk);
      if (visited.size > maxNodes) {
        visited.delete(vk);
        truncated = true;
      } else {
        queue.push([spec, anchor, depth + 1]);
      }
    }
  };

  while (queue.length > 0) {
    const [spec, anchor, depth] = queue.shift()!;
    if (depth >= maxDepth) continue;

    if (wantOut) {
      for (const r of await store.getOutgoingRefs(spec, anchor)) {
        if (sameSpecOnly && (r.toSpec !== rootSpec || spec !== rootSpec)) continue;
        const fromId = nodeId(spec, anchor);
        const toId = nodeId(r.toSpec, r.toAnchor);
        if (fromId === toId) continue;
        edges.add(`${fromId}\t${toId}`);
        tryAdd(r.toSpec, r.toAnchor, depth);
      }
    }

    if (wantIn) {
      for (const r of await store.getIncomingRefs(spec, anchor)) {
        if (sameSpecOnly && (r.fromSpec !== rootSpec || spec !== rootSpec)) continue;
        const fromId = nodeId(r.fromSpec, r.fromAnchor);
        const toId = nodeId(spec, anchor);
        if (fromId === toId) continue;
        edges.add(`${fromId}\t${toId}`);
        tryAdd(r.fromSpec, r.fromAnchor, depth);
      }
    }
  }

  // Materialize nodes with metadata.
  let nodes: GraphNode[] = [];
  for (const vk of visited) {
    const [spec, anchor] = vk.split("\n") as [string, string];
    const meta = await store.getNodeMeta(spec, anchor);
    nodes.push({
      id: nodeId(spec, anchor),
      spec,
      anchor,
      title: meta?.title ?? null,
      type: meta?.sectionType ?? null,
      filterRole: null,
    });
  }

  let edgeList = [...edges].map((e) => {
    const [from, to] = e.split("\t") as [string, string];
    return { from, to, kind: "reference" as const };
  });

  // Filter roles + shortest-path bridge retention.
  const filterActive = include.length > 0 || exclude.length > 0;
  const matchesNode = (id: string) =>
    (include.length === 0 || include.some((r) => r.test(id))) &&
    !exclude.some((r) => r.test(id));

  const matched = new Set<string>(
    filterActive ? nodes.filter((n) => matchesNode(n.id)).map((n) => n.id) : nodes.map((n) => n.id),
  );
  matched.add(rootId);

  // Undirected adjacency + BFS tree for shortest paths from root.
  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
  };
  for (const e of edgeList) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  const parent = new Map<string, string>();
  const seen = new Set<string>([rootId]);
  const bfs: string[] = [rootId];
  while (bfs.length > 0) {
    const cur = bfs.shift()!;
    for (const nb of adjacency.get(cur) ?? []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        parent.set(nb, cur);
        bfs.push(nb);
      }
    }
  }

  const kept = new Set<string>([rootId]);
  for (const id of matched) {
    if (!seen.has(id)) continue;
    let cur = id;
    kept.add(cur);
    for (let p = parent.get(cur); p !== undefined; p = parent.get(cur)) {
      kept.add(p);
      if (p === rootId) break;
      cur = p;
    }
  }
  nodes = nodes.filter((n) => kept.has(n.id));
  edgeList = edgeList.filter((e) => kept.has(e.from) && kept.has(e.to));

  // Final connectivity prune.
  const keptAdj = new Map<string, string[]>();
  const link2 = (a: string, b: string) => {
    (keptAdj.get(a) ?? keptAdj.set(a, []).get(a)!).push(b);
  };
  for (const e of edgeList) {
    link2(e.from, e.to);
    link2(e.to, e.from);
  }
  const connected = new Set<string>([rootId]);
  const cq: string[] = [rootId];
  while (cq.length > 0) {
    const cur = cq.shift()!;
    for (const nb of keptAdj.get(cur) ?? []) {
      if (!connected.has(nb)) {
        connected.add(nb);
        cq.push(nb);
      }
    }
  }
  nodes = nodes.filter((n) => connected.has(n.id));
  edgeList = edgeList.filter((e) => connected.has(e.from) && connected.has(e.to));

  if (filterActive) {
    for (const n of nodes) {
      n.filterRole = n.id === rootId ? "root" : matched.has(n.id) ? "matched" : "bridge";
    }
  }

  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  edgeList.sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0,
  );

  return {
    root: { spec: rootSpec, anchor: rootAnchor },
    direction,
    maxDepth,
    maxNodes,
    truncated,
    nodes,
    edges: edgeList,
  };
}
