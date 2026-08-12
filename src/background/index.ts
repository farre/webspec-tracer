/**
 * Background page: message router. Owns the SpecStore and performs all
 * fetch+parse (host permissions live here). M1 wires up trace generation over
 * a session MemorySpecStore; IndexedDB persistence lands in M2.
 *
 * Kept side-effect-free at module top level (only registers a listener) so the
 * same code can run as an MV3 event page later. See docs/design.md.
 */
import type { Request, Response, TraceRequest } from "./messages.js";
import { loadRegistry } from "../registry/specs-data.js";
import type { Registry } from "../registry/registry.js";
import { MemorySpecStore } from "../store/memory-store.js";
import { fetchSpecHtml } from "../store/fetcher.js";
import { parseSpec } from "../parse/parse-spec.js";
import { outgoingTrace, pathTrace } from "../tracer/trace.js";
import { chainToTree, renderTree } from "../render/trace-render.js";

const FRESH_MS = 24 * 60 * 60 * 1000;

const store = new MemorySpecStore();
let registryPromise: Promise<Registry> | null = null;
const getRegistry = (): Promise<Registry> => (registryPromise ??= loadRegistry());

/** Ensure a spec's parsed model is in the store, fetching + parsing on a miss. */
async function ensureSpec(specName: string): Promise<Registry> {
  const registry = await getRegistry();
  if (await store.isFresh(specName, FRESH_MS)) return registry;

  const baseUrl = registry.baseUrlForSpec(specName);
  if (!baseUrl) throw new Error(`unknown spec: ${specName}`);

  const { html, sha } = await fetchSpecHtml(baseUrl);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const parsed = parseSpec(doc, specName, baseUrl, registry);
  await store.putSpec({
    specName,
    baseUrl,
    contentSha: sha,
    indexVersion: browser.runtime.getManifest().version,
    fetchedAt: Date.now(),
    parsed,
  });
  return registry;
}

async function handleTrace(req: TraceRequest): Promise<Response> {
  const registry = await ensureSpec(req.spec);
  const baseUrlFor = (s: string) => registry.baseUrlForSpec(s);

  if (req.mode === "outgoing") {
    const { graph, tree } = await outgoingTrace(store, {
      rootSpec: req.spec,
      rootAnchor: req.anchor,
      sameSpecOnly: true,
      maxDepth: req.maxDepth,
      maxNodes: req.maxNodes,
    });
    const header = `Spec trace: ${req.spec}#${req.anchor} (outgoing, depth ${graph.maxDepth})`;
    return { kind: "trace", graph, text: renderTree(tree, baseUrlFor, header) };
  }

  // path mode
  if (!req.toSpec || !req.toAnchor) {
    return { kind: "error", message: "path trace requires toSpec and toAnchor" };
  }
  await ensureSpec(req.toSpec);
  const chain = await pathTrace(store, req.spec, req.anchor, req.toSpec, req.toAnchor);
  if (!chain) return { kind: "error", message: "no path found" };
  const tree = chainToTree(chain)!;
  const header = `Spec trace: ${req.spec}#${req.anchor} → ${req.toSpec}#${req.toAnchor}`;
  return { kind: "trace", text: renderTree(tree, baseUrlFor, header) };
}

async function handle(req: Request): Promise<Response> {
  try {
    switch (req.kind) {
      case "ping":
        return { kind: "ping", ok: true, echo: req.payload };
      case "trace":
        return await handleTrace(req);
      default:
        return { kind: "error", message: `unknown request: ${JSON.stringify(req)}` };
    }
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

browser.runtime.onMessage.addListener((message: unknown): Promise<Response> => {
  return handle(message as Request);
});
