/**
 * Ported from webspec-index (MIT, Copyright (c) 2026 jnjaeschke)
 * https://github.com/jnjaeschke/webspec-index — src/model.rs
 *
 * Shared data model for parsed specs, references, IDL, graph and query results.
 */

/** Type of a section. Mirrors `SectionType` (model.rs). */
export type SectionType =
  | "heading"
  | "algorithm"
  | "definition"
  | "idl"
  | "prose";

/** A parsed section from the spec HTML. Mirrors `ParsedSection`. */
export interface ParsedSection {
  anchor: string;
  title: string | null;
  contentText: string | null;
  sectionType: SectionType;
  parentAnchor: string | null;
  prevAnchor: string | null;
  nextAnchor: string | null;
  /** 2-6 for headings, otherwise null. */
  depth: number | null;
}

/** A cross-reference found in the spec. Mirrors `ParsedReference`. */
export interface ParsedReference {
  fromAnchor: string;
  /** Target spec name (same as source for intra-spec refs). */
  toSpec: string;
  toAnchor: string;
}

/** A parsed WebIDL definition from `dfn[data-dfn-type]`. Mirrors `ParsedIdlDefinition`. */
export interface ParsedIdlDefinition {
  anchor: string;
  name: string;
  owner: string | null;
  kind: string;
  canonicalName: string;
  idlText: string | null;
}

/** Complete parsed spec. Mirrors `ParsedSpec`. */
export interface ParsedSpec {
  sections: ParsedSection[];
  references: ParsedReference[];
  idlDefinitions: ParsedIdlDefinition[];
}

/** A single directed cross-reference edge, fully qualified on both ends. */
export interface RefEdge {
  fromSpec: string;
  fromAnchor: string;
  toSpec: string;
  toAnchor: string;
}

/** Minimal label info for a graph node. */
export interface NodeMeta {
  title: string | null;
  sectionType: SectionType | null;
}

export type GraphDirection = "incoming" | "outgoing" | "both";

/** A node in a cross-reference graph. Mirrors `GraphNode` (model.rs / format.rs). */
export interface GraphNode {
  /** `"SPEC#anchor"` */
  id: string;
  spec: string;
  anchor: string;
  title?: string | null;
  type?: SectionType | null;
  /** "root" | "matched" | "bridge" when include/exclude filters are active. */
  filterRole?: string | null;
}

/** An edge in a cross-reference graph. Mirrors `GraphEdge`. */
export interface GraphEdge {
  from: string;
  to: string;
  kind: "reference";
}

/** Result of a graph traversal. Mirrors `GraphResult` (build_graph_from_conn). */
export interface GraphResult {
  root: { spec: string; anchor: string };
  direction: GraphDirection;
  maxDepth: number;
  maxNodes: number;
  truncated: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
