/**
 * Typed request/response protocol. The sidebar talks to the background (which
 * owns the SpecStore and does all fetch+parse) and, via the background, asks the
 * active tab's content script to insert rendered text.
 *
 * Endpoints are raw strings resolved in the background: `SPEC#anchor`, a full
 * spec URL, or `#anchor`/`anchor` (interpreted against the start's spec).
 */
import type { SectionType } from "../model/types.js";

/** Ask for a node's outgoing edges (for the interactive step-through). */
export interface EdgesRequest {
  kind: "edges";
  ref: string;
}

/** Insert rendered text into the active tab's focused text field. */
export interface InsertRequest {
  kind: "insert";
  text: string;
}

/** Connectivity check. */
export interface PingRequest {
  kind: "ping";
  payload?: string;
}

export type Request = EdgesRequest | InsertRequest | PingRequest;

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
  type: SectionType | null;
  baseUrl: string | null;
  /** Source HTML of the node's body, for spec-faithful rendering. */
  contentHtml: string | null;
  edges: EdgeInfo[];
}

export interface PingResponse {
  kind: "ping";
  ok: true;
  echo: string | undefined;
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

export type Response = PingResponse | EdgesResponse | InsertResponse | ErrorResponse;
