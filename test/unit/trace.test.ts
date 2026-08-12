/**
 * End-to-end port validation on a synthetic algorithm chain shaped like the bug
 * 2040963 c4 trace: assign → navigate → check. Exercises reference extraction,
 * the outgoing BFS graph, the call-tree, and the Bugzilla renderer.
 */
import { describe, expect, it } from "vitest";
import { parseHtml, storeFrom } from "../helpers.js";
import { outgoingTrace, pathTrace } from "../../src/tracer/trace.js";
import { renderPath, renderTree } from "../../src/render/trace-render.js";

const CHAIN_HTML = `
  <h2 id="nav">Navigation</h2>

  <div class="algorithm" data-algorithm="assign">
    <p>To <dfn id="a-assign">assign(url)</dfn>:</p>
    <ol><li>Do <a href="#a-navigate">navigate</a>.</li></ol>
  </div>

  <div class="algorithm" data-algorithm="navigate">
    <p>To <dfn id="a-navigate">navigate</dfn>:</p>
    <ol><li>Do <a href="#a-check">check unloading</a>.</li></ol>
  </div>

  <div class="algorithm" data-algorithm="check">
    <p>To <dfn id="a-check">check unloading</dfn>:</p>
    <ol><li>Return.</li></ol>
  </div>
`;

describe("references — algorithm chain", () => {
  it("attributes intra-spec links to their algorithm scope", () => {
    const { references } = parseHtml(CHAIN_HTML);
    expect(references).toEqual([
      { fromAnchor: "a-assign", toSpec: "TEST", toAnchor: "a-navigate", callSiteIds: [] },
      { fromAnchor: "a-navigate", toSpec: "TEST", toAnchor: "a-check", callSiteIds: [] },
    ]);
  });
});

describe("outgoing trace", () => {
  it("builds the expected graph node/edge sets (depth 2)", async () => {
    const store = await storeFrom(CHAIN_HTML);
    const { graph } = await outgoingTrace(store, {
      rootSpec: "TEST",
      rootAnchor: "a-assign",
      sameSpecOnly: true,
    });
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      "TEST#a-assign",
      "TEST#a-check",
      "TEST#a-navigate",
    ]);
    expect(graph.edges.map((e) => `${e.from} -> ${e.to}`)).toEqual([
      "TEST#a-assign -> TEST#a-navigate",
      "TEST#a-navigate -> TEST#a-check",
    ]);
  });

  it("renders a nested numbered list with titles and links", async () => {
    const store = await storeFrom(CHAIN_HTML);
    const { tree } = await outgoingTrace(store, {
      rootSpec: "TEST",
      rootAnchor: "a-assign",
      sameSpecOnly: true,
    });
    const text = renderTree(tree, () => "https://test.example.com");
    expect(text).toBe(
      [
        "1. [assign(url)](https://test.example.com#a-assign)",
        "   1.1. [navigate](https://test.example.com#a-navigate)",
        "      1.1.1. [check unloading](https://test.example.com#a-check)",
      ].join("\n"),
    );
  });
});

describe("path trace", () => {
  it("finds the chain from assign to check", async () => {
    const store = await storeFrom(CHAIN_HTML);
    const chain = await pathTrace(store, "TEST", "a-assign", "TEST", "a-check");
    expect(chain?.map((n) => n.anchor)).toEqual(["a-assign", "a-navigate", "a-check"]);
  });

  it("renders a flat 'A calls B' numbered list", async () => {
    const store = await storeFrom(CHAIN_HTML);
    const chain = await pathTrace(store, "TEST", "a-assign", "TEST", "a-check");
    const text = renderPath(chain!, () => "https://test.example.com");
    expect(text).toBe(
      [
        "1. [#a-assign](https://test.example.com#a-assign) calls [#a-navigate](https://test.example.com#a-navigate)",
        "2. [#a-navigate](https://test.example.com#a-navigate) calls [#a-check](https://test.example.com#a-check)",
      ].join("\n"),
    );
  });

  it("returns null when no path exists", async () => {
    const store = await storeFrom(CHAIN_HTML);
    const chain = await pathTrace(store, "TEST", "a-check", "TEST", "a-assign");
    expect(chain).toBeNull();
  });

  it("links the callee to every call site inside the caller's section", async () => {
    const html = `
      <div class="algorithm" data-algorithm="assign">
        <p>To <dfn id="a-assign">assign(url)</dfn>:</p>
        <ol>
          <li>Do <a href="#a-navigate" id="the-loc:navigate-9">navigate</a>.</li>
          <li>Maybe <a href="#a-navigate" id="the-loc:navigate-10">navigate</a> again.</li>
        </ol>
      </div>
      <div class="algorithm" data-algorithm="navigate">
        <p>To <dfn id="a-navigate">navigate</dfn>:</p>
        <ol><li>Return.</li></ol>
      </div>`;
    const store = await storeFrom(html);
    const chain = await pathTrace(store, "TEST", "a-assign", "TEST", "a-navigate");
    const text = renderPath(chain!, () => "https://test.example.com");
    // caller → canonical def; callee → first call site as label, extras as [[2]].
    expect(text).toBe(
      "1. [#a-assign](https://test.example.com#a-assign) calls " +
        "[#a-navigate](https://test.example.com#the-loc:navigate-9), " +
        "[[2]](https://test.example.com#the-loc:navigate-10)",
    );
  });
});
