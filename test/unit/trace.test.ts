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

describe("references — call-site scoping", () => {
  it("records call sites only when inside the calling algorithm's body", () => {
    const html = `
      <div class="algorithm" data-algorithm="assign">
        <p>To <dfn id="a-assign">assign(url)</dfn>:</p>
        <ol><li>Do <a href="#a-navigate" id="in-body">navigate</a>.</li></ol>
      </div>
      <p>Note: see <a href="#a-navigate" id="in-prose">navigate</a> for details.</p>
      <div class="algorithm" data-algorithm="navigate">
        <p>To <dfn id="a-navigate">navigate</dfn>:</p>
        <ol><li>Return.</li></ol>
      </div>`;
    const { references } = parseHtml(html);
    const ref = references.find(
      (r) => r.fromAnchor === "a-assign" && r.toAnchor === "a-navigate",
    );
    // The edge still exists (the prose link created it), but only the in-body
    // call site is recorded.
    expect(ref?.callSiteIds).toEqual(["in-body"]);
  });
});

describe("algorithm extent — multiple algorithms in one div", () => {
  // WHATWG sometimes wraps several algorithms in a single <div data-algorithm>.
  const html = `
    <div data-algorithm="">
      <p>To <dfn id="algo-one">algo one</dfn>:</p>
      <ol><li>Do <a href="#algo-two" id="s:algo-two">algo two</a>.</li></ol>
      <p>To <dfn id="algo-two">algo two</dfn>:</p>
      <ol><li>Do <a href="#thing" id="s:thing">thing</a>.</li></ol>
    </div>`;

  it("bounds each algorithm's content to itself (no bleed into the next)", () => {
    const { sections } = parseHtml(html);
    const one = sections.find((s) => s.anchor === "algo-one")!;
    expect(one.contentHtml).not.toContain('id="algo-two"');
    expect(one.contentHtml).toContain("algo two"); // the step-7-style call is kept
  });

  it("attributes each call to the right algorithm within the shared div", () => {
    const { references } = parseHtml(html);
    const one = references.filter((r) => r.fromAnchor === "algo-one");
    const two = references.filter((r) => r.fromAnchor === "algo-two");
    expect(one).toEqual([
      { fromAnchor: "algo-one", toSpec: "TEST", toAnchor: "algo-two", callSiteIds: ["s:algo-two"] },
    ]);
    expect(two).toEqual([
      { fromAnchor: "algo-two", toSpec: "TEST", toAnchor: "thing", callSiteIds: ["s:thing"] },
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
