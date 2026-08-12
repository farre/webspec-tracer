/**
 * Parity vs the webspec-index CLI for the bug 2040963 seed anchor.
 * Tier 1 (strict): the same-spec-only outgoing graph node/edge id sets must
 * equal the CLI golden. Tier 2 (strict): section_type per shared node matches.
 *
 * Requires the HTML fixture (run `node test/fixtures/refresh.mjs`); skips if
 * absent so the suite stays runnable without the 15 MB download.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { parseHtml } from "../helpers.js";
import { MemorySpecStore } from "../../src/store/memory-store.js";
import { buildGraph } from "../../src/tracer/graph.js";
import type { GraphResult } from "../../src/model/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures");
const HTML_FIXTURE = join(FIX, "html", "HTML.html");
const GOLDEN = join(FIX, "golden", "graph", "HTML__dom-location-assign.json");

interface GoldenNode { id: string; type: string | null }
interface GoldenGraph { nodes: GoldenNode[]; edges: { from: string; to: string }[] }

const hasFixture = existsSync(HTML_FIXTURE);

describe.skipIf(!hasFixture)("parity: HTML#dom-location-assign (same-spec-only)", () => {
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as GoldenGraph;
  let ours: GraphResult;

  // Parsing the 15 MB spec in jsdom is expensive; do it once for all tiers.
  beforeAll(async () => {
    const html = readFileSync(HTML_FIXTURE, "utf8");
    const store = new MemorySpecStore();
    await store.putSpec({
      specName: "HTML",
      baseUrl: "https://html.spec.whatwg.org",
      contentSha: "fixture",
      indexVersion: "fixture",
      fetchedAt: Date.now(),
      parsed: parseHtml(html, "HTML", "https://html.spec.whatwg.org"),
    });
    ours = await buildGraph(store, {
      rootSpec: "HTML",
      rootAnchor: "dom-location-assign",
      direction: "outgoing",
      sameSpecOnly: true,
      maxDepth: 2,
      maxNodes: 150,
    });
  }, 120_000);

  it("tier 1: node id set matches the CLI", () => {
    expect(new Set(ours.nodes.map((n) => n.id))).toEqual(
      new Set(golden.nodes.map((n) => n.id)),
    );
  });

  it("tier 1: edge set matches the CLI", () => {
    const key = (e: { from: string; to: string }) => `${e.from} -> ${e.to}`;
    expect(new Set(ours.edges.map(key))).toEqual(new Set(golden.edges.map(key)));
  });

  it("tier 2: section_type matches for shared nodes", () => {
    const goldType = new Map(golden.nodes.map((n) => [n.id, n.type]));
    for (const n of ours.nodes) {
      const expected = goldType.get(n.id);
      if (expected != null && n.type != null) expect(n.type).toBe(expected);
    }
  });
});
