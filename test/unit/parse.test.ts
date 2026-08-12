/**
 * Ported from webspec-index's parse tests (src/parse/mod.rs #[cfg(test)]):
 * validates section classification and the parent/prev/next tree.
 */
import { describe, expect, it } from "vitest";
import { parseHtml } from "../helpers.js";

const WIDGET_HTML = `
  <h2 id="intro">Introduction</h2>
  <p>This spec defines <dfn id="concept-widget">widgets</dfn>.</p>

  <h3 id="types">Widget Types</h3>
  <pre class="idl">
    interface <dfn data-dfn-type="interface" id="widget"><code>Widget</code></dfn> {
      constructor();
    };
  </pre>

  <div class="algorithm" data-algorithm="create widget">
    <p>To <dfn id="create-widget">create a widget</dfn>:</p>
    <ol>
      <li>Let w be a new Widget.</li>
      <li>Return w.</li>
    </ol>
  </div>

  <h3 id="examples">Examples</h3>
  <p>See the <dfn id="widget-example">widget example</dfn>.</p>
`;

describe("parseSpec — widget pipeline", () => {
  const { sections } = parseHtml(WIDGET_HTML);

  it("extracts sections in document order with correct types", () => {
    expect(sections.map((s) => [s.anchor, s.sectionType])).toEqual([
      ["intro", "heading"],
      ["concept-widget", "definition"],
      ["types", "heading"],
      ["widget", "idl"],
      ["create-widget", "algorithm"],
      ["examples", "heading"],
      ["widget-example", "definition"],
    ]);
  });

  it("computes parent relationships", () => {
    const parent = Object.fromEntries(sections.map((s) => [s.anchor, s.parentAnchor]));
    expect(parent["intro"]).toBeNull();
    expect(parent["concept-widget"]).toBe("intro");
    expect(parent["types"]).toBe("intro");
    expect(parent["widget"]).toBe("types");
    expect(parent["create-widget"]).toBe("types");
    expect(parent["examples"]).toBe("intro");
    expect(parent["widget-example"]).toBe("examples");
  });

  it("computes sibling relationships", () => {
    const examples = sections.find((s) => s.anchor === "examples")!;
    expect(examples.prevAnchor).toBe("types");
  });
});
