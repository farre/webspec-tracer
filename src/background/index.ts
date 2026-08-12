/**
 * Background page: message router. Owns the SpecStore and performs all
 * fetch+parse (host permissions live here). M1 wires up trace generation over
 * a session MemorySpecStore; IndexedDB persistence lands in M2.
 *
 * Kept side-effect-free at module top level (only registers a listener) so the
 * same code can run as an MV3 event page later. See docs/design.md.
 */
import type { EdgeInfo, EdgesRequest, Request, Response } from "./messages.js";
import { loadRegistry } from "../registry/specs-data.js";
import type { Registry } from "../registry/registry.js";
import { MemorySpecStore } from "../store/memory-store.js";
import { LazyStore } from "../store/lazy-store.js";
import { fetchSpecHtml } from "../store/fetcher.js";
import { parseSpec } from "../parse/parse-spec.js";
import { resolveEndpoint } from "../registry/endpoint.js";

const FRESH_MS = 24 * 60 * 60 * 1000;

const base = new MemorySpecStore();
let registryPromise: Promise<Registry> | null = null;
const getRegistry = (): Promise<Registry> => (registryPromise ??= loadRegistry());

// De-duplicate concurrent/repeat fetches of the same spec.
const inFlight = new Map<string, Promise<void>>();

/** Fetch + parse + store a spec if it isn't already fresh. */
async function fetchAndStore(specName: string): Promise<void> {
  const registry = await getRegistry();
  if (await base.isFresh(specName, FRESH_MS)) return;

  const baseUrl = registry.baseUrlForSpec(specName);
  if (!baseUrl) throw new Error(`unknown spec: ${specName}`);

  const { html, sha } = await fetchSpecHtml(baseUrl);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const parsed = parseSpec(doc, specName, baseUrl, registry);
  await base.putSpec({
    specName,
    baseUrl,
    contentSha: sha,
    indexVersion: browser.runtime.getManifest().version,
    fetchedAt: Date.now(),
    parsed,
  });
}

/** Ensure a spec is present, coalescing duplicate in-flight fetches. */
function ensureSpec(specName: string): Promise<void> {
  let p = inFlight.get(specName);
  if (!p) {
    p = fetchAndStore(specName).finally(() => inFlight.delete(specName));
    inFlight.set(specName, p);
  }
  return p;
}

// The tracer reads through the lazy layer, which fetches specs on demand as a
// trace crosses `to_spec` boundaries.
const store = new LazyStore(base, ensureSpec);

async function handleEdges(req: EdgesRequest): Promise<Response> {
  const registry = await getRegistry();
  const ep = resolveEndpoint(req.ref, registry);
  if (!ep) return { kind: "error", message: `could not resolve "${req.ref}" (use SPEC#anchor)` };

  // getOutgoingRefs triggers a lazy fetch of the spec via LazyStore.
  const refs = await store.getOutgoingRefs(ep.spec, ep.anchor);
  const section = await store.getSection(ep.spec, ep.anchor);

  const edges: EdgeInfo[] = [];
  for (const r of refs) {
    const meta = await store.getNodeMeta(r.toSpec, r.toAnchor);
    edges.push({
      toSpec: r.toSpec,
      toAnchor: r.toAnchor,
      title: meta?.title ?? null,
      baseUrl: registry.baseUrlForSpec(r.toSpec),
      callSiteIds: r.callSiteIds,
    });
  }

  return {
    kind: "edges",
    spec: ep.spec,
    anchor: ep.anchor,
    title: section?.title ?? null,
    type: section?.sectionType ?? null,
    baseUrl: registry.baseUrlForSpec(ep.spec),
    contentHtml: section?.contentHtml ?? null,
    edges,
  };
}

async function handleInsert(text: string): Promise<Response> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { kind: "insert", ok: false, message: "no active tab" };
  try {
    // Ensure the content script is present (idempotent), then hand it the text.
    await browser.tabs.executeScript(tab.id, { file: "comment-insert.js" });
    return (await browser.tabs.sendMessage(tab.id, { kind: "insert", text })) as Response;
  } catch {
    return {
      kind: "insert",
      ok: false,
      message: "open a bugzilla.mozilla.org page and click a text field",
    };
  }
}

async function handle(req: Request): Promise<Response> {
  try {
    switch (req.kind) {
      case "ping":
        return { kind: "ping", ok: true, echo: req.payload };
      case "edges":
        return await handleEdges(req);
      case "insert":
        return await handleInsert(req.text);
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
