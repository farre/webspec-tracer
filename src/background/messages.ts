/**
 * Typed request/response protocol. The UI and content scripts talk to the
 * background (which owns the SpecStore and does all fetch+parse); the sidebar
 * also asks the active Bugzilla tab's content script to insert rendered text.
 *
 * Endpoints are raw strings resolved in the background: `SPEC#anchor`, a full
 * spec URL, or `#anchor`/`anchor` (interpreted against the start's spec).
 */
import type { GraphResult } from "../model/types.js";

/** Outgoing call-tree from a single anchor. */
export interface OutgoingTraceRequest {
  kind: "trace";
  mode: "outgoing";
  ref: string;
  maxDepth?: number;
  maxNodes?: number;
}

/** Shortest path between two anchors. */
export interface PathTraceRequest {
  kind: "trace";
  mode: "path";
  from: string;
  to: string;
}

export type TraceRequest = OutgoingTraceRequest | PathTraceRequest;

/** Ask for a node's outgoing edges (for the interactive step-through). */
export interface EdgesRequest {
  kind: "edges";
  ref: string;
}

/** Sent to the active Bugzilla tab's content script to insert text at the caret. */
export interface InsertRequest {
  kind: "insert";
  text: string;
}

/** Connectivity check. */
export interface PingRequest {
  kind: "ping";
  payload?: string;
}

export type Request = TraceRequest | EdgesRequest | InsertRequest | PingRequest;

/** One outgoing edge from a node, for the interactive step-through. */
export interface EdgeInfo {
  toSpec: string;
  toAnchor: string;
  title: string | null;
  baseUrl: string | null;
  callSiteIds: string[];
}

export interface EdgesResponse {
  kind: "edges";
  spec: string;
  anchor: string;
  title: string | null;
  baseUrl: string | null;
  edges: EdgeInfo[];
}

export interface PingResponse {
  kind: "ping";
  ok: true;
  echo: string | undefined;
}

export interface TraceResponse {
  kind: "trace";
  /** Present for outgoing call-tree traces; omitted for path traces. */
  graph?: GraphResult;
  /** Rendered numbered-list text ready to paste into Bugzilla. */
  text: string;
}

export interface InsertResponse {
  kind: "insert";
  ok: boolean;
  message?: string;
}

export interface ErrorResponse {
  kind: "error";
  message: string;
}

export type Response =
  | PingResponse
  | TraceResponse
  | EdgesResponse
  | InsertResponse
  | ErrorResponse;
