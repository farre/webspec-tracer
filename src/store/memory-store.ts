/** In-memory SpecStore, used by tests and the parity harness. */
import type { NodeMeta, ParsedSection, RefEdge } from "../model/types.js";
import { SpecIndex, type SpecStore, type StoredSpec } from "./spec-store.js";

export class MemorySpecStore implements SpecStore {
  readonly incomingRefsCoverage = "fetched-only" as const;
  private readonly specs = new Map<string, StoredSpec>();
  private readonly index = new SpecIndex();

  async getSpec(specName: string): Promise<StoredSpec | undefined> {
    return this.specs.get(specName);
  }

  async putSpec(spec: StoredSpec): Promise<void> {
    this.specs.set(spec.specName, spec);
    this.index.add(spec.specName, spec.parsed);
  }

  async isFresh(specName: string, maxAgeMs: number): Promise<boolean> {
    const s = this.specs.get(specName);
    return s !== undefined && Date.now() - s.fetchedAt < maxAgeMs;
  }

  async getSection(specName: string, anchor: string): Promise<ParsedSection | undefined> {
    return this.index.getSection(specName, anchor);
  }

  async getNodeMeta(specName: string, anchor: string): Promise<NodeMeta | undefined> {
    const s = this.index.getSection(specName, anchor);
    return s ? { title: s.title, sectionType: s.sectionType } : undefined;
  }

  async getOutgoingRefs(specName: string, anchor: string): Promise<RefEdge[]> {
    return this.index.getOutgoing(specName, anchor);
  }

  async getIncomingRefs(specName: string, anchor: string): Promise<RefEdge[]> {
    return this.index.getIncoming(specName, anchor);
  }
}
