/**
 * Lazy cross-spec layer: wraps a base SpecStore and ensures a spec is fetched +
 * parsed the first time traversal needs its outgoing refs (or a query needs its
 * section), mirroring how webspec-index lazily indexes specs on demand. Node
 * metadata and incoming refs never trigger a fetch, so a cross-spec trace only
 * pulls specs it actually descends into — not every leaf.
 */
import type { NodeMeta, ParsedSection, RefEdge } from "../model/types.js";
import type { SpecStore, StoredSpec } from "./spec-store.js";

/** Ensures a spec's parsed model is present in the base store (fetch on miss). */
export type EnsureSpec = (specName: string) => Promise<void>;

export class LazyStore implements SpecStore {
  readonly incomingRefsCoverage: "fetched-only" | "complete";

  constructor(
    private readonly base: SpecStore,
    private readonly ensure: EnsureSpec,
  ) {
    this.incomingRefsCoverage = base.incomingRefsCoverage;
  }

  getSpec(specName: string): Promise<StoredSpec | undefined> {
    return this.base.getSpec(specName);
  }

  putSpec(spec: StoredSpec): Promise<void> {
    return this.base.putSpec(spec);
  }

  isFresh(specName: string, maxAgeMs: number): Promise<boolean> {
    return this.base.isFresh(specName, maxAgeMs);
  }

  async getSection(specName: string, anchor: string): Promise<ParsedSection | undefined> {
    await this.ensure(specName);
    return this.base.getSection(specName, anchor);
  }

  async getOutgoingRefs(specName: string, anchor: string): Promise<RefEdge[]> {
    await this.ensure(specName);
    return this.base.getOutgoingRefs(specName, anchor);
  }

  /** No fetch: metadata is best-effort over already-loaded specs. */
  getNodeMeta(specName: string, anchor: string): Promise<NodeMeta | undefined> {
    return this.base.getNodeMeta(specName, anchor);
  }

  /** No fetch: incoming refs are best-effort over already-loaded specs. */
  getIncomingRefs(specName: string, anchor: string): Promise<RefEdge[]> {
    return this.base.getIncomingRefs(specName, anchor);
  }
}
