/**
 * Typed request/response protocol between the UI/content scripts and the
 * background page. The background owns the SpecStore and does all fetch+parse.
 */
import type { GraphResult } from "../model/types.js";

export type TraceMode = "outgoing" | "path";

export interface TraceRequest {
  kind: "trace";
  spec: string;
  anchor: string;
  mode: TraceMode;
  /** For mode === "path". */
  toSpec?: string;
  toAnchor?: string;
  maxDepth?: number;
  maxNodes?: number;
}

/** Simple connectivity check used by the M0 scaffold. */
export interface PingRequest {
  kind: "ping";
  payload?: string;
}

export type Request = TraceRequest | PingRequest;

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

export interface ErrorResponse {
  kind: "error";
  message: string;
}

export type Response = PingResponse | TraceResponse | ErrorResponse;
