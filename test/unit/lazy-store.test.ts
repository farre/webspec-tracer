/**
 * LazyStore fetches a spec's parsed model on first read of its outgoing refs,
 * so a cross-spec path descends into specs that were not preloaded.
 */
import { describe, expect, it } from "vitest";
import { parseHtml } from "../helpers.js";
import { MemorySpecStore } from "../../src/store/memory-store.js";
import { LazyStore } from "../../src/store/lazy-store.js";
import { pathTrace } from "../../src/tracer/trace.js";
import { Registry } from "../../src/registry/registry.js";

// Spec A links out to DOM#node-a; reaching the target DOM#node-b requires
// expanding node-a, which forces DOM to be fetched mid-traversal.
const A_HTML = `
  <div class="algorithm" data-algorithm="start">
    <p>To <dfn id="a-start">start</dfn>:</p>
    <ol><li>Do <a href="https://dom.spec.whatwg.org/#node-a">node a</a>.</li></ol>
  </div>
`;

const DOM_HTML = `
  <div class="algorithm" data-algorithm="a">
    <p>To <dfn id="node-a">node a</dfn>:</p>
    <ol><li>Do <a href="#node-b">node b</a>.</li></ol>
  </div>
  <div class="algorithm" data-algorithm="b">
    <p>To <dfn id="node-b">node b</dfn>:</p>
    <ol><li>Return.</li></ol>
  </div>
`;

describe("LazyStore — cross-spec lazy fetch", () => {
  it("fetches the target spec on demand while pathfinding", async () => {
    const registry = new Registry([]);
    const base = new MemorySpecStore();

    // Preload only spec A; DOM is fetched lazily via ensure().
    await base.putSpec({
      specName: "A",
      baseUrl: "https://a.example.com",
      contentSha: "x",
      indexVersion: "t",
      fetchedAt: Date.now(),
      parsed: parseHtml(A_HTML, "A", "https://a.example.com", registry),
    });

    const fetched: string[] = [];
    const ensure = async (spec: string) => {
      if (spec === "DOM" && !(await base.getSpec("DOM"))) {
        fetched.push(spec);
        await base.putSpec({
          specName: "DOM",
          baseUrl: "https://dom.spec.whatwg.org",
          contentSha: "x",
          indexVersion: "t",
          fetchedAt: Date.now(),
          parsed: parseHtml(DOM_HTML, "DOM", "https://dom.spec.whatwg.org", registry),
        });
      }
    };

    const store = new LazyStore(base, ensure);
    const chain = await pathTrace(store, "A", "a-start", "DOM", "node-b");

    expect(chain?.map((n) => n.id)).toEqual(["A#a-start", "DOM#node-a", "DOM#node-b"]);
    expect(fetched).toEqual(["DOM"]); // DOM was pulled in on demand mid-traversal
  });
});
