/**
 * The SpecStore seam: fetch+parse (background) writes parsed specs; the tracer
 * reads refs and node metadata. Formalized so the default lazy IndexedDB store
 * and a future global/backend store are interchangeable (see docs/design.md).
 */
import type {
  NodeMeta,
  ParsedSection,
  ParsedSpec,
  RefEdge,
} from "../model/types.js";

export interface StoredSpec {
  specName: string;
  baseUrl: string;
  /** sha256 of the source HTML. */
  contentSha: string;
  /** Bumped to invalidate stale caches (INDEX_VERSION analogue). */
  indexVersion: string;
  /** epoch ms when fetched. */
  fetchedAt: number;
  parsed: ParsedSpec;
}

export interface SpecStore {
  getSpec(specName: string): Promise<StoredSpec | undefined>;
  putSpec(spec: StoredSpec): Promise<void>;
  isFresh(specName: string, maxAgeMs: number): Promise<boolean>;

  getSection(specName: string, anchor: string): Promise<ParsedSection | undefined>;
  getNodeMeta(specName: string, anchor: string): Promise<NodeMeta | undefined>;
  getOutgoingRefs(specName: string, anchor: string): Promise<RefEdge[]>;
  getIncomingRefs(specName: string, anchor: string): Promise<RefEdge[]>;

  /**
   * 'fetched-only' — incoming refs are best-effort across specs already stored.
   * 'complete' — a backend guarantees global coverage.
   */
  readonly incomingRefsCoverage: "fetched-only" | "complete";
}

const key = (spec: string, anchor: string) => `${spec}#${anchor}`;

/**
 * In-memory denormalized index over one-or-more parsed specs. Shared by the
 * memory and IndexedDB stores; the difference is only how StoredSpecs persist.
 */
export class SpecIndex {
  private readonly sections = new Map<string, ParsedSection>();
  private readonly outgoing = new Map<string, RefEdge[]>();
  private readonly incoming = new Map<string, RefEdge[]>();
  private readonly loaded = new Set<string>();

  has(specName: string): boolean {
    return this.loaded.has(specName);
  }

  add(specName: string, parsed: ParsedSpec): void {
    if (this.loaded.has(specName)) return;
    this.loaded.add(specName);

    for (const s of parsed.sections) {
      this.sections.set(key(specName, s.anchor), s);
    }
    for (const r of parsed.references) {
      const edge: RefEdge = {
        fromSpec: specName,
        fromAnchor: r.fromAnchor,
        toSpec: r.toSpec,
        toAnchor: r.toAnchor,
      };
      const outKey = key(specName, r.fromAnchor);
      (this.outgoing.get(outKey) ?? this.outgoing.set(outKey, []).get(outKey)!).push(edge);
      const inKey = key(r.toSpec, r.toAnchor);
      (this.incoming.get(inKey) ?? this.incoming.set(inKey, []).get(inKey)!).push(edge);
    }
  }

  getSection(specName: string, anchor: string): ParsedSection | undefined {
    return this.sections.get(key(specName, anchor));
  }

  getOutgoing(specName: string, anchor: string): RefEdge[] {
    return this.outgoing.get(key(specName, anchor)) ?? [];
  }

  getIncoming(specName: string, anchor: string): RefEdge[] {
    return this.incoming.get(key(specName, anchor)) ?? [];
  }
}
